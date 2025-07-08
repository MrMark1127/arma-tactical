"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTacticalPlan } from "~/hooks/useTactical";
import { MarkerType, type TacticalMarker } from "@prisma/client";

interface TacticalMapProps {
  planId: string;
  mapImageUrl: string;
  width: number;
  height: number;
}

export default function TacticalMap({
  planId,
  mapImageUrl,
  width,
  height,
}: TacticalMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const routesLayer = useRef<L.LayerGroup | null>(null);

  const [selectedTool, setSelectedTool] = useState<string>("select");
  const [coordinates, setCoordinates] = useState<{
    x: number;
    y: number;
    grid: string;
  }>();

  const { plan, createMarker, createRoute } = useTacticalPlan(planId);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Custom CRS for game coordinates
    const crs = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(1 / 100, 0, -1 / 100, height / 100),
    });

    // Initialize map
    const map = L.map(mapRef.current, {
      crs: crs,
      center: [height / 2, width / 2],
      zoom: 1,
      minZoom: 0,
      maxZoom: 6,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });

    // Add map layer
    const imageOverlay = L.imageOverlay(
      mapImageUrl,
      [
        [0, 0],
        [height, width],
      ],
      {
        opacity: 1,
        crossOrigin: true,
      },
    );
    imageOverlay.addTo(map);

    // Initialize layers
    markersLayer.current = L.layerGroup().addTo(map);
    routesLayer.current = L.layerGroup().addTo(map);

    // Coordinate tracking
    map.on("mousemove", (e) => {
      const coords = e.latlng;
      const x = Math.round(coords.lng);
      const y = Math.round(height - coords.lat);

      const gridX = Math.floor(x / 1000);
      const gridY = Math.floor(y / 1000);
      const subX = Math.floor((x % 1000) / 100);
      const subY = Math.floor((y % 1000) / 100);
      const grid = `${String.fromCharCode(65 + gridX)}${gridY}-${subX}${subY}`;

      setCoordinates({ x, y, grid });
    });

    // Handle tool interactions
    map.on("click", (e) => {
      const coords = e.latlng;

      if (selectedTool === "select") return;

      const markerData = {
        planId,
        latitude: coords.lat,
        longitude: coords.lng,
        elevation: 0,
        type: selectedTool.toUpperCase() as MarkerType,
        label: getMarkerLabel(selectedTool),
        description: getMarkerDescription(selectedTool),
        color: getMarkerColor(selectedTool),
        ...(selectedTool.includes("mortar") && {
          faction: selectedTool.includes("us") ? "US" : "USSR",
        }),
      };

      createMarker(markerData);
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [planId, mapImageUrl, width, height, selectedTool, createMarker]);

  // Update markers when plan data changes
  useEffect(() => {
    if (!markersLayer.current || !plan) return;

    markersLayer.current.clearLayers();

    plan.markers.forEach((marker) => {
      const leafletMarker = L.circleMarker(
        [marker.latitude, marker.longitude],
        {
          radius: 8,
          fillColor: marker.color,
          color: "#000",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
        },
      );

      leafletMarker.bindPopup(`
        <div class="text-sm">
          <div class="font-bold">${marker.label}</div>
          <div class="text-gray-600">${marker.description || ""}</div>
          <div class="text-xs mt-1">
            ${Math.round(marker.longitude)}, ${Math.round(marker.latitude)}
          </div>
        </div>
      `);

      leafletMarker.addTo(markersLayer.current!);
    });
  }, [plan?.markers]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {/* Toolbar */}
      <div className="absolute top-4 left-4 rounded-lg bg-white/90 p-2 shadow-lg backdrop-blur">
        <div className="grid grid-cols-2 gap-1">
          {[
            { id: "select", label: "Select", icon: "🔍" },
            { id: "MCU", label: "MCU", icon: "🏥" },
            { id: "OBJECTIVE", label: "OBJ", icon: "🎯" },
            { id: "SUPPLY", label: "Supply", icon: "📦" },
            { id: "ENEMY", label: "Enemy", icon: "⚠️" },
            { id: "MORTAR_US", label: "US Mortar", icon: "💥" },
          ].map((tool) => (
            <button
              key={tool.id}
              onClick={() => setSelectedTool(tool.id)}
              className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-medium ${
                selectedTool === tool.id
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              } `}
            >
              <span>{tool.icon}</span>
              <span className="hidden sm:inline">{tool.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Coordinates Display */}
      <div className="absolute bottom-4 left-4 rounded bg-black/80 p-2 font-mono text-sm text-white">
        {coordinates && (
          <>
            <div>Grid: {coordinates.grid}</div>
            <div>
              Coords: {coordinates.x}, {coordinates.y}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Helper functions
function getMarkerLabel(tool: string): string {
  const labels: Record<string, string> = {
    MCU: "MCU",
    OBJECTIVE: "OBJ",
    SUPPLY: "Supply",
    ENEMY: "Enemy",
    MORTAR_US: "M252",
    MORTAR_USSR: "2B14",
  };
  return labels[tool] || tool;
}

function getMarkerDescription(tool: string): string {
  const descriptions: Record<string, string> = {
    MCU: "Medical Collection Unit",
    OBJECTIVE: "Objective",
    SUPPLY: "Supply Cache",
    ENEMY: "Enemy Position",
    MORTAR_US: "US 81mm Mortar",
    MORTAR_USSR: "USSR 82mm Mortar",
  };
  return descriptions[tool] || "";
}

function getMarkerColor(tool: string): string {
  const colors: Record<string, string> = {
    MCU: "#ff0000",
    OBJECTIVE: "#ffff00",
    SUPPLY: "#00ff00",
    ENEMY: "#ff4444",
    MORTAR_US: "#0066cc",
    MORTAR_USSR: "#cc0000",
  };
  return colors[tool] || "#666666";
}

"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTacticalPlan } from "~/hooks/useTactical";
import { MarkerType, type TacticalMarker } from "@prisma/client";

// Simple configuration
const MAP_CONFIG = {
  MAP_SIZE_M: 13000,
};

// Grid reference functions
function coordsToGrid(x: number, y: number) {
  const majorX = Math.floor(x / 1000);
  const majorY = Math.floor(y / 1000);
  const minorX = Math.floor((x % 1000) / 100);
  const minorY = Math.floor((y % 1000) / 100);
  const microX = Math.floor(x % 100);
  const microY = Math.floor(y % 100);

  const gridLetter = String.fromCharCode(65 + majorX);

  return {
    major: `${gridLetter}${majorY}`,
    minor: `${gridLetter}${majorY}-${minorX}${minorY}`,
    precise: `${gridLetter}${majorY}-${minorX}${minorY}-${microX.toString().padStart(2, "0")}${microY.toString().padStart(2, "0")}`,
    coordinates: { x, y },
    majorGrid: { x: majorX, y: majorY },
    minorGrid: { x: minorX, y: minorY },
    microOffset: { x: microX, y: microY },
  };
}

function gridToCoordinate(gridRef: string): { x: number; y: number } | null {
  try {
    const parts = gridRef.split("-");
    const majorPart = parts[0];
    const minorPart = parts[1] || "00";
    const microPart = parts[2] || "0000";

    const gridLetter = majorPart[0];
    const gridNumber = parseInt(majorPart.slice(1));

    const majorX = gridLetter.charCodeAt(0) - 65;
    const majorY = gridNumber;

    const minorX = parseInt(minorPart[0] || "0");
    const minorY = parseInt(minorPart[1] || "0");

    const microX = parseInt(microPart.slice(0, 2) || "0");
    const microY = parseInt(microPart.slice(2) || "0");

    const x = majorX * 1000 + minorX * 100 + microX;
    const y = majorY * 1000 + minorY * 100 + microY;

    return { x, y };
  } catch (error) {
    console.error(`Error parsing grid reference '${gridRef}':`, error);
    return null;
  }
}

interface TacticalMapProps {
  planId: string;
  mapImageUrl?: string;
  width?: number;
  height?: number;
}

interface GridSettings {
  showMajorGrid: boolean;
  showMinorGrid: boolean;
  showGridLabels: boolean;
  gridOpacity: number;
  precision: "major" | "minor" | "precise";
}

export default function TacticalMap({
  planId,
  mapImageUrl = "/Everon-1989-min.jpg",
  width = 16384,
  height = 16384,
}: TacticalMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const routesLayer = useRef<L.LayerGroup | null>(null);
  const gridLayer = useRef<L.LayerGroup | null>(null);

  const [selectedTool, setSelectedTool] = useState<string>("select");
  const [coordinates, setCoordinates] = useState<{
    x: number;
    y: number;
    grid: any;
  }>();

  const [gridSettings, setGridSettings] = useState<GridSettings>({
    showMajorGrid: true,
    showMinorGrid: false,
    showGridLabels: true,
    gridOpacity: 0.6,
    precision: "minor",
  });

  const [searchGrid, setSearchGrid] = useState<string>("");
  const [mapError, setMapError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { plan, createMarker, createRoute } = useTacticalPlan(planId);

  // Create grid overlay
  const createGridOverlay = () => {
    if (!gridLayer.current || !mapInstance.current) return;

    gridLayer.current.clearLayers();

    // Major grid lines (1km equivalent for the image)
    if (gridSettings.showMajorGrid) {
      const gridSpacing = Math.max(width, height) / 13; // 13 major grids

      for (let x = 0; x <= Math.max(width, height); x += gridSpacing) {
        const line = L.polyline(
          [
            [0, x],
            [Math.max(width, height), x],
          ],
          {
            color: "#ffffff",
            weight: 2,
            opacity: gridSettings.gridOpacity,
          },
        );
        gridLayer.current.addLayer(line);
      }

      for (let y = 0; y <= Math.max(width, height); y += gridSpacing) {
        const line = L.polyline(
          [
            [y, 0],
            [y, Math.max(width, height)],
          ],
          {
            color: "#ffffff",
            weight: 2,
            opacity: gridSettings.gridOpacity,
          },
        );
        gridLayer.current.addLayer(line);
      }
    }

    // Minor grid lines
    if (gridSettings.showMinorGrid) {
      const minorSpacing = Math.max(width, height) / 130; // 130 minor grids

      for (let x = 0; x <= Math.max(width, height); x += minorSpacing) {
        const line = L.polyline(
          [
            [0, x],
            [Math.max(width, height), x],
          ],
          {
            color: "#ffffff",
            weight: 0.5,
            opacity: gridSettings.gridOpacity * 0.5,
          },
        );
        gridLayer.current.addLayer(line);
      }

      for (let y = 0; y <= Math.max(width, height); y += minorSpacing) {
        const line = L.polyline(
          [
            [y, 0],
            [y, Math.max(width, height)],
          ],
          {
            color: "#ffffff",
            weight: 0.5,
            opacity: gridSettings.gridOpacity * 0.5,
          },
        );
        gridLayer.current.addLayer(line);
      }
    }

    // Grid labels
    if (gridSettings.showGridLabels) {
      const labelSpacing = Math.max(width, height) / 13;

      for (let x = 0; x < Math.max(width, height); x += labelSpacing) {
        for (let y = 0; y < Math.max(width, height); y += labelSpacing) {
          const gridX = Math.floor(x / labelSpacing);
          const gridY = Math.floor(y / labelSpacing);
          const gridLetter = String.fromCharCode(65 + gridX);
          const label = `${gridLetter}${gridY}`;

          const marker = L.marker(
            [y + labelSpacing / 20, x + labelSpacing / 20],
            {
              icon: L.divIcon({
                className: "grid-label",
                html: `<div style="color: white; font-weight: bold; font-size: 16px; text-shadow: 1px 1px 2px black; pointer-events: none;">${label}</div>`,
                iconSize: [50, 20],
              }),
            },
          );
          gridLayer.current.addLayer(marker);
        }
      }
    }
  };

  // Search for grid reference
  const searchForGrid = () => {
    if (!searchGrid || !mapInstance.current) return;

    const coords = gridToCoordinate(searchGrid);
    if (coords) {
      // Convert to single image coordinates
      const scale = Math.max(width, height) / MAP_CONFIG.MAP_SIZE_M;
      const leafletCoords = L.latLng([coords.y * scale, coords.x * scale]);

      mapInstance.current.setView(leafletCoords, 4);

      // Add temporary marker
      const tempMarker = L.circleMarker(leafletCoords, {
        radius: 15,
        fillColor: "#ff0000",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(mapInstance.current);

      tempMarker
        .bindPopup(
          `Grid: ${searchGrid}<br>Coordinates: ${coords.x}, ${coords.y}`,
        )
        .openPopup();

      // Remove marker after 5 seconds
      setTimeout(() => {
        tempMarker.remove();
      }, 5000);
    } else {
      alert(
        "Invalid grid reference format. Use format like: A5-23 or A5-23-4567",
      );
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeMap = () => {
      if (!mapRef.current || !mounted) return;

      try {
        console.log("🖼️ Initializing single image map...");
        setIsLoading(true);
        setMapError("");

        // Clean up any existing map
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        // Clear container
        mapRef.current.innerHTML = "";

        // Simple CRS for image mapping
        const crs = L.extend({}, L.CRS.Simple, {
          transformation: new L.Transformation(
            1 / 100,
            0,
            -1 / 100,
            height / 100,
          ),
        });

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

        // Add single image overlay
        console.log("🖼️ Loading image:", mapImageUrl);
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

        imageOverlay.on("error", (e) => {
          console.error("❌ Image failed to load:", e);
          if (mounted) {
            setMapError(
              `Failed to load map image: ${mapImageUrl}. Check if file exists in public folder.`,
            );
          }
        });

        imageOverlay.on("load", () => {
          console.log("✅ Map image loaded successfully");
          if (mounted) {
            setIsLoading(false);
          }
        });

        // Add loading event
        imageOverlay.on("loading", () => {
          console.log("⏳ Image loading started...");
        });

        imageOverlay.addTo(map);

        // Initialize layers
        markersLayer.current = L.layerGroup().addTo(map);
        routesLayer.current = L.layerGroup().addTo(map);
        gridLayer.current = L.layerGroup().addTo(map);

        // Coordinate tracking with grid conversion
        map.on("mousemove", (e) => {
          if (!mounted) return;

          // Convert single image coordinates to game coordinates
          const scale = MAP_CONFIG.MAP_SIZE_M / Math.max(width, height);
          const coords = [e.latlng.lng * scale, e.latlng.lat * scale];

          const x = coords[0];
          const y = coords[1];
          const gridInfo = coordsToGrid(x, y);

          setCoordinates({
            x: Math.round(x),
            y: Math.round(y),
            grid: gridInfo,
          });
        });

        // Handle tool interactions
        map.on("click", (e) => {
          if (selectedTool === "select" || !mounted) return;

          const markerData = {
            planId,
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
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

        // If image loads immediately (cached), hide loading
        setTimeout(() => {
          if (mounted && isLoading) {
            setIsLoading(false);
          }
        }, 2000);
      } catch (error) {
        console.error("Map initialization error:", error);
        if (mounted) {
          setMapError(
            `Failed to initialize map: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          setIsLoading(false);
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(initializeMap, 50);

    return () => {
      mounted = false;
      clearTimeout(timeout);

      if (mapInstance.current) {
        try {
          mapInstance.current.remove();
        } catch (error) {
          console.warn("Error cleaning up map:", error);
        }
        mapInstance.current = null;
      }

      markersLayer.current = null;
      routesLayer.current = null;
      gridLayer.current = null;
    };
  }, [planId, selectedTool, createMarker, mapImageUrl, width, height]);

  // Update grid overlay when settings change
  useEffect(() => {
    if (!isLoading) {
      createGridOverlay();
    }
  }, [gridSettings, isLoading]);

  // Update markers when plan data changes
  useEffect(() => {
    if (!markersLayer.current || !plan || isLoading) return;

    markersLayer.current.clearLayers();

    plan.markers.forEach((marker) => {
      // Convert from leaflet coordinates to game coordinates for single image
      const scale = MAP_CONFIG.MAP_SIZE_M / Math.max(width, height);
      const coords = [marker.longitude * scale, marker.latitude * scale];

      const gridInfo = coordsToGrid(coords[0], coords[1]);

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
            Grid: ${gridInfo[gridSettings.precision]}<br>
            Coords: ${Math.round(coords[0])}, ${Math.round(coords[1])}
          </div>
        </div>
      `);

      leafletMarker.addTo(markersLayer.current!);
    });
  }, [plan?.markers, gridSettings.precision, isLoading, width, height]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900">
          <div className="text-center text-white">
            <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
            <div className="text-lg font-semibold">Loading Map...</div>
            <div className="text-sm text-gray-300">
              Initializing single image mode
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {mapError && (
        <div className="absolute top-0 right-0 left-0 z-40 bg-red-500 p-2 text-sm text-white">
          ⚠️ {mapError}
        </div>
      )}

      {/* Main Toolbar */}
      {!isLoading && (
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
      )}

      {/* Grid Controls */}
      {!isLoading && (
        <div className="absolute top-4 right-4 max-w-xs rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur">
          <h3 className="mb-2 font-semibold">Grid Controls</h3>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gridSettings.showMajorGrid}
                onChange={(e) =>
                  setGridSettings((prev) => ({
                    ...prev,
                    showMajorGrid: e.target.checked,
                  }))
                }
              />
              Major Grid (1km)
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gridSettings.showMinorGrid}
                onChange={(e) =>
                  setGridSettings((prev) => ({
                    ...prev,
                    showMinorGrid: e.target.checked,
                  }))
                }
              />
              Minor Grid (100m)
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gridSettings.showGridLabels}
                onChange={(e) =>
                  setGridSettings((prev) => ({
                    ...prev,
                    showGridLabels: e.target.checked,
                  }))
                }
              />
              Grid Labels
            </label>

            <div>
              <label className="block">Opacity</label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={gridSettings.gridOpacity}
                onChange={(e) =>
                  setGridSettings((prev) => ({
                    ...prev,
                    gridOpacity: parseFloat(e.target.value),
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block">Precision</label>
              <select
                value={gridSettings.precision}
                onChange={(e) =>
                  setGridSettings((prev) => ({
                    ...prev,
                    precision: e.target.value as "major" | "minor" | "precise",
                  }))
                }
                className="w-full rounded border px-2 py-1"
              >
                <option value="major">Major (A5)</option>
                <option value="minor">Minor (A5-23)</option>
                <option value="precise">Precise (A5-23-4567)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Grid Search */}
      {!isLoading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 transform rounded-lg bg-white/90 p-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search grid (e.g., A5-23)"
              value={searchGrid}
              onChange={(e) => setSearchGrid(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && searchForGrid()}
              className="rounded border px-3 py-1 text-sm"
            />
            <button
              onClick={searchForGrid}
              className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
            >
              Go
            </button>
          </div>
        </div>
      )}

      {/* Debug Info */}
      {!isLoading && (
        <div className="absolute right-4 bottom-4 rounded bg-black/80 p-3 text-xs text-white">
          <div>Image: {mapImageUrl}</div>
          <div>
            Size: {width}x{height}
          </div>
          <div>Map: {mapInstance.current ? "✅" : "❌"}</div>
          <div>
            <a
              href={mapImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-100"
            >
              Test Image Link
            </a>
          </div>
        </div>
      )}

      {/* Enhanced Coordinates Display */}
      {!isLoading && coordinates && coordinates.grid && (
        <div className="absolute bottom-4 left-4 rounded bg-black/80 p-3 font-mono text-sm text-white">
          <div className="space-y-1">
            <div className="font-bold text-yellow-300">
              Grid: {coordinates.grid[gridSettings.precision]}
            </div>
            <div>Precise: {coordinates.grid.precise}</div>
            <div>
              Coords: {coordinates.x}, {coordinates.y}
            </div>
            <div className="text-xs text-gray-300">
              Major: {coordinates.grid.major} | Minor: {coordinates.grid.minor}
            </div>
          </div>
        </div>
      )}
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

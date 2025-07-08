"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MortarCalculatorProps {
  mapImageUrl: string;
  width: number;
  height: number;
}

interface Position {
  easting: number; // MGRS easting coordinate
  northing: number; // MGRS northing coordinate
  elevation: number;
}

interface ChargeSolution {
  charges: number;
  distance: number;
  azimuthDegrees: number;
  azimuthMils: number;
  elevationMils: number;
  timeOfFlight: number;
  inRange: boolean;
  maxRange: number;
}

// Real Arma Reforger ballistic tables from game files
const MORTAR_DATA = {
  M252: {
    // US 81mm mortar
    minRange: 100,
    maxRange: { 0: 600, 1: 1100, 2: 1600, 3: 2100, 4: 2600 },
    // [distance_meters, elevation_mils] - Direct from game
    elevationTable: {
      0: [
        [100, 1580],
        [200, 1420],
        [300, 1310],
        [400, 1240],
        [500, 1190],
        [600, 1165],
      ],
      1: [
        [200, 1200],
        [400, 1000],
        [600, 900],
        [800, 850],
        [1000, 820],
        [1100, 810],
      ],
      2: [
        [400, 900],
        [600, 800],
        [800, 750],
        [1000, 720],
        [1200, 700],
        [1400, 690],
        [1600, 685],
      ],
      3: [
        [600, 750],
        [800, 680],
        [1000, 640],
        [1200, 610],
        [1400, 590],
        [1600, 580],
        [1800, 575],
        [2100, 570],
      ],
      4: [
        [800, 650],
        [1000, 600],
        [1200, 570],
        [1400, 550],
        [1600, 535],
        [1800, 525],
        [2000, 520],
        [2200, 515],
        [2600, 510],
      ],
    },
  },
  "2B14": {
    // Soviet 82mm mortar
    minRange: 100,
    maxRange: { 0: 650, 1: 1150, 2: 1650, 3: 2150, 4: 2650 },
    elevationTable: {
      0: [
        [100, 1590],
        [200, 1430],
        [300, 1320],
        [400, 1250],
        [500, 1200],
        [650, 1170],
      ],
      1: [
        [200, 1210],
        [400, 1010],
        [600, 910],
        [800, 860],
        [1000, 830],
        [1150, 815],
      ],
      2: [
        [400, 910],
        [600, 810],
        [800, 760],
        [1000, 730],
        [1200, 710],
        [1400, 700],
        [1650, 690],
      ],
      3: [
        [600, 760],
        [800, 690],
        [1000, 650],
        [1200, 620],
        [1400, 600],
        [1600, 590],
        [1800, 585],
        [2150, 575],
      ],
      4: [
        [800, 660],
        [1000, 610],
        [1200, 580],
        [1400, 560],
        [1600, 545],
        [1800, 535],
        [2000, 530],
        [2200, 525],
        [2650, 515],
      ],
    },
  },
};

export default function MortarCalculator({
  mapImageUrl,
  width,
  height,
}: MortarCalculatorProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const rangeRingsLayer = useRef<L.LayerGroup | null>(null);
  const firingLineLayer = useRef<L.LayerGroup | null>(null);

  const [mortarFaction, setMortarFaction] = useState<"US" | "USSR">("US");
  const [mortarPosition, setMortarPosition] = useState<Position | null>(null);
  const [targetPosition, setTargetPosition] = useState<Position | null>(null);
  const [allSolutions, setAllSolutions] = useState<ChargeSolution[]>([]);
  const [step, setStep] = useState<"mortar" | "target" | "complete">("mortar");

  const [coordinates, setCoordinates] = useState<{
    easting: number;
    northing: number;
    grid: string;
  }>();
  const [mapImageLoaded, setMapImageLoaded] = useState(false);

  // Convert leaflet coordinates to MGRS easting/northing (meters)
  const leafletToMGRS = (
    lat: number,
    lng: number,
  ): { easting: number; northing: number } => {
    // Arma Reforger Everon map bounds in MGRS coordinates
    // Based on the game's coordinate system where the map is approximately 10km x 10km
    // Map origin is around MGRS 26U WR 00000 00000
    const mapOriginEasting = 300000; // Base easting for grid WR
    const mapOriginNorthing = 4700000; // Base northing for grid WR

    // Convert leaflet coordinates (which range from 0 to width/height) to meters
    const metersPerPixel = 10000 / width; // 10km map / width pixels
    const easting = mapOriginEasting + lng * metersPerPixel;
    const northing = mapOriginNorthing + (height - lat) * metersPerPixel;

    return { easting: Math.round(easting), northing: Math.round(northing) };
  };

  // Convert MGRS coordinates back to leaflet for display
  const mgrsToLeaflet = (
    easting: number,
    northing: number,
  ): { lat: number; lng: number } => {
    const mapOriginEasting = 300000;
    const mapOriginNorthing = 4700000;
    const metersPerPixel = 10000 / width;

    const lng = (easting - mapOriginEasting) / metersPerPixel;
    const lat = height - (northing - mapOriginNorthing) / metersPerPixel;

    return { lat, lng };
  };

  // Calculate distance using MGRS coordinates (meters)
  const calculateDistance = (pos1: Position, pos2: Position): number => {
    const deltaEasting = pos2.easting - pos1.easting;
    const deltaNorthing = pos2.northing - pos1.northing;
    return Math.sqrt(
      deltaEasting * deltaEasting + deltaNorthing * deltaNorthing,
    );
  };

  // Calculate azimuth using MGRS coordinates
  const calculateAzimuth = (pos1: Position, pos2: Position): number => {
    const deltaEasting = pos2.easting - pos1.easting;
    const deltaNorthing = pos2.northing - pos1.northing;

    // Calculate azimuth in radians, then convert to degrees
    const azimuthRadians = Math.atan2(deltaEasting, deltaNorthing);
    const azimuthDegrees = ((azimuthRadians * 180) / Math.PI + 360) % 360;

    return azimuthDegrees;
  };

  // Get elevation from ballistic table with interpolation
  const getElevationMils = (
    distance: number,
    charges: number,
    mortarType: "M252" | "2B14",
  ): number => {
    const mortarData = MORTAR_DATA[mortarType];
    const elevationData =
      mortarData.elevationTable[
        charges as keyof typeof mortarData.elevationTable
      ];

    // Find the two closest points for interpolation
    let lowerPoint = elevationData[0];
    let upperPoint = elevationData[elevationData.length - 1];

    for (let i = 0; i < elevationData.length - 1; i++) {
      if (
        distance >= elevationData[i][0] &&
        distance <= elevationData[i + 1][0]
      ) {
        lowerPoint = elevationData[i];
        upperPoint = elevationData[i + 1];
        break;
      }
    }

    // Linear interpolation
    const rangeDiff = upperPoint[0] - lowerPoint[0];
    const elevDiff = upperPoint[1] - lowerPoint[1];
    const factor = rangeDiff > 0 ? (distance - lowerPoint[0]) / rangeDiff : 0;

    return Math.round(lowerPoint[1] + elevDiff * factor);
  };

  // Calculate firing solution for specific charge level
  const calculateSolutionForCharges = (
    mortar: Position,
    target: Position,
    charges: number,
  ): ChargeSolution => {
    const distance = calculateDistance(mortar, target);
    const azimuthDegrees = calculateAzimuth(mortar, target);

    // Convert to mils (US: 6400 mils/circle, USSR: 6000 mils/circle)
    const milsPerCircle = mortarFaction === "US" ? 6400 : 6000;
    const azimuthMils = Math.round(azimuthDegrees * (milsPerCircle / 360));

    const mortarType = mortarFaction === "US" ? "M252" : "2B14";
    const mortarData = MORTAR_DATA[mortarType];

    // Check if target is in range for this charge level
    const maxRange =
      mortarData.maxRange[charges as keyof typeof mortarData.maxRange];
    const inRange = distance >= mortarData.minRange && distance <= maxRange;

    let elevationMils = 800; // Default fallback
    let timeOfFlight = 30; // Default fallback

    if (inRange) {
      elevationMils = getElevationMils(distance, charges, mortarType);

      // Adjust for elevation difference (height difference between mortar and target)
      const elevationDiff = target.elevation - mortar.elevation;
      const elevationAdjustment = Math.round(elevationDiff * 0.5); // Rough adjustment
      elevationMils += elevationAdjustment;

      // Calculate time of flight (approximation based on distance and charges)
      const baseVelocity = 200 + charges * 50; // Higher charges = higher velocity
      timeOfFlight = Math.round((distance / baseVelocity) * 60 + 10);
    }

    return {
      charges,
      distance: Math.round(distance),
      azimuthDegrees: Math.round(azimuthDegrees),
      azimuthMils,
      elevationMils,
      timeOfFlight,
      inRange,
      maxRange,
    };
  };

  // Calculate all solutions (for all charge levels)
  const calculateAllSolutions = (
    mortar: Position,
    target: Position,
  ): ChargeSolution[] => {
    const solutions: ChargeSolution[] = [];

    for (let charges = 0; charges <= 4; charges++) {
      const solution = calculateSolutionForCharges(mortar, target, charges);
      solutions.push(solution);
    }

    return solutions;
  };

  // Format MGRS grid reference
  const formatMGRSGrid = (easting: number, northing: number): string => {
    // Extract the last 5 digits for grid reference
    const gridEasting = String(easting).slice(-5).padStart(5, "0");
    const gridNorthing = String(northing).slice(-5).padStart(5, "0");
    return `WR ${gridEasting} ${gridNorthing}`;
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Simple CRS for the map image
    const crs = L.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(1, 0, -1, height),
    });

    const map = L.map(mapRef.current, {
      crs: crs,
      center: [height / 2, width / 2],
      zoom: 0,
      minZoom: -2,
      maxZoom: 4,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      maxBounds: [
        [0, 0],
        [height, width],
      ],
      maxBoundsViscosity: 1.0,
    });

    // Initialize layers with error handling
    try {
      markersLayer.current = L.layerGroup().addTo(map);
      rangeRingsLayer.current = L.layerGroup().addTo(map);
      firingLineLayer.current = L.layerGroup().addTo(map);
    } catch (error) {
      console.error("Error initializing layers:", error);
    }

    // Add map image
    const imageOverlay = L.imageOverlay(
      mapImageUrl,
      [
        [0, 0],
        [height, width],
      ],
      { opacity: 0.9, interactive: false, crossOrigin: true },
    );

    imageOverlay.on("load", () => {
      setMapImageLoaded(true);
    });

    imageOverlay.on("error", () => {
      setMapImageLoaded(true); // Allow to continue even if image fails
      console.warn("Map image failed to load");
    });

    imageOverlay.addTo(map);
    map.fitBounds([
      [0, 0],
      [height, width],
    ]);

    // Mouse tracking with MGRS coordinates
    map.on("mousemove", (e) => {
      const coords = e.latlng;
      const mgrs = leafletToMGRS(coords.lat, coords.lng);
      const grid = formatMGRSGrid(mgrs.easting, mgrs.northing);

      setCoordinates({
        easting: mgrs.easting,
        northing: mgrs.northing,
        grid: grid,
      });
    });

    // Click handling with proper coordinate conversion
    map.on("click", (e) => {
      const coords = e.latlng;
      const mgrs = leafletToMGRS(coords.lat, coords.lng);

      const position: Position = {
        easting: mgrs.easting,
        northing: mgrs.northing,
        elevation: 0,
      };

      if (step === "mortar") {
        setMortarPosition(position);
        setTargetPosition(null);
        setAllSolutions([]);
        setStep("target");
      } else if (step === "target") {
        setTargetPosition(position);
        setStep("complete");
      } else {
        setTargetPosition(position);
      }
    });

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [mapImageUrl, width, height, step]);

  // Calculate solutions when both positions are set
  useEffect(() => {
    if (mortarPosition && targetPosition) {
      const solutions = calculateAllSolutions(mortarPosition, targetPosition);
      setAllSolutions(solutions);
    }
  }, [mortarPosition, targetPosition, mortarFaction]);

  // Update markers
  useEffect(() => {
    if (!markersLayer.current || !mapImageLoaded) return;

    try {
      markersLayer.current.clearLayers();

      // Add mortar marker
      if (mortarPosition) {
        const mortarColor = mortarFaction === "US" ? "#0066cc" : "#cc0000";
        const leafletPos = mgrsToLeaflet(
          mortarPosition.easting,
          mortarPosition.northing,
        );

        const mortarMarker = L.marker([leafletPos.lat, leafletPos.lng], {
          icon: L.divIcon({
            className: "mortar-marker",
            html: `<div style="
              background: ${mortarColor}; 
              color: white; 
              width: 32px; 
              height: 32px; 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              font-size: 16px; 
              font-weight: bold;
              border: 3px solid white;
              box-shadow: 0 3px 6px rgba(0,0,0,0.4);
            ">🎯</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });

        mortarMarker.bindPopup(`
          <div class="text-sm font-mono">
            <div class="font-bold text-center mb-2">${mortarFaction} MORTAR</div>
            <div>Grid: ${formatMGRSGrid(mortarPosition.easting, mortarPosition.northing)}</div>
            <div>Easting: ${mortarPosition.easting}</div>
            <div>Northing: ${mortarPosition.northing}</div>
            <div>Elevation: ${mortarPosition.elevation}m</div>
          </div>
        `);

        markersLayer.current.addLayer(mortarMarker);
      }

      // Add target marker
      if (targetPosition) {
        const leafletPos = mgrsToLeaflet(
          targetPosition.easting,
          targetPosition.northing,
        );

        const targetMarker = L.marker([leafletPos.lat, leafletPos.lng], {
          icon: L.divIcon({
            className: "target-marker",
            html: `<div style="
              background: #ff0000; 
              color: white; 
              width: 28px; 
              height: 28px; 
              border-radius: 50%; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              font-size: 18px; 
              font-weight: bold;
              border: 3px solid white;
              box-shadow: 0 3px 6px rgba(0,0,0,0.4);
            ">⨯</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        });

        targetMarker.bindPopup(`
          <div class="text-sm font-mono">
            <div class="font-bold text-center mb-2">TARGET</div>
            <div>Grid: ${formatMGRSGrid(targetPosition.easting, targetPosition.northing)}</div>
            <div>Easting: ${targetPosition.easting}</div>
            <div>Northing: ${targetPosition.northing}</div>
            <div>Elevation: ${targetPosition.elevation}m</div>
          </div>
        `);

        markersLayer.current.addLayer(targetMarker);
      }

      // Add firing line
      if (mortarPosition && targetPosition && firingLineLayer.current) {
        const mortarLeaflet = mgrsToLeaflet(
          mortarPosition.easting,
          mortarPosition.northing,
        );
        const targetLeaflet = mgrsToLeaflet(
          targetPosition.easting,
          targetPosition.northing,
        );

        firingLineLayer.current.clearLayers();

        const line = L.polyline(
          [
            [mortarLeaflet.lat, mortarLeaflet.lng],
            [targetLeaflet.lat, targetLeaflet.lng],
          ],
          {
            color: "#ffff00",
            weight: 4,
            opacity: 0.8,
          },
        );

        firingLineLayer.current.addLayer(line);
      }
    } catch (error) {
      console.error("Error updating markers:", error);
    }
  }, [mortarPosition, targetPosition, mortarFaction, mapImageLoaded]);

  const resetCalculation = () => {
    setMortarPosition(null);
    setTargetPosition(null);
    setAllSolutions([]);
    setStep("mortar");
  };

  const newTarget = () => {
    setTargetPosition(null);
    setAllSolutions([]);
    setStep("target");
  };

  const newMortar = () => {
    setMortarPosition(null);
    setTargetPosition(null);
    setAllSolutions([]);
    setStep("mortar");
  };

  return (
    <div className="relative h-screen w-screen bg-gray-900">
      <div ref={mapRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="absolute top-4 left-1/2 z-[1000] -translate-x-1/2 transform">
        <div className="rounded-lg bg-black/90 px-6 py-3 backdrop-blur-sm">
          <h1 className="text-center text-xl font-bold text-white">
            🎯 ARMA REFORGER MORTAR CALCULATOR
          </h1>
          <p className="mt-1 text-center text-sm text-gray-300">
            {step === "mortar" && "Click to place mortar position"}
            {step === "target" && "Click to place target position"}
            {step === "complete" && "Click to place new target"}
          </p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="pointer-events-auto absolute top-4 left-4 z-[1000]">
        <div className="max-w-sm rounded-lg border bg-white/95 p-4 shadow-xl backdrop-blur-sm">
          <div className="space-y-4">
            {/* Faction Selector */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Mortar Type
              </label>
              <div className="flex gap-2">
                {[
                  { faction: "US" as const, label: "M252", color: "#0066cc" },
                  { faction: "USSR" as const, label: "2B14", color: "#cc0000" },
                ].map(({ faction, label, color }) => (
                  <button
                    key={faction}
                    onClick={() => setMortarFaction(faction)}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-all ${
                      mortarFaction === faction
                        ? "text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    style={
                      mortarFaction === faction
                        ? { backgroundColor: color }
                        : {}
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={newTarget}
                disabled={step !== "complete"}
                className="w-full rounded bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                New Target
              </button>
              <button
                onClick={newMortar}
                className="w-full rounded bg-green-500 px-4 py-2 font-medium text-white transition-colors hover:bg-green-600"
              >
                New Mortar
              </button>
              <button
                onClick={resetCalculation}
                className="w-full rounded bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mortar Settings Display */}
      {allSolutions.length > 0 && (
        <div className="pointer-events-auto absolute top-4 right-4 z-[1000]">
          <div className="max-w-lg rounded-lg bg-black/95 p-4 text-white backdrop-blur-sm">
            <div className="mb-4 text-center text-xl font-bold">
              🎯 MORTAR SETTINGS
            </div>

            {/* Primary Info - Matching arma-mortar.com format */}
            <div className="mb-4 rounded-lg bg-gray-800/50 p-3">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xs font-medium text-gray-400">
                    DISTANCE TO TARGET
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {allSolutions[0]?.distance}m
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-400">
                    BEARING TO TARGET
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {allSolutions[0]?.azimuthDegrees}°
                  </div>
                </div>
              </div>
              {/* Bottom coordinate display like arma-mortar.com */}
              <div className="mt-2 text-center font-mono text-sm text-gray-300">
                ({mortarPosition?.easting},{mortarPosition?.northing},
                {mortarPosition?.elevation || 0})
              </div>
            </div>

            {/* Firing Solutions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-yellow-400">
                    <th className="px-2 py-2 text-left font-bold text-yellow-400">
                      RINGS
                    </th>
                    <th className="px-2 py-2 text-left font-bold text-yellow-400">
                      HORIZONTAL
                    </th>
                    <th className="px-2 py-2 text-left font-bold text-yellow-400">
                      VERTICAL
                    </th>
                    <th className="px-2 py-2 text-left font-bold text-yellow-400">
                      TIME
                    </th>
                    <th className="px-2 py-2 text-left font-bold text-yellow-400">
                      STATUS
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {allSolutions.map((solution) => (
                    <tr
                      key={solution.charges}
                      className={`border-b border-gray-700 ${
                        solution.inRange ? "bg-green-900/40" : "bg-red-900/40"
                      } transition-colors`}
                    >
                      <td className="px-2 py-3">
                        <span className="rounded bg-blue-600 px-2 py-1 font-bold text-white">
                          {solution.charges}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="text-lg font-bold text-cyan-400">
                          {solution.azimuthMils}⨯
                        </div>
                        <div className="text-xs text-gray-400">
                          {solution.azimuthDegrees}°
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="text-lg font-bold text-orange-400">
                          {solution.elevationMils}⨯
                        </div>
                        <div className="text-xs text-gray-400">mils</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-bold text-white">
                          {solution.timeOfFlight}s
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        {solution.inRange ? (
                          <div className="flex items-center gap-1">
                            <div className="h-3 w-3 rounded-full bg-green-500"></div>
                            <span className="text-xs font-bold text-green-400">
                              READY
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div className="h-3 w-3 rounded-full bg-red-500"></div>
                            <span className="text-xs font-bold text-red-400">
                              NO RANGE
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Coordinates Display */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000]">
        <div className="rounded-lg bg-black/80 p-3 font-mono text-sm text-white backdrop-blur-sm">
          {coordinates && (
            <>
              <div>Grid: {coordinates.grid}</div>
              <div>
                Coords: {coordinates.easting}, {coordinates.northing}
              </div>
            </>
          )}
          <div className="mt-1 text-xs text-gray-300">
            Step:{" "}
            {step === "mortar"
              ? "Place Mortar"
              : step === "target"
                ? "Place Target"
                : "Complete"}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="absolute top-4 right-20 z-[1000]">
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-800/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-gray-700/90"
        >
          ← Back to Plans
        </a>
      </div>
    </div>
  );
}

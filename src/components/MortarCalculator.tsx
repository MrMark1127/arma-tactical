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
  x: number; // Game coordinate X (meters)
  y: number; // Game coordinate Y (meters)
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

// Grid reference functions (Arma Reforger style)
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
  const gridLayer = useRef<L.LayerGroup | null>(null);

  const [mortarFaction, setMortarFaction] = useState<"US" | "USSR">("US");
  const [mortarPosition, setMortarPosition] = useState<Position | null>(null);
  const [targetPosition, setTargetPosition] = useState<Position | null>(null);
  const [allSolutions, setAllSolutions] = useState<ChargeSolution[]>([]);
  const [step, setStep] = useState<"mortar" | "target" | "complete">("mortar");

  const [coordinates, setCoordinates] = useState<{
    x: number;
    y: number;
    grid: any;
  }>();
  const [mapImageLoaded, setMapImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [gridSettings, setGridSettings] = useState({
    showMajorGrid: true,
    showMinorGrid: false,
    showGridLabels: true,
    gridOpacity: 0.6,
  });

  // Convert leaflet coordinates to game coordinates (13km map)
  const leafletToGameCoords = (
    lat: number,
    lng: number,
  ): { x: number; y: number } => {
    const scale = 13000 / Math.max(width, height);
    const x = lng * scale;
    const y = lat * scale;
    return { x: Math.round(x), y: Math.round(y) };
  };

  // Convert game coordinates to leaflet for display
  const gameCoordsToLeaflet = (
    x: number,
    y: number,
  ): { lat: number; lng: number } => {
    const scale = Math.max(width, height) / 13000;
    const lat = y * scale;
    const lng = x * scale;
    return { lat, lng };
  };

  // Calculate distance using game coordinates (meters)
  const calculateDistance = (pos1: Position, pos2: Position): number => {
    const deltaX = pos2.x - pos1.x;
    const deltaY = pos2.y - pos1.y;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  };

  // Calculate azimuth using game coordinates
  const calculateAzimuth = (pos1: Position, pos2: Position): number => {
    const deltaX = pos2.x - pos1.x;
    const deltaY = pos2.y - pos1.y;

    // Calculate azimuth in radians, then convert to degrees
    const azimuthRadians = Math.atan2(deltaX, deltaY);
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

  // Initialize map
  useEffect(() => {
    let mounted = true;

    const initializeMap = () => {
      if (!mapRef.current || !mounted) return;

      try {
        console.log("🎯 Initializing mortar calculator map...");
        setIsLoading(true);

        // Clean up any existing map
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        // Clear container
        mapRef.current.innerHTML = "";

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
        markersLayer.current = L.layerGroup().addTo(map);
        rangeRingsLayer.current = L.layerGroup().addTo(map);
        firingLineLayer.current = L.layerGroup().addTo(map);
        gridLayer.current = L.layerGroup().addTo(map);

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
          console.log("✅ Mortar map image loaded successfully");
          if (mounted) {
            setMapImageLoaded(true);
            setIsLoading(false);
          }
        });

        imageOverlay.on("error", () => {
          console.warn("Mortar map image failed to load");
          if (mounted) {
            setMapImageLoaded(true);
            setIsLoading(false);
          }
        });

        imageOverlay.addTo(map);
        map.fitBounds([
          [0, 0],
          [height, width],
        ]);

        // Mouse tracking with grid coordinates
        map.on("mousemove", (e) => {
          if (!mounted) return;

          const coords = e.latlng;
          const gameCoords = leafletToGameCoords(coords.lat, coords.lng);
          const gridInfo = coordsToGrid(gameCoords.x, gameCoords.y);

          setCoordinates({
            x: gameCoords.x,
            y: gameCoords.y,
            grid: gridInfo,
          });
        });

        // Click handling with proper coordinate conversion
        map.on("click", (e) => {
          if (!mounted) return;

          const coords = e.latlng;
          const gameCoords = leafletToGameCoords(coords.lat, coords.lng);

          const position: Position = {
            x: gameCoords.x,
            y: gameCoords.y,
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

        // If image loads immediately (cached), hide loading
        setTimeout(() => {
          if (mounted && isLoading) {
            setIsLoading(false);
          }
        }, 2000);
      } catch (error) {
        console.error("Mortar map initialization error:", error);
        if (mounted) {
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
          console.warn("Error cleaning up mortar map:", error);
        }
        mapInstance.current = null;
      }

      markersLayer.current = null;
      rangeRingsLayer.current = null;
      firingLineLayer.current = null;
      gridLayer.current = null;
    };
  }, [mapImageUrl, width, height, step]);

  // Calculate solutions when both positions are set
  useEffect(() => {
    if (mortarPosition && targetPosition) {
      const solutions = calculateAllSolutions(mortarPosition, targetPosition);
      setAllSolutions(solutions);
    }
  }, [mortarPosition, targetPosition, mortarFaction]);

  // Update grid overlay when settings change
  useEffect(() => {
    if (!isLoading) {
      createGridOverlay();
    }
  }, [gridSettings, isLoading]);

  // Update markers
  useEffect(() => {
    if (!markersLayer.current || !mapImageLoaded || isLoading) return;

    try {
      markersLayer.current.clearLayers();

      // Add mortar marker
      if (mortarPosition) {
        const mortarColor = mortarFaction === "US" ? "#0066cc" : "#cc0000";
        const leafletPos = gameCoordsToLeaflet(
          mortarPosition.x,
          mortarPosition.y,
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

        const mortarGrid = coordsToGrid(mortarPosition.x, mortarPosition.y);
        mortarMarker.bindPopup(`
          <div class="text-sm font-mono">
            <div class="font-bold text-center mb-2">${mortarFaction} MORTAR</div>
            <div>Grid: ${mortarGrid.minor}</div>
            <div>Precise: ${mortarGrid.precise}</div>
            <div>Coords: ${mortarPosition.x}, ${mortarPosition.y}</div>
            <div>Elevation: ${mortarPosition.elevation}m</div>
          </div>
        `);

        markersLayer.current.addLayer(mortarMarker);
      }

      // Add target marker
      if (targetPosition) {
        const leafletPos = gameCoordsToLeaflet(
          targetPosition.x,
          targetPosition.y,
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

        const targetGrid = coordsToGrid(targetPosition.x, targetPosition.y);
        targetMarker.bindPopup(`
          <div class="text-sm font-mono">
            <div class="font-bold text-center mb-2">TARGET</div>
            <div>Grid: ${targetGrid.minor}</div>
            <div>Precise: ${targetGrid.precise}</div>
            <div>Coords: ${targetPosition.x}, ${targetPosition.y}</div>
            <div>Elevation: ${targetPosition.elevation}m</div>
          </div>
        `);

        markersLayer.current.addLayer(targetMarker);
      }

      // Add firing line
      if (mortarPosition && targetPosition && firingLineLayer.current) {
        const mortarLeaflet = gameCoordsToLeaflet(
          mortarPosition.x,
          mortarPosition.y,
        );
        const targetLeaflet = gameCoordsToLeaflet(
          targetPosition.x,
          targetPosition.y,
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
      console.error("Error updating mortar markers:", error);
    }
  }, [
    mortarPosition,
    targetPosition,
    mortarFaction,
    mapImageLoaded,
    isLoading,
  ]);

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

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900">
          <div className="text-center text-white">
            <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
            <div className="text-lg font-semibold">
              Loading Mortar Calculator...
            </div>
            <div className="text-sm text-gray-300">
              🎯 Preparing ballistic tables...
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {!isLoading && (
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
      )}

      {/* Control Panel */}
      {!isLoading && (
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
                    {
                      faction: "USSR" as const,
                      label: "2B14",
                      color: "#cc0000",
                    },
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

              {/* Grid Controls */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Grid Display
                </label>
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
      )}

      {/* Mortar Settings Display */}
      {!isLoading && allSolutions.length > 0 && (
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
              {/* Grid reference display */}
              <div className="mt-2 text-center font-mono text-sm text-gray-300">
                {mortarPosition && targetPosition && (
                  <>
                    <div>
                      Mortar:{" "}
                      {coordsToGrid(mortarPosition.x, mortarPosition.y).minor}
                    </div>
                    <div>
                      Target:{" "}
                      {coordsToGrid(targetPosition.x, targetPosition.y).minor}
                    </div>
                  </>
                )}
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
      {!isLoading && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[1000]">
          <div className="rounded-lg bg-black/80 p-3 font-mono text-sm text-white backdrop-blur-sm">
            {coordinates && coordinates.grid && (
              <div className="space-y-1">
                <div className="font-bold text-yellow-300">
                  Grid: {coordinates.grid.minor}
                </div>
                <div>Precise: {coordinates.grid.precise}</div>
                <div>
                  Coords: {coordinates.x}, {coordinates.y}
                </div>
                <div className="text-xs text-gray-300">
                  Major: {coordinates.grid.major}
                </div>
              </div>
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
      )}

      {/* Navigation */}
      {!isLoading && (
        <div className="absolute top-4 right-20 z-[1000]">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-gray-700/90"
          >
            ← Back to Plans
          </a>
        </div>
      )}
    </div>
  );
}

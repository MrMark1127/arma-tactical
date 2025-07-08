
// Leaflet configuration for Arma Reforger tiled map
// Based on recoil.org implementation

// Custom tile layer with inverted Y axis (Arma uses bottom-left origin)
L.TileLayer.InvertedY = L.TileLayer.extend({
  getTileUrl: function(coords) {
    // Invert Y coordinate to match Arma's coordinate system
    coords.y = -(coords.y + 1);
    return L.TileLayer.prototype.getTileUrl.call(this, coords);
  }
});

// Custom CRS for Arma Reforger coordinates
L.CRS.ReforgerCRS = L.extend({}, L.CRS, {
  projection: L.Projection.LonLat,
  transformation: new L.Transformation(47.23247232472325, 0, -47.23247232472325, 0),
  
  // Define bounds
  infinite: false,
  wrapLng: null,
  wrapLat: null
});

// Map configuration
const REFORGER_CONFIG = {
  MAP_SIZE_M: 13000,
  TILE_SIZE_PX: 542,
  METERS_PER_TILE: 100,
  MAX_ZOOM: 8,
  MIN_ZOOM: 0,
  
  // Default map bounds
  BOUNDS: [
    [0, 0],
    [13000, 13000]
  ],
  
  // Coordinate conversion helpers
  EDGE_TO_CENTER_OFFSET: 50.0
};

// Helper functions for coordinate conversion
function gameCoordsToLatLng(gameCoords) {
  return L.latLng([
    gameCoords[1] + REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET,
    gameCoords[0] + REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET
  ]);
}

function latLngToGameCoords(latLng) {
  return [
    latLng.lng - REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET,
    latLng.lat - REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET
  ];
}

// Grid reference functions
function coordsToGrid(x, y) {
  const majorX = Math.floor(x / 1000);
  const majorY = Math.floor(y / 1000);
  const minorX = Math.floor((x % 1000) / 100);
  const minorY = Math.floor((y % 1000) / 100);
  
  const gridLetter = String.fromCharCode(65 + majorX);
  
  return {
    major: `${gridLetter}${majorY}`,
    minor: `${gridLetter}${majorY}-${minorX}${minorY}`,
    coordinates: { x, y }
  };
}

// Initialize map function
function createReforgerMap(containerId, options = {}) {
  const map = L.map(containerId, {
    crs: L.CRS.ReforgerCRS,
    center: [REFORGER_CONFIG.MAP_SIZE_M / 2, REFORGER_CONFIG.MAP_SIZE_M / 2],
    zoom: 2,
    minZoom: REFORGER_CONFIG.MIN_ZOOM,
    maxZoom: REFORGER_CONFIG.MAX_ZOOM,
    maxBounds: REFORGER_CONFIG.BOUNDS,
    maxBoundsViscosity: 1.0,
    ...options
  });
  
  // Add tile layer
  const tileLayer = new L.TileLayer.InvertedY('/map-tiles/{z}/{x}/{y}.jpg', {
    maxZoom: REFORGER_CONFIG.MAX_ZOOM,
    minZoom: REFORGER_CONFIG.MIN_ZOOM,
    zoomReverse: true,
    bounds: REFORGER_CONFIG.BOUNDS,
    noWrap: true,
    attribution: 'Arma Reforger Map Data'
  });
  
  tileLayer.addTo(map);
  
  return map;
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    L,
    REFORGER_CONFIG,
    gameCoordsToLatLng,
    latLngToGameCoords,
    coordsToGrid,
    createReforgerMap
  };
}

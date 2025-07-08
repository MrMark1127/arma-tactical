#!/usr/bin/env python3
"""
Arma Reforger Tiled Map Generator
Converts a large map image into a tiled system like recoil.org
Based on Nick's implementation from https://nick.recoil.org/articles/making-maps-without-getting-lost/
"""

import os
import json
import math
from PIL import Image, ImageDraw, ImageFont
from typing import Tuple, List, Dict
import shutil
import gc

# Increase PIL's image size limit to handle large maps
Image.MAX_IMAGE_PIXELS = None  # Remove size limit entirely
# Alternative: Set a specific larger limit
# Image.MAX_IMAGE_PIXELS = 500000000  # 500MP limit

class ReforgerTileGenerator:
    def __init__(self, 
                 source_image_path: str,
                 output_dir: str = "public/map-tiles",
                 map_size_km: int = 13,
                 tile_size_px: int = 542,  # Nick's optimized size
                 meters_per_tile: int = 100):
        
        self.source_image_path = source_image_path
        self.output_dir = output_dir
        self.map_size_km = map_size_km
        self.map_size_m = map_size_km * 1000
        self.tile_size_px = tile_size_px
        self.meters_per_tile = meters_per_tile
        
        # Calculate grid dimensions
        self.tiles_per_axis = self.map_size_m // meters_per_tile  # 130 tiles for 13km
        self.max_zoom = self._calculate_max_zoom()
        
        print(f"Map Configuration:")
        print(f"  Size: {map_size_km}km x {map_size_km}km")
        print(f"  Tiles per axis: {self.tiles_per_axis}")
        print(f"  Tile size: {tile_size_px}px")
        print(f"  Max zoom level: {self.max_zoom}")
        print(f"  Resolution: ~{(meters_per_tile * 100) / tile_size_px:.1f}cm per pixel")
    
    def _calculate_max_zoom(self) -> int:
        """Calculate maximum zoom level needed"""
        return math.ceil(math.log2(self.tiles_per_axis))
    
    def generate_all_tiles(self):
        """Generate complete tile set with all zoom levels"""
        print("\n🗺️  Starting tile generation...")
        
        # Create output directory structure
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Step 1: Generate LOD 0 (highest detail) tiles
        print("📸 Generating LOD 0 tiles...")
        self._generate_base_tiles()
        
        # Step 2: Generate all other zoom levels
        for zoom in range(1, self.max_zoom + 1):
            print(f"🔄 Generating LOD {zoom} tiles...")
            self._generate_zoom_level(zoom)
        
        # Step 3: Generate metadata
        print("📋 Generating metadata...")
        self._generate_metadata()
        
        # Step 4: Generate Leaflet configuration
        print("🍃 Generating Leaflet configuration...")
        self._generate_leaflet_config()
        
        print(f"✅ Tile generation complete! Output: {self.output_dir}")
        self._print_statistics()
    
    def _generate_base_tiles(self):
        """Generate LOD 0 (base level) tiles from source image"""
        # Load source image
        if not os.path.exists(self.source_image_path):
            raise FileNotFoundError(f"Source image not found: {self.source_image_path}")
        
        print(f"Loading source image: {self.source_image_path}")
        print("⚠️  Loading large image, this may take a moment...")
        
        try:
            # Load image with memory optimization
            source_img = Image.open(self.source_image_path)
            source_width, source_height = source_img.size
            
            print(f"Source image: {source_width}x{source_height} ({source_width * source_height:,} pixels)")
            
            # Check if image is extremely large and warn user
            if source_width * source_height > 200000000:  # 200MP
                print("⚠️  Very large source image detected!")
                print("💡 Consider resizing source image if generation is too slow")
            
        except Exception as e:
            print(f"❌ Error loading source image: {e}")
            print("💡 Try one of these solutions:")
            print("   1. Resize your source image to ~8192x8192 pixels")
            print("   2. Convert to a different format (PNG → JPG)")
            print("   3. Use image editing software to reduce file size")
            raise
        
        # Calculate scaling factor
        pixels_per_meter = source_width / self.map_size_m
        tile_source_size = int(self.meters_per_tile * pixels_per_meter)
        
        print(f"Source tile size: {tile_source_size}px (will be resized to {self.tile_size_px}px)")
        
        # Create LOD 0 directory
        lod0_dir = os.path.join(self.output_dir, "0")
        os.makedirs(lod0_dir, exist_ok=True)
        
        # Generate tiles with memory management
        total_tiles = self.tiles_per_axis * self.tiles_per_axis
        current_tile = 0
        
        print(f"Generating {total_tiles:,} base tiles...")
        
        for tile_x in range(self.tiles_per_axis):
            col_dir = os.path.join(lod0_dir, str(tile_x))
            os.makedirs(col_dir, exist_ok=True)
            
            for tile_y in range(self.tiles_per_axis):
                current_tile += 1
                
                # Calculate source coordinates
                source_x = tile_x * tile_source_size
                source_y = tile_y * tile_source_size
                
                # Crop tile from source with bounds checking
                crop_box = (
                    max(0, source_x),
                    max(0, source_y),
                    min(source_x + tile_source_size, source_width),
                    min(source_y + tile_source_size, source_height)
                )
                
                try:
                    tile_img = source_img.crop(crop_box)
                    
                    # Resize to standard tile size if needed
                    if tile_img.size != (self.tile_size_px, self.tile_size_px):
                        tile_img = tile_img.resize(
                            (self.tile_size_px, self.tile_size_px), 
                            Image.Resampling.LANCZOS
                        )
                    
                    # Save tile with optimized settings
                    tile_path = os.path.join(col_dir, f"{tile_y}.jpg")
                    tile_img.save(
                        tile_path, 
                        "JPEG", 
                        quality=85, 
                        optimize=True,
                        progressive=True
                    )
                    
                    # Clean up tile image from memory
                    tile_img.close()
                    del tile_img
                    
                except Exception as e:
                    print(f"❌ Error processing tile {tile_x},{tile_y}: {e}")
                    continue
                
                # Progress indicator with memory cleanup
                if current_tile % 100 == 0:
                    progress = current_tile / total_tiles * 100
                    print(f"  Progress: {progress:.1f}% ({current_tile:,}/{total_tiles:,} tiles)")
                    # Force garbage collection every 100 tiles to manage memory
                    gc.collect()
        
        # Clean up source image
        source_img.close()
        del source_img
        gc.collect()
        
        print(f"\n✅ Generated {total_tiles:,} base tiles")
        print(f"💾 Memory cleanup completed")
    
    def _generate_zoom_level(self, zoom: int):
        """Generate tiles for a specific zoom level by combining 4 tiles from previous level"""
        prev_zoom = zoom - 1
        prev_dir = os.path.join(self.output_dir, str(prev_zoom))
        current_dir = os.path.join(self.output_dir, str(zoom))
        os.makedirs(current_dir, exist_ok=True)
        
        # Calculate dimensions for this zoom level
        tiles_this_level = self.tiles_per_axis // (2 ** zoom)
        if tiles_this_level < 1:
            return
        
        for tile_x in range(tiles_this_level):
            col_dir = os.path.join(current_dir, str(tile_x))
            os.makedirs(col_dir, exist_ok=True)
            
            for tile_y in range(tiles_this_level):
                # Combine 4 tiles from previous zoom level
                combined_img = Image.new('RGB', (self.tile_size_px, self.tile_size_px))
                
                # Calculate source tile coordinates
                src_x = tile_x * 2
                src_y = tile_y * 2
                half_size = self.tile_size_px // 2
                
                # Combine 4 quadrants
                for dx in range(2):
                    for dy in range(2):
                        src_tile_x = src_x + dx
                        src_tile_y = src_y + dy
                        
                        src_tile_path = os.path.join(prev_dir, str(src_tile_x), f"{src_tile_y}.jpg")
                        
                        if os.path.exists(src_tile_path):
                            src_tile = Image.open(src_tile_path)
                            # Resize to half size
                            src_tile = src_tile.resize((half_size, half_size), Image.Resampling.LANCZOS)
                            
                            # Paste into combined image
                            paste_x = dx * half_size
                            paste_y = dy * half_size
                            combined_img.paste(src_tile, (paste_x, paste_y))
                
                # Save combined tile
                tile_path = os.path.join(col_dir, f"{tile_y}.jpg")
                combined_img.save(tile_path, "JPEG", quality=85, optimize=True)
        
        print(f"  Generated {tiles_this_level * tiles_this_level} tiles for zoom {zoom}")
    
    def _generate_metadata(self):
        """Generate metadata file with tile system information"""
        metadata = {
            "mapName": "Everon",
            "mapSizeKm": self.map_size_km,
            "mapSizeM": self.map_size_m,
            "tileSizePx": self.tile_size_px,
            "metersPerTile": self.meters_per_tile,
            "tilesPerAxis": self.tiles_per_axis,
            "maxZoom": self.max_zoom,
            "resolutionCmPerPixel": (self.meters_per_tile * 100) / self.tile_size_px,
            "bounds": {
                "sw": [0, 0],
                "ne": [self.map_size_m, self.map_size_m]
            },
            "zoomLevels": []
        }
        
        # Add zoom level information
        for zoom in range(self.max_zoom + 1):
            tiles_at_zoom = max(1, self.tiles_per_axis // (2 ** zoom))
            metadata["zoomLevels"].append({
                "zoom": zoom,
                "tilesPerAxis": tiles_at_zoom,
                "totalTiles": tiles_at_zoom * tiles_at_zoom,
                "metersPerTile": self.meters_per_tile * (2 ** zoom)
            })
        
        # Save metadata
        metadata_path = os.path.join(self.output_dir, "metadata.json")
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
    
    def _generate_leaflet_config(self):
        """Generate Leaflet configuration file"""
        # Calculate the scaling factor for CRS transformation
        # Based on Nick's approach: tile_size / standard_tile_size / meters_per_tile
        scale_factor = 1 / (self.tile_size_px / 256 / self.meters_per_tile)
        
        config = f'''
// Leaflet configuration for Arma Reforger tiled map
// Based on recoil.org implementation

// Custom tile layer with inverted Y axis (Arma uses bottom-left origin)
L.TileLayer.InvertedY = L.TileLayer.extend({{
  getTileUrl: function(coords) {{
    // Invert Y coordinate to match Arma's coordinate system
    coords.y = -(coords.y + 1);
    return L.TileLayer.prototype.getTileUrl.call(this, coords);
  }}
}});

// Custom CRS for Arma Reforger coordinates
L.CRS.ReforgerCRS = L.extend({{}}, L.CRS, {{
  projection: L.Projection.LonLat,
  transformation: new L.Transformation({scale_factor}, 0, -{scale_factor}, 0),
  
  // Define bounds
  infinite: false,
  wrapLng: null,
  wrapLat: null
}});

// Map configuration
const REFORGER_CONFIG = {{
  MAP_SIZE_M: {self.map_size_m},
  TILE_SIZE_PX: {self.tile_size_px},
  METERS_PER_TILE: {self.meters_per_tile},
  MAX_ZOOM: {self.max_zoom},
  MIN_ZOOM: 0,
  
  // Default map bounds
  BOUNDS: [
    [0, 0],
    [{self.map_size_m}, {self.map_size_m}]
  ],
  
  // Coordinate conversion helpers
  EDGE_TO_CENTER_OFFSET: {self.meters_per_tile / 2}
}};

// Helper functions for coordinate conversion
function gameCoordsToLatLng(gameCoords) {{
  return L.latLng([
    gameCoords[1] + REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET,
    gameCoords[0] + REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET
  ]);
}}

function latLngToGameCoords(latLng) {{
  return [
    latLng.lng - REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET,
    latLng.lat - REFORGER_CONFIG.EDGE_TO_CENTER_OFFSET
  ];
}}

// Grid reference functions
function coordsToGrid(x, y) {{
  const majorX = Math.floor(x / 1000);
  const majorY = Math.floor(y / 1000);
  const minorX = Math.floor((x % 1000) / 100);
  const minorY = Math.floor((y % 1000) / 100);
  
  const gridLetter = String.fromCharCode(65 + majorX);
  
  return {{
    major: `${{gridLetter}}${{majorY}}`,
    minor: `${{gridLetter}}${{majorY}}-${{minorX}}${{minorY}}`,
    coordinates: {{ x, y }}
  }};
}}

// Initialize map function
function createReforgerMap(containerId, options = {{}}) {{
  const map = L.map(containerId, {{
    crs: L.CRS.ReforgerCRS,
    center: [REFORGER_CONFIG.MAP_SIZE_M / 2, REFORGER_CONFIG.MAP_SIZE_M / 2],
    zoom: 2,
    minZoom: REFORGER_CONFIG.MIN_ZOOM,
    maxZoom: REFORGER_CONFIG.MAX_ZOOM,
    maxBounds: REFORGER_CONFIG.BOUNDS,
    maxBoundsViscosity: 1.0,
    ...options
  }});
  
  // Add tile layer
  const tileLayer = new L.TileLayer.InvertedY('/map-tiles/{{z}}/{{x}}/{{y}}.jpg', {{
    maxZoom: REFORGER_CONFIG.MAX_ZOOM,
    minZoom: REFORGER_CONFIG.MIN_ZOOM,
    zoomReverse: true,
    bounds: REFORGER_CONFIG.BOUNDS,
    noWrap: true,
    attribution: 'Arma Reforger Map Data'
  }});
  
  tileLayer.addTo(map);
  
  return map;
}}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {{
  module.exports = {{
    L,
    REFORGER_CONFIG,
    gameCoordsToLatLng,
    latLngToGameCoords,
    coordsToGrid,
    createReforgerMap
  }};
}}
'''
        
        config_path = os.path.join(self.output_dir, "leaflet-config.js")
        with open(config_path, 'w') as f:
            f.write(config)
    
    def _print_statistics(self):
        """Print generation statistics"""
        total_files = 0
        total_size = 0
        
        for root, dirs, files in os.walk(self.output_dir):
            for file in files:
                if file.endswith('.jpg'):
                    file_path = os.path.join(root, file)
                    total_files += 1
                    total_size += os.path.getsize(file_path)
        
        print(f"\n📊 Statistics:")
        print(f"  Total tiles: {total_files:,}")
        print(f"  Total size: {total_size / (1024*1024):.1f} MB")
        print(f"  Average tile size: {total_size / total_files / 1024:.1f} KB")
        
        # Size breakdown by zoom level
        print(f"\n📁 Size by zoom level:")
        for zoom in range(self.max_zoom + 1):
            zoom_dir = os.path.join(self.output_dir, str(zoom))
            if os.path.exists(zoom_dir):
                zoom_size = 0
                zoom_files = 0
                for root, dirs, files in os.walk(zoom_dir):
                    for file in files:
                        if file.endswith('.jpg'):
                            zoom_size += os.path.getsize(os.path.join(root, file))
                            zoom_files += 1
                
                print(f"  LOD {zoom}: {zoom_files:,} files, {zoom_size / (1024*1024):.1f} MB")

def main():
    """Main execution function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate Arma Reforger tiled map")
    parser.add_argument("source_image", help="Path to source map image")
    parser.add_argument("--output", "-o", default="public/map-tiles", 
                       help="Output directory for tiles")
    parser.add_argument("--size", "-s", type=int, default=13,
                       help="Map size in kilometers (default: 13)")
    parser.add_argument("--tile-size", type=int, default=542,
                       help="Tile size in pixels (default: 542)")
    parser.add_argument("--meters-per-tile", type=int, default=100,
                       help="Meters per tile at LOD 0 (default: 100)")
    parser.add_argument("--max-source-size", type=int, default=None,
                       help="Resize source image if larger than this (pixels on longest side)")
    parser.add_argument("--force", action="store_true",
                       help="Force processing of very large images")
    
    args = parser.parse_args()
    
    # Validate source image
    if not os.path.exists(args.source_image):
        print(f"❌ Error: Source image not found: {args.source_image}")
        return 1
    
    try:
        # Quick size check without loading full image
        with Image.open(args.source_image) as img:
            width, height = img.size
            total_pixels = width * height
            
        print(f"📏 Source image: {width}x{height} ({total_pixels:,} pixels)")
        
        # Warn about very large images
        if total_pixels > 300000000 and not args.force:  # 300MP
            print(f"⚠️  WARNING: Very large source image detected!")
            print(f"   This may consume significant memory and time.")
            print(f"   Consider using --max-source-size 8192 to resize first.")
            print(f"   Or use --force to proceed anyway.")
            
            response = input("Continue anyway? (y/N): ").strip().lower()
            if response != 'y':
                print("Operation cancelled.")
                return 1
        
        # Optional: Resize source image if requested
        if args.max_source_size and max(width, height) > args.max_source_size:
            print(f"🔄 Resizing source image to max {args.max_source_size}px...")
            
            with Image.open(args.source_image) as source_img:
                # Calculate new size maintaining aspect ratio
                if width > height:
                    new_width = args.max_source_size
                    new_height = int((height * args.max_source_size) / width)
                else:
                    new_height = args.max_source_size
                    new_width = int((width * args.max_source_size) / height)
                
                resized_img = source_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                
                # Save resized version
                base_name = os.path.splitext(args.source_image)[0]
                resized_path = f"{base_name}_resized.jpg"
                resized_img.save(resized_path, "JPEG", quality=95, optimize=True)
                
                print(f"💾 Resized image saved as: {resized_path}")
                
                # Use resized image as source
                args.source_image = resized_path
        
        # Create generator and run
        generator = ReforgerTileGenerator(
            source_image_path=args.source_image,
            output_dir=args.output,
            map_size_km=args.size,
            tile_size_px=args.tile_size,
            meters_per_tile=args.meters_per_tile
        )
        
        generator.generate_all_tiles()
        
        print(f"\n🎉 Success! Your tiled map is ready at: {args.output}")
        print(f"\nNext steps:")
        print(f"1. Copy the generated files to your Next.js public directory")
        print(f"2. Update your TacticalMap component to use the tiled system")
        print(f"3. Include the leaflet-config.js in your project")
        
        return 0
        
    except MemoryError:
        print(f"\n❌ Memory Error: Source image too large for available RAM")
        print(f"💡 Solutions:")
        print(f"   1. Use --max-source-size 8192 to resize the image first")
        print(f"   2. Close other applications to free up memory")
        print(f"   3. Use a machine with more RAM")
        return 1
        
    except Exception as e:
        print(f"❌ Error: {e}")
        print(f"\n💡 Troubleshooting tips:")
        print(f"   • Check if the image file is corrupted")
        print(f"   • Try converting to a different format (PNG ↔ JPG)")
        print(f"   • Use --max-source-size to resize large images")
        print(f"   • Ensure you have enough disk space")
        return 1

if __name__ == "__main__":
    exit(main())
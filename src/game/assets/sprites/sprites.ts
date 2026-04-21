/**
 * Pixel-art SVG sprites for Factory Island.
 *
 * Each sprite is a data-URI pointing to a 32�32 (or 64�64 for 2�2 buildings)
 * SVG that uses crisp <rect> elements for a clean pixel-art look.
 * Grid cells are 64 px, so 1�1 assets map to 32?64 (2� scale) and
 * 2�2 assets to 64?128 (also 2� scale), keeping everything sharp.
 *
 * Palette (shared across ALL assets for visual consistency):
 *   dark outline   #1a1a2e   light outline  #3a3a5e
 *   grass1         #4a8c3f   grass2         #3d7a33
 *   wood-dark      #5c3a1e   wood-mid       #8b5e34  wood-light #b07840
 *   leaf-dark      #2d6e2d   leaf-mid       #3d9e3d  leaf-light #5cb85c
 *   stone-dark     #5a5a6a   stone-mid      #7a7a8a  stone-light #a0a0b0
 *   iron-dark      #6a7080   iron-mid       #8a90a0  iron-light #b0b8c8
 *   copper-dark    #8b5e20   copper-mid     #cd7f32  copper-light #e8a848
 *   red-dark       #8b2020   red-mid        #c44040  red-light #e06060
 *   blue-dark      #1a5080   blue-mid       #2888c8  blue-light #48b0e8
 *   yellow-dark    #a08000   yellow-mid     #d4aa00  yellow-light #ffd700
 *   purple-dark    #4a3a80   purple-mid     #6a5acd  purple-light #8a7ae8
 */

import type { AssetType, FloorTileType } from "../../store/reducer";
import warehousePng from "./images/warehouse.png";

// ---------------------------------------------------------------------------
// Helper: build a data-URI from an SVG string
// ---------------------------------------------------------------------------
function svgURI(width: number, height: number, body: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Shorthand for a pixel rect
function r(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
}

// ---------------------------------------------------------------------------
// 1�1 RESOURCES  (32�32 SVG)
// ---------------------------------------------------------------------------

function makeTree(): string {
  // Trunk
  let s = "";
  s += r(13, 20, 6, 10, "#5c3a1e");
  s += r(14, 22, 4, 8, "#8b5e34");
  // Canopy (round-ish layered)
  s += r(8, 4, 16, 16, "#2d6e2d");
  s += r(6, 6, 20, 12, "#3d9e3d");
  s += r(10, 2, 12, 4, "#3d9e3d");
  s += r(8, 8, 16, 8, "#5cb85c");
  s += r(12, 4, 8, 4, "#5cb85c");
  // Highlight
  s += r(10, 6, 4, 2, "#7dd87d");
  return svgURI(32, 32, s);
}

function makeSapling(): string {
  let s = "";
  // Thin stem
  s += r(14, 16, 4, 14, "#5c3a1e");
  s += r(15, 18, 2, 10, "#8b5e34");
  // Small leaf clusters
  s += r(10, 8, 12, 10, "#3d9e3d");
  s += r(12, 6, 8, 4, "#5cb85c");
  s += r(8, 10, 16, 6, "#3d9e3d");
  // Highlight
  s += r(12, 8, 4, 2, "#7dd87d");
  return svgURI(32, 32, s);
}

function makeStone(): string {
  let s = "";
  // Main rock body
  s += r(4, 12, 24, 16, "#5a5a6a");
  s += r(6, 10, 20, 4, "#7a7a8a");
  s += r(8, 8, 16, 4, "#7a7a8a");
  // Lighter face
  s += r(8, 14, 12, 8, "#a0a0b0");
  s += r(10, 12, 8, 4, "#b8b8c8");
  // Dark edge
  s += r(4, 26, 24, 2, "#3a3a4e");
  // Specular
  s += r(10, 10, 4, 2, "#c8c8d8");
  return svgURI(32, 32, s);
}

function makeIron(): string {
  let s = "";
  // Rock base
  s += r(4, 14, 24, 14, "#5a5a6a");
  s += r(6, 12, 20, 4, "#6a7080");
  // Iron vein streaks
  s += r(8, 16, 6, 4, "#8a90a0");
  s += r(16, 18, 8, 4, "#b0b8c8");
  s += r(10, 22, 10, 4, "#8a90a0");
  // Metallic highlight
  s += r(18, 16, 4, 2, "#d0d8e8");
  s += r(10, 14, 2, 2, "#c0c8d8");
  // Dark base
  s += r(4, 26, 24, 2, "#3a3a4e");
  return svgURI(32, 32, s);
}

function makeCopper(): string {
  let s = "";
  // Rock base
  s += r(4, 14, 24, 14, "#5a5a6a");
  s += r(6, 12, 20, 4, "#6a6a7a");
  // Copper vein streaks
  s += r(8, 16, 8, 4, "#cd7f32");
  s += r(18, 18, 6, 4, "#e8a848");
  s += r(12, 22, 8, 4, "#cd7f32");
  // Warm highlight
  s += r(10, 16, 2, 2, "#f0c060");
  s += r(20, 18, 2, 2, "#f0c060");
  // Dark base
  s += r(4, 26, 24, 2, "#3a3a4e");
  return svgURI(32, 32, s);
}

// ---------------------------------------------------------------------------
// 1�1 BUILDINGS  (32�32 SVG)
// ---------------------------------------------------------------------------

function makeCable(): string {
  let s = "";
  // Cable conduit box
  s += r(6, 8, 20, 16, "#a08000");
  s += r(8, 6, 16, 4, "#d4aa00");
  s += r(8, 10, 16, 12, "#ffd700");
  // Inner wire detail
  s += r(12, 12, 8, 2, "#a08000");
  s += r(12, 16, 8, 2, "#a08000");
  // Connector nubs
  s += r(4, 14, 4, 4, "#d4aa00");
  s += r(24, 14, 4, 4, "#d4aa00");
  // Dark base
  s += r(6, 24, 20, 2, "#3a3a4e");
  return svgURI(32, 32, s);
}

function makePowerPole(): string {
  let s = "";
  // Tall pole
  s += r(13, 2, 6, 28, "#5c3a1e");
  s += r(14, 4, 4, 24, "#8b5e34");
  // Cross-arm top
  s += r(4, 4, 24, 4, "#5a5a6a");
  s += r(6, 2, 20, 4, "#7a7a8a");
  // Insulators
  s += r(6, 2, 4, 4, "#2888c8");
  s += r(22, 2, 4, 4, "#2888c8");
  // Lightning bolt symbol
  s += r(14, 14, 4, 2, "#ffd700");
  s += r(12, 16, 4, 2, "#ffd700");
  s += r(14, 18, 4, 2, "#ffd700");
  // Base plate
  s += r(10, 28, 12, 2, "#3a3a4e");
  return svgURI(32, 32, s);
}

// ---------------------------------------------------------------------------
// 2�2 BUILDINGS  (64�64 SVG)
// ---------------------------------------------------------------------------

function makeGenerator(): string {
  let s = "";
  // Main housing
  s += r(4, 16, 56, 40, "#1a5080");
  s += r(6, 14, 52, 4, "#2888c8");
  s += r(8, 18, 48, 36, "#2888c8");
  // Chimney / exhaust stack
  s += r(10, 4, 10, 14, "#5a5a6a");
  s += r(12, 2, 6, 6, "#7a7a8a");
  // Smoke puffs
  s += r(10, 0, 4, 4, "#b0b0b0");
  s += r(16, 2, 3, 3, "#c8c8c8");
  // Front panel / gauge
  s += r(28, 24, 20, 16, "#1a5080");
  s += r(30, 26, 16, 12, "#0a3060");
  // Lightning icon on front
  s += r(36, 28, 4, 2, "#ffd700");
  s += r(34, 30, 4, 2, "#ffd700");
  s += r(36, 32, 4, 2, "#ffd700");
  // Wood fuel slot on side
  s += r(12, 30, 12, 16, "#5c3a1e");
  s += r(14, 32, 8, 12, "#8b5e34");
  // Base
  s += r(4, 54, 56, 4, "#0a3060");
  s += r(2, 56, 60, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeBattery(): string {
  let s = "";
  // Outer casing
  s += r(8, 10, 48, 46, "#1a5080");
  s += r(10, 8, 44, 4, "#2888c8");
  s += r(10, 12, 44, 42, "#2888c8");
  // Battery terminals on top
  s += r(18, 4, 10, 8, "#7a7a8a");
  s += r(36, 4, 10, 8, "#7a7a8a");
  // Charge level bars (3 bars of green)
  s += r(16, 22, 32, 6, "#1a8040");
  s += r(16, 32, 32, 6, "#22a050");
  s += r(16, 42, 32, 6, "#30c060");
  // + symbol
  s += r(20, 6, 6, 2, "#d0d0d0");
  s += r(22, 4, 2, 6, "#d0d0d0");
  // - symbol
  s += r(38, 6, 6, 2, "#d0d0d0");
  // Base
  s += r(8, 54, 48, 4, "#0a3060");
  s += r(6, 56, 52, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeWorkbench(): string {
  let s = "";
  // Table surface
  s += r(4, 20, 56, 8, "#b07840");
  s += r(2, 18, 60, 4, "#8b5e34");
  // Front apron
  s += r(4, 28, 56, 6, "#8b5e34");
  // Legs
  s += r(8, 34, 6, 22, "#5c3a1e");
  s += r(50, 34, 6, 22, "#5c3a1e");
  s += r(10, 36, 4, 18, "#8b5e34");
  s += r(50, 36, 4, 18, "#8b5e34");
  // Tools on the bench
  // Hammer head
  s += r(14, 10, 10, 6, "#7a7a8a");
  s += r(18, 16, 2, 6, "#5c3a1e");
  // Saw blade
  s += r(34, 8, 16, 4, "#a0a0b0");
  s += r(36, 12, 12, 2, "#7a7a8a");
  s += r(34, 6, 2, 2, "#a0a0b0");
  s += r(38, 6, 2, 2, "#a0a0b0");
  s += r(42, 6, 2, 2, "#a0a0b0");
  s += r(46, 6, 2, 2, "#a0a0b0");
  // Base
  s += r(6, 56, 52, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeSmithy(): string {
  let s = "";
  // Furnace body
  s += r(8, 16, 48, 40, "#8b2020");
  s += r(10, 14, 44, 4, "#c44040");
  s += r(12, 18, 40, 36, "#c44040");
  // Chimney
  s += r(40, 4, 10, 14, "#5a5a6a");
  s += r(42, 2, 6, 6, "#7a7a8a");
  // Fire opening
  s += r(16, 30, 20, 16, "#1a1a2e");
  s += r(18, 32, 16, 12, "#0a0a1e");
  // Flames
  s += r(20, 36, 4, 6, "#ffd700");
  s += r(26, 34, 4, 8, "#e8a848");
  s += r(24, 38, 4, 4, "#ff6020");
  // Anvil on right
  s += r(40, 28, 14, 4, "#5a5a6a");
  s += r(42, 24, 10, 6, "#7a7a8a");
  s += r(44, 32, 6, 10, "#5a5a6a");
  // Base
  s += r(8, 54, 48, 4, "#5a2020");
  s += r(6, 56, 52, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

// Warehouse sprite is loaded from a PNG file.
// To update the image, replace: src/game/assets/sprites/images/warehouse.png

function makeMapShop(): string {
  let s = "";
  // Tent / awning
  s += r(4, 8, 56, 8, "#6a5acd");
  s += r(8, 4, 48, 6, "#8a7ae8");
  s += r(12, 2, 40, 4, "#6a5acd");
  // Scalloped awning edge
  s += r(4, 16, 8, 4, "#6a5acd");
  s += r(16, 16, 8, 4, "#8a7ae8");
  s += r(28, 16, 8, 4, "#6a5acd");
  s += r(40, 16, 8, 4, "#8a7ae8");
  s += r(52, 16, 8, 4, "#6a5acd");
  // Counter
  s += r(6, 28, 52, 8, "#8b5e34");
  s += r(8, 26, 48, 4, "#b07840");
  // Goods on counter
  s += r(12, 22, 6, 6, "#cd7f32"); // copper bar
  s += r(22, 22, 6, 6, "#a0a0b0"); // iron bar
  s += r(32, 20, 8, 8, "#ffd700"); // gold item
  s += r(44, 22, 6, 6, "#5cb85c"); // herb
  // Support posts
  s += r(8, 16, 4, 40, "#5c3a1e");
  s += r(52, 16, 4, 40, "#5c3a1e");
  // Base
  s += r(4, 56, 56, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

// ---------------------------------------------------------------------------
// FLOOR TILES  (32�32 SVG)
// ---------------------------------------------------------------------------

export const GRASS_VARIANTS = [
  { base: "#4a8c3f", tuft: "#3d7a33" },
  { base: "#3d7a33", tuft: "#4a8c3f" },
] as const;

export const GRASS_TUFTS: readonly [number, number, number, number][] = [
  [4, 4, 2, 2],
  [12, 8, 3, 2],
  [22, 2, 2, 3],
  [6, 18, 2, 2],
  [18, 22, 3, 2],
  [26, 14, 2, 2],
  [28, 26, 2, 2],
  [10, 28, 2, 2],
];

export const STONE_FLOOR_BASE = "#7a7a8a";
export const STONE_FLOOR_BLOCKS: readonly [number, number, number, number, string][] = [
  [0, 0, 15, 10, "#8a8a9a"],
  [17, 0, 15, 10, "#6a6a7a"],
  [0, 12, 10, 8, "#6a6a7a"],
  [12, 12, 8, 8, "#8a8a9a"],
  [22, 12, 10, 8, "#7a7a8a"],
  [0, 22, 15, 10, "#8a8a9a"],
  [17, 22, 15, 10, "#6a6a7a"],
];
export const STONE_FLOOR_MORTAR: readonly [number, number, number, number][] = [
  [15, 0, 2, 32],
  [0, 10, 32, 2],
  [0, 20, 32, 2],
  [10, 10, 2, 12],
  [20, 10, 2, 12],
];
export const STONE_FLOOR_MORTAR_COLOR = "#5a5a6a";

function makeGrassTile(variant: 0 | 1): string {
  // Two slight variants for checkerboard
  const c1 = GRASS_VARIANTS[variant].base;
  const c2 = GRASS_VARIANTS[variant].tuft;
  let s = "";
  s += r(0, 0, 32, 32, c1);
  // Grass tufts / subtle detail
  for (const [x, y, w, h] of GRASS_TUFTS) {
    s += r(x, y, w, h, c2);
  }
  return svgURI(32, 32, s);
}

function makeStoneFloorTile(): string {
  let s = "";
  // Base
  s += r(0, 0, 32, 32, STONE_FLOOR_BASE);
  // Stone block pattern (large bricks)
  for (const [x, y, w, h, color] of STONE_FLOOR_BLOCKS) {
    s += r(x, y, w, h, color);
  }
  // Mortar lines
  for (const [x, y, w, h] of STONE_FLOOR_MORTAR) {
    s += r(x, y, w, h, STONE_FLOOR_MORTAR_COLOR);
  }
  return svgURI(32, 32, s);
}

// ---------------------------------------------------------------------------
// 2�2 RESOURCE DEPOSITS  (64�64 SVG)
// ---------------------------------------------------------------------------

function makeStoneDeposit(): string {
  let s = "";
  // Large rock formation base
  s += r(4, 20, 56, 36, "#5a5a6a");
  s += r(8, 16, 48, 8, "#6a6a7a");
  s += r(12, 12, 40, 8, "#7a7a8a");
  // Top boulders
  s += r(16, 6, 20, 10, "#7a7a8a");
  s += r(36, 10, 16, 10, "#6a6a7a");
  s += r(10, 14, 14, 8, "#6a6a7a");
  // Light faces
  s += r(16, 22, 18, 12, "#a0a0b0");
  s += r(38, 24, 14, 10, "#8a8a9a");
  s += r(20, 8, 12, 6, "#a0a0b0");
  // Specular highlights
  s += r(22, 10, 4, 2, "#c8c8d8");
  s += r(40, 26, 4, 2, "#b8b8c8");
  s += r(18, 24, 6, 2, "#c8c8d8");
  // Crystal/sparkle accents
  s += r(28, 14, 2, 2, "#e0e0f0");
  s += r(44, 18, 2, 2, "#e0e0f0");
  // Dark crevices
  s += r(24, 32, 2, 8, "#3a3a4e");
  s += r(36, 28, 2, 10, "#3a3a4e");
  // Infinity symbol (8) in center
  s += r(24, 40, 4, 2, "#ffd700");
  s += r(32, 40, 4, 2, "#ffd700");
  s += r(22, 42, 2, 2, "#ffd700");
  s += r(28, 42, 2, 2, "#ffd700");
  s += r(30, 42, 2, 2, "#ffd700");
  s += r(36, 42, 2, 2, "#ffd700");
  s += r(24, 44, 4, 2, "#ffd700");
  s += r(32, 44, 4, 2, "#ffd700");
  // Base
  s += r(4, 54, 56, 4, "#3a3a4e");
  s += r(2, 56, 60, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeIronDeposit(): string {
  let s = "";
  // Large rock formation
  s += r(4, 22, 56, 34, "#5a5a6a");
  s += r(8, 18, 48, 8, "#6a6a7a");
  s += r(14, 12, 36, 10, "#6a7080");
  // Top peak
  s += r(20, 6, 24, 10, "#6a7080");
  s += r(24, 2, 16, 8, "#7a8090");
  // Iron vein streaks (metallic blue-grey)
  s += r(12, 24, 10, 6, "#8a90a0");
  s += r(28, 20, 12, 6, "#b0b8c8");
  s += r(44, 26, 10, 4, "#8a90a0");
  s += r(18, 36, 14, 4, "#b0b8c8");
  s += r(38, 34, 12, 4, "#8a90a0");
  s += r(26, 6, 8, 4, "#b0b8c8");
  // Metallic highlights
  s += r(30, 22, 4, 2, "#d0d8e8");
  s += r(14, 26, 4, 2, "#c0c8d8");
  s += r(46, 28, 4, 2, "#d0d8e8");
  s += r(28, 4, 4, 2, "#d8e0f0");
  // Infinity symbol
  s += r(24, 42, 4, 2, "#ffd700");
  s += r(32, 42, 4, 2, "#ffd700");
  s += r(22, 44, 2, 2, "#ffd700");
  s += r(28, 44, 2, 2, "#ffd700");
  s += r(30, 44, 2, 2, "#ffd700");
  s += r(36, 44, 2, 2, "#ffd700");
  s += r(24, 46, 4, 2, "#ffd700");
  s += r(32, 46, 4, 2, "#ffd700");
  // Base
  s += r(4, 54, 56, 4, "#3a3a4e");
  s += r(2, 56, 60, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeCopperDeposit(): string {
  let s = "";
  // Large rock formation
  s += r(4, 22, 56, 34, "#5a5a6a");
  s += r(8, 18, 48, 8, "#6a6a7a");
  s += r(14, 12, 36, 10, "#6a6a7a");
  // Top peak
  s += r(18, 6, 28, 10, "#6a6a7a");
  s += r(22, 2, 20, 8, "#7a7a8a");
  // Copper vein streaks (warm orange-brown)
  s += r(10, 24, 12, 6, "#cd7f32");
  s += r(30, 20, 14, 6, "#e8a848");
  s += r(44, 28, 10, 4, "#cd7f32");
  s += r(16, 36, 16, 4, "#e8a848");
  s += r(36, 34, 14, 4, "#cd7f32");
  s += r(24, 6, 12, 4, "#e8a848");
  // Warm highlights
  s += r(32, 22, 4, 2, "#f0c060");
  s += r(12, 26, 4, 2, "#f0c060");
  s += r(46, 30, 4, 2, "#f0c060");
  s += r(28, 8, 4, 2, "#f8d070");
  // Greenish patina spots
  s += r(14, 30, 4, 2, "#5cb85c");
  s += r(40, 24, 4, 2, "#5cb85c");
  // Infinity symbol
  s += r(24, 42, 4, 2, "#ffd700");
  s += r(32, 42, 4, 2, "#ffd700");
  s += r(22, 44, 2, 2, "#ffd700");
  s += r(28, 44, 2, 2, "#ffd700");
  s += r(30, 44, 2, 2, "#ffd700");
  s += r(36, 44, 2, 2, "#ffd700");
  s += r(24, 46, 4, 2, "#ffd700");
  s += r(32, 46, 4, 2, "#ffd700");
  // Base
  s += r(4, 54, 56, 4, "#3a3a4e");
  s += r(2, 56, 60, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

// ---------------------------------------------------------------------------
// AUTO-MINER & CONVEYOR  (32�32 SVG, 1�1 buildings)
// ---------------------------------------------------------------------------

function makeAutoMiner(): string {
  let s = "";
  // Machine body (dark industrial)
  s += r(4, 8, 24, 20, "#4a4a5a");
  s += r(6, 10, 20, 16, "#5a5a6a");
  // Drill bit
  s += r(12, 4, 8, 6, "#8a8a9a");
  s += r(14, 2, 4, 4, "#a0a0b0");
  s += r(15, 0, 2, 4, "#c0c8d0");
  // Gears
  s += r(8, 12, 6, 6, "#ff6b00");
  s += r(18, 14, 6, 6, "#ff6b00");
  s += r(10, 14, 2, 2, "#ffa500");
  s += r(20, 16, 2, 2, "#ffa500");
  // Treads / base
  s += r(2, 26, 28, 4, "#3a3a4a");
  s += r(4, 28, 24, 2, "#2a2a3a");
  // Output arrow indicator
  s += r(26, 14, 4, 4, "#ffd700");
  s += r(28, 12, 2, 8, "#ffd700");
  // Outline shadow
  s += r(2, 30, 28, 2, "#1a1a2e");
  return svgURI(32, 32, s);
}

function makeConveyor(): string {
  let s = "";
  // Belt base
  s += r(2, 10, 28, 12, "#6a6a7a");
  s += r(4, 12, 24, 8, "#8a8a9a");
  // Belt ridges
  s += r(6, 14, 4, 4, "#5a5a6a");
  s += r(14, 14, 4, 4, "#5a5a6a");
  s += r(22, 14, 4, 4, "#5a5a6a");
  // Arrow (points east by default, rotated via CSS)
  s += r(16, 6, 4, 4, "#ffa500");
  s += r(20, 8, 4, 2, "#ffa500");
  s += r(16, 22, 4, 4, "#ffa500");
  s += r(20, 22, 4, 2, "#ffa500");
  s += r(22, 12, 6, 8, "#ffa500");
  s += r(26, 14, 4, 4, "#ffd700");
  // Side rails
  s += r(2, 8, 28, 2, "#4a4a5a");
  s += r(2, 22, 28, 2, "#4a4a5a");
  // Shadow
  s += r(2, 24, 28, 2, "#1a1a2e");
  return svgURI(32, 32, s);
}

function makeConveyorCorner(): string {
  let s = "";
  // L-shaped belt body (north -> east default orientation)
  s += r(10, 2, 12, 20, "#6a6a7a");
  s += r(10, 10, 20, 12, "#6a6a7a");
  s += r(12, 4, 8, 16, "#8a8a9a");
  s += r(12, 12, 16, 8, "#8a8a9a");
  // Inner corner details
  s += r(16, 12, 4, 4, "#5a5a6a");
  s += r(12, 10, 2, 2, "#5a5a6a");
  s += r(20, 16, 2, 2, "#5a5a6a");
  // Flow arrows
  s += r(14, 2, 4, 4, "#ffa500");
  s += r(14, 6, 4, 2, "#ffa500");
  s += r(22, 14, 4, 4, "#ffa500");
  s += r(18, 14, 2, 4, "#ffa500");
  // Rails / shadow
  s += r(8, 0, 16, 2, "#4a4a5a");
  s += r(8, 22, 24, 2, "#4a4a5a");
  s += r(8, 24, 24, 2, "#1a1a2e");
  return svgURI(32, 32, s);
}

function makeManualAssembler(): string {
  let s = "";
  // Housing
  s += r(8, 14, 48, 40, "#1a5080");
  s += r(10, 12, 44, 4, "#48b0e8");
  s += r(12, 16, 40, 36, "#2b78b8");
  // Front panel
  s += r(18, 24, 28, 20, "#0f3558");
  s += r(20, 26, 24, 16, "#174972");
  // Gear icon
  s += r(30, 30, 4, 8, "#ffd700");
  s += r(28, 32, 8, 4, "#ffd700");
  s += r(26, 28, 2, 2, "#d4aa00");
  s += r(36, 28, 2, 2, "#d4aa00");
  s += r(26, 38, 2, 2, "#d4aa00");
  s += r(36, 38, 2, 2, "#d4aa00");
  // Input/output slots
  s += r(12, 32, 6, 10, "#8b5e34");
  s += r(46, 32, 6, 10, "#8b5e34");
  // Base
  s += r(8, 54, 48, 4, "#12324f");
  s += r(6, 56, 52, 4, "#1a1a2e");
  return svgURI(64, 64, s);
}

function makeAutoSmelter(): string {
  let s = "";
  // 2x1 machine body
  s += r(2, 8, 60, 24, "#6c1616");
  s += r(4, 10, 56, 20, "#a62828");
  // Furnace chamber
  s += r(10, 14, 18, 12, "#2a0909");
  s += r(12, 16, 14, 8, "#ff6a00");
  // Conveyor-facing ports
  s += r(0, 16, 6, 8, "#444");
  s += r(58, 16, 6, 8, "#444");
  // Accent / status strip
  s += r(30, 12, 24, 4, "#ffd166");
  s += r(30, 24, 24, 3, "#1a1a2e");
  return svgURI(64, 32, s);
}

// ---------------------------------------------------------------------------
// WAREHOUSE INPUT TILE  (32�32 SVG)
// ---------------------------------------------------------------------------

function makeWarehouseInputTile(): string {
  let s = "";
  // Dark amber-tinted background matching warehouse palette
  s += r(0, 0, 32, 32, "#1a1500");
  // Gold border
  s += r(0, 0, 32, 2, "#d4aa00");
  s += r(0, 30, 32, 2, "#d4aa00");
  s += r(0, 0, 2, 32, "#d4aa00");
  s += r(30, 0, 2, 32, "#d4aa00");
  // Inner background
  s += r(2, 2, 28, 28, "#251e00");
  // Upward arrow (items flow north into warehouse above)
  // Arrow tip (top)
  s += r(14, 3, 4, 4, "#ffd700");
  // Arrow neck widening
  s += r(11, 7, 10, 4, "#ffd700");
  // Arrow head base (widest)
  s += r(8, 11, 16, 4, "#ffd700");
  // Shaft
  s += r(13, 15, 6, 12, "#ffd700");
  // Bright center highlight on arrow
  s += r(15, 4, 2, 3, "#ffe980");
  s += r(14, 16, 2, 8, "#ffe980");
  return svgURI(32, 32, s);
}

// ---------------------------------------------------------------------------
// SERVICE HUB (Drone Hub) — 2×2 (64×64 SVG)
// ---------------------------------------------------------------------------

function makeServiceHub(): string {
  // 2x2 building (64x64)
  let s = "";
  // Dark blue background
  s += r(2, 2, 60, 60, "#1a2a5e");
  s += r(4, 4, 56, 56, "#2a3e8c");
  // Border
  s += r(0, 0, 64, 2, "#4169E1");
  s += r(0, 62, 64, 2, "#4169E1");
  s += r(0, 0, 2, 64, "#4169E1");
  s += r(62, 0, 2, 64, "#4169E1");
  // Drone body (center hexagon approximation)
  s += r(24, 28, 16, 8, "#a0c8ff");
  s += r(20, 30, 24, 4, "#c8e0ff");
  // Drone arms
  s += r(10, 26, 12, 4, "#7aa8d8");
  s += r(42, 26, 12, 4, "#7aa8d8");
  s += r(10, 34, 12, 4, "#7aa8d8");
  s += r(42, 34, 12, 4, "#7aa8d8");
  // Rotor circles (approximate)
  s += r(8, 22, 8, 8, "#3a6aaa");
  s += r(48, 22, 8, 8, "#3a6aaa");
  s += r(8, 34, 8, 8, "#3a6aaa");
  s += r(48, 34, 8, 8, "#3a6aaa");
  // Highlight dot on rotors
  s += r(10, 24, 2, 2, "#90c0ff");
  s += r(50, 24, 2, 2, "#90c0ff");
  s += r(10, 36, 2, 2, "#90c0ff");
  s += r(50, 36, 2, 2, "#90c0ff");
  // Signal arc above hub
  s += r(26, 10, 12, 2, "#5af");
  s += r(22, 14, 20, 2, "#48a0ff");
  s += r(18, 18, 28, 2, "#3080e0");
  return svgURI(64, 64, s);
}

// ---------------------------------------------------------------------------
// EXPORT MAPS
// ---------------------------------------------------------------------------

/** Pixel-art sprite data URIs per asset type */
export const ASSET_SPRITES: Record<AssetType, string> = {
  tree: makeTree(),
  sapling: makeSapling(),
  stone: makeStone(),
  iron: makeIron(),
  copper: makeCopper(),
  cable: makeCable(),
  power_pole: makePowerPole(),
  generator: makeGenerator(),
  battery: makeBattery(),
  workbench: makeWorkbench(),
  smithy: makeSmithy(),
  warehouse: warehousePng,
  map_shop: makeMapShop(),
  stone_deposit: makeStoneDeposit(),
  iron_deposit: makeIronDeposit(),
  copper_deposit: makeCopperDeposit(),
  auto_miner: makeAutoMiner(),
  conveyor: makeConveyor(),
  conveyor_corner: makeConveyorCorner(),
  manual_assembler: makeManualAssembler(),
  auto_smelter: makeAutoSmelter(),
  service_hub: makeServiceHub(),
};

/** Grass tile variants (0 / 1 for checkerboard) */
export const GRASS_TILE_SPRITES = [makeGrassTile(0), makeGrassTile(1)] as const;

/** Floor tile sprites */
export const FLOOR_SPRITES: Record<"stone_floor", string> = {
  stone_floor: makeStoneFloorTile(),
};

/** Warehouse input tile marker sprite */
export const WAREHOUSE_INPUT_SPRITE = makeWarehouseInputTile();

import Phaser from "phaser";

const GRID_W = 80;
const GRID_H = 50;
const CELL_PX = 64;
const GAME_W = GRID_W * CELL_PX;
const GAME_H = GRID_H * CELL_PX;

/** Event name used to push floorMap updates from React into the Phaser scene. */
export const FLOOR_MAP_EVENT = "floorMapChanged";

/** The floorMap shape coming from React state. */
export type FloorMapData = Record<string, string>;

// Grass colours – must stay in sync with sprites.ts makeGrassTile()
const GRASS_VARIANTS = [
  { base: "#4a8c3f", tuft: "#3d7a33" }, // variant 0
  { base: "#3d7a33", tuft: "#4a8c3f" }, // variant 1
];

// Tuft rectangles in 32×32 source coords – copied from sprites.ts
const TUFTS: readonly [number, number, number, number][] = [
  [4, 4, 2, 2], [12, 8, 3, 2], [22, 2, 2, 3], [6, 18, 2, 2],
  [18, 22, 3, 2], [26, 14, 2, 2], [28, 26, 2, 2], [10, 28, 2, 2],
];

// Stone floor colours – must stay in sync with sprites.ts makeStoneFloorTile()
// Rectangles are in 32×32 source coords, painted at 2× onto CELL_PX texture.
const STONE_BASE = "#7a7a8a";
const STONE_BLOCKS: readonly [number, number, number, number, string][] = [
  [0, 0, 15, 10, "#8a8a9a"],
  [17, 0, 15, 10, "#6a6a7a"],
  [0, 12, 10, 8, "#6a6a7a"],
  [12, 12, 8, 8, "#8a8a9a"],
  [22, 12, 10, 8, "#7a7a8a"],
  [0, 22, 15, 10, "#8a8a9a"],
  [17, 22, 15, 10, "#6a6a7a"],
];
const STONE_MORTAR: readonly [number, number, number, number][] = [
  [15, 0, 2, 32],
  [0, 10, 32, 2],
  [0, 20, 32, 2],
  [10, 10, 2, 12],
  [20, 10, 2, 12],
];
const MORTAR_COLOR = "#5a5a6a";

/** World scene – renders grass + stone floor as tilemap layers. */
class WorldScene extends Phaser.Scene {
  /** Stone floor tilemap layer – tiles set/cleared via applyFloorMap(). */
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  /** The firstgid assigned to the stone floor tileset in the shared tilemap. */
  private floorFirstGid = 0;

  constructor() {
    super({ key: "WorldScene" });
  }

  create(): void {
    this.buildLayers();

    // Listen for floorMap updates from React
    this.events.on(FLOOR_MAP_EVENT, (data: FloorMapData) => {
      this.applyFloorMap(data);
    });
  }

  /** Apply a full floorMap snapshot – set or clear tiles as needed. */
  private applyFloorMap(data: FloorMapData): void {
    // Clear all existing floor tiles
    this.floorLayer.forEachTile((t: Phaser.Tilemaps.Tile) => {
      if (t.index !== -1) {
        this.floorLayer.removeTileAt(t.x, t.y);
      }
    });

    // Place floor tiles from snapshot
    for (const key of Object.keys(data)) {
      const [gx, gy] = key.split(",").map(Number);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        this.floorLayer.putTileAt(this.floorFirstGid, gx, gy);
      }
    }

    if (import.meta.env.DEV) {
      let placed = 0;
      this.floorLayer.forEachTile((t: Phaser.Tilemaps.Tile) => {
        if (t.index !== -1) placed++;
      });
      console.debug("[WorldScene] floorMapChanged", {
        entries: Object.keys(data).length,
        placed,
      });
    }
  }

  /**
   * Build all tilemap layers: grass (checkerboard) + stone floor (initially empty).
   * Both share a single Phaser tilemap so tile rendering uses the same proven path.
   */
  private buildLayers(): void {
    // === Grass spritesheet (2 variants side by side: 128×64) ===
    const grassCt = this.textures.createCanvas("grass_tiles", CELL_PX * 2, CELL_PX)!;
    const grassCtx = grassCt.context;

    for (let v = 0; v < 2; v++) {
      const ox = v * CELL_PX;
      const { base, tuft } = GRASS_VARIANTS[v];

      grassCtx.fillStyle = base;
      grassCtx.fillRect(ox, 0, CELL_PX, CELL_PX);

      grassCtx.fillStyle = tuft;
      for (const [x, y, w, h] of TUFTS) {
        grassCtx.fillRect(ox + x * 2, y * 2, w * 2, h * 2);
      }
    }
    grassCt.refresh();

    // === Stone floor spritesheet (single tile: 64×64) ===
    const floorCt = this.textures.createCanvas("stone_floor_tiles", CELL_PX, CELL_PX)!;
    const floorCtx = floorCt.context;

    floorCtx.fillStyle = STONE_BASE;
    floorCtx.fillRect(0, 0, CELL_PX, CELL_PX);

    for (const [bx, by, bw, bh, color] of STONE_BLOCKS) {
      floorCtx.fillStyle = color;
      floorCtx.fillRect(bx * 2, by * 2, bw * 2, bh * 2);
    }

    floorCtx.fillStyle = MORTAR_COLOR;
    for (const [mx, my, mw, mh] of STONE_MORTAR) {
      floorCtx.fillRect(mx * 2, my * 2, mw * 2, mh * 2);
    }
    floorCt.refresh();

    // === Shared tilemap (80×50, 64px tiles) ===
    const map = this.make.tilemap({
      width: GRID_W,
      height: GRID_H,
      tileWidth: CELL_PX,
      tileHeight: CELL_PX,
    });

    // Grass tileset + layer (tile indices: firstgid, firstgid+1)
    const grassTs = map.addTilesetImage("grass_tiles", "grass_tiles", CELL_PX, CELL_PX, 0, 0)!;
    const grassLayer = map.createBlankLayer("grass", grassTs)!;

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        grassLayer.putTileAt((x + y) % 2 + grassTs.firstgid, x, y);
      }
    }

    // Stone floor tileset + layer (initially empty, filled by applyFloorMap)
    const floorTs = map.addTilesetImage("stone_floor_tiles", "stone_floor_tiles", CELL_PX, CELL_PX, 0, 0)!;
    this.floorLayer = map.createBlankLayer("floor", floorTs)!;
    this.floorLayer.setDepth(1); // Above grass layer (depth 0)
    this.floorFirstGid = floorTs.firstgid;
  }
}

/**
 * Create and return a new Phaser.Game instance attached to the given parent element.
 * The canvas is transparent so the existing React-rendered grid shows through.
 */
export function createPhaserGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent,
    transparent: true,
    scene: [WorldScene],
    // Disable all input – React still handles everything
    input: {
      mouse: false,
      touch: false,
      keyboard: false,
      gamepad: false,
    },
    banner: false,
    audio: { noAudio: true },
    render: {
      pixelArt: true,
      antialias: false,
    },
  });
}

import Phaser from "phaser";
import {
  ASSET_SPRITES,
  GRASS_TUFTS,
  GRASS_VARIANTS,
  STONE_FLOOR_BASE,
  STONE_FLOOR_BLOCKS,
  STONE_FLOOR_MORTAR,
  STONE_FLOOR_MORTAR_COLOR,
} from "../assets/sprites/sprites";
import { CELL_PX, GRID_H, GRID_W } from "../constants/grid";
import { ASSET_LABELS, type Direction } from "../store/reducer";

const GAME_W = GRID_W * CELL_PX;
const GAME_H = GRID_H * CELL_PX;

/** Event name used to push floorMap updates from React into the Phaser scene. */
export const FLOOR_MAP_EVENT = "floorMapChanged";

/** Event name used to push static asset snapshots from React into the Phaser scene. */
export const STATIC_ASSETS_EVENT = "staticAssetsChanged";

/** The floorMap shape coming from React state. */
export type FloorMapData = Record<string, string>;

export interface StaticAssetSnapshot {
  id: string;
  type:
    | "map_shop"
    | "stone_deposit"
    | "iron_deposit"
    | "copper_deposit"
    | "stone"
    | "iron"
    | "copper"
    | "tree"
    | "sapling"
    | "cable"
    | "generator"
    | "battery"
    | "power_pole"
    | "conveyor"
    | "conveyor_corner"
    | "auto_miner"
    | "auto_smelter"
    | "warehouse"
    | "workbench"
    | "smithy"
    | "manual_assembler";
  x: number;
  y: number;
  width: 1 | 2;
  height: 1 | 2;
  direction?: Direction;
}

const DIRECTION_ROTATION: Record<Direction, number> = {
  north: 270,
  east: 0,
  south: 90,
  west: 180,
};

/** World scene � renders grass + stone floor as tilemap layers. */
class WorldScene extends Phaser.Scene {
  /** Stone floor tilemap layer � tiles set/cleared via applyFloorMap(). */
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  /** The firstgid assigned to the stone floor tileset in the shared tilemap. */
  private floorFirstGid = 0;
  /** Static world assets currently rendered by Phaser. */
  private staticAssetNodes = new Map<string, Phaser.GameObjects.Container>();

  constructor() {
    super({ key: "WorldScene" });
  }

  preload(): void {
    this.load.image("asset:map_shop", ASSET_SPRITES.map_shop);
    this.load.image("asset:stone_deposit", ASSET_SPRITES.stone_deposit);
    this.load.image("asset:iron_deposit", ASSET_SPRITES.iron_deposit);
    this.load.image("asset:copper_deposit", ASSET_SPRITES.copper_deposit);
    this.load.image("asset:stone", ASSET_SPRITES.stone);
    this.load.image("asset:iron", ASSET_SPRITES.iron);
    this.load.image("asset:copper", ASSET_SPRITES.copper);
    this.load.image("asset:tree", ASSET_SPRITES.tree);
    this.load.image("asset:sapling", ASSET_SPRITES.sapling);
    this.load.image("asset:cable", ASSET_SPRITES.cable);
    this.load.image("asset:generator", ASSET_SPRITES.generator);
    this.load.image("asset:battery", ASSET_SPRITES.battery);
    this.load.image("asset:power_pole", ASSET_SPRITES.power_pole);
    this.load.image("asset:conveyor", ASSET_SPRITES.conveyor);
    this.load.image("asset:conveyor_corner", ASSET_SPRITES.conveyor_corner);
    this.load.image("asset:auto_miner", ASSET_SPRITES.auto_miner);
    this.load.image("asset:auto_smelter", ASSET_SPRITES.auto_smelter);
    this.load.image("asset:warehouse", ASSET_SPRITES.warehouse);
    this.load.image("asset:workbench", ASSET_SPRITES.workbench);
    this.load.image("asset:smithy", ASSET_SPRITES.smithy);
    this.load.image("asset:manual_assembler", ASSET_SPRITES.manual_assembler);
  }

  create(): void {
    this.buildLayers();

    // Listen for floorMap updates from React
    this.events.on(FLOOR_MAP_EVENT, (data: FloorMapData) => {
      this.applyFloorMap(data);
    });

    this.events.on(STATIC_ASSETS_EVENT, (data: StaticAssetSnapshot[]) => {
      this.applyStaticAssets(data);
    });
  }

  /** Apply a full floorMap snapshot � set or clear tiles as needed. */
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

  /** Apply a full static-asset snapshot for Phaser-rendered world sprites. */
  private applyStaticAssets(data: StaticAssetSnapshot[]): void {
    const nextIds = new Set<string>();

    for (const asset of data) {
      nextIds.add(asset.id);

      let container = this.staticAssetNodes.get(asset.id);
      if (!container) {
        container = this.createStaticAssetContainer(asset);
        this.staticAssetNodes.set(asset.id, container);
      }

      this.updateStaticAssetContainer(container, asset);
    }

    for (const [id, container] of this.staticAssetNodes.entries()) {
      if (nextIds.has(id)) continue;
      container.destroy(true);
      this.staticAssetNodes.delete(id);
    }
  }

  /** Create a Phaser container for one static world asset. */
  private createStaticAssetContainer(asset: StaticAssetSnapshot): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const image = this.add.image(0, 0, `asset:${asset.type}`).setOrigin(0.5, 0.5);
    const label = this.add.text(0, 0, ASSET_LABELS[asset.type], {
      fontFamily: "Arial",
      fontSize: "9px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.6)",
      padding: { left: 4, right: 4, top: 1, bottom: 1 },
    });

    image.name = "sprite";
    label.name = "label";

    container.add([image, label]);
    container.setDepth(2);
    return container;
  }

  /** Keep a static world asset container aligned with the shared world grid. */
  private updateStaticAssetContainer(
    container: Phaser.GameObjects.Container,
    asset: StaticAssetSnapshot
  ): void {
    const worldWidth = asset.width * CELL_PX;
    const worldHeight = asset.height * CELL_PX;
    const image = container.getByName("sprite") as Phaser.GameObjects.Image;
    const label = container.getByName("label") as Phaser.GameObjects.Text;

    container.setPosition(asset.x * CELL_PX, asset.y * CELL_PX);

    image.setPosition(worldWidth / 2, (worldHeight - 16) / 2);
    image.setDisplaySize(worldWidth - 4, worldHeight - 16);
    if (
      asset.type === "conveyor" ||
      asset.type === "conveyor_corner" ||
      asset.type === "auto_miner" ||
      asset.type === "auto_smelter"
    ) {
      image.setAngle(DIRECTION_ROTATION[asset.direction ?? "east"]);
    } else {
      image.setAngle(0);
    }

    label.setText(ASSET_LABELS[asset.type]);
    label.setOrigin(0.5, 0);
    label.setPosition(worldWidth / 2, worldHeight - 15);
  }

  /**
   * Build all tilemap layers: grass (checkerboard) + stone floor (initially empty).
   * Both share a single Phaser tilemap so tile rendering uses the same proven path.
   */
  private buildLayers(): void {
    // === Grass spritesheet (2 variants side by side: 128�64) ===
    const grassCt = this.textures.createCanvas("grass_tiles", CELL_PX * 2, CELL_PX)!;
    const grassCtx = grassCt.context;

    for (let v = 0; v < 2; v++) {
      const ox = v * CELL_PX;
      const { base, tuft } = GRASS_VARIANTS[v];

      grassCtx.fillStyle = base;
      grassCtx.fillRect(ox, 0, CELL_PX, CELL_PX);

      grassCtx.fillStyle = tuft;
      for (const [x, y, w, h] of GRASS_TUFTS) {
        grassCtx.fillRect(ox + x * 2, y * 2, w * 2, h * 2);
      }
    }
    grassCt.refresh();

    // === Stone floor spritesheet (single tile: 64�64) ===
    const floorCt = this.textures.createCanvas("stone_floor_tiles", CELL_PX, CELL_PX)!;
    const floorCtx = floorCt.context;

    floorCtx.fillStyle = STONE_FLOOR_BASE;
    floorCtx.fillRect(0, 0, CELL_PX, CELL_PX);

    for (const [bx, by, bw, bh, color] of STONE_FLOOR_BLOCKS) {
      floorCtx.fillStyle = color;
      floorCtx.fillRect(bx * 2, by * 2, bw * 2, bh * 2);
    }

    floorCtx.fillStyle = STONE_FLOOR_MORTAR_COLOR;
    for (const [mx, my, mw, mh] of STONE_FLOOR_MORTAR) {
      floorCtx.fillRect(mx * 2, my * 2, mw * 2, mh * 2);
    }
    floorCt.refresh();

    // === Shared tilemap (80�50, 64px tiles) ===
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
    // Disable all input � React still handles everything
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

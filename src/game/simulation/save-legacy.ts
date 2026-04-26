import type {
  GameState,
  GameMode,
  PlacedAsset,
  Inventory,
  BuildingType,
  HotbarSlot,
  SmithyState,
  GeneratorState,
  BatteryState,
  AutoMinerEntry,
  ConveyorState,
  ConveyorItem,
  AutoSmelterEntry,
  ManualAssemblerState,
} from "../store/reducer";
import { createInitialState } from "../store/reducer";

/** Represents a pre-version save payload. */
export type SaveGameV0 = Record<string, unknown>;

/**
 * Migrate a pre-version (V0) save into the first versioned format (V1).
 */
export function migrateV0ToV1(raw: SaveGameV0): any {
  const mode: GameMode =
    raw.mode === "debug" || raw.mode === "release"
      ? (raw.mode as GameMode)
      : "release";
  const base = createInitialState(mode);

  // Conveyor normalization (legacy `item` field -> queue array).
  const VALID_CONVEYOR_ITEMS: ConveyorItem[] = [
    "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear",
  ];
  const isConveyorItem = (v: unknown): v is ConveyorItem =>
    typeof v === "string" && VALID_CONVEYOR_ITEMS.includes(v as ConveyorItem);

  const normalizedConveyors: Record<string, ConveyorState> = {};
  const conveyorsRaw = raw.conveyors;
  if (conveyorsRaw && typeof conveyorsRaw === "object") {
    for (const [id, value] of Object.entries(conveyorsRaw as Record<string, unknown>)) {
      const conv = value as { queue?: unknown[]; item?: unknown } | null;
      if (conv && Array.isArray(conv.queue)) {
        normalizedConveyors[id] = { queue: conv.queue.filter(isConveyorItem) };
      } else if (conv && isConveyorItem((conv as any)?.item)) {
        normalizedConveyors[id] = { queue: [(conv as any).item] };
      } else {
        normalizedConveyors[id] = { queue: [] };
      }
    }
  }

  // Auto-smelter recipe validation.
  const autoSmelters: Record<string, AutoSmelterEntry> =
    raw.autoSmelters && typeof raw.autoSmelters === "object"
      ? Object.entries(raw.autoSmelters as Record<string, unknown>).reduce(
          (acc, [id, smelter]) => {
            const s = (smelter as Record<string, unknown>) || {};
            acc[id] = {
              inputBuffer: Array.isArray(s.inputBuffer)
                ? (s.inputBuffer as ConveyorItem[]).filter(isConveyorItem)
                : [],
              processing: (s.processing as AutoSmelterEntry["processing"]) ?? null,
              pendingOutput: Array.isArray(s.pendingOutput)
                ? (s.pendingOutput as ConveyorItem[]).filter(isConveyorItem)
                : [],
              status: (typeof s.status === "string" ? s.status : "IDLE") as AutoSmelterEntry["status"],
              lastRecipeInput: (typeof s.lastRecipeInput === "string" ? s.lastRecipeInput : null) as string | null,
              lastRecipeOutput: (typeof s.lastRecipeOutput === "string" ? s.lastRecipeOutput : null) as string | null,
              throughputEvents: Array.isArray(s.throughputEvents) ? (s.throughputEvents as number[]) : [],
              selectedRecipe:
                s.selectedRecipe === "iron" || s.selectedRecipe === "copper"
                  ? s.selectedRecipe
                  : "iron",
            };
            return acc;
          },
          {} as Record<string, AutoSmelterEntry>,
        )
      : {};

  // Warehouse-inventory -> unified inventory migration.
  const CONVEYOR_RESOURCE_KEYS: readonly string[] = [
    "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear",
  ];
  const rawInv: Inventory =
    raw.inventory && typeof raw.inventory === "object"
      ? { ...base.inventory, ...(raw.inventory as Partial<Inventory>) }
      : { ...base.inventory };
  const rawWhInvs =
    raw.warehouseInventories && typeof raw.warehouseInventories === "object"
      ? (raw.warehouseInventories as Record<string, Record<string, number>>)
      : {};
  const migratedInv = { ...rawInv } as Record<string, number> & Inventory;
  const migratedWhInvs: Record<string, Inventory> = {};
  for (const [whId, whInv] of Object.entries(rawWhInvs)) {
    if (!whInv || typeof whInv !== "object") {
      migratedWhInvs[whId] = { ...base.inventory };
      continue;
    }
    const newWhInv = { ...whInv } as Record<string, number>;
    for (const key of CONVEYOR_RESOURCE_KEYS) {
      const amt = typeof whInv[key] === "number" ? whInv[key] : 0;
      if (amt > 0) {
        migratedInv[key] = (migratedInv[key] ?? 0) + amt;
        newWhInv[key] = 0;
      }
    }
    migratedWhInvs[whId] = newWhInv as unknown as Inventory;
  }

  const machinePowerRatio =
    raw.machinePowerRatio && typeof raw.machinePowerRatio === "object"
      ? (raw.machinePowerRatio as Record<string, number>)
      : {};

  const safeRecord = <T>(v: unknown, fallback: Record<string, T>): Record<string, T> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : fallback;
  const safeArray = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v as T[]) : fallback;
  const safeNum = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  return {
    version: 1,
    mode,
    assets: safeRecord<PlacedAsset>(raw.assets, base.assets),
    cellMap: safeRecord<string>(raw.cellMap, base.cellMap),
    inventory: migratedInv as Inventory,
    purchasedBuildings: safeArray<BuildingType>(raw.purchasedBuildings, base.purchasedBuildings),
    placedBuildings: safeArray<BuildingType>(raw.placedBuildings, base.placedBuildings),
    warehousesPurchased: safeNum(raw.warehousesPurchased, base.warehousesPurchased),
    warehousesPlaced: safeNum(raw.warehousesPlaced, base.warehousesPlaced),
    warehouseInventories: Object.keys(migratedWhInvs).length > 0
      ? migratedWhInvs
      : (safeRecord<Inventory>(raw.warehouseInventories, base.warehouseInventories)),
    cablesPlaced: safeNum(raw.cablesPlaced, base.cablesPlaced),
    powerPolesPlaced: safeNum(raw.powerPolesPlaced, base.powerPolesPlaced),
    hotbarSlots: safeArray<HotbarSlot>(raw.hotbarSlots, base.hotbarSlots),
    activeSlot: safeNum(raw.activeSlot, base.activeSlot),
    smithy: raw.smithy && typeof raw.smithy === "object"
      ? { ...base.smithy, ...(raw.smithy as Partial<SmithyState>) }
      : base.smithy,
    generator: raw.generator && typeof raw.generator === "object"
      ? { fuel: 0, progress: 0, running: false, ...(raw.generator as Partial<GeneratorState>) }
      : { fuel: 0, progress: 0, running: false },
    battery: raw.battery && typeof raw.battery === "object"
      ? { ...base.battery, ...(raw.battery as Partial<BatteryState>) }
      : base.battery,
    floorMap: safeRecord<"stone_floor">(raw.floorMap, base.floorMap),
    autoMiners: safeRecord<AutoMinerEntry>(raw.autoMiners, base.autoMiners),
    conveyors: { ...safeRecord<ConveyorState>(undefined, base.conveyors), ...normalizedConveyors },
    autoSmelters,
    manualAssembler: raw.manualAssembler && typeof raw.manualAssembler === "object"
      ? { ...base.manualAssembler, ...(raw.manualAssembler as Partial<ManualAssemblerState>) }
      : base.manualAssembler,
    machinePowerRatio,
    saplingGrowAt: safeRecord<number>(raw.saplingGrowAt, base.saplingGrowAt),
  };
}

export function isRuntimeGameStateSnapshot(raw: unknown): raw is GameState {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.version === "number") return false;
  return Array.isArray(candidate.connectedAssetIds)
    && Array.isArray(candidate.poweredMachineIds)
    && Array.isArray(candidate.notifications)
    && Object.prototype.hasOwnProperty.call(candidate, "openPanel")
    && Object.prototype.hasOwnProperty.call(candidate, "buildMode");
}

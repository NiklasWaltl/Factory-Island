// ============================================================
// Tests for Factory Island – Save/Load System
// ============================================================

import {
  CURRENT_SAVE_VERSION,
  migrateSave,
  serializeState,
  deserializeState,
  loadAndHydrate,
  type SaveGameV1,
  type SaveGameLatest,
} from "../save";
import { createInitialState, type GameState } from "../../store/reducer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal V1 save from a fresh release state */
function makeV1Save(overrides: Partial<SaveGameV1> = {}): SaveGameV1 {
  const state = createInitialState("release");
  return {
    ...serializeState(state),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Save creation (serializeState)
// ---------------------------------------------------------------------------

describe("serializeState", () => {
  it("stamps the current version", () => {
    const state = createInitialState("release");
    const save = serializeState(state);
    expect(save.version).toBe(CURRENT_SAVE_VERSION);
  });

  it("preserves key persistent fields", () => {
    const state = createInitialState("release");
    state.inventory.wood = 42;
    state.generators["test-gen-1"] = { fuel: 10, progress: 0, running: false };
    const save = serializeState(state);
    expect(save.inventory.wood).toBe(42);
    expect(save.generators["test-gen-1"].fuel).toBe(10);
    expect(save.mode).toBe("release");
  });

  it("persists keep-in-stock targets", () => {
    const state = createInitialState("release");
    state.assets["wb-save"] = { id: "wb-save", type: "workbench", x: 1, y: 1, size: 1 };
    state.keepStockByWorkbench = {
      "wb-save": {
        wood_pickaxe: { enabled: true, amount: 3 },
      },
    };

    const save = serializeState(state);
    expect(save.keepStockByWorkbench).toEqual({
      "wb-save": {
        wood_pickaxe: { enabled: true, amount: 3 },
      },
    });
  });

  it("excludes derived/transient fields", () => {
    const state = createInitialState("release");
    state.connectedAssetIds = ["a", "b"];
    state.poweredMachineIds = ["x"];
    state.notifications = [{ id: "n1", message: "test", type: "info", timestamp: 0 } as any];
    state.openPanel = "workbench";
    const save = serializeState(state);
    // These should not exist on the save type
    expect((save as any).connectedAssetIds).toBeUndefined();
    expect((save as any).poweredMachineIds).toBeUndefined();
    expect((save as any).notifications).toBeUndefined();
    expect((save as any).openPanel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Save loading (deserializeState)
// ---------------------------------------------------------------------------

describe("deserializeState", () => {
  it("returns a full GameState with all required fields", () => {
    const save = makeV1Save();
    const state = deserializeState(save);
    // Derived fields should be present with defaults
    expect(Array.isArray(state.connectedAssetIds)).toBe(true);
    expect(Array.isArray(state.poweredMachineIds)).toBe(true);
    expect(state.openPanel).toBeNull();
    expect(state.notifications).toEqual([]);
    expect(state.buildMode).toBe(false);
    expect(state.energyDebugOverlay).toBe(false);
  });

  it("recomputes connectedAssetIds from assets", () => {
    const debugState = createInitialState("debug");
    const save = serializeState(debugState);
    const loaded = deserializeState(save);
    // Debug state has generators + cables → should have connectivity
    expect(loaded.connectedAssetIds.length).toBeGreaterThan(0);
  });

  it("restores keep-stock targets and drops stale workbench entries", () => {
    const state = createInitialState("release");
    state.assets["wb-valid"] = { id: "wb-valid", type: "workbench", x: 5, y: 5, size: 1 };
    state.keepStockByWorkbench = {
      "wb-valid": {
        wood_pickaxe: { enabled: true, amount: 2 },
      },
      "wb-missing": {
        wood_pickaxe: { enabled: true, amount: 2 },
      },
    };

    const loaded = deserializeState(serializeState(state));
    expect(loaded.keepStockByWorkbench).toEqual({
      "wb-valid": {
        wood_pickaxe: { enabled: true, amount: 2 },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Migrating old (v0) saves
// ---------------------------------------------------------------------------

describe("migrateSave – v0 → v1", () => {
  it("migrates a legacy save without version field to v1", () => {
    const legacySave = {
      mode: "release",
      assets: {},
      cellMap: {},
      inventory: { coins: 50, wood: 10 },
      conveyors: {},
    };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(CURRENT_SAVE_VERSION);
    expect(result!.inventory.coins).toBe(50);
    expect(result!.inventory.wood).toBe(10);
  });

  it("normalises legacy conveyor item field to queue array", () => {
    const legacySave = {
      mode: "release",
      conveyors: {
        "conv-1": { item: "iron" },
        "conv-2": { queue: ["stone", "copper"] },
        "conv-3": { queue: ["invalidItem", "iron"] },
      },
    };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    expect(result!.conveyors["conv-1"].queue).toEqual(["iron"]);
    expect(result!.conveyors["conv-2"].queue).toEqual(["stone", "copper"]);
    // Invalid items are filtered out
    expect(result!.conveyors["conv-3"].queue).toEqual(["iron"]);
  });

  it("validates auto-smelter recipe, defaulting to iron", () => {
    const legacySave = {
      mode: "release",
      autoSmelters: {
        "sm-1": { selectedRecipe: "copper", inputBuffer: [], pendingOutput: [], status: "IDLE" },
        "sm-2": { selectedRecipe: "banana", inputBuffer: [] },
      },
    };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    expect(result!.autoSmelters["sm-1"].selectedRecipe).toBe("copper");
    expect(result!.autoSmelters["sm-2"].selectedRecipe).toBe("iron"); // defaulted
  });

  it("migrates resources from warehouseInventories to unified inventory", () => {
    const legacySave = {
      mode: "release",
      inventory: { iron: 5 },
      warehouseInventories: {
        "wh-1": { iron: 10, copper: 3, axe: 2 },
      },
    };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    // iron: 5 (inventory) + 10 (warehouse) = 15
    expect(result!.inventory.iron).toBe(15);
    // copper: 0 (default) + 3 (warehouse) = 3
    expect(result!.inventory.copper).toBe(3);
    // Warehouse iron/copper should be zeroed
    expect(result!.warehouseInventories["wh-1"].iron).toBe(0);
    expect(result!.warehouseInventories["wh-1"].copper).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Missing fields → defaults
// ---------------------------------------------------------------------------

describe("migrateSave – missing fields get defaults", () => {
  it("fills missing inventory fields from base state", () => {
    const legacySave = {
      mode: "release",
      inventory: { coins: 200 },
      // everything else missing
    };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    expect(result!.inventory.coins).toBe(200);
    // Fields not in the save should have base defaults
    expect(typeof result!.inventory.wood).toBe("number");
    expect(typeof result!.inventory.stone).toBe("number");
  });

  it("fills missing smithy from defaults", () => {
    const legacySave = { mode: "release" };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    expect(result!.smithy).toBeDefined();
    expect(result!.smithy.fuel).toBe(0);
    expect(result!.smithy.processing).toBe(false);
  });

  it("fills missing generator/battery from defaults", () => {
    const legacySave = { mode: "release" };
    const result = migrateSave(legacySave);
    expect(result).not.toBeNull();
    // V2: generators is a per-instance map; no assets → empty object
    expect(result!.generators).toBeDefined();
    expect(typeof result!.generators).toBe("object");
    expect(result!.battery).toBeDefined();
    expect(typeof result!.battery.stored).toBe("number");
  });

  it("migrates v14 saves by seeding empty keep-stock config", () => {
    const latest = serializeState(createInitialState("release"));
    const { keepStockByWorkbench: _dropKeepStock, ...legacyShape } = latest as any;
    const v14 = { ...legacyShape, version: 14 };

    const result = migrateSave(v14);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(CURRENT_SAVE_VERSION);
    expect(result!.keepStockByWorkbench).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid save data – defensive handling
// ---------------------------------------------------------------------------

describe("migrateSave – invalid data", () => {
  it("returns null for null input", () => {
    expect(migrateSave(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(migrateSave(undefined)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(migrateSave("hello")).toBeNull();
    expect(migrateSave(42)).toBeNull();
    expect(migrateSave(true)).toBeNull();
  });

  it("returns null for a save from the future (version > current)", () => {
    const futureSave = { version: 9999, mode: "release" };
    expect(migrateSave(futureSave)).toBeNull();
  });

  it("handles completely empty object gracefully", () => {
    const result = migrateSave({});
    expect(result).not.toBeNull();
    expect(result!.version).toBe(CURRENT_SAVE_VERSION);
    expect(result!.mode).toBe("release"); // default
  });
});

// ---------------------------------------------------------------------------
// 6. loadAndHydrate – combined load flow
// ---------------------------------------------------------------------------

describe("loadAndHydrate", () => {
  it("returns fresh state for null input", () => {
    const state = loadAndHydrate(null, "release");
    expect(state.mode).toBe("release");
    expect(state.inventory.coins).toBeGreaterThan(0); // release starts with coins
  });

  it("returns fresh state when saved mode !== requested mode", () => {
    const save = makeV1Save({ mode: "debug" });
    const state = loadAndHydrate(save, "release");
    // Mode mismatch → fresh release state
    expect(state.mode).toBe("release");
  });

  it("loads a valid v1 save correctly (physical keys migrate out of globalInventory post-load)", () => {
    const v1 = makeV1Save({ mode: "release" });
    v1.inventory.wood = 999;
    const state = loadAndHydrate(v1, "release");
    // Post-Phase-1: the auto-created proto-hub means `wood` has a physical
    // home → globalInventory is re-derived and zeros it out.
    expect(state.inventory.wood).toBe(0);
    expect(Array.isArray(state.connectedAssetIds)).toBe(true);
  });

  it("preserves a starter proto-hub as tier 1 when hydrating a raw runtime snapshot", () => {
    const runtimeState = createInitialState("release");
    const hubId = runtimeState.starterDrone.hubId;

    expect(hubId).not.toBeNull();

    const hydrated = loadAndHydrate(runtimeState, "release");

    expect(hydrated.serviceHubs[hubId!]?.tier).toBe(1);
  });

  it("loads a legacy v0 save via migration", () => {
    const legacy = { mode: "release", inventory: { coins: 77 } };
    const state = loadAndHydrate(legacy, "release");
    expect(state.inventory.coins).toBe(77);
    expect(state.mode).toBe("release");
  });
});

// ---------------------------------------------------------------------------
// 7. Round-trip: serialize → parse → migrate → deserialize
// ---------------------------------------------------------------------------

describe("round-trip", () => {
  it("release state survives full save/load cycle", () => {
    const original = createInitialState("release");
    original.inventory.wood = 123;
    original.inventory.ironIngot = 7;
    original.generators["rt-gen-1"] = { fuel: 5, progress: 0, running: false };

    const json = JSON.stringify(serializeState(original));
    const parsed = JSON.parse(json);
    const loaded = loadAndHydrate(parsed, "release");

    // Phase 1: release auto-creates a starter warehouse which is a physical
    // home for every physical key (including ingots) → global is zeroed on load.
    expect(loaded.inventory.wood).toBe(0);
    expect(loaded.inventory.ironIngot).toBe(0);
    expect(loaded.generators["rt-gen-1"].fuel).toBe(5);
    expect(loaded.mode).toBe("release");
  });

  it("debug state survives full save/load cycle", () => {
    const original = createInitialState("debug");

    const json = JSON.stringify(serializeState(original));
    const parsed = JSON.parse(json);
    const loaded = loadAndHydrate(parsed, "debug");

    expect(loaded.mode).toBe("debug");
    // Debug state has assets pre-placed
    expect(Object.keys(loaded.assets).length).toBeGreaterThan(0);
    // Connectivity recomputed
    expect(loaded.connectedAssetIds.length).toBeGreaterThan(0);
  });

  it("per-warehouse inventories survive full save/load cycle", () => {
    const original = createInitialState("release");
    original.warehouseInventories = {
      "wh-1": { ...original.inventory, iron: 15, copper: 8 },
      "wh-2": { ...original.inventory, wood: 3, stone: 12 },
    };
    original.inventory.wood = 50;

    const json = JSON.stringify(serializeState(original));
    const parsed = JSON.parse(json);
    const loaded = loadAndHydrate(parsed, "release");

    // Phase 1: warehouses exist → physical keys in globalInventory are
    // zeroed on load (warehouses are the source of truth).
    expect(loaded.inventory.wood).toBe(0);
    // Per-warehouse inventories preserved independently.
    expect(loaded.warehouseInventories["wh-1"].iron).toBe(15);
    expect(loaded.warehouseInventories["wh-1"].copper).toBe(8);
    expect(loaded.warehouseInventories["wh-2"].wood).toBe(3);
    expect(loaded.warehouseInventories["wh-2"].stone).toBe(12);
  });

  it("global and warehouse inventories are not mixed during serialization", () => {
    const original = createInitialState("release");
    original.inventory.iron = 100;
    original.warehouseInventories = {
      "wh-x": { ...original.inventory, iron: 5 },
    };
    // The warehouse has 5 iron, global has 100 - they must stay separate in the save.

    const save = serializeState(original);
    expect(save.inventory.iron).toBe(100);
    expect(save.warehouseInventories["wh-x"].iron).toBe(5);

    const loaded = deserializeState(save);
    // Phase 1: warehouses are authoritative after load → global iron is zeroed,
    // warehouse iron stays intact.
    expect(loaded.inventory.iron).toBe(0);
    expect(loaded.warehouseInventories["wh-x"].iron).toBe(5);
  });
});

// ============================================================
// Save/Load — Phase 1 globalInventory re-derivation
// ============================================================
//
// Verifies `deserializeState` zeros physical keys in `state.inventory`
// when a physical home exists, so `selectGlobalInventoryView` cannot
// double-count stale values carried over from old saves.

import { serializeState, deserializeState } from "../save";
import { rebuildGlobalInventoryFromStorage } from "../save";
import {
  createInitialState,
  addResources,
  selectGlobalInventoryView,
  hasResourcesInPhysicalStorage,
  type GameState,
  type Inventory,
  type ServiceHubEntry,
} from "../../store/reducer";

function emptyInv(): Inventory {
  const inv = createInitialState("release").inventory;
  for (const k of Object.keys(inv) as (keyof Inventory)[]) {
    (inv as unknown as Record<string, number>)[k] = 0;
  }
  return inv;
}

function bareState(): GameState {
  const s = createInitialState("release");
  return { ...s, inventory: emptyInv(), warehouseInventories: {}, serviceHubs: {} };
}

function withWarehouse(state: GameState, id: string, inv: Partial<Inventory>): GameState {
  return {
    ...state,
    assets: { ...state.assets, [id]: { id, type: "warehouse", x: 0, y: 0, size: 2, direction: "south" } },
    warehousesPlaced: state.warehousesPlaced + 1,
    warehouseInventories: { ...state.warehouseInventories, [id]: addResources(emptyInv(), inv) },
  };
}

function withHub(state: GameState, id: string, inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>): GameState {
  const hub: ServiceHubEntry = {
    inventory: { wood: 0, stone: 0, iron: 0, copper: 0, ...inv },
    targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
    tier: 1,
    droneIds: [],
  };
  return {
    ...state,
    assets: { ...state.assets, [id]: { id, type: "service_hub", x: 0, y: 0, size: 2 } },
    serviceHubs: { ...state.serviceHubs, [id]: hub },
  };
}

describe("deserializeState — globalInventory rebuild", () => {
  it("zeros physical keys in globalInventory when a warehouse exists (warehouse stays authoritative)", () => {
    // Legacy-ish state: physical keys in BOTH global and warehouse.
    let s = bareState();
    s = withWarehouse(s, "wh-A", { wood: 20, iron: 5, ironIngot: 2 });
    s = {
      ...s,
      inventory: addResources(s.inventory, { wood: 99, iron: 99, ironIngot: 99, coins: 100 }),
    };

    const loaded = deserializeState(serializeState(s));

    // Physical keys must be cleared from global; warehouse untouched.
    expect(loaded.inventory.wood).toBe(0);
    expect(loaded.inventory.iron).toBe(0);
    expect(loaded.inventory.ironIngot).toBe(0);
    expect(loaded.warehouseInventories["wh-A"].wood).toBe(20);
    expect(loaded.warehouseInventories["wh-A"].iron).toBe(5);
    expect(loaded.warehouseInventories["wh-A"].ironIngot).toBe(2);
    // Non-physical keys stay in global.
    expect(loaded.inventory.coins).toBe(100);
  });

  it("zeros only hub-eligible keys when only a hub exists (ingots remain as legacy fallback)", () => {
    let s = bareState();
    s = withHub(s, "hub-1", { wood: 4 });
    s = {
      ...s,
      inventory: addResources(s.inventory, { wood: 50, ironIngot: 50, coins: 10 }),
    };

    const loaded = deserializeState(serializeState(s));

    expect(loaded.inventory.wood).toBe(0); // hub-eligible → zeroed
    expect(loaded.inventory.ironIngot).toBe(50); // no warehouse → legacy fallback
    expect(loaded.inventory.coins).toBe(10);
    expect(loaded.serviceHubs["hub-1"].inventory.wood).toBe(4);
  });

  it("keeps legacy globalInventory intact when no physical storage exists at all", () => {
    // Purely legacy save: no warehouses, no hubs — globalInventory is the only truth.
    const s: GameState = {
      ...bareState(),
      inventory: addResources(emptyInv(), { wood: 11, stone: 7, coins: 3 }),
    };

    const loaded = deserializeState(serializeState(s));

    expect(loaded.inventory.wood).toBe(11);
    expect(loaded.inventory.stone).toBe(7);
    expect(loaded.inventory.coins).toBe(3);
  });

  it("derived view after load matches physical stores exactly (no double-counting)", () => {
    let s = bareState();
    s = withWarehouse(s, "wh-A", { wood: 12, iron: 3 });
    s = withHub(s, "hub-1", { wood: 8, stone: 4 });
    // Bogus legacy global amounts that would double-count pre-fix:
    s = { ...s, inventory: addResources(s.inventory, { wood: 999, iron: 999, stone: 999 }) };

    const loaded = deserializeState(serializeState(s));
    const view = selectGlobalInventoryView(loaded);

    expect(view.wood).toBe(12 + 8);
    expect(view.iron).toBe(3);
    expect(view.stone).toBe(4);
  });

  it("affordance predicate sees the correct post-load totals", () => {
    let s = bareState();
    s = withWarehouse(s, "wh-A", { wood: 10 });
    // Garbage legacy global that pre-fix would have falsely inflated coverage.
    s = { ...s, inventory: addResources(s.inventory, { wood: 500 }) };

    const loaded = deserializeState(serializeState(s));

    expect(hasResourcesInPhysicalStorage(loaded, { wood: 10 })).toBe(true);
    expect(hasResourcesInPhysicalStorage(loaded, { wood: 11 })).toBe(false);
  });
});

describe("rebuildGlobalInventoryFromStorage — helper guards", () => {
  it("is idempotent when called twice on the same loaded state", () => {
    let s = bareState();
    s = withWarehouse(s, "wh-A", { wood: 7 });
    s = { ...s, inventory: addResources(s.inventory, { wood: 99, coins: 5 }) };

    const loaded = deserializeState(serializeState(s));
    const onceMore = rebuildGlobalInventoryFromStorage(loaded);

    // Reference equality is allowed because no further changes are needed.
    expect(onceMore.wood).toBe(loaded.inventory.wood);
    expect(onceMore.coins).toBe(loaded.inventory.coins);
    expect(onceMore.wood).toBe(0);
    expect(onceMore.coins).toBe(5);
  });

  it("does not touch non-physical keys (coins, sapling, tools, building counters)", () => {
    let s = bareState();
    s = withWarehouse(s, "wh-A", { wood: 1 });
    s = {
      ...s,
      inventory: addResources(s.inventory, {
        coins: 42,
        sapling: 3,
        axe: 1,
        wood_pickaxe: 2,
        workbench: 5,
        cable: 9,
      }),
    };

    const next = rebuildGlobalInventoryFromStorage(s);

    expect(next.coins).toBe(42);
    expect(next.sapling).toBe(3);
    expect(next.axe).toBe(1);
    expect(next.wood_pickaxe).toBe(2);
    expect(next.workbench).toBe(5);
    expect(next.cable).toBe(9);
  });

  it("tolerates undefined warehouseInventories / serviceHubs without crashing", () => {
    const s = bareState();
    const broken = {
      inventory: addResources(emptyInv(), { wood: 12, coins: 1 }),
      // Cast intentionally: simulate a malformed runtime snapshot
      warehouseInventories: undefined as unknown as GameState["warehouseInventories"],
      serviceHubs: undefined as unknown as GameState["serviceHubs"],
    };
    const next = rebuildGlobalInventoryFromStorage({
      inventory: broken.inventory,
      warehouseInventories: broken.warehouseInventories,
      serviceHubs: broken.serviceHubs,
    });
    // No physical home anywhere → keep legacy values untouched.
    expect(next.wood).toBe(12);
    expect(next.coins).toBe(1);
    // Sanity: bareState() created via createInitialState still works.
    expect(s.inventory.coins).toBe(0);
  });

  it("warehouse rule wins over hub rule when both exist (ingots also zeroed)", () => {
    let s = bareState();
    s = withWarehouse(s, "wh-A", { ironIngot: 4 });
    s = withHub(s, "hub-1", { wood: 2 });
    s = {
      ...s,
      inventory: addResources(emptyInv(), { wood: 50, ironIngot: 50, coins: 1 }),
    };

    const next = rebuildGlobalInventoryFromStorage(s);

    // Both wood AND ironIngot zeroed (warehouse branch).
    expect(next.wood).toBe(0);
    expect(next.ironIngot).toBe(0);
    expect(next.coins).toBe(1);
  });
});

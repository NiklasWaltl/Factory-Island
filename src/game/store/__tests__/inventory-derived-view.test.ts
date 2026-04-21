// ============================================================
// Phase 1 - selectGlobalInventoryView (derived read-only view)
// ============================================================
//
// Verifies that:
//   1. The derived view equals globalInventory + warehouseInventories
//      + serviceHubs (collectables only).
//   2. The DEBUG_MOCK_RESOURCES action increases the *physical*
//      warehouse stock, not just state.inventory.
//   3. Hub upgrade now consumes from physical stores instead of
//      bypassing them via state.inventory.
//   4. Save/Load round-trips do not break the view.

import {
  createInitialState,
  selectGlobalInventoryView,
  gameReducer,
  addResources,
  HUB_UPGRADE_COST,
  type GameState,
  type Inventory,
  type ServiceHubEntry,
} from "../reducer";
import { serializeState, deserializeState } from "../../simulation/save";
import { applyMockToState } from "../../debug/mockData";

function emptyInv(): Inventory {
  // createInitialState seeds non-zero starter coins; zero everything for predictable assertions.
  const inv = createInitialState("release").inventory;
  for (const k of Object.keys(inv) as (keyof Inventory)[]) {
    (inv as unknown as Record<string, number>)[k] = 0;
  }
  return inv;
}

function withWarehouse(state: GameState, id: string, inv: Partial<Inventory>): GameState {
  return {
    ...state,
    warehousesPlaced: state.warehousesPlaced + 1,
    warehouseInventories: {
      ...state.warehouseInventories,
      [id]: addResources(emptyInv(), inv),
    },
  };
}

function withHub(state: GameState, id: string, inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>): GameState {
  const hub: ServiceHubEntry = {
    inventory: { wood: 0, stone: 0, iron: 0, copper: 0, ...inv },
    targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
    tier: 1,
    droneIds: [],
  };
  return { ...state, serviceHubs: { ...state.serviceHubs, [id]: hub } };
}

describe("selectGlobalInventoryView – derived read-only inventory", () => {
  it("matches the sum of global + warehouses + hubs (collectables)", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: addResources(emptyInv(), { wood: 5, coins: 100 }), warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", { wood: 20, iron: 30, ironIngot: 7 });
    s = withWarehouse(s, "wh-B", { wood: 10, copper: 4 });
    s = withHub(s, "hub-1", { wood: 3, stone: 2 });

    const view = selectGlobalInventoryView(s);

    expect(view.wood).toBe(5 + 20 + 10 + 3);
    expect(view.iron).toBe(30);
    expect(view.copper).toBe(4);
    expect(view.stone).toBe(2);
    expect(view.ironIngot).toBe(7);
    // Coins live only in global – passthrough.
    expect(view.coins).toBe(100);
  });

  it("does not mutate state.inventory", () => {
    const s = withWarehouse(
      { ...createInitialState("release"), inventory: addResources(emptyInv(), { wood: 1 }) },
      "wh-A",
      { wood: 5 },
    );
    const before = { ...s.inventory };
    selectGlobalInventoryView(s);
    expect(s.inventory).toEqual(before);
  });
});

describe("DEBUG_MOCK_RESOURCES – fills physical storage", () => {
  it("deposits collectables into the first warehouse, leaves coins/sapling global", () => {
    // Start from release (no auto-built debug warehouses) and add exactly one warehouse.
    let s = createInitialState("release");
    s = { ...s, warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", {});
    const woodBefore = s.warehouseInventories["wh-A"].wood;
    const coinsBefore = s.inventory.coins;
    const globalWoodBefore = s.inventory.wood;

    const after = applyMockToState(s, "DEBUG_MOCK_RESOURCES");

    expect(after.warehouseInventories["wh-A"].wood).toBeGreaterThan(woodBefore);
    expect(after.warehouseInventories["wh-A"].iron).toBeGreaterThan(0);
    // Global coin balance still receives the coin top-up (no physical home).
    expect(after.inventory.coins).toBeGreaterThan(coinsBefore);
    // Wood was NOT additionally piled into globalInventory.
    expect(after.inventory.wood).toBe(globalWoodBefore);
  });

  it("skips physical keys (wood/stone/…) when no warehouse or hub exists, still applies coins/sapling", () => {
    let s = createInitialState("release");
    s = { ...s, warehouseInventories: {}, serviceHubs: {} };
    expect(Object.keys(s.warehouseInventories)).toHaveLength(0);
    const woodBefore = s.inventory.wood;
    const coinsBefore = s.inventory.coins;

    const after = applyMockToState(s, "DEBUG_MOCK_RESOURCES");
    // Physical keys must NOT silently be dumped into globalInventory anymore;
    // without a warehouse/hub they are skipped (logged as no-op).
    expect(after.inventory.wood).toBe(woodBefore);
    expect(after.inventory.iron).toBe(s.inventory.iron);
    expect(after.inventory.ironIngot).toBe(s.inventory.ironIngot);
    // Non-physical keys (coins/sapling) still apply.
    expect(after.inventory.coins).toBeGreaterThan(coinsBefore);
  });
});

describe("UPGRADE_HUB – consumes from physical storage", () => {
  it("pulls hub upgrade cost from a warehouse, not only from state.inventory", () => {
    const cost = HUB_UPGRADE_COST as Partial<Record<keyof Inventory, number>>;
    let s = createInitialState("release");
    // Stash the entire upgrade cost into a warehouse; keep global empty.
    s = { ...s, inventory: emptyInv() };
    s = withWarehouse(s, "wh-A", cost);
    // Place a tier-1 hub asset directly so UPGRADE_HUB sees it.
    const hubId = "hub-1";
    s = {
      ...s,
      assets: { ...s.assets, [hubId]: { id: hubId, type: "service_hub", x: 10, y: 10, size: 2 } },
      serviceHubs: {
        ...s.serviceHubs,
        [hubId]: {
          inventory: { wood: 0, stone: 0, iron: 0, copper: 0 },
          targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
          tier: 1,
          droneIds: [],
        },
      },
    };
    const whBefore = { ...s.warehouseInventories["wh-A"] };

    const after = gameReducer(s, { type: "UPGRADE_HUB", hubId });

    // Tier should have advanced – proves the cost check passed using physical stores.
    expect(after.serviceHubs[hubId].tier).toBe(2);
    // At least one cost entry must have decreased in the warehouse.
    const someDeducted = Object.entries(cost).some(
      ([key, amt]) =>
        ((amt ?? 0) > 0) &&
        ((whBefore as unknown as Record<string, number>)[key] ?? 0) >
          ((after.warehouseInventories["wh-A"] as unknown as Record<string, number>)[key] ?? 0),
    );
    expect(someDeducted).toBe(true);
  });
});

describe("Save/Load – derived view stays consistent", () => {
  it("round-trips through serialize/deserialize without changing the view", () => {
    let s = createInitialState("release");
    s = withWarehouse(s, "wh-A", { wood: 12, iron: 4 });
    const before = selectGlobalInventoryView(s);

    const blob = serializeState(s);
    const restored = deserializeState(blob);
    expect(restored).not.toBeNull();
    const after = selectGlobalInventoryView(restored as GameState);

    expect(after.wood).toBe(before.wood);
    expect(after.iron).toBe(before.iron);
  });
});

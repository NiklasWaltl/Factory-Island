// ============================================================
// Phase 1 - selectGlobalInventoryView (derived read-only view)
// ============================================================
//
// Verifies that:
//   1. The derived view equals globalInventory + warehouseInventories
//      + serviceHubs (collectables only).
//   2. The DEBUG_MOCK_RESOURCES action increases the *physical*
//      warehouse stock, not just state.inventory.
//   3. Hub upgrade creates delivery demand and does not instantly
//      deduct/complete on click.
//   4. Save/Load round-trips do not break the view.

import type { GameState, Inventory, ServiceHubEntry } from "../types";
import {
  createInitialState,
  selectGlobalInventoryView,
  gameReducer,
  addResources,
  HUB_UPGRADE_COST,
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

describe("UPGRADE_HUB – drone-delivery flow (no instant warehouse drain)", () => {
  it("passes the physical-storage affordance check without deducting from the warehouse", () => {
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

    // Hub stays Tier 1 until drones have physically delivered the resources.
    expect(after.serviceHubs[hubId].tier).toBe(1);
    // Pending upgrade is recorded, matching the cost.
    const pending = after.serviceHubs[hubId].pendingUpgrade;
    expect(pending).toBeDefined();
    for (const [key, amt] of Object.entries(cost)) {
      if ((amt ?? 0) <= 0) continue;
      expect((pending as Record<string, number>)[key]).toBe(amt);
    }
    // Warehouse stock must remain untouched — no instant drain.
    expect(after.warehouseInventories["wh-A"]).toEqual(whBefore);
  });

  it("does not fast-path: even with full hub stock it creates upgrade demand and waits for delivery flow", () => {
    const cost = HUB_UPGRADE_COST as Partial<Record<keyof Inventory, number>>;
    let s = createInitialState("release");
    s = { ...s, inventory: emptyInv() };
    const hubId = "hub-2";
    s = {
      ...s,
      assets: { ...s.assets, [hubId]: { id: hubId, type: "service_hub", x: 10, y: 10, size: 2 } },
      serviceHubs: {
        ...s.serviceHubs,
        [hubId]: {
          inventory: {
            wood: cost.wood ?? 0,
            stone: cost.stone ?? 0,
            iron: cost.iron ?? 0,
            copper: cost.copper ?? 0,
          },
          targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
          tier: 1,
          droneIds: [],
        },
      },
    };

    const hubBefore = { ...s.serviceHubs[hubId].inventory };

    const after = gameReducer(s, { type: "UPGRADE_HUB", hubId });

    // No instant completion and no instant stock deduction.
    expect(after.serviceHubs[hubId].tier).toBe(1);
    expect(after.serviceHubs[hubId].inventory).toEqual(hubBefore);
    expect(after.serviceHubs[hubId].pendingUpgrade).toBeDefined();
    expect(after.constructionSites[hubId]).toBeDefined();

    // Construction demand mirrors the upgrade costs.
    for (const [key, amt] of Object.entries(cost)) {
      if ((amt ?? 0) <= 0) continue;
      expect((after.constructionSites[hubId].remaining as Record<string, number>)[key]).toBe(amt);
    }
  });

  it("completes Tier-2 upgrade only after drone deliveries satisfy construction demand", () => {
    const cost = HUB_UPGRADE_COST as Partial<Record<keyof Inventory, number>>;
    let s = createInitialState("release");
    const hubId = s.starterDrone.hubId!;

    s = {
      ...s,
      serviceHubs: {
        ...s.serviceHubs,
        [hubId]: {
          ...s.serviceHubs[hubId],
          // Provide upgrade materials in the hub so the drone can dispatch from
          // a valid physical source to the upgrade construction demand.
          inventory: {
            wood: cost.wood ?? 0,
            stone: cost.stone ?? 0,
            iron: cost.iron ?? 0,
            copper: cost.copper ?? 0,
          },
          targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
        },
      },
    };

    let current = gameReducer(s, { type: "UPGRADE_HUB", hubId });

    // Click does not complete immediately.
    expect(current.serviceHubs[hubId].tier).toBe(1);
    expect(current.constructionSites[hubId]).toBeDefined();

    let ticks = 0;
    while (current.serviceHubs[hubId].tier !== 2 && ticks < 500) {
      current = gameReducer(current, { type: "DRONE_TICK" });
      ticks += 1;
    }

    expect(current.serviceHubs[hubId].tier).toBe(2);
    expect(current.serviceHubs[hubId].pendingUpgrade).toBeUndefined();
    expect(current.constructionSites[hubId]).toBeUndefined();
    expect(ticks).toBeGreaterThan(0);
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

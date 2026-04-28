// ============================================================
// Phase 2 - consumeFromPhysicalStorage (all-or-nothing helper)
// ============================================================
//
// Verifies:
//   1. Costs are deducted from a warehouse first.
//   2. Costs are deducted from a service hub when no warehouse holds them.
//   3. Mixed coverage across physical stores works for collectables.
//   4. Insufficient total stock leaves ALL stores untouched (no partial deduction).
//   5. globalInventory alone does NOT satisfy a physical consume call when no
//      physical store holds anything (it acts only as last-resort fallback;
//      this is verified by ensuring physical stores are preferred).

import {
  createInitialState,
  consumeFromPhysicalStorage,
  addResources,
} from "../reducer";
import type { GameState, Inventory, ServiceHubEntry } from "../types";

function emptyInv(): Inventory {
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

describe("consumeFromPhysicalStorage", () => {
  it("deducts entirely from a warehouse when it covers the cost", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: emptyInv(), warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", { wood: 50 });

    const result = consumeFromPhysicalStorage(s, { wood: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.warehouseInventories["wh-A"].wood).toBe(45);
    expect(result.next.inventory.wood).toBe(0);
  });

  it("falls back to a service hub when no warehouse holds the resource", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: emptyInv(), warehouseInventories: {} };
    s = withHub(s, "hub-1", { stone: 10 });

    const result = consumeFromPhysicalStorage(s, { stone: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.serviceHubs["hub-1"].inventory.stone).toBe(6);
  });

  it("splits a cost across warehouse + hub when neither alone is enough", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: emptyInv(), warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", { iron: 3 });
    s = withHub(s, "hub-1", { iron: 4 });

    const result = consumeFromPhysicalStorage(s, { iron: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Warehouse drained first (priority), then hub takes the rest.
    expect(result.next.warehouseInventories["wh-A"].iron).toBe(0);
    expect(result.next.serviceHubs["hub-1"].inventory.iron).toBe(2);
  });

  it("leaves all stores untouched when total stock is insufficient", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: addResources(emptyInv(), { wood: 1 }), warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", { wood: 2 });
    s = withHub(s, "hub-1", { wood: 1 });
    // Snapshot deep references – they must be byref-equal after the failed call.
    const beforeWh = s.warehouseInventories["wh-A"];
    const beforeHub = s.serviceHubs["hub-1"];

    const result = consumeFromPhysicalStorage(s, { wood: 999 });
    expect(result.ok).toBe(false);
    // No mutation: original state references stay intact.
    expect(s.warehouseInventories["wh-A"]).toBe(beforeWh);
    expect(s.serviceHubs["hub-1"]).toBe(beforeHub);
    expect(s.inventory.wood).toBe(1);
  });

  it("prefers the warehouse over state.inventory (physical-first)", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: addResources(emptyInv(), { wood: 100 }), warehouseInventories: {} };
    s = withWarehouse(s, "wh-A", { wood: 10 });

    const result = consumeFromPhysicalStorage(s, { wood: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Warehouse paid – global is untouched.
    expect(result.next.warehouseInventories["wh-A"].wood).toBe(5);
    expect(result.next.inventory.wood).toBe(100);
  });

  it("falls back to state.inventory only when no physical store holds the key (e.g. coins)", () => {
    let s = createInitialState("release");
    s = { ...s, inventory: addResources(emptyInv(), { coins: 50 }), warehouseInventories: {} };

    const result = consumeFromPhysicalStorage(s, { coins: 30 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next.inventory.coins).toBe(20);
  });
});

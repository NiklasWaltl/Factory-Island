// ============================================================
// hasResourcesInPhysicalStorage — affordance predicate
// ============================================================
//
// Verifies:
//   1. true when a warehouse alone covers the cost.
//   2. true when a service hub alone covers the cost.
//   3. true on null/undefined/empty costs (no crash).
//   4. Predicate result is consistent with consumeFromPhysicalStorage:
//      whenever has...() is true, consume...() succeeds; otherwise it fails.
//   5. globalInventory contributes only as last-resort fallback (matches
//      consumeFromPhysicalStorage), so has...() == ok of consume...() in all
//      tested combinations.

import {
  createInitialState,
  hasResourcesInPhysicalStorage,
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

function withHub(
  state: GameState,
  id: string,
  inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>,
): GameState {
  const hub: ServiceHubEntry = {
    inventory: { wood: 0, stone: 0, iron: 0, copper: 0, ...inv },
    targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
    tier: 1,
    droneIds: [],
  };
  return { ...state, serviceHubs: { ...state.serviceHubs, [id]: hub } };
}

function bareState(): GameState {
  const s = createInitialState("release");
  return { ...s, inventory: emptyInv(), warehouseInventories: {}, serviceHubs: {} };
}

describe("hasResourcesInPhysicalStorage", () => {
  it("returns true when a warehouse covers the cost", () => {
    const s = withWarehouse(bareState(), "wh", { wood: 10 });
    expect(hasResourcesInPhysicalStorage(s, { wood: 5 })).toBe(true);
  });

  it("returns true when a service hub covers the cost", () => {
    const s = withHub(bareState(), "hub", { iron: 4 });
    expect(hasResourcesInPhysicalStorage(s, { iron: 4 })).toBe(true);
  });

  it("returns false when nothing physical (or fallback) covers the cost", () => {
    const s = bareState();
    expect(hasResourcesInPhysicalStorage(s, { wood: 1 })).toBe(false);
  });

  it("treats null/undefined/empty costs as trivially satisfiable and does not crash", () => {
    const s = bareState();
    expect(hasResourcesInPhysicalStorage(s, undefined)).toBe(true);
    expect(hasResourcesInPhysicalStorage(s, null)).toBe(true);
    expect(hasResourcesInPhysicalStorage(s, {})).toBe(true);
  });

  it("is consistent with consumeFromPhysicalStorage: true => consume ok, false => consume not ok", () => {
    const cases: Array<{ s: GameState; costs: Partial<Record<keyof Inventory, number>> }> = [
      { s: withWarehouse(bareState(), "wh", { wood: 10 }), costs: { wood: 5 } },
      { s: withWarehouse(bareState(), "wh", { wood: 1 }), costs: { wood: 5 } },
      { s: withHub(bareState(), "h", { stone: 3 }), costs: { stone: 3 } },
      { s: withHub(bareState(), "h", { stone: 2 }), costs: { stone: 3 } },
      {
        s: withHub(withWarehouse(bareState(), "wh", { wood: 2 }), "h", { wood: 3 }),
        costs: { wood: 4 },
      },
    ];
    for (const { s, costs } of cases) {
      const predicate = hasResourcesInPhysicalStorage(s, costs);
      const result = consumeFromPhysicalStorage(s, costs);
      expect(predicate).toBe(result.ok);
    }
  });
});

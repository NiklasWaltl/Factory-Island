// ============================================================
// InventoryNetwork Read-View — Tests (Step 1)
// ============================================================

import { createInitialState, type Inventory } from "../../store/reducer";
import {
  getNetworkAmount,
  getNetworkItemsByCategory,
  getNetworkStock,
  type NetworkStateSlice,
} from "../network";
import {
  getItemDef,
  isHotbarEligible,
  isPlayerGear,
  isSeed,
} from "../../items/registry";

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

function inv(overrides: Partial<Inventory>): Inventory {
  return { ...emptyInv(), ...overrides };
}

function slice(
  warehouseInventories: Record<string, Inventory>,
): NetworkStateSlice {
  return { warehouseInventories };
}

describe("getNetworkStock", () => {
  it("returns an empty totals map when no warehouses exist", () => {
    const view = getNetworkStock(slice({}));
    expect(view.totals).toEqual({});
  });

  it("aggregates counts across multiple warehouses", () => {
    const view = getNetworkStock(
      slice({
        "wh-A": inv({ wood: 10, ironIngot: 2 }),
        "wh-B": inv({ wood: 5, stone: 3 }),
      }),
    );
    expect(view.totals.wood).toBe(15);
    expect(view.totals.stone).toBe(3);
    expect(view.totals.ironIngot).toBe(2);
  });

  it("omits items with total 0", () => {
    const view = getNetworkStock(slice({ "wh-A": emptyInv() }));
    expect(view.totals).toEqual({});
  });

  it("does NOT include the global fallback inventory", () => {
    // The slice intentionally only carries warehouseInventories.
    const view = getNetworkStock(slice({}));
    expect(view.totals.wood).toBeUndefined();
  });
});

describe("getNetworkAmount", () => {
  it("returns 0 for unknown items", () => {
    const amount = getNetworkAmount(
      slice({ "wh-A": inv({ wood: 7 }) }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "not_a_real_item" as any,
    );
    expect(amount).toBe(0);
  });

  it("sums a single item across warehouses", () => {
    const amount = getNetworkAmount(
      slice({
        "wh-A": inv({ wood: 4 }),
        "wh-B": inv({ wood: 6 }),
      }),
      "wood",
    );
    expect(amount).toBe(10);
  });
});

describe("getNetworkItemsByCategory", () => {
  it("returns only items of the requested category that have stock", () => {
    const result = getNetworkItemsByCategory(
      slice({
        "wh-A": inv({ wood: 3, axe: 1, ironIngot: 2 }),
      }),
      "player_gear",
    );
    expect(result.map((r) => r.def.id)).toEqual(["axe"]);
    expect(result[0].count).toBe(1);
  });

  it("returns an empty list when the category has no stock", () => {
    const result = getNetworkItemsByCategory(
      slice({ "wh-A": inv({ wood: 5 }) }),
      "seed",
    );
    expect(result).toEqual([]);
  });
});

describe("item registry hotbar rules", () => {
  it("marks only seed and player_gear as hotbar eligible", () => {
    expect(isHotbarEligible("axe")).toBe(true);
    expect(isHotbarEligible("wood_pickaxe")).toBe(true);
    expect(isHotbarEligible("sapling")).toBe(true);
    expect(isHotbarEligible("wood")).toBe(false);
    expect(isHotbarEligible("ironIngot")).toBe(false);
    expect(isHotbarEligible("workbench")).toBe(false);
  });

  it("classifies player gear and seeds correctly", () => {
    expect(isPlayerGear("axe")).toBe(true);
    expect(isPlayerGear("sapling")).toBe(false);
    expect(isSeed("sapling")).toBe(true);
    expect(isSeed("axe")).toBe(false);
  });

  it("gives player_gear a stack size of 1", () => {
    expect(getItemDef("axe")?.stackSize).toBe(1);
    expect(getItemDef("wood_pickaxe")?.stackSize).toBe(1);
  });
});

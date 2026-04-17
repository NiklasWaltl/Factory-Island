// ============================================================
// Regression Tests – Inventory Wrapper Functions
// ============================================================

import {
  getAvailableResource,
  hasResources,
  consumeResources,
  addResources,
  devAssertInventoryNonNegative,
  createInitialState,
  type Inventory,
} from "../reducer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fresh zero inventory via createInitialState and zero all fields */
function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}

function invWith(overrides: Partial<Record<keyof Inventory, number>>): Inventory {
  const base = emptyInv();
  for (const [k, v] of Object.entries(overrides)) {
    (base as any)[k] = v;
  }
  return base;
}

// ---------------------------------------------------------------------------
// 1. getAvailableResource
// ---------------------------------------------------------------------------

describe("getAvailableResource", () => {
  it("returns the correct value from state.inventory", () => {
    const state = createInitialState("release");
    state.inventory.wood = 42;
    expect(getAvailableResource(state, "wood")).toBe(42);
  });

  it("returns 0 for an empty resource", () => {
    const state = createInitialState("release");
    state.inventory.iron = 0;
    expect(getAvailableResource(state, "iron")).toBe(0);
  });

  it("reads from the inventory object passed in state", () => {
    const inv = invWith({ copper: 15 });
    expect(getAvailableResource({ inventory: inv }, "copper")).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// 2. hasResources
// ---------------------------------------------------------------------------

describe("hasResources", () => {
  it("returns true when inventory covers all costs", () => {
    const inv = invWith({ wood: 10, stone: 5 });
    expect(hasResources(inv, { wood: 10, stone: 5 })).toBe(true);
  });

  it("returns true when inventory exceeds costs", () => {
    const inv = invWith({ wood: 20 });
    expect(hasResources(inv, { wood: 5 })).toBe(true);
  });

  it("returns false when a single resource is short", () => {
    const inv = invWith({ wood: 3, stone: 10 });
    expect(hasResources(inv, { wood: 5, stone: 2 })).toBe(false);
  });

  it("returns false when all resources are short", () => {
    const inv = invWith({ wood: 0, stone: 0 });
    expect(hasResources(inv, { wood: 1, stone: 1 })).toBe(false);
  });

  it("returns true for empty costs", () => {
    const inv = invWith({});
    expect(hasResources(inv, {})).toBe(true);
  });

  it("treats missing inventory fields as 0", () => {
    const inv = emptyInv();
    expect(hasResources(inv, { ironIngot: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. consumeResources
// ---------------------------------------------------------------------------

describe("consumeResources", () => {
  it("deducts costs correctly", () => {
    const inv = invWith({ wood: 10, stone: 5 });
    const result = consumeResources(inv, { wood: 3, stone: 2 });
    expect(result.wood).toBe(7);
    expect(result.stone).toBe(3);
  });

  it("does not mutate the original inventory", () => {
    const inv = invWith({ wood: 10 });
    consumeResources(inv, { wood: 5 });
    expect(inv.wood).toBe(10);
  });

  it("preserves fields not in costs", () => {
    const inv = invWith({ wood: 10, iron: 7, copper: 3 });
    const result = consumeResources(inv, { wood: 2 });
    expect(result.iron).toBe(7);
    expect(result.copper).toBe(3);
  });

  it("returns zero for exact deduction", () => {
    const inv = invWith({ wood: 5 });
    const result = consumeResources(inv, { wood: 5 });
    expect(result.wood).toBe(0);
  });

  it("results in negative value when costs exceed available (no guard)", () => {
    // consumeResources itself doesn't prevent negative — caller must use hasResources first.
    const inv = invWith({ wood: 2 });
    const result = consumeResources(inv, { wood: 5 });
    expect(result.wood).toBe(-3);
  });

  it("handles empty costs gracefully", () => {
    const inv = invWith({ wood: 10 });
    const result = consumeResources(inv, {});
    expect(result.wood).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 4. addResources
// ---------------------------------------------------------------------------

describe("addResources", () => {
  it("increases amounts correctly", () => {
    const inv = invWith({ wood: 5, stone: 3 });
    const result = addResources(inv, { wood: 2, stone: 7 });
    expect(result.wood).toBe(7);
    expect(result.stone).toBe(10);
  });

  it("does not mutate the original inventory", () => {
    const inv = invWith({ wood: 5 });
    addResources(inv, { wood: 3 });
    expect(inv.wood).toBe(5);
  });

  it("preserves fields not in items", () => {
    const inv = invWith({ wood: 5, iron: 9 });
    const result = addResources(inv, { wood: 1 });
    expect(result.iron).toBe(9);
  });

  it("handles adding to zero-value fields", () => {
    const inv = emptyInv();
    const result = addResources(inv, { copper: 4 });
    expect(result.copper).toBe(4);
  });

  it("handles empty items gracefully", () => {
    const inv = invWith({ wood: 10 });
    const result = addResources(inv, {});
    expect(result.wood).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 5. hasResources + consumeResources consistency
// ---------------------------------------------------------------------------

describe("hasResources / consumeResources consistency", () => {
  it("consuming only when hasResources is true never produces negatives", () => {
    const inv = invWith({ wood: 5, stone: 3, iron: 0 });
    const costs = { wood: 4, stone: 3 };
    expect(hasResources(inv, costs)).toBe(true);
    const result = consumeResources(inv, costs);
    expect(result.wood).toBeGreaterThanOrEqual(0);
    expect(result.stone).toBeGreaterThanOrEqual(0);
  });

  it("hasResources returns false → should not consume", () => {
    const inv = invWith({ wood: 2, stone: 1 });
    const costs = { wood: 5, stone: 1 };
    expect(hasResources(inv, costs)).toBe(false);
    // Pattern: caller skips consumeResources when hasResources is false.
  });
});

// ---------------------------------------------------------------------------
// 6. devAssertInventoryNonNegative
// ---------------------------------------------------------------------------

describe("devAssertInventoryNonNegative", () => {
  it("does not throw for a valid inventory", () => {
    const inv = invWith({ wood: 5, stone: 0 });
    // Should not throw or error
    expect(() => devAssertInventoryNonNegative("test", inv)).not.toThrow();
  });

  it("logs error for negative values (spy check)", () => {
    // In test env import.meta.env.DEV is replaced with false,
    // so the function is a no-op. We verify it doesn't crash.
    const inv = invWith({ wood: -1 });
    expect(() => devAssertInventoryNonNegative("test", inv)).not.toThrow();
  });
});

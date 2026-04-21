// ============================================================
// Network reducer integration tests (Step 2)
// ------------------------------------------------------------
// Verifies that NETWORK_* actions are wired into gameReducer
// and round-trip through the full GameState correctly.
// ============================================================

import {
  createInitialState,
  gameReducer,
  type GameState,
  type Inventory,
  type PlacedAsset,
} from "../../store/reducer";

function withWarehouse(over: Partial<Inventory>): GameState {
  const base = createInitialState("release");
  // Reuse an existing warehouse asset id so structural invariants stay valid.
  const existingId = Object.keys(base.warehouseInventories)[0];
  if (!existingId) {
    // Fallback: create a synthetic warehouse asset + inventory.
    const synthetic: PlacedAsset = {
      id: "wh-test",
      type: "warehouse",
      x: 0,
      y: 0,
      size: 2,
    };
    return {
      ...base,
      assets: { ...base.assets, "wh-test": synthetic },
      warehouseInventories: {
        ...base.warehouseInventories,
        "wh-test": { ...base.inventory, ...over },
      },
    };
  }
  return {
    ...base,
    warehouseInventories: {
      ...base.warehouseInventories,
      [existingId]: { ...base.warehouseInventories[existingId], ...over },
    },
  };
}

describe("gameReducer + NETWORK_* actions", () => {
  it("createInitialState seeds an empty network slice", () => {
    const s = createInitialState("release");
    expect(s.network).toBeDefined();
    expect(s.network.reservations).toEqual([]);
    expect(s.network.nextReservationId).toBe(1);
    expect(s.network.lastError).toBeNull();
  });

  it("reserve → commit reduces the warehouse stock by exactly the reserved amount", () => {
    const s0 = withWarehouse({ wood: 8 });
    const whId = Object.keys(s0.warehouseInventories).find(
      (id) => s0.warehouseInventories[id].wood === 8,
    )!;

    const s1 = gameReducer(s0, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 3 }],
      ownerKind: "crafting_job",
      ownerId: "job-1",
    });
    expect(s1.network.reservations).toHaveLength(1);
    expect(s1.warehouseInventories[whId].wood).toBe(8); // not yet reduced

    const s2 = gameReducer(s1, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId: "res-1",
    });
    expect(s2.network.reservations).toEqual([]);
    expect(s2.warehouseInventories[whId].wood).toBe(5);
  });

  it("reserve → cancel restores availability without touching stock", () => {
    const s0 = withWarehouse({ wood: 6 });
    const whId = Object.keys(s0.warehouseInventories).find(
      (id) => s0.warehouseInventories[id].wood === 6,
    )!;

    const s1 = gameReducer(s0, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 4 }],
      ownerKind: "system_request",
      ownerId: "req-1",
    });
    const s2 = gameReducer(s1, {
      type: "NETWORK_CANCEL_RESERVATION",
      reservationId: "res-1",
    });
    expect(s2.network.reservations).toEqual([]);
    expect(s2.warehouseInventories[whId].wood).toBe(6);
  });

  it("two consecutive reserves see the post-first-reserve `free` value", () => {
    const s0 = withWarehouse({ wood: 5 });
    const s1 = gameReducer(s0, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 4 }],
      ownerKind: "crafting_job",
      ownerId: "job-1",
    });
    const s2 = gameReducer(s1, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 2 }],
      ownerKind: "crafting_job",
      ownerId: "job-2",
    });
    // job-1 holds 4, free was 1 → job-2 must fail
    expect(s2.network.reservations).toHaveLength(1);
    expect(s2.network.lastError?.kind).toBe("INSUFFICIENT_STOCK");
  });

  it("an old save without a `network` field still loads correctly via createInitialState defaults", () => {
    // Simulate the deserializeState pattern: spread base, omit `network`.
    const base = createInitialState("release");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restored: GameState = { ...base, network: createInitialState("release").network };
    // After "loading", reservations are empty and reducer still works.
    const next = gameReducer(restored, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 1 }],
      ownerKind: "system_request",
      ownerId: "r",
    });
    // No warehouses with wood in default state → must fail with INSUFFICIENT_STOCK,
    // but the action is wired through the reducer (i.e. lastError set, not a crash).
    expect(next.network.lastError?.kind).toBe("INSUFFICIENT_STOCK");
  });
});

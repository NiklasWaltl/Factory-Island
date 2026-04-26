// ============================================================
// Reservations — pure helper tests (Step 2)
// ============================================================

import { createInitialState } from "../../store/reducer";
import type { Inventory } from "../../store/types";
import {
  applyNetworkAction,
  getAllReservedByOwner,
  getFreeAmount,
  getReservationsForItem,
  getReservedAmount,
  normalizeNetworkSlice,
  previewReserveBatch,
  type ReservationStateSlice,
} from "../reservations";
import {
  createEmptyNetworkSlice,
  type NetworkSlice,
  type Reservation,
} from "../reservationTypes";

function emptyInv(): Inventory {
  return createInitialState("release").inventory;
}
function inv(over: Partial<Inventory>): Inventory {
  return { ...emptyInv(), ...over };
}
function slice(
  whInvs: Record<string, Inventory>,
  network: NetworkSlice = createEmptyNetworkSlice(),
): ReservationStateSlice {
  return { warehouseInventories: whInvs, network };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe("selectors", () => {
  it("getReservedAmount returns 0 when no reservations exist", () => {
    expect(getReservedAmount(slice({}), "wood")).toBe(0);
  });

  it("getFreeAmount = stored - reserved", () => {
    const s = slice({ "wh-A": inv({ wood: 10 }) });
    const r1 = applyNetworkAction(s.warehouseInventories, s.network, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 3 }],
      ownerKind: "system_request",
      ownerId: "req-1",
    });
    const next: ReservationStateSlice = {
      warehouseInventories: r1.warehouseInventories,
      network: r1.network,
    };
    expect(getReservedAmount(next, "wood")).toBe(3);
    expect(getFreeAmount(next, "wood")).toBe(7);
  });

  it("getFreeAmount throws when invariant violated (manual corruption)", () => {
    const corrupted: NetworkSlice = {
      reservations: [
        { id: "x", itemId: "wood", amount: 999, ownerKind: "system_request", ownerId: "o", createdAt: 0 },
      ],
      nextReservationId: 2,
      lastError: null,
    };
    expect(() =>
      getFreeAmount(slice({ "wh-A": inv({ wood: 5 }) }, corrupted), "wood"),
    ).toThrow(/Invariant violated/);
  });
});

// ---------------------------------------------------------------------------
// previewReserveBatch
// ---------------------------------------------------------------------------

describe("previewReserveBatch", () => {
  it("rejects empty batch", () => {
    const r = previewReserveBatch(slice({ "wh-A": inv({ wood: 5 }) }), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("EMPTY_BATCH");
  });

  it("throws on unknown item id", () => {
    expect(() =>
      previewReserveBatch(slice({ "wh-A": inv({ wood: 5 }) }), [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { itemId: "fake_item" as any, count: 1 },
      ]),
    ).toThrow(/Unknown item id/);
  });

  it("throws on non-positive amount", () => {
    expect(() =>
      previewReserveBatch(slice({ "wh-A": inv({ wood: 5 }) }), [
        { itemId: "wood", count: 0 },
      ]),
    ).toThrow(/Invalid amount/);
  });

  it("aggregates duplicate items in the same batch", () => {
    const s = slice({ "wh-A": inv({ wood: 10 }) });
    const r = previewReserveBatch(s, [
      { itemId: "wood", count: 4 },
      { itemId: "wood", count: 4 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.newReservations).toHaveLength(1);
      expect(r.newReservations[0].amount).toBe(8);
    }
  });

  it("reports per-item shortfalls on insufficient stock", () => {
    const s = slice({ "wh-A": inv({ wood: 1, stone: 0 }) });
    const r = previewReserveBatch(s, [
      { itemId: "wood", count: 3 },
      { itemId: "stone", count: 2 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("INSUFFICIENT_STOCK");
      expect(r.error.missing).toEqual([
        { itemId: "wood", requested: 3, available: 1 },
        { itemId: "stone", requested: 2, available: 0 },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// applyNetworkAction — reserve / commit / cancel
// ---------------------------------------------------------------------------

describe("applyNetworkAction: NETWORK_RESERVE_BATCH", () => {
  it("creates one reservation per unique item with deterministic ids", () => {
    const s = slice({ "wh-A": inv({ wood: 10, stone: 5 }) });
    const r = applyNetworkAction(s.warehouseInventories, s.network, {
      type: "NETWORK_RESERVE_BATCH",
      items: [
        { itemId: "wood", count: 3 },
        { itemId: "stone", count: 2 },
      ],
      ownerKind: "crafting_job",
      ownerId: "job-1",
      tick: 42,
    });
    expect(r.network.reservations.map((res: Reservation) => res.id)).toEqual([
      "res-1",
      "res-2",
    ]);
    expect(r.network.nextReservationId).toBe(3);
    expect(r.network.lastError).toBeNull();
    expect(r.network.reservations[0].createdAt).toBe(42);
    // Physical stock untouched.
    expect(r.warehouseInventories["wh-A"].wood).toBe(10);
  });

  it("is atomic: any missing ingredient → no reservations created", () => {
    const s = slice({ "wh-A": inv({ wood: 10, stone: 1 }) });
    const r = applyNetworkAction(s.warehouseInventories, s.network, {
      type: "NETWORK_RESERVE_BATCH",
      items: [
        { itemId: "wood", count: 3 },
        { itemId: "stone", count: 2 },
      ],
      ownerKind: "crafting_job",
      ownerId: "job-1",
    });
    expect(r.network.reservations).toEqual([]);
    expect(r.network.lastError?.kind).toBe("INSUFFICIENT_STOCK");
  });

  it("respects already-reserved amounts on subsequent reserves", () => {
    let wh = { "wh-A": inv({ wood: 10 }) };
    let net = createEmptyNetworkSlice();

    const r1 = applyNetworkAction(wh, net, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 7 }],
      ownerKind: "crafting_job",
      ownerId: "job-1",
    });
    wh = r1.warehouseInventories as typeof wh;
    net = r1.network;

    // free is now 3; trying to reserve 5 must fail.
    const r2 = applyNetworkAction(wh, net, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 5 }],
      ownerKind: "crafting_job",
      ownerId: "job-2",
    });
    expect(r2.network.lastError?.kind).toBe("INSUFFICIENT_STOCK");
    expect(r2.network.reservations).toHaveLength(1); // only job-1 still
  });
});

describe("applyNetworkAction: commit", () => {
  it("decrements physical stock and removes the reservation", () => {
    const r1 = applyNetworkAction(
      { "wh-A": inv({ wood: 10 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [{ itemId: "wood", count: 4 }],
        ownerKind: "system_request",
        ownerId: "req-1",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId: "res-1",
    });
    expect(r2.warehouseInventories["wh-A"].wood).toBe(6);
    expect(r2.network.reservations).toEqual([]);
  });

  it("double-commit fails with UNKNOWN_RESERVATION", () => {
    const r1 = applyNetworkAction(
      { "wh-A": inv({ wood: 10 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [{ itemId: "wood", count: 4 }],
        ownerKind: "system_request",
        ownerId: "req-1",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId: "res-1",
    });
    const r3 = applyNetworkAction(r2.warehouseInventories, r2.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId: "res-1",
    });
    expect(r3.network.lastError?.kind).toBe("UNKNOWN_RESERVATION");
    // Stock unchanged by the failed second commit.
    expect(r3.warehouseInventories["wh-A"].wood).toBe(6);
  });

  it("commits across multiple warehouses greedily and deterministically", () => {
    const r1 = applyNetworkAction(
      {
        "wh-B": inv({ wood: 4 }),
        "wh-A": inv({ wood: 3 }), // sorted: wh-A first
      },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [{ itemId: "wood", count: 5 }],
        ownerKind: "system_request",
        ownerId: "req-1",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_COMMIT_RESERVATION",
      reservationId: "res-1",
    });
    expect(r2.warehouseInventories["wh-A"].wood).toBe(0); // taken first
    expect(r2.warehouseInventories["wh-B"].wood).toBe(2); // remainder
  });

  it("NETWORK_COMMIT_BY_OWNER commits all owner reservations atomically", () => {
    const r1 = applyNetworkAction(
      { "wh-A": inv({ wood: 10, stone: 5 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [
          { itemId: "wood", count: 3 },
          { itemId: "stone", count: 2 },
        ],
        ownerKind: "crafting_job",
        ownerId: "job-1",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_COMMIT_BY_OWNER",
      ownerKind: "crafting_job",
      ownerId: "job-1",
    });
    expect(r2.warehouseInventories["wh-A"].wood).toBe(7);
    expect(r2.warehouseInventories["wh-A"].stone).toBe(3);
    expect(r2.network.reservations).toEqual([]);
  });

  it("NETWORK_COMMIT_BY_OWNER with no matches → UNKNOWN_RESERVATION", () => {
    const r = applyNetworkAction(
      { "wh-A": inv({ wood: 1 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_COMMIT_BY_OWNER",
        ownerKind: "crafting_job",
        ownerId: "ghost",
      },
    );
    expect(r.network.lastError?.kind).toBe("UNKNOWN_RESERVATION");
  });
});

describe("applyNetworkAction: cancel", () => {
  it("cancel releases the reservation without touching stock", () => {
    const r1 = applyNetworkAction(
      { "wh-A": inv({ wood: 10 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [{ itemId: "wood", count: 4 }],
        ownerKind: "system_request",
        ownerId: "req-1",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_CANCEL_RESERVATION",
      reservationId: "res-1",
    });
    expect(r2.network.reservations).toEqual([]);
    expect(r2.warehouseInventories["wh-A"].wood).toBe(10);
  });

  it("cancelling unknown id → UNKNOWN_RESERVATION error", () => {
    const r = applyNetworkAction(
      { "wh-A": inv({ wood: 10 }) },
      createEmptyNetworkSlice(),
      { type: "NETWORK_CANCEL_RESERVATION", reservationId: "nope" },
    );
    expect(r.network.lastError?.kind).toBe("UNKNOWN_RESERVATION");
  });

  it("NETWORK_CANCEL_BY_OWNER drops only that owner's reservations", () => {
    const r1 = applyNetworkAction(
      { "wh-A": inv({ wood: 10 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [{ itemId: "wood", count: 3 }],
        ownerKind: "crafting_job",
        ownerId: "job-A",
      },
    );
    const r2 = applyNetworkAction(r1.warehouseInventories, r1.network, {
      type: "NETWORK_RESERVE_BATCH",
      items: [{ itemId: "wood", count: 4 }],
      ownerKind: "crafting_job",
      ownerId: "job-B",
    });
    const r3 = applyNetworkAction(r2.warehouseInventories, r2.network, {
      type: "NETWORK_CANCEL_BY_OWNER",
      ownerKind: "crafting_job",
      ownerId: "job-A",
    });
    expect(r3.network.reservations).toHaveLength(1);
    expect(r3.network.reservations[0].ownerId).toBe("job-B");
  });
});

describe("getAllReservedByOwner / getReservationsForItem", () => {
  it("groups correctly", () => {
    const r = applyNetworkAction(
      { "wh-A": inv({ wood: 10, stone: 5 }) },
      createEmptyNetworkSlice(),
      {
        type: "NETWORK_RESERVE_BATCH",
        items: [
          { itemId: "wood", count: 2 },
          { itemId: "stone", count: 1 },
        ],
        ownerKind: "crafting_job",
        ownerId: "job-1",
      },
    );
    const s: ReservationStateSlice = {
      warehouseInventories: r.warehouseInventories,
      network: r.network,
    };
    expect(getAllReservedByOwner(s, "crafting_job", "job-1")).toHaveLength(2);
    expect(getReservationsForItem(s, "wood")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Save migration
// ---------------------------------------------------------------------------

describe("normalizeNetworkSlice", () => {
  it("returns a fresh slice for missing input", () => {
    expect(normalizeNetworkSlice(undefined)).toEqual(createEmptyNetworkSlice());
    expect(normalizeNetworkSlice(null)).toEqual(createEmptyNetworkSlice());
  });

  it("drops persisted reservations but preserves nextReservationId", () => {
    const stale: NetworkSlice = {
      reservations: [
        { id: "res-99", itemId: "wood", amount: 1, ownerKind: "crafting_job", ownerId: "ghost", createdAt: 0 },
      ],
      nextReservationId: 100,
      lastError: null,
    };
    const out = normalizeNetworkSlice(stale);
    expect(out.reservations).toEqual([]);
    expect(out.nextReservationId).toBe(100);
    expect(out.lastError).toBeNull();
  });

  it("clamps invalid nextReservationId back to 1", () => {
    expect(
      normalizeNetworkSlice({ nextReservationId: -5 } as Partial<NetworkSlice>)
        .nextReservationId,
    ).toBe(1);
  });
});

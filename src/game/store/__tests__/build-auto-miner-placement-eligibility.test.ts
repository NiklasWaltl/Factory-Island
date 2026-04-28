import { decideAutoMinerPlacementEligibility } from "../build-auto-miner-placement-eligibility";

describe("decideAutoMinerPlacementEligibility", () => {
  test("returns eligible for a valid unclaimed deposit", () => {
    const decision = decideAutoMinerPlacementEligibility({
      x: 5,
      y: 6,
      cellMap: { "5,6": "dep-1" },
      assets: {
        "dep-1": { id: "dep-1", type: "iron_deposit", x: 5, y: 6, size: 2, fixed: true },
      },
      autoMiners: {},
      depositTypes: new Set(["stone_deposit", "iron_deposit", "copper_deposit"]),
    });

    expect(decision).toEqual({ kind: "eligible" });
  });

  test("returns blocked when deposit already has an auto-miner", () => {
    const decision = decideAutoMinerPlacementEligibility({
      x: 5,
      y: 6,
      cellMap: { "5,6": "dep-1" },
      assets: {
        "dep-1": { id: "dep-1", type: "iron_deposit", x: 5, y: 6, size: 2, fixed: true },
      },
      autoMiners: {
        "miner-1": { depositId: "dep-1" },
      },
      depositTypes: new Set(["stone_deposit", "iron_deposit", "copper_deposit"]),
    });

    expect(decision).toEqual({
      kind: "blocked",
      blockReason: "deposit_already_has_auto_miner",
    });
  });
});

import {
  getActiveResources,
  getHubRange,
  getHubTierLabel,
  getMaxDrones,
  getMaxTargetStockForTier,
} from "../reducer";

describe("hub tier selector helpers", () => {
  it("returns expected values for tier 1", () => {
    expect(getHubRange(1)).toBe(10);
    expect(getActiveResources(1)).toEqual(["wood", "stone"]);
    expect(getMaxDrones(1)).toBe(1);
    expect(getMaxTargetStockForTier(1)).toBe(30);
    expect(getHubTierLabel(1)).toBe("Proto-Hub");
  });

  it("returns expected values for tier 2", () => {
    expect(getHubRange(2)).toBe(30);
    expect(getActiveResources(2)).toEqual(["wood", "stone", "iron", "copper"]);
    expect(getMaxDrones(2)).toBe(4);
    expect(getMaxTargetStockForTier(2)).toBe(100);
    expect(getHubTierLabel(2)).toBe("Service-Hub");
  });
});

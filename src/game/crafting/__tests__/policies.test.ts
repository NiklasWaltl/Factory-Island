import {
  checkRecipeAutomationPolicy,
  type RecipeAutomationPolicyMap,
} from "../policies/policies";

const ALLOWED: RecipeAutomationPolicyMap = {};
const MANUAL_ONLY: RecipeAutomationPolicyMap = {
  plank: { manualOnly: true },
};
const AUTO_DISABLED: RecipeAutomationPolicyMap = {
  plank: { autoCraftAllowed: false },
};
const KEEP_DISABLED: RecipeAutomationPolicyMap = {
  plank: { keepInStockAllowed: false },
};

describe("crafting/policies — checkRecipeAutomationPolicy", () => {
  describe("when policy allows the recipe", () => {
    it.each([
      "craftRequest",
      "jobEnqueueAutomation",
      "plannerAutoCraft",
      "plannerKeepStock",
      "keepStockRefill",
    ] as const)("returns allowed for context %s", (ctx) => {
      const decision = checkRecipeAutomationPolicy(ALLOWED, "plank", ctx);
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBeUndefined();
    });
  });

  describe("auto-craft contexts use auto-craft policy", () => {
    it("blocks craftRequest with exact wording (incl. trailing dot)", () => {
      const decision = checkRecipeAutomationPolicy(MANUAL_ONLY, "plank", "craftRequest");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("Auto-Craft fuer Rezept plank blockiert: manual only.");
      expect(decision.rawReason).toBe("manual only");
    });
    it("blocks jobEnqueueAutomation with exact wording (incl. trailing dot)", () => {
      const decision = checkRecipeAutomationPolicy(AUTO_DISABLED, "plank", "jobEnqueueAutomation");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe(
        "Automations-Queue blockiert Rezept plank: auto-craft disabled.",
      );
      expect(decision.rawReason).toBe("auto-craft disabled");
    });
    it("blocks plannerAutoCraft without trailing dot (planner reason format)", () => {
      const decision = checkRecipeAutomationPolicy(AUTO_DISABLED, "plank", "plannerAutoCraft");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("Auto-Craft policy blockiert Rezept plank: auto-craft disabled");
    });
    it("auto-craft contexts ignore keep-stock-only restrictions", () => {
      const decision = checkRecipeAutomationPolicy(KEEP_DISABLED, "plank", "craftRequest");
      expect(decision.allowed).toBe(true);
    });
  });

  describe("keep-stock contexts use keep-stock policy", () => {
    it("blocks plannerKeepStock without trailing dot (planner reason format)", () => {
      const decision = checkRecipeAutomationPolicy(KEEP_DISABLED, "plank", "plannerKeepStock");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe(
        "Keep-in-stock policy blockiert Rezept plank: keep-in-stock disabled",
      );
      expect(decision.rawReason).toBe("keep-in-stock disabled");
    });
    it("keepStockRefill returns the bare reason (used in dev-log fragment)", () => {
      const decision = checkRecipeAutomationPolicy(KEEP_DISABLED, "plank", "keepStockRefill");
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe("keep-in-stock disabled");
      expect(decision.rawReason).toBe("keep-in-stock disabled");
    });
    it("keep-stock contexts ignore auto-craft-only restrictions", () => {
      const decision = checkRecipeAutomationPolicy(AUTO_DISABLED, "plank", "plannerKeepStock");
      expect(decision.allowed).toBe(true);
    });
    it("manualOnly blocks both keep-stock contexts", () => {
      expect(checkRecipeAutomationPolicy(MANUAL_ONLY, "plank", "plannerKeepStock").allowed).toBe(false);
      expect(checkRecipeAutomationPolicy(MANUAL_ONLY, "plank", "keepStockRefill").allowed).toBe(false);
    });
  });

  describe("undefined / missing policy map", () => {
    it("treats undefined map as allow-all", () => {
      const decision = checkRecipeAutomationPolicy(undefined, "plank", "craftRequest");
      expect(decision.allowed).toBe(true);
    });
    it("treats missing entry as allow-all", () => {
      const decision = checkRecipeAutomationPolicy(
        { other: { manualOnly: true } },
        "plank",
        "craftRequest",
      );
      expect(decision.allowed).toBe(true);
    });
  });
});

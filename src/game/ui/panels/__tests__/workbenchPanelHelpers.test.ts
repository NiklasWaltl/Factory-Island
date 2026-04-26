import {
  cellKey,
  createInitialState,
  type GameState,
  type PlacedAsset,
} from "../../../store/reducer";
import type { Reservation } from "../../../inventory/reservationTypes";
import {
  computeIngredientLines,
  isPlayerGearRecipe,
  scopeKeyForSource,
  summarizeAvailability,
} from "../helpers";
import { getWorkbenchRecipe } from "../../../simulation/recipes";

function baseState(): GameState {
  const base = createInitialState("release");
  const wb: PlacedAsset = { id: "wb-1", type: "workbench", x: 0, y: 0, size: 2 };
  return {
    ...base,
    assets: { ...base.assets, "wb-1": wb },
    cellMap: {
      ...base.cellMap,
      [cellKey(0, 0)]: "wb-1",
      [cellKey(1, 0)]: "wb-1",
      [cellKey(0, 1)]: "wb-1",
      [cellKey(1, 1)]: "wb-1",
    },
    selectedCraftingBuildingId: "wb-1",
    placedBuildings: ["workbench"],
  };
}

describe("workbenchPanelHelpers", () => {
  describe("scopeKeyForSource", () => {
    it("uses the same scope keys as crafting/tick.ts", () => {
      expect(scopeKeyForSource({ kind: "global" })).toBe("crafting:global");
      expect(scopeKeyForSource({ kind: "warehouse", warehouseId: "wh-1" })).toBe(
        "crafting:warehouse:wh-1",
      );
      expect(
        scopeKeyForSource({ kind: "zone", zoneId: "z-1", warehouseIds: [] }),
      ).toBe("crafting:zone:z-1");
    });
  });

  describe("computeIngredientLines + summarizeAvailability", () => {
    it("reports available when free >= required", () => {
      const state: GameState = {
        ...baseState(),
        inventory: { ...baseState().inventory, wood: 10 },
      };
      const recipe = getWorkbenchRecipe("wood_pickaxe")!; // costs wood 5
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "global" },
        state.inventory,
      );
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        resource: "wood",
        required: 5,
        stored: 10,
        reserved: 0,
        free: 10,
        status: "available",
      });
      const avail = summarizeAvailability(lines);
      expect(avail.canCraft).toBe(true);
      expect(avail.worstStatus).toBe("available");
      expect(avail.maxBatchByStock).toBe(2);
    });

    it("reports reserved when stock exists but reservations block it", () => {
      const base = baseState();
      const res: Reservation = {
        id: "r-1",
        itemId: "wood" as any,
        amount: 8,
        ownerKind: "crafting_job",
        ownerId: "job-x",
        scopeKey: "crafting:global",
        createdAt: 1,
      };
      const state: GameState = {
        ...base,
        inventory: { ...base.inventory, wood: 10 },
        network: { ...base.network, reservations: [res] },
      };
      const recipe = getWorkbenchRecipe("wood_pickaxe")!;
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "global" },
        state.inventory,
      );
      // stored=10, reserved=8, free=2, required=5 → stored >= required but free < required
      expect(lines[0].status).toBe("reserved");
      expect(lines[0].reserved).toBe(8);
      expect(lines[0].free).toBe(2);
      const avail = summarizeAvailability(lines);
      expect(avail.canCraft).toBe(false);
      expect(avail.worstStatus).toBe("reserved");
    });

    it("reports missing when physical stock is too low", () => {
      const base = baseState();
      const state: GameState = {
        ...base,
        inventory: { ...base.inventory, wood: 2 },
      };
      const recipe = getWorkbenchRecipe("wood_pickaxe")!; // needs 5
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "global" },
        state.inventory,
      );
      expect(lines[0].status).toBe("missing");
      const avail = summarizeAvailability(lines);
      expect(avail.canCraft).toBe(false);
      expect(avail.worstStatus).toBe("missing");
      expect(avail.maxBatchByStock).toBe(0);
    });

    it("worst-of aggregates across multiple ingredients (missing trumps reserved)", () => {
      const base = baseState();
      const res: Reservation = {
        id: "r-1",
        itemId: "wood" as any,
        amount: 9,
        ownerKind: "crafting_job",
        ownerId: "job-x",
        scopeKey: "crafting:global",
        createdAt: 1,
      };
      const state: GameState = {
        ...base,
        inventory: { ...base.inventory, wood: 10, stone: 0 },
        network: { ...base.network, reservations: [res] },
      };
      const recipe = getWorkbenchRecipe("stone_pickaxe")!; // wood:10, stone:5
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "global" },
        state.inventory,
      );
      // wood: stored 10, reserved 9, free 1, required 10 → missing (physically not enough free+reserved doesn't matter: stored<required? stored=10, req=10 → free=1 < 10 but stored>=required → reserved)
      // Actually stored(10) == required(10) so status=reserved
      // stone: stored 0, required 5 → missing
      expect(lines.find((l) => l.resource === "wood")!.status).toBe("reserved");
      expect(lines.find((l) => l.resource === "stone")!.status).toBe("missing");
      const avail = summarizeAvailability(lines);
      expect(avail.worstStatus).toBe("missing");
      expect(avail.canCraft).toBe(false);
    });

    it("marks as available via hub fallback when warehouse is insufficient", () => {
      const base = baseState();
      const hubId = base.starterDrone.hubId;
      expect(hubId).toBeTruthy();
      if (!hubId) return;

      const state: GameState = {
        ...base,
        assets: {
          ...base.assets,
          "wh-1": { id: "wh-1", type: "warehouse", x: 4, y: 4, size: 2 },
        },
        warehouseInventories: {
          ...base.warehouseInventories,
          "wh-1": { ...base.inventory, wood: 2 },
        },
        serviceHubs: {
          ...base.serviceHubs,
          [hubId]: {
            ...base.serviceHubs[hubId],
            inventory: { ...base.serviceHubs[hubId].inventory, wood: 10 },
          },
        },
      };

      const recipe = getWorkbenchRecipe("wood_pickaxe")!; // needs 5 wood
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "warehouse", warehouseId: "wh-1" },
        state.warehouseInventories["wh-1"],
      );

      expect(lines).toHaveLength(1);
      expect(lines[0].status).toBe("available");
      expect(lines[0].stored).toBe(10);
      expect(lines[0].free).toBe(10);
    });

    it("marks as reserved when fallback hub stock exists but is reserved", () => {
      const base = baseState();
      const hubId = base.starterDrone.hubId;
      expect(hubId).toBeTruthy();
      if (!hubId) return;

      const state: GameState = {
        ...base,
        assets: {
          ...base.assets,
          "wh-1": { id: "wh-1", type: "warehouse", x: 4, y: 4, size: 2 },
        },
        warehouseInventories: {
          ...base.warehouseInventories,
          "wh-1": { ...base.inventory, wood: 0 },
        },
        serviceHubs: {
          ...base.serviceHubs,
          [hubId]: {
            ...base.serviceHubs[hubId],
            inventory: { ...base.serviceHubs[hubId].inventory, wood: 10 },
          },
        },
        network: {
          ...base.network,
          reservations: [
            {
              id: "r-hub",
              itemId: "wood" as ItemId,
              amount: 8,
              ownerKind: "crafting_job",
              ownerId: "job-1",
              scopeKey: `crafting:warehouse:wh-1:hub:${hubId}`,
              createdAt: 1,
            },
          ],
        },
      };

      const recipe = getWorkbenchRecipe("wood_pickaxe")!;
      const lines = computeIngredientLines(
        state,
        recipe,
        { kind: "warehouse", warehouseId: "wh-1" },
        state.warehouseInventories["wh-1"],
      );

      expect(lines[0].status).toBe("reserved");
      expect(lines[0].reserved).toBe(8);
      expect(lines[0].free).toBe(2);
    });
  });

  describe("isPlayerGearRecipe", () => {
    it("returns true for player_gear outputs", () => {
      expect(isPlayerGearRecipe(getWorkbenchRecipe("wood_pickaxe")!)).toBe(true);
      expect(isPlayerGearRecipe(getWorkbenchRecipe("stone_pickaxe")!)).toBe(true);
    });
  });
});

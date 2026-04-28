import { decideConveyorRoutingAction } from "../logistics-routing";
import { decideConveyorTargetSelection } from "../../conveyor-decisions";
import { createInitialState } from "../../reducer";
import type { CraftingSource } from "../../types";
import type { CraftingJob } from "../../../crafting/types";
import type {
  ConveyorItem,
  ConveyorState,
  GameState,
  Inventory,
  PlacedAsset,
  SmithyState,
} from "../../types";

describe("decideConveyorRoutingAction", () => {
  it("routes to next conveyor when compatible and available", () => {
    const action = decideConveyorRoutingAction({
      conveyorDirection: "east",
      nextAssetType: "conveyor",
      nextAssetDirection: "east",
      nextConveyorMovedThisTick: false,
      nextConveyorHasCapacity: true,
      beltToNextZoneCompatible: true,
      nextWarehouseInputValid: false,
      nextWarehouseZoneCompatible: false,
      nextWarehouseHasCapacity: false,
    });

    expect(action).toEqual({ type: "route_to_next_conveyor" });
  });

  it("blocks when next conveyor is full", () => {
    const action = decideConveyorRoutingAction({
      conveyorDirection: "east",
      nextAssetType: "conveyor",
      nextAssetDirection: "east",
      nextConveyorMovedThisTick: false,
      nextConveyorHasCapacity: false,
      beltToNextZoneCompatible: true,
      nextWarehouseInputValid: false,
      nextWarehouseZoneCompatible: false,
      nextWarehouseHasCapacity: false,
    });

    expect(action).toEqual({ type: "mark_routing_blocked" });
  });

  it("routes to adjacent warehouse when warehouse input is valid and capacity exists", () => {
    const action = decideConveyorRoutingAction({
      conveyorDirection: "west",
      nextAssetType: "warehouse",
      nextAssetDirection: null,
      nextConveyorMovedThisTick: false,
      nextConveyorHasCapacity: false,
      beltToNextZoneCompatible: false,
      nextWarehouseInputValid: true,
      nextWarehouseZoneCompatible: true,
      nextWarehouseHasCapacity: true,
    });

    expect(action).toEqual({ type: "route_to_adjacent_warehouse" });
  });

  it("blocks warehouse routing when zones are incompatible", () => {
    const action = decideConveyorRoutingAction({
      conveyorDirection: "west",
      nextAssetType: "warehouse",
      nextAssetDirection: null,
      nextConveyorMovedThisTick: false,
      nextConveyorHasCapacity: false,
      beltToNextZoneCompatible: false,
      nextWarehouseInputValid: true,
      nextWarehouseZoneCompatible: false,
      nextWarehouseHasCapacity: true,
    });

    expect(action).toEqual({ type: "mark_routing_blocked" });
  });

  it("blocks when no known route target exists", () => {
    const action = decideConveyorRoutingAction({
      conveyorDirection: "south",
      nextAssetType: "workbench",
      nextAssetDirection: null,
      nextConveyorMovedThisTick: false,
      nextConveyorHasCapacity: false,
      beltToNextZoneCompatible: false,
      nextWarehouseInputValid: false,
      nextWarehouseZoneCompatible: false,
      nextWarehouseHasCapacity: false,
    });

    expect(action).toEqual({ type: "mark_routing_blocked" });
  });
});

function makeSmithyDecisionInput(params?: {
  currentItem?: ConveyorItem;
  smithy?: Partial<SmithyState>;
  zoneCompatible?: boolean;
}) {
  const currentItem = params?.currentItem ?? "iron";
  const zoneCompatible = params?.zoneCompatible ?? true;

  const convId = "cv1";
  const smithyId = "sm1";
  const convAsset: PlacedAsset = {
    id: convId,
    type: "conveyor",
    x: 1,
    y: 1,
    size: 1,
    direction: "east",
  };
  const smithyAsset: PlacedAsset = {
    id: smithyId,
    type: "smithy",
    x: 2,
    y: 1,
    size: 2,
    direction: "south",
  };

  const base = createInitialState("release");
  const state: GameState = {
    ...base,
    assets: {
      [convId]: convAsset,
      [smithyId]: smithyAsset,
    },
    cellMap: {
      "1,1": convId,
      "2,1": smithyId,
    },
    buildingZoneIds: zoneCompatible
      ? { [convId]: "zA", [smithyId]: "zA" }
      : { [convId]: "zA", [smithyId]: "zB" },
  };

  const smithy: SmithyState = {
    ...state.smithy,
    ...(params?.smithy ?? {}),
  };

  const conveyors: Record<string, ConveyorState> = {
    [convId]: { queue: [currentItem] },
  };

  const noCallResolveSource = () => {
    throw new Error("resolveBuildingSource should not be called in smithy tests");
  };

  return {
    state,
    input: {
      state,
      liveState: state,
      convId,
      convAsset,
      currentItem,
      conveyors,
      warehouseInventories: {} as Record<string, Inventory>,
      smithy,
      movedThisTick: new Set<string>(),
      isValidWarehouseInput: () => false,
      resolveBuildingSource: noCallResolveSource as (state: GameState, buildingId: string | null) => CraftingSource,
      getCraftingSourceInventory: () => ({ ...state.inventory }),
      getSourceCapacity: () => 0,
      getWarehouseCapacity: () => 20,
    },
  };
}

describe("decideConveyorTargetSelection workbench contract", () => {
  it("returns workbench target with mandatory workbenchJob when an active job exists", () => {
    const convId = "cv1";
    const workbenchId = "wb1";

    const convAsset: PlacedAsset = {
      id: convId,
      type: "conveyor",
      x: 1,
      y: 1,
      size: 1,
      direction: "east",
    };
    const workbenchAsset: PlacedAsset = {
      id: workbenchId,
      type: "workbench",
      x: 2,
      y: 1,
      size: 1,
      direction: "south",
    };

    const activeJob: CraftingJob = {
      id: "job-1",
      recipeId: "wood_pickaxe",
      workbenchId,
      inventorySource: { kind: "global" },
      status: "queued",
      priority: "high",
      source: "player",
      enqueuedAt: 1,
      startedAt: null,
      finishesAt: null,
      progress: 0,
      ingredients: [{ itemId: "wood", count: 1 }],
      output: { itemId: "wood", count: 1 },
      processingTime: 1,
      reservationOwnerId: "job-1",
    };

    const base = createInitialState("release");
    const state: GameState = {
      ...base,
      assets: {
        [convId]: convAsset,
        [workbenchId]: workbenchAsset,
      },
      cellMap: {
        "1,1": convId,
        "2,1": workbenchId,
      },
      buildingZoneIds: {
        [convId]: "zA",
        [workbenchId]: "zA",
      },
      crafting: {
        ...base.crafting,
        jobs: [activeJob],
      },
    };

    const decision = decideConveyorTargetSelection({
      state,
      liveState: state,
      convId,
      convAsset,
      currentItem: "wood",
      conveyors: {
        [convId]: { queue: ["wood"] },
      },
      warehouseInventories: {} as Record<string, Inventory>,
      smithy: state.smithy,
      movedThisTick: new Set<string>(),
      isValidWarehouseInput: () => false,
      resolveBuildingSource: () => ({ kind: "global" } as CraftingSource),
      getCraftingSourceInventory: () => ({ ...state.inventory }),
      getSourceCapacity: () => 999,
      getWarehouseCapacity: () => 20,
    });

    expect(decision).toEqual({
      kind: "target",
      targetType: "workbench",
      targetId: workbenchId,
      workbenchJob: { id: activeJob.id, status: activeJob.status },
    });

    if (decision.kind === "target" && decision.targetType === "workbench") {
      const jobId: string = decision.workbenchJob.id;
      expect(jobId).toBe(activeJob.id);
    }
  });
});

describe("decideConveyorTargetSelection next_conveyor contract", () => {
  it("returns next_conveyor target with mandatory nextAssetId when routing is eligible", () => {
    const convId = "cv1";
    const nextConvId = "cv2";

    const convAsset: PlacedAsset = {
      id: convId,
      type: "conveyor",
      x: 1,
      y: 1,
      size: 1,
      direction: "east",
    };
    const nextConvAsset: PlacedAsset = {
      id: nextConvId,
      type: "conveyor",
      x: 2,
      y: 1,
      size: 1,
      direction: "east",
    };

    const base = createInitialState("release");
    const state: GameState = {
      ...base,
      assets: {
        [convId]: convAsset,
        [nextConvId]: nextConvAsset,
      },
      cellMap: {
        "1,1": convId,
        "2,1": nextConvId,
      },
      buildingZoneIds: {
        [convId]: "zA",
        [nextConvId]: "zA",
      },
    };

    const noCallResolveSource = () => {
      throw new Error("resolveBuildingSource should not be called in next_conveyor tests");
    };

    const decision = decideConveyorTargetSelection({
      state,
      liveState: state,
      convId,
      convAsset,
      currentItem: "iron",
      conveyors: {
        [convId]: { queue: ["iron"] },
        [nextConvId]: { queue: [] },
      },
      warehouseInventories: {} as Record<string, Inventory>,
      smithy: state.smithy,
      movedThisTick: new Set<string>(),
      isValidWarehouseInput: () => false,
      resolveBuildingSource: noCallResolveSource as (state: GameState, buildingId: string | null) => CraftingSource,
      getCraftingSourceInventory: () => ({ ...state.inventory }),
      getSourceCapacity: () => 0,
      getWarehouseCapacity: () => 20,
    });

    expect(decision).toEqual({
      kind: "target",
      targetType: "next_conveyor",
      targetId: nextConvId,
      nextAssetId: nextConvId,
    });

    if (decision.kind === "target" && decision.targetType === "next_conveyor") {
      const nextId: string = decision.nextAssetId;
      expect(nextId).toBe(nextConvId);
    }
  });
});

describe("decideConveyorTargetSelection smithy contract", () => {
  it("returns smithy target with mandatory oreKey when smithy can accept iron", () => {
    const { input } = makeSmithyDecisionInput({
      currentItem: "iron",
      smithy: { iron: 49 },
      zoneCompatible: true,
    });

    const decision = decideConveyorTargetSelection(input);

    expect(decision).toEqual({
      kind: "target",
      targetType: "smithy",
      targetId: "sm1",
      smithyOreKey: "iron",
    });

    if (decision.kind === "target" && decision.targetType === "smithy") {
      const oreKey: "iron" | "copper" = decision.smithyOreKey;
      expect(oreKey).toBe("iron");
    }
  });

  it("returns smithy blocked when smithy is full for the routed ore", () => {
    const { input } = makeSmithyDecisionInput({
      currentItem: "iron",
      smithy: { iron: 50 },
      zoneCompatible: true,
    });

    const decision = decideConveyorTargetSelection(input);

    expect(decision).toEqual({
      kind: "blocked",
      targetType: "smithy",
      targetId: "sm1",
      blockReason: "smithy_full",
    });
  });
});

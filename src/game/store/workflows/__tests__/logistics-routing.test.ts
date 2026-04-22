import { decideConveyorRoutingAction } from "../logistics-routing";

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

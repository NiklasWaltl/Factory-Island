import { decideConveyorWarehouseInputRoutingAction } from "../logistics-warehouse-input-routing";

describe("decideConveyorWarehouseInputRoutingAction", () => {
  it("returns no_input_tile_warehouse_target when no candidate matches the input tile", () => {
    const action = decideConveyorWarehouseInputRoutingAction({
      conveyorX: 10,
      conveyorY: 10,
      candidates: [
        {
          warehouseId: "w1",
          warehouseX: 5,
          warehouseY: 5,
          warehouseHeight: 2,
          zoneCompatible: true,
          hasCapacity: true,
        },
      ],
    });

    expect(action).toEqual({ type: "no_input_tile_warehouse_target" });
  });

  it("routes to warehouse when conveyor is on input tile and delivery is possible", () => {
    const action = decideConveyorWarehouseInputRoutingAction({
      conveyorX: 5,
      conveyorY: 7,
      candidates: [
        {
          warehouseId: "w1",
          warehouseX: 5,
          warehouseY: 5,
          warehouseHeight: 2,
          zoneCompatible: true,
          hasCapacity: true,
        },
      ],
    });

    expect(action).toEqual({
      type: "route_to_input_tile_warehouse",
      warehouseId: "w1",
    });
  });

  it("marks blocked when conveyor is on input tile but delivery is not possible", () => {
    const action = decideConveyorWarehouseInputRoutingAction({
      conveyorX: 5,
      conveyorY: 7,
      candidates: [
        {
          warehouseId: "w1",
          warehouseX: 5,
          warehouseY: 5,
          warehouseHeight: 2,
          zoneCompatible: false,
          hasCapacity: true,
        },
      ],
    });

    expect(action).toEqual({
      type: "mark_input_tile_routing_blocked",
      warehouseId: "w1",
    });
  });

  it("uses first matching candidate deterministically", () => {
    const action = decideConveyorWarehouseInputRoutingAction({
      conveyorX: 5,
      conveyorY: 7,
      candidates: [
        {
          warehouseId: "first",
          warehouseX: 5,
          warehouseY: 5,
          warehouseHeight: 2,
          zoneCompatible: false,
          hasCapacity: true,
        },
        {
          warehouseId: "second",
          warehouseX: 5,
          warehouseY: 5,
          warehouseHeight: 2,
          zoneCompatible: true,
          hasCapacity: true,
        },
      ],
    });

    expect(action).toEqual({
      type: "mark_input_tile_routing_blocked",
      warehouseId: "first",
    });
  });
});

// ============================================================
// Logistics warehouse-input routing workflow decisions
// ------------------------------------------------------------
// Pure decision layer for direct conveyor -> warehouse input-tile routing.
// Reducer remains responsible for all state mutations.
// ============================================================

export interface WarehouseInputRoutingCandidate {
  warehouseId: string;
  warehouseX: number;
  warehouseY: number;
  warehouseHeight: number;
  zoneCompatible: boolean;
  hasCapacity: boolean;
}

export interface DecideConveyorWarehouseInputRoutingInput {
  conveyorX: number;
  conveyorY: number;
  candidates: readonly WarehouseInputRoutingCandidate[];
}

export type LogisticsWarehouseInputRoutingAction =
  | {
      type: "route_to_input_tile_warehouse";
      warehouseId: string;
    }
  | {
      type: "mark_input_tile_routing_blocked";
      warehouseId: string;
    }
  | {
      type: "no_input_tile_warehouse_target";
    };

function isConveyorOnWarehouseInputTile(
  conveyorX: number,
  conveyorY: number,
  candidate: WarehouseInputRoutingCandidate,
): boolean {
  return (
    conveyorX === candidate.warehouseX &&
    conveyorY === candidate.warehouseY + candidate.warehouseHeight
  );
}

export function decideConveyorWarehouseInputRoutingAction(
  input: DecideConveyorWarehouseInputRoutingInput,
): LogisticsWarehouseInputRoutingAction {
  for (const candidate of input.candidates) {
    if (
      !isConveyorOnWarehouseInputTile(
        input.conveyorX,
        input.conveyorY,
        candidate,
      )
    ) {
      continue;
    }

    if (candidate.zoneCompatible && candidate.hasCapacity) {
      return {
        type: "route_to_input_tile_warehouse",
        warehouseId: candidate.warehouseId,
      };
    }

    return {
      type: "mark_input_tile_routing_blocked",
      warehouseId: candidate.warehouseId,
    };
  }

  return { type: "no_input_tile_warehouse_target" };
}

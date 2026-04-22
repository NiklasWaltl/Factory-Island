// ============================================================
// Logistics routing workflow decisions
// ------------------------------------------------------------
// Pure decision layer for conveyor next-target routing.
// Reducer remains responsible for all state mutations.
// ============================================================

import type { AssetType, Direction } from "../types";

export type LogisticsRoutingAction =
  | { type: "route_to_next_conveyor" }
  | { type: "route_to_adjacent_warehouse" }
  | { type: "mark_routing_blocked" };

export interface DecideConveyorRoutingInput {
  conveyorDirection: Direction;
  nextAssetType: AssetType | null;
  nextAssetDirection: Direction | null;
  nextConveyorMovedThisTick: boolean;
  nextConveyorHasCapacity: boolean;
  beltToNextZoneCompatible: boolean;
  nextWarehouseInputValid: boolean;
  nextWarehouseZoneCompatible: boolean;
  nextWarehouseHasCapacity: boolean;
}

function isCompatibleNextConveyor(
  conveyorDirection: Direction,
  nextAssetType: AssetType | null,
  nextAssetDirection: Direction | null,
): boolean {
  if (nextAssetType === "conveyor_corner") return true;
  if (nextAssetType !== "conveyor") return false;
  return (nextAssetDirection ?? "east") === conveyorDirection;
}

export function decideConveyorRoutingAction(
  input: DecideConveyorRoutingInput,
): LogisticsRoutingAction {
  const nextConveyorCompatible = isCompatibleNextConveyor(
    input.conveyorDirection,
    input.nextAssetType,
    input.nextAssetDirection,
  );

  if (nextConveyorCompatible) {
    if (
      !input.nextConveyorMovedThisTick &&
      input.beltToNextZoneCompatible &&
      input.nextConveyorHasCapacity
    ) {
      return { type: "route_to_next_conveyor" };
    }
    return { type: "mark_routing_blocked" };
  }

  if (input.nextAssetType === "warehouse" && input.nextWarehouseInputValid) {
    if (input.nextWarehouseZoneCompatible && input.nextWarehouseHasCapacity) {
      return { type: "route_to_adjacent_warehouse" };
    }
    return { type: "mark_routing_blocked" };
  }

  return { type: "mark_routing_blocked" };
}

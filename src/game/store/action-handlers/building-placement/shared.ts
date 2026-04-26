import type { GameAction } from "../../reducer";
import {
  isBuildingSourceStateConsistent,
  isBuildingZoneStateConsistent,
  isConstructionSiteStateConsistent,
} from "../../utils/asset-guards";
import type {
  GameNotification,
  GameState,
} from "../../types";

export type HandledActionType = "BUILD_PLACE_BUILDING" | "BUILD_REMOVE_ASSET";

export const HANDLED_ACTION_TYPES = new Set<string>([
  "BUILD_PLACE_BUILDING",
  "BUILD_REMOVE_ASSET",
]);

export function isBuildingPlacementAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

export interface BuildingPlacementIoDeps {
  makeId(): string;
  addErrorNotification(notifications: GameNotification[], message: string): GameNotification[];
  debugLog: {
    building(message: string): void;
  };
}

export function logPlacementInvariantWarnings(
  state: GameState,
  actionType: string,
  debugLog: BuildingPlacementIoDeps["debugLog"],
): void {
  if (!import.meta.env.DEV) return;
  if (!isConstructionSiteStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] constructionSites inkonsistent`);
  }
  if (!isBuildingZoneStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingZoneIds inkonsistent`);
  }
  if (!isBuildingSourceStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingSourceWarehouseIds inkonsistent`);
  }
}

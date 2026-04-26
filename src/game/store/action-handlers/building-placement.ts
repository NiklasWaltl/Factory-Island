// ============================================================
// Build placement/removal action handler — dispatcher
// ------------------------------------------------------------
// Composition root for the BUILD_PLACE_BUILDING / BUILD_REMOVE_ASSET
// action slice. Per-case logic lives in ./building-placement/.
// ============================================================

import type { GameAction } from "../reducer";
import {
  type BuildingPlacementActionDeps,
  isBuildingPlacementAction,
} from "./building-placement/shared";
import { handlePlaceBuildingAction } from "./building-placement/place-building";
import { handleRemoveAssetAction } from "./building-placement/remove-asset";
import type { GameState } from "../types";

export { isBuildingPlacementAction };
export type { BuildingPlacementActionDeps };

export function handleBuildingPlacementAction(
  state: GameState,
  action: GameAction,
  deps: BuildingPlacementActionDeps,
): GameState | null {
  switch (action.type) {
    case "BUILD_PLACE_BUILDING":
      return handlePlaceBuildingAction(state, action, deps);
    case "BUILD_REMOVE_ASSET":
      return handleRemoveAssetAction(state, action, deps);
    default:
      return null;
  }
}

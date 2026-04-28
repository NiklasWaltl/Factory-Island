// ============================================================
// Build-mode action handler
// ------------------------------------------------------------
// Handles:     TOGGLE_BUILD_MODE, SELECT_BUILD_BUILDING,
//              SELECT_BUILD_FLOOR_TILE
// Reads:       state.buildMode, state.selectedBuildingType,
//              state.selectedFloorTile
// Writes:      state.buildMode, state.selectedBuildingType,
//              state.selectedFloorTile
// Depends on:  ./phases (3 phase modules; pure UI toggles)
// Notes:       No deps injection. Pure UI-only mutations — no asset
//              placement here (that's BUILD_PLACE_BUILDING in
//              building-placement.ts).
// ============================================================

import type { GameAction } from "../../actions";
import type { GameState } from "../../types";
import { HANDLED_ACTION_TYPES, type BuildModeHandledAction } from "./types";
import {
  runToggleBuildModePhase,
  runSelectBuildBuildingPhase,
  runSelectBuildFloorTilePhase,
} from "./phases";

export function isBuildModeAction(
  action: GameAction,
): action is BuildModeHandledAction {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles all build-mode UI cluster actions. Returns the next state
 * if the action belongs to this cluster, or `null` to signal the
 * reducer should fall through to its remaining switch cases.
 */
export function handleBuildModeAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "TOGGLE_BUILD_MODE": {
      return runToggleBuildModePhase({ state, action });
    }

    case "SELECT_BUILD_BUILDING": {
      return runSelectBuildBuildingPhase({ state, action });
    }

    case "SELECT_BUILD_FLOOR_TILE": {
      return runSelectBuildFloorTilePhase({ state, action });
    }

    default:
      return null;
  }
}

// ============================================================
// Build-mode action handler
// ------------------------------------------------------------
// Dispatcher over the three pure UI build-mode toggle/select cases:
// - TOGGLE_BUILD_MODE
// - SELECT_BUILD_BUILDING
// - SELECT_BUILD_FLOOR_TILE
//
// Behaviour is intentionally byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
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

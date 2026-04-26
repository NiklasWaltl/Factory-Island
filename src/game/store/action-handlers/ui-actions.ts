// ============================================================
// UI action handler (small interaction cases)
// ------------------------------------------------------------
// Extracts the small, low-risk UI interaction cases from reducer.ts:
// - SET_ACTIVE_SLOT
// - TOGGLE_PANEL
// - CLOSE_PANEL
// - TOGGLE_ENERGY_DEBUG
//
// CLICK_CELL is handled by handleClickCellAction (see action-handlers/click-cell.ts).
// ============================================================

import type { GameAction } from "../actions";
import type { GameState } from "../types";

type HandledActionType =
  | "SET_ACTIVE_SLOT"
  | "TOGGLE_PANEL"
  | "CLOSE_PANEL"
  | "TOGGLE_ENERGY_DEBUG";

const HANDLED_ACTION_TYPES = new Set<string>([
  "SET_ACTIVE_SLOT",
  "TOGGLE_PANEL",
  "CLOSE_PANEL",
  "TOGGLE_ENERGY_DEBUG",
]);

export function isUiAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

/**
 * Handles the small UI interaction actions. Returns next state if the
 * action is handled here, otherwise `null` for reducer fall-through.
 */
export function handleUiAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "SET_ACTIVE_SLOT":
      return {
        ...state,
        activeSlot: Math.min(action.slot, Math.max(0, state.hotbarSlots.length - 1)),
      };

    case "TOGGLE_PANEL":
      return { ...state, openPanel: state.openPanel === action.panel ? null : action.panel };

    case "CLOSE_PANEL":
      return {
        ...state,
        openPanel: null,
        selectedAutoMinerId: null,
        selectedAutoSmelterId: null,
        selectedGeneratorId: null,
        selectedWarehouseId: null,
        selectedCraftingBuildingId: null,
        selectedServiceHubId: null,
      };

    case "TOGGLE_ENERGY_DEBUG": {
      return { ...state, energyDebugOverlay: !state.energyDebugOverlay };
    }

    default:
      return null;
  }
}

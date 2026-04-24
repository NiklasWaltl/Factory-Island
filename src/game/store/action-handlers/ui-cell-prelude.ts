// ============================================================
// UI prelude for CLICK_CELL
// ------------------------------------------------------------
// Extracts only the transient UI prelude from CLICK_CELL:
// - map_shop panel toggle
// - build-mode panel routing
// - normal-mode panel routing
//
// Tool branches (axe/pickaxe/sapling) stay in reducer.ts.
// ============================================================

import type { GameState, PlacedAsset } from "../types";

export interface UiCellPreludeDeps {
  tryTogglePanelFromAsset(state: GameState, asset: PlacedAsset | null): GameState | null;
}

/**
 * Handles the transient UI prelude for CLICK_CELL.
 * Returns next state when handled; returns null to continue with tool branches.
 */
export function handleUiCellPrelude(
  state: GameState,
  asset: PlacedAsset | null,
  deps: UiCellPreludeDeps,
): GameState | null {
  // Click on map shop => open shop panel (always works)
  if (asset && asset.type === "map_shop") {
    return { ...state, openPanel: state.openPanel === "map_shop" ? null : "map_shop" };
  }

  // ----- BUILD MODE ACTIVE -----
  if (state.buildMode) {
    const panelState = deps.tryTogglePanelFromAsset(state, asset);
    if (panelState) return panelState;
    // In build mode: no mining, no hotbar tools, no cable clicking – only
    // BUILD_PLACE_BUILDING / BUILD_REMOVE_ASSET via dispatch.
    return state;
  }

  // ----- NORMAL MODE (build mode OFF) -----
  // Click on building => open its panel (panels still accessible)
  const panelState = deps.tryTogglePanelFromAsset(state, asset);
  if (panelState) return panelState;

  return null;
}

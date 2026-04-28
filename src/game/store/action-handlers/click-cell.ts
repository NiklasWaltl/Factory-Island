// ============================================================
// CLICK_CELL action handler
// ------------------------------------------------------------
// Extracts only the CLICK_CELL orchestration shell:
// - grid bounds guard
// - cellMap/asset lookup
// - UI prelude short-circuit
// - hotbar tool delegation
// ============================================================

import type { GameAction } from "../actions";
import { GRID_W, GRID_H } from "../../constants/grid";
import { cellKey } from "../cell-key";
import type { GameState, PlacedAsset } from "../types";
import {
  handleClickCellToolAction,
  type ClickCellToolActionDeps,
} from "./click-cell-tools";
import {
  handleUiCellPrelude,
  type UiCellPreludeDeps,
} from "./ui-cell-prelude";

export interface ClickCellActionDeps {
  uiCellPreludeDeps: UiCellPreludeDeps;
  clickCellToolActionDeps: ClickCellToolActionDeps;
}

type ResolveClickCellTargetResult =
  | { kind: "out_of_bounds" }
  | {
      kind: "resolved";
      x: number;
      y: number;
      assetId: string | undefined;
      asset: PlacedAsset | null;
    };

function resolveClickCellTarget(
  state: GameState,
  x: number,
  y: number,
): ResolveClickCellTargetResult {
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) {
    return { kind: "out_of_bounds" };
  }
  const assetId = state.cellMap[cellKey(x, y)];
  const asset = assetId ? state.assets[assetId] : null;
  return { kind: "resolved", x, y, assetId, asset };
}

export function handleClickCellAction(
  state: GameState,
  action: GameAction,
  deps: ClickCellActionDeps,
): GameState | null {
  switch (action.type) {
    case "CLICK_CELL": {
      const { x, y } = action;
      const resolved = resolveClickCellTarget(state, x, y);
      if (resolved.kind === "out_of_bounds") return state;

      const { assetId, asset } = resolved;

      const uiPreludeState = handleUiCellPrelude(state, asset, deps.uiCellPreludeDeps);
      if (uiPreludeState !== null) return uiPreludeState;

      return handleClickCellToolAction(
        state,
        { x: resolved.x, y: resolved.y, assetId, asset },
        deps.clickCellToolActionDeps,
      );
    }

    default:
      return null;
  }
}

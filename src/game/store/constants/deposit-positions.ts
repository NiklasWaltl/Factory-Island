// ============================================================
// Deposit constants
// ------------------------------------------------------------
// Pure deposit placement/config tables.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

import { GRID_H, GRID_W } from "../../constants/grid";
import type { AssetType } from "../types";

/** 2x2 infinite resource deposits (unbreakable, require Auto-Miner) */
export const DEPOSIT_TYPES = new Set<AssetType>(["stone_deposit", "iron_deposit", "copper_deposit"]);

/** Fixed spawn positions for deposits, scaled with grid size and far from trader */
export const DEPOSIT_POSITIONS: { type: AssetType; x: number; y: number }[] = [
  { type: "stone_deposit", x: 2, y: 2 },
  { type: "iron_deposit", x: GRID_W - 5, y: 2 },
  { type: "copper_deposit", x: 2, y: GRID_H - 5 },
];

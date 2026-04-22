// ============================================================
// Map layout constants
// ------------------------------------------------------------
// Pure map/layout anchor values.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

import { GRID_H, GRID_W } from "../../constants/grid";

/** Fixed top-left tile position of the 2x2 map shop near map center. */
export const MAP_SHOP_POS = { x: Math.floor(GRID_W / 2) - 1, y: Math.floor(GRID_H / 2) - 1 };
// ============================================================
// Service Hub upgrade cost
// ------------------------------------------------------------
// Pure cost table for hub upgrades.
// MUST NOT runtime-import from ../../reducer to avoid ESM cycles.
// ============================================================

import type { Inventory } from "../../types";

/** Resources required to upgrade a hub from Tier 1 to Tier 2. */
export const HUB_UPGRADE_COST: Readonly<Partial<Record<keyof Inventory, number>>> = { wood: 15, stone: 10, iron: 5 };

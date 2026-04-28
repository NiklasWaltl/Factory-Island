// ============================================================
// Service Hub active resource profiles
// ------------------------------------------------------------
// Pure per-tier resource profile tables.
// MUST NOT runtime-import from ../../reducer to avoid ESM cycles.
// ============================================================

import type { CollectableItemType } from "../../types";

/** Active collectable resource types for Tier 1. */
export const TIER1_ACTIVE_RESOURCES: readonly CollectableItemType[] = ["wood", "stone"];

/** Active collectable resource types for Tier 2. */
export const TIER2_ACTIVE_RESOURCES: readonly CollectableItemType[] = ["wood", "stone", "iron", "copper"];

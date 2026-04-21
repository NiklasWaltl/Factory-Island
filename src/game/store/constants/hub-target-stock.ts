// ============================================================
// Service Hub target stock defaults
// ------------------------------------------------------------
// Pure target-stock tables per hub tier.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

import type { CollectableItemType } from "../types";

/** Default target stock per resource for a Tier 2 Service-Hub. */
export const SERVICE_HUB_TARGET_STOCK: Readonly<Record<CollectableItemType, number>> = {
  wood: 20,
  stone: 10,
  iron: 5,
  copper: 5,
};

/** Default target stock per resource for a Tier 1 (Proto-Hub). */
export const PROTO_HUB_TARGET_STOCK: Readonly<Record<CollectableItemType, number>> = {
  wood: 10,
  stone: 5,
  iron: 0,
  copper: 0,
};

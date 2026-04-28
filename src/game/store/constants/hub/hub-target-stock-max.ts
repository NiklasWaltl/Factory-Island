// ============================================================
// Service Hub target stock clamp constants
// ------------------------------------------------------------
// Pure numeric clamp values by hub tier.
// MUST NOT runtime-import from ../../reducer to avoid ESM cycles.
// ============================================================

/** Maximum allowed target stock per resource (UI clamp) - Tier 2. */
export const MAX_HUB_TARGET_STOCK = 100;

/** Maximum allowed target stock per resource (UI clamp) - Tier 1. */
export const PROTO_HUB_MAX_TARGET_STOCK = 30;

// ============================================================
// Auto-delivery constants
// ------------------------------------------------------------
// Pure auto-delivery log/batching configuration values.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

/** Max entries kept in the auto-delivery log. */
export const AUTO_DELIVERY_LOG_MAX = 50;

/** Entries with the same source+resource within this window are batched together. */
export const AUTO_DELIVERY_BATCH_WINDOW_MS = 8_000;
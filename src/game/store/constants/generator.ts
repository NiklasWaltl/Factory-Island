// ============================================================
// Generator constants
// ------------------------------------------------------------
// Pure numeric configuration for the wood-burning generator.
// MUST NOT runtime-import from ../reducer to avoid ESM cycles.
// ============================================================

/** Tick interval for the generator fuel consumption (ms) */
export const GENERATOR_TICK_MS = 200;

/** Energy produced per generator tick while burning (J) */
export const GENERATOR_ENERGY_PER_TICK = 2;

/** How many ticks one wood unit lasts */
export const GENERATOR_TICKS_PER_WOOD = 25;

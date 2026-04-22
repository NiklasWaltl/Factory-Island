// ============================================================
// Drone/logistics configuration constants.
// ------------------------------------------------------------
// Extracted from store/reducer.ts as a single domain package.
// Re-exported by reducer.ts for backward-compatible
// from "../store/reducer" consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialization cycle.
// ============================================================

import type { DroneTaskType } from "../types";

/** Chebyshev tiles covered per tick while moving. */
export const DRONE_SPEED_TILES_PER_TICK = 2;

/** Ticks the drone spends collecting from a node. */
export const DRONE_COLLECT_TICKS = 2;

/** Ticks the drone spends depositing at the dropoff. */
export const DRONE_DEPOSIT_TICKS = 2;

/** Number of logistics ticks for one auto-miner production cycle (6 x 500ms = 3s). */
export const AUTO_MINER_PRODUCE_TICKS = 6;

/** Max items carried per trip. */
export const DRONE_CAPACITY = 5;

/** Number of parking columns laid out on top of the 2x2 hub footprint. */
export const DRONE_DOCK_COLUMNS = 2;

/**
 * Small per-drone delivery offsets applied to construction-site/building dropoffs.
 * Multiple drones delivering to the same target land at slightly different tiles.
 */
export const DELIVERY_OFFSETS: readonly { dx: number; dy: number }[] = [
	{ dx: 0, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: 1, dy: 0 },
	{ dx: 1, dy: 1 },
];

/**
 * Chebyshev radius (tiles) within which drones repel each other.
 * Matches DRONE_SPEED_TILES_PER_TICK so a fast drone always sees its
 * nearest neighbour before crossing.
 */
export const DRONE_SEPARATION_RADIUS = 2;

/** Maximum tiles of separation nudge applied per tick (< 1 so velocity is never reversed). */
export const DRONE_SEPARATION_STRENGTH = 0.8;

/** Score bonus when a task matches the drone's preferred role. */
export const DRONE_ROLE_BONUS = 30;

/** Score bonus for a node already reserved by the same drone. */
export const DRONE_STICKY_BONUS = 15;

/** Maximum urgency bonus for hub_restock candidates. */
export const DRONE_URGENCY_BONUS_MAX = 20;

/** Maximum demand bonus for construction_supply / hub_dispatch candidates. */
export const DRONE_DEMAND_BONUS_MAX = 20;

/** Per-already-assigned-drone spread penalty for construction_supply / hub_dispatch. */
export const DRONE_SPREAD_PENALTY_PER_DRONE = 5;

/** Base priority scores for drone task types. */
export const DRONE_TASK_BASE_SCORE: Record<DroneTaskType, number> = {
	construction_supply: 1000,
	hub_dispatch: 500,
	workbench_delivery: 300,
	building_supply: 200,
	hub_restock: 100,
};
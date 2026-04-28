import type { DroneTaskType } from "../../../store/types";

/**
 * Base priority scores for drone task types.
 * The gap between task types must exceed max map distance so high-priority
 * tasks still win even when farther away.
 */
export const DRONE_TASK_BASE_SCORE: Record<DroneTaskType, number> = {
  construction_supply: 1000,
  hub_dispatch: 500,
  workbench_delivery: 300,
  building_supply: 200,
  hub_restock: 100,
};

/** Score bonus when a task matches the drone's preferred role. */
export const DRONE_ROLE_BONUS = 30;

/** Score bonus for a node already reserved by this drone. */
export const DRONE_STICKY_BONUS = 15;

/** Maximum urgency bonus for hub_restock candidates. */
export const DRONE_URGENCY_BONUS_MAX = 20;

/** Maximum demand bonus for construction_supply / hub_dispatch candidates. */
export const DRONE_DEMAND_BONUS_MAX = 20;

/** Per-already-assigned-drone spread penalty for construction_supply / hub_dispatch. */
export const DRONE_SPREAD_PENALTY_PER_DRONE = 5;

/**
 * Logistics priority: nearby warehouses are the primary pickup source for
 * construction_supply / building_supply jobs. The hub is a fallback.
 */
export const DRONE_WAREHOUSE_PRIORITY_BONUS = 50;

/**
 * Number of closest stocking warehouses considered per (item, target) pair.
 */
export const DRONE_NEARBY_WAREHOUSE_LIMIT = 3;

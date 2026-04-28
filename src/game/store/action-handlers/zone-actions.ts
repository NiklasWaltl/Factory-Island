// ============================================================
// Production zone action handler
// ------------------------------------------------------------
// Centralizes the three production-zone mutation cases extracted
// from reducer.ts. Behaviour is byte-equivalent to the prior inline
// case bodies — no new abstractions, no logic changes.
// ============================================================

import type { GameAction } from "../actions";
import { MAX_ZONES } from "../constants/buildings";
import { makeId } from "../make-id";
import type { GameState } from "../types";
import { hasAsset, isBuildingZoneStateConsistent } from "../utils/asset-guards";

type HandledActionType = "CREATE_ZONE" | "DELETE_ZONE" | "SET_BUILDING_ZONE";

const HANDLED_ACTION_TYPES = new Set<string>([
  "CREATE_ZONE",
  "DELETE_ZONE",
  "SET_BUILDING_ZONE",
]);

export function isZoneAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

function logZoneInvariantIfInvalid(state: GameState, actionType: string): void {
  if (!import.meta.env.DEV) return;
  if (isBuildingZoneStateConsistent(state)) return;
  console.warn(`[ZoneAction:${actionType}] buildingZoneIds inkonsistent`);
}

/**
 * Handles all production-zone mutation actions. Returns the next
 * state if the action belongs to this cluster, or `null` so the
 * reducer can fall through to its remaining switch cases.
 */
export function handleZoneAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "CREATE_ZONE": {
      if (Object.keys(state.productionZones).length >= MAX_ZONES) return state;
      const zoneId = makeId();
      const idx = Object.keys(state.productionZones).length + 1;
      const name = action.name || `Zone ${idx}`;
      const nextState = {
        ...state,
        productionZones: { ...state.productionZones, [zoneId]: { id: zoneId, name } },
      };
      logZoneInvariantIfInvalid(nextState, action.type);
      return nextState;
    }

    case "DELETE_ZONE": {
      const { zoneId } = action;
      if (!state.productionZones[zoneId]) return state;
      const { [zoneId]: _, ...remainingZones } = state.productionZones;
      // Remove all building-zone assignments for this zone
      const newBuildingZoneIds: Record<string, string> = {};
      for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
        if (zid !== zoneId) newBuildingZoneIds[bid] = zid;
      }
      const nextState = {
        ...state,
        productionZones: remainingZones,
        buildingZoneIds: newBuildingZoneIds,
      };
      logZoneInvariantIfInvalid(nextState, action.type);
      return nextState;
    }

    case "SET_BUILDING_ZONE": {
      const { buildingId, zoneId } = action;
      if (!hasAsset(state, buildingId)) return state;
      if (!zoneId) {
        // Remove from zone
        const { [buildingId]: _removed, ...rest } = state.buildingZoneIds;
        const nextState = { ...state, buildingZoneIds: rest };
        logZoneInvariantIfInvalid(nextState, action.type);
        return nextState;
      }
      if (!state.productionZones[zoneId]) return state;
      const nextState = {
        ...state,
        buildingZoneIds: { ...state.buildingZoneIds, [buildingId]: zoneId },
      };
      logZoneInvariantIfInvalid(nextState, action.type);
      return nextState;
    }

    default:
      return null;
  }
}

// ============================================================
// Building-site action handler
// ------------------------------------------------------------
// Extracts the building-site related reducer cases:
// - SET_BUILDING_SOURCE
// - UPGRADE_HUB
//
// Behavior is intentionally unchanged. Reducer-local helpers are
// injected to avoid value-import cycles.
// ============================================================

import { HUB_UPGRADE_COST } from "../constants/hub/hub-upgrade-cost";
import { COLLECTABLE_KEYS } from "../constants/resources";
import { hasResourcesInPhysicalStorage } from "../../buildings/warehouse/warehouse-storage";
import {
  hasAsset,
  hasWarehouseAssetWithInventory,
  isBuildingSourceStateConsistent,
  isBuildingZoneStateConsistent,
  isConstructionSiteStateConsistent,
} from "../utils/asset-guards";
import { withErrorNotification } from "../utils/notification-utils";
import type { GameAction } from "../reducer";
import type {
  CollectableItemType,
  GameNotification,
  GameState,
  Inventory,
} from "../types";

type HandledActionType = "SET_BUILDING_SOURCE" | "UPGRADE_HUB";

const HANDLED_ACTION_TYPES = new Set<string>([
  "SET_BUILDING_SOURCE",
  "UPGRADE_HUB",
]);

export function isBuildingSiteAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

export interface BuildingSiteActionDeps {
  isUnderConstruction(state: Pick<GameState, "constructionSites">, assetId: string): boolean;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  fullCostAsRemaining(
    costs: Partial<Record<keyof Inventory, number>>,
  ): Partial<Record<CollectableItemType, number>>;
  debugLog: {
    building(message: string): void;
  };
}

export function handleBuildingSiteAction(
  state: GameState,
  action: GameAction,
  deps: BuildingSiteActionDeps,
): GameState | null {
  switch (action.type) {
    case "SET_BUILDING_SOURCE": {
      const { buildingId, warehouseId } = action;
      if (!hasAsset(state, buildingId)) return state;
      if (!warehouseId) {
        // Reset to global: remove the mapping entry
        const { [buildingId]: _removed, ...rest } = state.buildingSourceWarehouseIds;
        const nextState = { ...state, buildingSourceWarehouseIds: rest };
        if (import.meta.env.DEV && !isBuildingSourceStateConsistent(nextState)) {
          deps.debugLog.building(`[Invariant] buildingSourceWarehouseIds inkonsistent nach Reset für ${buildingId}`);
        }
        return nextState;
      }
      if (!hasWarehouseAssetWithInventory(state, warehouseId)) return state;
      const nextState = {
        ...state,
        buildingSourceWarehouseIds: { ...state.buildingSourceWarehouseIds, [buildingId]: warehouseId },
      };
      if (import.meta.env.DEV && !isBuildingSourceStateConsistent(nextState)) {
        deps.debugLog.building(`[Invariant] buildingSourceWarehouseIds inkonsistent nach Setzen für ${buildingId}`);
      }
      return nextState;
    }

    case "UPGRADE_HUB": {
      if (deps.isUnderConstruction(state, action.hubId)) {
        return withErrorNotification(state, deps.addErrorNotification, "Hub ist noch im Bau.");
      }
      const hub = state.serviceHubs[action.hubId];
      if (!hub || hub.tier !== 1) return state;
      if (hub.pendingUpgrade) {
        // Upgrade already in flight — drones are currently delivering.
        return state;
      }
      // Affordance check: cost must exist somewhere in physical storage.
      // We do NOT deduct here — drones deliver the resources to the hub first.
      if (!hasResourcesInPhysicalStorage(state, HUB_UPGRADE_COST as Partial<Record<keyof Inventory, number>>)) {
        return withErrorNotification(state, deps.addErrorNotification, "Nicht genug Ressourcen für das Upgrade!");
      }
      const pending: Partial<Record<CollectableItemType, number>> = {};
      for (const [k, v] of Object.entries(HUB_UPGRADE_COST)) {
        const amt = v ?? 0;
        if (amt > 0 && COLLECTABLE_KEYS.has(k)) {
          pending[k as CollectableItemType] = amt;
        }
      }

      const upgradeDemand = deps.fullCostAsRemaining(HUB_UPGRADE_COST);
      const withPending: GameState = {
        ...state,
        serviceHubs: {
          ...state.serviceHubs,
          [action.hubId]: { ...hub, pendingUpgrade: pending },
        },
        constructionSites: {
          ...state.constructionSites,
          [action.hubId]: { buildingType: "service_hub", remaining: upgradeDemand },
        },
      };

      if (import.meta.env.DEV) {
        deps.debugLog.building(
          `[HubUpgrade] Started for ${action.hubId}: construction demand created, no immediate stock deduction`,
        );
        if (!isConstructionSiteStateConsistent(withPending)) {
          deps.debugLog.building(`[Invariant] constructionSites inkonsistent nach Hub-Upgrade für ${action.hubId}`);
        }
        if (!isBuildingZoneStateConsistent(withPending)) {
          deps.debugLog.building(`[Invariant] buildingZoneIds inkonsistent nach Hub-Upgrade für ${action.hubId}`);
        }
        if (!isBuildingSourceStateConsistent(withPending)) {
          deps.debugLog.building(`[Invariant] buildingSourceWarehouseIds inkonsistent nach Hub-Upgrade für ${action.hubId}`);
        }
      }

      return withPending;
    }

    default:
      return null;
  }
}

import type {
  CollectableItemType,
  GameState,
  ServiceHubInventory,
  StarterDroneState,
} from "../../store/types";
import type { TickOneDroneDebugLog } from "../utils/drone-utils";

export interface DronePreflightDeps {
  createEmptyHubInventory: () => ServiceHubInventory;
  createDefaultProtoHubTargetStock: () => Record<CollectableItemType, number>;
  debugLog: TickOneDroneDebugLog;
}

export function runIdleHubSelfHeal(
  state: GameState,
  drone: StarterDroneState,
  deps: DronePreflightDeps,
): GameState {
  if (!drone.hubId) return state;
  if (state.serviceHubs[drone.hubId]) return state;
  if (state.assets[drone.hubId]?.type !== "service_hub") return state;

  deps.debugLog.inventory(`[Drone] Self-healed missing hub entry for ${drone.hubId}`);
  return {
    ...state,
    serviceHubs: {
      ...state.serviceHubs,
      [drone.hubId]: {
        inventory: deps.createEmptyHubInventory(),
        targetStock: deps.createDefaultProtoHubTargetStock(),
        tier: 1,
        droneIds: [drone.droneId],
      },
    },
  };
}

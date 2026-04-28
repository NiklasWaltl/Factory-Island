import type {
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { TickOneDroneDebugLog } from "../utils/drone-utils";
import { createEmptyHubInventory } from "../../buildings/service-hub/hub-upgrade-workflow";
import { createDefaultProtoHubTargetStock } from "../../store/constants/hub/hub-target-stock";

export interface DronePreflightDeps {
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
        inventory: createEmptyHubInventory(),
        targetStock: createDefaultProtoHubTargetStock(),
        tier: 1,
        droneIds: [drone.droneId],
      },
    },
  };
}

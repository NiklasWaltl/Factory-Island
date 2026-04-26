import { finalizeHubTier2Upgrade, createEmptyHubInventory } from "../../../buildings/service-hub/hub-upgrade-workflow";
import { createDefaultProtoHubTargetStock } from "../../../store/constants/hub/hub-target-stock";
import { isHubUpgradeDeliverySatisfied } from "../../../buildings/service-hub/hub-upgrade-status";
import { computeConnectedAssetIds } from "../../../logistics/connectivity";
import { getBuildingInputConfig } from "../../../store/constants/buildings";
import { getMaxDrones } from "../../../store/hub-tier-selectors";
import { addResources } from "../../../store/inventory-ops";
import { syncDrones, applyDroneUpdate } from "../../drone-state-helpers";
import { parseWorkbenchTaskNodeId } from "../../../store/workbench-task-utils";
import {
  finalizeWorkbenchDelivery,
  finalizeWorkbenchInputDelivery,
} from "../workbench-finalizer-bindings";
import type {
  ConstructionSite,
  DroneCargoItem,
  GameState,
  ServiceHubInventory,
  StarterDroneState,
} from "../../../store/types";
import { getDroneDockOffset } from "../../drone-dock-geometry";
import { decideDepositingTaskRoute } from "../../utils/drone-utils";
import type { WorkbenchInputTask } from "../workbench-finalizers";
import type { DroneFinalizationDeps } from "./types";

export function handleDepositingStatus(
  state: GameState,
  droneId: string,
  drone: StarterDroneState,
  deps: DroneFinalizationDeps,
): GameState {
  const { makeId, addNotification, debugLog } = deps;

  const rem = drone.ticksRemaining - 1;
  if (rem > 0) return applyDroneUpdate(state, droneId, { ...drone, ticksRemaining: rem });

  const idleDrone: StarterDroneState = {
    ...drone,
    status: "idle",
    targetNodeId: null,
    cargo: null,
    ticksRemaining: 0,
    currentTaskType: null,
    deliveryTargetId: null,
    craftingJobId: null,
  };
  const workbenchTask = parseWorkbenchTaskNodeId(drone.targetNodeId);
  const depositingTaskRoute = decideDepositingTaskRoute({
    currentTaskType: drone.currentTaskType,
    workbenchTaskKind: workbenchTask?.kind,
    hasCargo: !!drone.cargo,
    deliveryTargetId: drone.deliveryTargetId,
  });
  if (depositingTaskRoute.kind === "workbench_input") {
    return finalizeWorkbenchInputDelivery(
      state,
      droneId,
      workbenchTask as WorkbenchInputTask,
      idleDrone,
    );
  }
  if (depositingTaskRoute.kind === "workbench_output") {
    return finalizeWorkbenchDelivery(state, droneId, drone.craftingJobId, idleDrone);
  }
  if (depositingTaskRoute.kind === "no_cargo") {
    return applyDroneUpdate(state, droneId, {
      ...drone,
      status: "idle",
      ticksRemaining: 0,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
    });
  }

  const { itemType, amount } = drone.cargo as DroneCargoItem;

  // Route by task type
  if (depositingTaskRoute.kind === "building_supply_target") {
    const deliveryId = depositingTaskRoute.targetId;
    const targetAsset = state.assets[deliveryId];
    const cfg = targetAsset ? getBuildingInputConfig(targetAsset.type) : null;
    if (targetAsset && cfg && cfg.resource === itemType && targetAsset.type === "generator") {
      const gen = state.generators[deliveryId];
      if (gen) {
        const space = Math.max(0, cfg.capacity - gen.fuel);
        const applied = Math.min(amount, space);
        const leftover = amount - applied;
        const nextRequested = Math.max(0, (gen.requestedRefill ?? 0) - applied);
        const newGenerators = { ...state.generators, [deliveryId]: { ...gen, fuel: gen.fuel + applied, requestedRefill: nextRequested } };
        const newInv = leftover > 0 ? addResources(state.inventory, { [itemType]: leftover }) : state.inventory;
        debugLog.inventory(
          `Drone deposited ${applied}× ${itemType} into generator ${deliveryId} (fuel ${gen.fuel} → ${gen.fuel + applied}/${cfg.capacity})` +
            (leftover > 0 ? ` (${leftover} overflow → global)` : ""),
        );
        return applyDroneUpdate(
          { ...state, generators: newGenerators, inventory: newInv },
          droneId,
          idleDrone,
        );
      }
    }
    // Building gone or no input slot - fall back to global pool
    debugLog.inventory(`[Drone] building_supply target ${deliveryId} gone or invalid; depositing ${amount}× ${itemType} → global`);
    return applyDroneUpdate(
      { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
      droneId,
      idleDrone,
    );
  }

  if (depositingTaskRoute.kind === "construction_supply_target") {
    const deliveryId = depositingTaskRoute.targetId;
    const site = state.constructionSites[deliveryId];
    if (site) {
      const needed = site.remaining[itemType] ?? 0;
      const applied = Math.min(amount, needed);
      const leftover = amount - applied;
      const newRemaining = { ...site.remaining };
      const newNeeded = needed - applied;
      if (newNeeded <= 0) {
        delete newRemaining[itemType];
      } else {
        newRemaining[itemType] = newNeeded;
      }
      // Check if construction is complete
      const isComplete = Object.values(newRemaining).every((value) => (value ?? 0) <= 0);
      const isHubUpgradeSite =
        site.buildingType === "service_hub" &&
        !!state.serviceHubs[deliveryId]?.pendingUpgrade;
      let newSites: Record<string, ConstructionSite>;
      if (isComplete) {
        const { [deliveryId]: _, ...rest } = state.constructionSites;
        newSites = rest;
        debugLog.building(`[Drone] Construction site ${deliveryId} completed`);
      } else {
        newSites = { ...state.constructionSites, [deliveryId]: { ...site, remaining: newRemaining } };
      }
      // Any leftover goes to global inventory
      const newInv = leftover > 0 ? addResources(state.inventory, { [itemType]: leftover }) : state.inventory;
      debugLog.inventory(`Drone deposited ${applied}× ${itemType} into construction site ${deliveryId}` + (leftover > 0 ? ` (${leftover} overflow → global)` : ""));
      if (import.meta.env.DEV && isHubUpgradeSite) {
        const remainingAfter = newRemaining[itemType] ?? 0;
        debugLog.building(
          `[HubUpgrade] Delivery applied to ${deliveryId}: ${applied}× ${itemType}, remaining ${itemType}=${remainingAfter}`,
        );
      }
      let completionState = applyDroneUpdate(
        { ...state, constructionSites: newSites, inventory: newInv },
        droneId,
        idleDrone,
      );
      // Recompute energy grid when a construction finishes (cables/poles/generators may now conduct)
      if (isComplete) {
        completionState = { ...completionState, connectedAssetIds: computeConnectedAssetIds(completionState) };
        const completedAsset = completionState.assets[deliveryId];
        if (completedAsset?.type === "service_hub") {
          const hubEntry = completionState.serviceHubs[deliveryId];
          if (hubEntry?.pendingUpgrade) {
            if (import.meta.env.DEV) {
              debugLog.building(
                `[HubUpgrade] Upgrade demand for ${deliveryId} fully delivered via construction flow — finalizing tier upgrade.`,
              );
            }
            completionState = finalizeHubTier2Upgrade(
              completionState,
              deliveryId,
              {
                makeId,
                getDroneDockOffset,
                addNotification,
                syncDrones,
              },
              {
                deductPendingFromHubInventory: false,
              },
            );
          } else if (hubEntry && hubEntry.droneIds.length < getMaxDrones(hubEntry.tier)) {
            // New Proto-Hub construction: spawn its first drone after completion.
            const newDroneId = `drone-${makeId()}`;
            const dockSlot = hubEntry.droneIds.length;
            const offset = getDroneDockOffset(dockSlot);
            const spawnedDrone: StarterDroneState = {
              status: "idle",
              tileX: completedAsset.x + offset.dx,
              tileY: completedAsset.y + offset.dy,
              targetNodeId: null,
              cargo: null,
              ticksRemaining: 0,
              hubId: deliveryId,
              currentTaskType: null,
              deliveryTargetId: null,
              craftingJobId: null,
              droneId: newDroneId,
            };
            completionState = {
              ...completionState,
              drones: { ...completionState.drones, [newDroneId]: spawnedDrone },
              serviceHubs: {
                ...completionState.serviceHubs,
                [deliveryId]: { ...hubEntry, droneIds: [...hubEntry.droneIds, newDroneId] },
              },
            };
            debugLog.building(`[Drone] Drohne ${newDroneId} für neuen Hub ${deliveryId} gespawnt nach Bauabschluss.`);
          }
        }
      }
      return completionState;
    }
    // Site gone - deposit to global
    debugLog.inventory(`Drone construction target gone, depositing ${amount}× ${itemType} into global inventory`);
    return applyDroneUpdate(
      { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
      droneId,
      idleDrone,
    );
  }

  // hub_restock: deposit into hub inventory when assigned
  let hubEntry = drone.hubId ? state.serviceHubs[drone.hubId] ?? null : null;
  let depositState = state;
  // Self-heal: hub asset exists but serviceHubs entry is missing
  if (!hubEntry && drone.hubId && state.assets[drone.hubId]?.type === "service_hub") {
    debugLog.inventory(`[Drone] Hub entry missing for ${drone.hubId} during deposit — self-healing`);
    hubEntry = {
      inventory: createEmptyHubInventory(),
      targetStock: createDefaultProtoHubTargetStock(),
      tier: 1,
      droneIds: [drone.droneId],
    };
    depositState = {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [drone.hubId]: hubEntry,
      },
    };
  }
  if (hubEntry && drone.hubId) {
    const updatedHubInv: ServiceHubInventory = {
      ...hubEntry.inventory,
      [itemType]: (hubEntry.inventory[itemType] ?? 0) + amount,
    };
    debugLog.inventory(`Drone deposited ${amount}× ${itemType} into Service-Hub`);
    const afterDeposit: GameState = {
      ...depositState,
      serviceHubs: {
        ...depositState.serviceHubs,
        [drone.hubId]: { ...hubEntry, inventory: updatedHubInv },
      },
    };
    // Finalize a pending tier-2 upgrade once the hub holds the full cost.
    const updatedHubEntry = afterDeposit.serviceHubs[drone.hubId];
    const finalized = isHubUpgradeDeliverySatisfied(updatedHubEntry)
      ? finalizeHubTier2Upgrade(afterDeposit, drone.hubId, {
          makeId,
          getDroneDockOffset,
          addNotification,
          syncDrones,
        })
      : afterDeposit;
    return applyDroneUpdate(finalized, droneId, idleDrone);
  }

  // Fallback: global inventory
  debugLog.inventory(`Drone deposited ${amount}× ${itemType} into Startmodul`);
  // DEV: warn if a workbench job could be waiting on these resources
  if (import.meta.env.DEV) {
    const waitingJob = (state.crafting?.jobs ?? []).find(
      (job) =>
        (job.status === "queued" || job.status === "reserved") &&
        job.ingredients.some((ingredient) => ingredient.itemId === itemType),
    );
    if (waitingJob) {
      debugLog.inventory(
        `[Drone] Drohne ${drone.droneId}: delivering ${amount}× ${itemType} for Job ${waitingJob.id} (${waitingJob.status}) → global pool`,
      );
    }
  }
  return applyDroneUpdate(
    { ...state, inventory: addResources(state.inventory, { [itemType]: amount }) },
    droneId,
    idleDrone,
  );
}

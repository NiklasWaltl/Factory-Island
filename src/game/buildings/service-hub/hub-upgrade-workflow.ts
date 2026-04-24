import { debugLog } from "../../debug/debugLogger";
import { SERVICE_HUB_TARGET_STOCK } from "../../store/constants/hub/hub-target-stock";
import { getMaxDrones } from "../../store/hub-tier-selectors";
import type {
  CollectableItemType,
  GameNotification,
  GameState,
  ServiceHubEntry,
  ServiceHubInventory,
} from "../../store/types";

export interface FinalizeHubTier2UpgradeDeps {
  makeId: () => string;
  getDroneDockOffset: (slotIndex: number) => { dx: number; dy: number };
  addNotification: (notifications: GameNotification[], resource: string, amount: number) => GameNotification[];
  syncDrones: (state: GameState) => GameState;
}

/** Create a zero-initialized hub inventory. */
export function createEmptyHubInventory(): ServiceHubInventory {
  return { wood: 0, stone: 0, iron: 0, copper: 0 };
}

/**
 * Finalize a pending tier-2 upgrade: deduct the pending cost from the hub's
 * own inventory (NOT from warehouses - drones have already brought the stock
 * to the hub), bump the tier, expand target stock, and spawn drone slots.
 *
 * Caller must ensure upgrade delivery is satisfied.
 */
export function finalizeHubTier2Upgrade(
  state: GameState,
  hubId: string,
  deps: FinalizeHubTier2UpgradeDeps,
  options?: { deductPendingFromHubInventory?: boolean },
): GameState {
  const hub = state.serviceHubs[hubId];
  if (!hub || !hub.pendingUpgrade) return state;
  const shouldDeduct = options?.deductPendingFromHubInventory ?? true;

  let upgradedInventory: ServiceHubInventory = { ...hub.inventory };
  if (shouldDeduct) {
    for (const [k, v] of Object.entries(hub.pendingUpgrade)) {
      const needed = v ?? 0;
      if (needed <= 0) continue;
      const key = k as CollectableItemType;
      upgradedInventory[key] = Math.max(0, (upgradedInventory[key] ?? 0) - needed);
    }
  }

  const expandedStock: Record<CollectableItemType, number> = {
    wood: Math.max(hub.targetStock.wood, SERVICE_HUB_TARGET_STOCK.wood),
    stone: Math.max(hub.targetStock.stone, SERVICE_HUB_TARGET_STOCK.stone),
    iron: Math.max(hub.targetStock.iron, SERVICE_HUB_TARGET_STOCK.iron),
    copper: Math.max(hub.targetStock.copper, SERVICE_HUB_TARGET_STOCK.copper),
  };

  const maxDrones = getMaxDrones(2);
  const newDrones = { ...state.drones };
  const hubDroneIds = [...hub.droneIds];
  const hubAsset = state.assets[hubId];
  while (hubDroneIds.length < maxDrones && hubAsset) {
    const newDroneId = `drone-${deps.makeId()}`;
    const dockSlot = hubDroneIds.length;
    const offset = deps.getDroneDockOffset(dockSlot);
    newDrones[newDroneId] = {
      status: "idle",
      tileX: hubAsset.x + offset.dx,
      tileY: hubAsset.y + offset.dy,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId: newDroneId,
    };
    hubDroneIds.push(newDroneId);
  }

  const upgradedHub: ServiceHubEntry = {
    ...hub,
    tier: 2,
    targetStock: expandedStock,
    droneIds: hubDroneIds,
    inventory: upgradedInventory,
    pendingUpgrade: undefined,
  };

  if (import.meta.env.DEV) {
    debugLog.building(
      `[HubUpgrade] Hub ${hubId} finalized to Tier 2 (${shouldDeduct ? "deducted pending from hub inventory" : "construction delivery already consumed source stock"})`,
    );
  }

  return deps.syncDrones({
    ...state,
    serviceHubs: { ...state.serviceHubs, [hubId]: upgradedHub },
    drones: newDrones,
    notifications: deps.addNotification(state.notifications, "hub_upgrade", 1),
  });
}
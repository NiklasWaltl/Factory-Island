import type { CollectableItemType, ServiceHubEntry } from "../../store/types";

/**
 * True when the hub's own inventory already covers every resource still
 * outstanding in `pendingUpgrade`. Used to finalize a pending tier-2 upgrade
 * once drones have delivered the last of the required materials.
 */
export function isHubUpgradeDeliverySatisfied(
  hub: ServiceHubEntry | undefined | null,
): boolean {
  if (!hub || !hub.pendingUpgrade) return false;
  for (const [k, v] of Object.entries(hub.pendingUpgrade)) {
    const needed = v ?? 0;
    if (needed <= 0) continue;
    const have = hub.inventory[k as CollectableItemType] ?? 0;
    if (have < needed) return false;
  }
  return true;
}

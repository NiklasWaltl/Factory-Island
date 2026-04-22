// ============================================================
// Hub tier selectors
// ------------------------------------------------------------
// Pure mapping helpers for tier-based hub values.
// ============================================================

import {
  TIER1_ACTIVE_RESOURCES,
  TIER2_ACTIVE_RESOURCES,
} from "./constants/hub/hub-active-resources";
import {
  HUB_MAX_DRONES_TIER1,
  HUB_MAX_DRONES_TIER2,
} from "./constants/hub/hub-max-drones";
import {
  HUB_RANGE_TIER1,
  HUB_RANGE_TIER2,
} from "./constants/hub/hub-range";
import {
  MAX_HUB_TARGET_STOCK,
  PROTO_HUB_MAX_TARGET_STOCK,
} from "./constants/hub/hub-target-stock-max";
import type {
  CollectableItemType,
  HubTier,
} from "./types";

function selectByHubTier<T>(tier: HubTier, tier1Value: T, tier2Value: T): T {
  return tier === 1 ? tier1Value : tier2Value;
}

export function getHubRange(tier: HubTier): number {
  return selectByHubTier(tier, HUB_RANGE_TIER1, HUB_RANGE_TIER2);
}

export function getActiveResources(tier: HubTier): readonly CollectableItemType[] {
  return selectByHubTier(tier, TIER1_ACTIVE_RESOURCES, TIER2_ACTIVE_RESOURCES);
}

export function getMaxDrones(tier: HubTier): number {
  return selectByHubTier(tier, HUB_MAX_DRONES_TIER1, HUB_MAX_DRONES_TIER2);
}

export function getMaxTargetStockForTier(tier: HubTier): number {
  return selectByHubTier(tier, PROTO_HUB_MAX_TARGET_STOCK, MAX_HUB_TARGET_STOCK);
}

export function getHubTierLabel(tier: HubTier): string {
  return selectByHubTier(tier, "Proto-Hub", "Service-Hub");
}
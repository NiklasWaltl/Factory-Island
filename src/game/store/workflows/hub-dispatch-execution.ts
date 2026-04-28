// ============================================================
// Hub dispatch execution workflow decisions
// ------------------------------------------------------------
// Pure decision layer for hub_dispatch execution at hub pickup.
// Reducer remains responsible for applying emitted actions.
// ============================================================

import { DRONE_CAPACITY } from "../constants/drone-config";
import type { CollectableItemType } from "../types";

export interface DecideHubDispatchExecutionInput {
  hubId: string;
  itemType: CollectableItemType;
  availableInHub: number | null;
  remainingNeed: number;
}

export type HubDispatchExecutionAction =
  | {
      type: "abort_hub_dispatch";
      reason: "hub_missing" | "hub_empty" | "no_remaining_need";
    }
  | {
      type: "start_hub_dispatch_delivery";
      hubId: string;
      itemType: CollectableItemType;
      pickupAmount: number;
      nextTaskType: "construction_supply";
    };

export function decideHubDispatchExecutionAction(
  input: DecideHubDispatchExecutionInput,
): HubDispatchExecutionAction {
  if (input.availableInHub == null) {
    return { type: "abort_hub_dispatch", reason: "hub_missing" };
  }

  if (input.availableInHub <= 0) {
    return { type: "abort_hub_dispatch", reason: "hub_empty" };
  }

  if (input.remainingNeed <= 0) {
    return { type: "abort_hub_dispatch", reason: "no_remaining_need" };
  }

  const pickupAmount = Math.min(
    DRONE_CAPACITY,
    input.availableInHub,
    input.remainingNeed,
  );

  if (pickupAmount <= 0) {
    return { type: "abort_hub_dispatch", reason: "no_remaining_need" };
  }

  return {
    type: "start_hub_dispatch_delivery",
    hubId: input.hubId,
    itemType: input.itemType,
    pickupAmount,
    nextTaskType: "construction_supply",
  };
}

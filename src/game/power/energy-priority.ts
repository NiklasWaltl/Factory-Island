// ============================================================
// Energy priority slice
// ------------------------------------------------------------
// Isolates machine-priority ordering for ENERGY_NET_TICK.
// ============================================================

import {
  DEFAULT_MACHINE_PRIORITY,
  ENERGY_ALLOCATION_RANK,
} from "../store/constants/energy/energy-balance";
import type {
  AssetType,
  MachinePriority,
  PlacedAsset,
} from "../store/state";

type EnergyConsumerWithDrain = {
  asset: PlacedAsset;
  index: number;
  drain: number;
};

type PrioritizedEnergyConsumer = EnergyConsumerWithDrain & {
  priority: MachinePriority;
  allocationRank: number;
};

function clampMachinePriority(priority: number | undefined): MachinePriority {
  const raw = Number.isFinite(priority)
    ? Math.round(priority as number)
    : DEFAULT_MACHINE_PRIORITY;
  const clamped = Math.max(1, Math.min(5, raw));
  return clamped as MachinePriority;
}

function getEnergyAllocationRank(type: AssetType): number {
  return ENERGY_ALLOCATION_RANK[type] ?? 4;
}

export function computeEnergyAllocationOrder(
  consumers: readonly EnergyConsumerWithDrain[],
): PrioritizedEnergyConsumer[] {
  return consumers
    .map((consumer) => ({
      ...consumer,
      priority: clampMachinePriority(consumer.asset.priority),
      allocationRank: getEnergyAllocationRank(consumer.asset.type),
    }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.allocationRank - b.allocationRank ||
        a.index - b.index,
    );
}

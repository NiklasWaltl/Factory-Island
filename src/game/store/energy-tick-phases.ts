// ============================================================
// ENERGY_NET_TICK pure phase helpers
// ------------------------------------------------------------
// Keeps phase-1 (snapshot/planning) and phase-2 (allocation)
// outside reducer.ts while preserving behavior.
// ============================================================

import { getEnergyProductionPerPeriod } from "../power/energy-production";
import {
  AUTO_ASSEMBLER_IDLE_DRAIN_PER_PERIOD,
  AUTO_ASSEMBLER_PROCESSING_DRAIN_PER_PERIOD,
} from "./constants/energy/energy-assembler";
import {
  AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD,
  AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD,
} from "./constants/energy/energy-smelter";
import {
  DEFAULT_MACHINE_PRIORITY,
  ENERGY_ALLOCATION_RANK,
  ENERGY_DRAIN,
} from "./constants/energy/energy-balance";
import {
  AUTO_MINER_BOOST_MULTIPLIER,
  AUTO_SMELTER_BOOST_MULTIPLIER,
} from "./constants/boost-multipliers";
import type {
  AssetType,
  GameState,
  MachinePriority,
  PlacedAsset,
} from "./types";

export interface EnergyTickPrioritizedConsumer {
  asset: PlacedAsset;
  index: number;
  priority: number;
  allocationRank: number;
  drain: number;
}

export interface EnergyTickPhase1Result {
  prioritizedConsumers: EnergyTickPrioritizedConsumer[];
  batteryConnected: boolean;
  initialAvailableEnergy: number;
}

export interface EnergyTickAllocationResult {
  remainingEnergy: number;
  poweredMachineIds: string[];
  machinePowerRatio: Record<string, number>;
}

export interface EnergyTickChangeCheckInput {
  previousBatteryStored: number;
  nextBatteryStored: number;
  previousPoweredMachineIds?: string[];
  nextPoweredMachineIds: string[];
  previousMachinePowerRatio?: Record<string, number>;
  nextMachinePowerRatio: Record<string, number>;
}

function isEnergyConsumerType(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
}

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

function getBoostMultiplier(asset: Pick<PlacedAsset, "type" | "boosted">): number {
  if (!asset.boosted) return 1;
  if (asset.type === "auto_miner") return AUTO_MINER_BOOST_MULTIPLIER;
  if (asset.type === "auto_smelter") return AUTO_SMELTER_BOOST_MULTIPLIER;
  return 1;
}

export function buildEnergyTickPhase1Snapshot(
  state: Pick<
    GameState,
    | "assets"
    | "connectedAssetIds"
    | "generators"
    | "autoSmelters"
    | "autoAssemblers"
    | "constructionSites"
    | "battery"
  >,
): EnergyTickPhase1Result {
  const production = getEnergyProductionPerPeriod(state);
  const connectedConsumers = state.connectedAssetIds
    .map((id) => state.assets[id])
    .filter((a): a is PlacedAsset => !!a && isEnergyConsumerType(a.type));

  const prioritizedConsumers = connectedConsumers
    .map((asset, index) => ({
      asset,
      index,
      priority: clampMachinePriority(asset.priority),
      allocationRank: getEnergyAllocationRank(asset.type),
      drain:
        (asset.type === "auto_smelter"
          ? state.autoSmelters?.[asset.id]?.processing
            ? AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD
            : AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD
          : asset.type === "auto_assembler"
            ? state.autoAssemblers?.[asset.id]?.processing
              ? AUTO_ASSEMBLER_PROCESSING_DRAIN_PER_PERIOD
              : AUTO_ASSEMBLER_IDLE_DRAIN_PER_PERIOD
            : ENERGY_DRAIN[asset.type]) * getBoostMultiplier(asset),
    }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.allocationRank - b.allocationRank ||
        a.index - b.index,
    );

  const batteryAsset = Object.values(state.assets).find((a) => a.type === "battery");
  const batteryConnected = batteryAsset
    ? state.connectedAssetIds.includes(batteryAsset.id) &&
      !state.constructionSites[batteryAsset.id]
    : false;

  return {
    prioritizedConsumers,
    batteryConnected,
    initialAvailableEnergy:
      production + (batteryConnected ? state.battery.stored : 0),
  };
}

export function allocateEnergyByPriority(
  initialAvailableEnergy: number,
  prioritizedConsumers: Array<{
    asset: Pick<PlacedAsset, "id">;
    drain: number;
  }>,
): EnergyTickAllocationResult {
  let remainingEnergy = initialAvailableEnergy;
  const poweredMachineIds: string[] = [];
  const machinePowerRatio: Record<string, number> = {};

  for (const consumer of prioritizedConsumers) {
    if (consumer.drain <= 0) {
      machinePowerRatio[consumer.asset.id] = 1;
      poweredMachineIds.push(consumer.asset.id);
      continue;
    }
    if (remainingEnergy <= 0) {
      machinePowerRatio[consumer.asset.id] = 0;
      continue;
    }
    const ratio = Math.max(0, Math.min(1, remainingEnergy / consumer.drain));
    machinePowerRatio[consumer.asset.id] = ratio;
    remainingEnergy -= consumer.drain * ratio;
    if (ratio >= 1) poweredMachineIds.push(consumer.asset.id);
  }

  return {
    remainingEnergy,
    poweredMachineIds,
    machinePowerRatio,
  };
}

export function hasEnergyTickChanges(input: EnergyTickChangeCheckInput): boolean {
  const prevPowered = input.previousPoweredMachineIds ?? [];
  const samePoweredSet =
    input.nextPoweredMachineIds.length === prevPowered.length &&
    input.nextPoweredMachineIds.every((id, idx) => prevPowered[idx] === id);

  const samePowerRatio =
    Object.keys(input.nextMachinePowerRatio).length ===
      Object.keys(input.previousMachinePowerRatio ?? {}).length &&
    Object.entries(input.nextMachinePowerRatio).every(([id, ratio]) =>
      Math.abs((input.previousMachinePowerRatio?.[id] ?? 0) - ratio) < 0.0001,
    );

  return !(
    input.nextBatteryStored === input.previousBatteryStored &&
    samePoweredSet &&
    samePowerRatio
  );
}

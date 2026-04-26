// Pure machine-priority / consumer-type helpers. Extracted from
// reducer.ts so handler modules (e.g. action-handlers/machine-config.ts)
// can value-import them directly without creating an ESM cycle through
// `../reducer`.

import type { AssetType, MachinePriority, PlacedAsset } from "./types";
import { DEFAULT_MACHINE_PRIORITY, ENERGY_DRAIN } from "./constants/energy/energy-balance";

export function clampMachinePriority(priority: number | undefined): MachinePriority {
  const raw = Number.isFinite(priority) ? Math.round(priority as number) : DEFAULT_MACHINE_PRIORITY;
  const clamped = Math.max(1, Math.min(5, raw));
  return clamped as MachinePriority;
}

export function isEnergyConsumerType(type: AssetType): boolean {
  return ENERGY_DRAIN[type] != null;
}

export function isBoostSupportedType(type: AssetType): boolean {
  return type === "auto_miner" || type === "auto_smelter";
}

export function withDefaultMachinePriority(type: AssetType): Pick<PlacedAsset, "priority"> | Record<never, never> {
  if (!isEnergyConsumerType(type)) return {};
  return { priority: DEFAULT_MACHINE_PRIORITY };
}

export const AUTO_MINER_BOOST_MULTIPLIER = 2;
export const AUTO_SMELTER_BOOST_MULTIPLIER = 2;

export function getBoostMultiplier(asset: Pick<PlacedAsset, "type" | "boosted">): number {
  if (!asset.boosted) return 1;
  if (asset.type === "auto_miner") return AUTO_MINER_BOOST_MULTIPLIER;
  if (asset.type === "auto_smelter") return AUTO_SMELTER_BOOST_MULTIPLIER;
  return 1;
}

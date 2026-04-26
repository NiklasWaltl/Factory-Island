// Pure machine-priority / consumer-type helpers. Extracted from
// reducer.ts so handler modules (e.g. action-handlers/machine-config.ts)
// can value-import them directly without creating an ESM cycle through
// `../reducer`.

import type { AssetType, MachinePriority } from "./types";
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

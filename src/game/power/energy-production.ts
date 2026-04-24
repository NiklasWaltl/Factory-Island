// ============================================================
// Connected energy production helpers
// ------------------------------------------------------------
// Isolates per-period generator production for connected assets.
// ============================================================

import { ENERGY_NET_TICK_MS } from "../store/constants/energy/energy-smelter";
import {
  GENERATOR_ENERGY_PER_TICK,
  GENERATOR_TICK_MS,
} from "../store/constants/energy/generator";
import type { GameState } from "../store/types";

export function getEnergyProductionPerPeriod(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "generators">,
): number {
  const hasPole = state.connectedAssetIds.some(
    (id) => state.assets[id]?.type === "power_pole",
  );
  if (!hasPole) return 0;
  const ticksPerPeriod = Math.round(ENERGY_NET_TICK_MS / GENERATOR_TICK_MS);
  const runningCount = state.connectedAssetIds.filter((id) => {
    const a = state.assets[id];
    return a?.type === "generator" && state.generators[id]?.running;
  }).length;
  return runningCount * ticksPerPeriod * GENERATOR_ENERGY_PER_TICK;
}
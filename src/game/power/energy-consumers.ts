// ============================================================
// Connected energy consumer drain helpers
// ------------------------------------------------------------
// Isolates per-period demand calculation for connected assets.
// ============================================================

import {
  AUTO_ASSEMBLER_IDLE_DRAIN_PER_PERIOD,
  AUTO_ASSEMBLER_PROCESSING_DRAIN_PER_PERIOD,
} from "../store/constants/energy/energy-assembler";
import {
  AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD,
  AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD,
} from "../store/constants/energy/energy-smelter";
import { ENERGY_DRAIN } from "../store/constants/energy/energy-balance";
import {
  AUTO_MINER_BOOST_MULTIPLIER,
  AUTO_SMELTER_BOOST_MULTIPLIER,
} from "../store/constants/boost-multipliers";
import type {
  GameState,
  PlacedAsset,
} from "../store/types";

export function getConnectedConsumerDrainEntries(
  state: Pick<GameState, "assets" | "connectedAssetIds" | "autoSmelters" | "autoAssemblers">,
): Array<{ id: string; drain: number }> {
  return state.connectedAssetIds
    .map((id) => state.assets[id])
    .filter((a): a is PlacedAsset => !!a && ENERGY_DRAIN[a.type] != null)
    .map((asset) => {
      const baseDrain =
        asset.type === "auto_smelter"
          ? (state.autoSmelters?.[asset.id]?.processing
              ? AUTO_SMELTER_PROCESSING_DRAIN_PER_PERIOD
              : AUTO_SMELTER_IDLE_DRAIN_PER_PERIOD)
          : asset.type === "auto_assembler"
            ? (state.autoAssemblers?.[asset.id]?.processing
                ? AUTO_ASSEMBLER_PROCESSING_DRAIN_PER_PERIOD
                : AUTO_ASSEMBLER_IDLE_DRAIN_PER_PERIOD)
            : ENERGY_DRAIN[asset.type];
      const boostMultiplier = !asset.boosted
        ? 1
        : asset.type === "auto_miner"
          ? AUTO_MINER_BOOST_MULTIPLIER
          : asset.type === "auto_smelter"
            ? AUTO_SMELTER_BOOST_MULTIPLIER
            : 1;
      return { id: asset.id, drain: baseDrain * boostMultiplier };
    });
}
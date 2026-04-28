import type { AutoMinerEntry, PlacedAsset } from "./types";

export type AutoMinerPlacementEligibilityBlockReason =
  | "target_cell_has_no_deposit"
  | "target_cell_invalid_deposit_type"
  | "deposit_already_has_auto_miner";

export type AutoMinerPlacementEligibilityDecision =
  | { kind: "eligible" }
  | { kind: "blocked"; blockReason: AutoMinerPlacementEligibilityBlockReason };

export interface DecideAutoMinerPlacementEligibilityInput {
  x: number;
  y: number;
  cellMap: Record<string, string>;
  assets: Record<string, PlacedAsset>;
  autoMiners: Record<string, Pick<AutoMinerEntry, "depositId">>;
  depositTypes: ReadonlySet<string>;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function decideAutoMinerPlacementEligibility(
  input: DecideAutoMinerPlacementEligibilityInput,
): AutoMinerPlacementEligibilityDecision {
  const depositAssetId = input.cellMap[cellKey(input.x, input.y)];
  if (!depositAssetId) {
    return { kind: "blocked", blockReason: "target_cell_has_no_deposit" };
  }

  const depositAsset = input.assets[depositAssetId];
  if (!depositAsset || !input.depositTypes.has(depositAsset.type)) {
    return { kind: "blocked", blockReason: "target_cell_invalid_deposit_type" };
  }

  const existingMiner = Object.values(input.autoMiners).find(
    (miner) => miner.depositId === depositAssetId,
  );
  if (existingMiner) {
    return { kind: "blocked", blockReason: "deposit_already_has_auto_miner" };
  }

  return { kind: "eligible" };
}

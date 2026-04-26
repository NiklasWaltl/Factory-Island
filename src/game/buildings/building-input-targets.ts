import { getBuildingInputConfig } from "../store/constants/buildings";
import type { CollectableItemType, GameState } from "../store/types";

/** Reads the current amount in a building's input buffer. */
export function getBuildingInputCurrent(
  state: Pick<GameState, "assets" | "generators">,
  assetId: string,
): number {
  const asset = state.assets[assetId];
  if (!asset) return 0;
  if (asset.type === "generator") return state.generators[assetId]?.fuel ?? 0;
  return 0;
}

/** Lists every placed asset that owns an input buffer, paired with its accepted resource. */
export function getBuildingInputTargets(
  state: Pick<GameState, "assets">,
): { assetId: string; resource: CollectableItemType; capacity: number }[] {
  const out: { assetId: string; resource: CollectableItemType; capacity: number }[] = [];
  for (const asset of Object.values(state.assets)) {
    const cfg = getBuildingInputConfig(asset.type);
    if (!cfg) continue;
    out.push({ assetId: asset.id, resource: cfg.resource, capacity: cfg.capacity });
  }
  return out;
}

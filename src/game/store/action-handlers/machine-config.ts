import type { GameAction } from "../reducer";
import type { GameState, PlacedAsset } from "../types";
import { DEFAULT_MACHINE_PRIORITY } from "../constants/energy/energy-balance";
import {
  clampMachinePriority,
  isBoostSupportedType,
  isEnergyConsumerType,
} from "../machine-priority";

type MachineConfigTargetDecision =
  | { kind: "blocked" }
  | { kind: "eligible"; asset: PlacedAsset };

function decideMachineConfigTargetAsset(
  state: Pick<GameState, "assets">,
  assetId: string,
): MachineConfigTargetDecision {
  const asset = state.assets[assetId];
  if (!asset) return { kind: "blocked" };
  return { kind: "eligible", asset };
}

function patchMachineAsset(
  state: GameState,
  assetId: string,
  patch: Partial<PlacedAsset>,
): GameState {
  return {
    ...state,
    assets: {
      ...state.assets,
      [assetId]: {
        ...state.assets[assetId],
        ...patch,
      },
    },
  };
}

export function handleMachineConfigAction(
  state: GameState,
  action: GameAction,
): GameState | null {
  switch (action.type) {
    case "SET_MACHINE_PRIORITY": {
      const targetDecision = decideMachineConfigTargetAsset(state, action.assetId);
      if (targetDecision.kind === "blocked") return state;

      const { asset } = targetDecision;
      if (!isEnergyConsumerType(asset.type)) return state;

      const nextPriority = clampMachinePriority(action.priority);
      if ((asset.priority ?? DEFAULT_MACHINE_PRIORITY) === nextPriority) {
        return state;
      }

      return patchMachineAsset(state, action.assetId, { priority: nextPriority });
    }

    case "SET_MACHINE_BOOST": {
      const targetDecision = decideMachineConfigTargetAsset(state, action.assetId);
      if (targetDecision.kind === "blocked") return state;

      const { asset } = targetDecision;
      // Harte Einschraenkung: Overclocking-Stufe 1 ist nur fuer auto_miner und auto_smelter.
      if (!isBoostSupportedType(asset.type)) return state;

      const nextBoost = !!action.boosted;
      if ((asset.boosted ?? false) === nextBoost) return state;

      return patchMachineAsset(state, action.assetId, { boosted: nextBoost });
    }

    default:
      return null;
  }
}

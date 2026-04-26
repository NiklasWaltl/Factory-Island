import { debugLog } from "../../../../debug/debugLogger";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
} from "../../../../crafting/crafting-sources";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { MachineActionDeps } from "../deps";

type SmithyInputAction = Extract<
  GameAction,
  {
    type: "SMITHY_ADD_FUEL" | "SMITHY_ADD_IRON" | "SMITHY_ADD_COPPER";
  }
>;

export type SmithyAddAmountDecision =
  | { kind: "eligible"; amount: number }
  | { kind: "blocked"; blockReason: "no_amount" };

export function decideSmithyAddAmount(
  requestedAmount: number,
  availableAmount: number,
): SmithyAddAmountDecision {
  const amount = Math.min(requestedAmount, availableAmount);
  if (amount <= 0) {
    return { kind: "blocked", blockReason: "no_amount" };
  }

  return { kind: "eligible", amount };
}

// Re-export the runtime helper from its dedicated module so existing
// imports from this file continue to work transparently.
export {
  deriveSmithyRuntimeContext,
  type SmithyRuntimeContext,
} from "./smithy-runtime";

export interface SmithyInputContext {
  state: GameState;
  action: SmithyInputAction;
  deps: MachineActionDeps;
}

export function runSmithyInputPhase(ctx: SmithyInputContext): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
    case "SMITHY_ADD_FUEL": {
      const smithyForFuel = deps.getSelectedCraftingAsset(state, "smithy");
      if (!smithyForFuel) return state;
      deps.logCraftingSelectionComparison(state, "smithy", smithyForFuel.id);
      if (deps.isUnderConstruction(state, smithyForFuel.id)) return state;
      const source = deps.resolveBuildingSource(
        state,
        state.selectedCraftingBuildingId,
      );
      const sourceInv = getCraftingSourceInventory(state, source);
      const addAmountDecision = decideSmithyAddAmount(
        action.amount,
        sourceInv.wood as number,
      );
      const amt =
        addAmountDecision.kind === "eligible" ? addAmountDecision.amount : 0;
      if (amt > 0) debugLog.smithy(`Added ${amt} Wood as fuel`);
      if (addAmountDecision.kind === "blocked") return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { wood: amt }),
        ),
        smithy: { ...state.smithy, fuel: state.smithy.fuel + amt },
      };
    }

    case "SMITHY_ADD_IRON": {
      const smithyForIron = deps.getSelectedCraftingAsset(state, "smithy");
      if (!smithyForIron) return state;
      deps.logCraftingSelectionComparison(state, "smithy", smithyForIron.id);
      if (deps.isUnderConstruction(state, smithyForIron.id)) return state;
      const source = deps.resolveBuildingSource(
        state,
        state.selectedCraftingBuildingId,
      );
      const sourceInv = getCraftingSourceInventory(state, source);
      const addAmountDecision = decideSmithyAddAmount(
        action.amount,
        sourceInv.iron as number,
      );
      const amt =
        addAmountDecision.kind === "eligible" ? addAmountDecision.amount : 0;
      if (amt > 0) debugLog.smithy(`Added ${amt} Iron ore`);
      if (addAmountDecision.kind === "blocked") return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { iron: amt }),
        ),
        smithy: { ...state.smithy, iron: state.smithy.iron + amt },
      };
    }

    case "SMITHY_ADD_COPPER": {
      const smithyForCopper = deps.getSelectedCraftingAsset(state, "smithy");
      if (!smithyForCopper) return state;
      deps.logCraftingSelectionComparison(state, "smithy", smithyForCopper.id);
      if (deps.isUnderConstruction(state, smithyForCopper.id)) return state;
      const source = deps.resolveBuildingSource(
        state,
        state.selectedCraftingBuildingId,
      );
      const sourceInv = getCraftingSourceInventory(state, source);
      const addAmountDecision = decideSmithyAddAmount(
        action.amount,
        sourceInv.copper as number,
      );
      const amt =
        addAmountDecision.kind === "eligible" ? addAmountDecision.amount : 0;
      if (amt > 0) debugLog.smithy(`Added ${amt} Copper ore`);
      if (addAmountDecision.kind === "blocked") return state;
      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { copper: amt }),
        ),
        smithy: { ...state.smithy, copper: state.smithy.copper + amt },
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

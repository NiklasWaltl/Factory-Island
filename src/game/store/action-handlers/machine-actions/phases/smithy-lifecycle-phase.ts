import { debugLog } from "../../../../debug/debugLogger";
import { getSmeltingRecipe } from "../../../../simulation/recipes";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
} from "../../../../crafting/crafting-sources";
import {
  SMITHY_PROCESS_MS,
  SMITHY_TICK_MS,
} from "../../../constants/workbench-timing";
import type { GameAction } from "../../../actions";
import type { GameState } from "../../../types";
import type { MachineActionDeps } from "../deps";
import { deriveSmithyRuntimeContext } from "./smithy-runtime";

type SmithyLifecycleAction = Extract<
  GameAction,
  {
    type:
      | "SMITHY_SET_RECIPE"
      | "SMITHY_START"
      | "SMITHY_STOP"
      | "SMITHY_TICK"
      | "SMITHY_WITHDRAW";
  }
>;

export interface SmithyLifecycleContext {
  state: GameState;
  action: SmithyLifecycleAction;
  deps: MachineActionDeps;
}

export function runSmithyLifecyclePhase(
  ctx: SmithyLifecycleContext,
): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
    case "SMITHY_SET_RECIPE": {
      if (state.smithy.processing) return state;
      return {
        ...state,
        smithy: { ...state.smithy, selectedRecipe: action.recipe },
      };
    }

    case "SMITHY_START": {
      const s = state.smithy;
      const smithyAsset = deps.getSelectedCraftingAsset(state, "smithy");
      if (!smithyAsset) return state;
      deps.logCraftingSelectionComparison(state, "smithy", smithyAsset.id);
      if (deps.isUnderConstruction(state, smithyAsset.id)) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            `Schmelze [${smithyAsset.id}] ist noch im Bau.`,
          ),
        };
      }
      const smithyRuntime = deriveSmithyRuntimeContext({
        selectedRecipe: s.selectedRecipe,
        iron: s.iron,
        copper: s.copper,
        poweredMachineIds: state.poweredMachineIds,
        smithyAssetId: smithyAsset.id,
      });
      if (!smithyRuntime.smithyPowered) {
        debugLog.smithy(
          `Crafting smithy [${smithyAsset.id}] - not enough power`,
        );
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            `Schmelze [${smithyAsset.id}] hat keinen Strom.`,
          ),
        };
      }
      debugLog.smithy(`Crafting smithy [${smithyAsset.id}] - Power OK`);
      if (s.processing || s.fuel <= 0) return state;
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) return state;
      const rawAmt = smithyRuntime.rawAmt;
      if (rawAmt < recipe.inputAmount) return state;
      debugLog.smithy(
        `Started smelting ${s.selectedRecipe} (fuel=${s.fuel}, ore=${rawAmt})`,
      );
      return {
        ...state,
        smithy: {
          ...s,
          processing: true,
          progress: 0,
          buildingId: smithyAsset.id,
        },
      };
    }

    case "SMITHY_STOP":
      return {
        ...state,
        smithy: { ...state.smithy, processing: false },
      };

    case "SMITHY_TICK": {
      const s = state.smithy;
      const smithyAsset = deps.getActiveSmithyAsset(state);
      if (!smithyAsset) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      if (deps.isUnderConstruction(state, smithyAsset.id)) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const smithyRuntime = deriveSmithyRuntimeContext({
        selectedRecipe: s.selectedRecipe,
        iron: s.iron,
        copper: s.copper,
        poweredMachineIds: state.poweredMachineIds,
        smithyAssetId: smithyAsset.id,
      });
      if (!smithyRuntime.smithyPowered) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const recipe = getSmeltingRecipe(s.selectedRecipe);
      if (!recipe) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const rawAmt = smithyRuntime.rawAmt;
      if (!s.processing || s.fuel <= 0 || rawAmt < recipe.inputAmount) {
        return { ...state, smithy: { ...s, processing: false } };
      }
      const newProgress = s.progress + SMITHY_TICK_MS / SMITHY_PROCESS_MS;
      if (newProgress >= 1) {
        const newFuel = s.fuel - 1;
        if (recipe.inputItem === "iron") {
          const newIron = s.iron - recipe.inputAmount;
          const canContinue = newFuel > 0 && newIron >= recipe.inputAmount;
          return {
            ...state,
            smithy: {
              ...s,
              iron: newIron,
              fuel: newFuel,
              outputIngots: s.outputIngots + recipe.outputAmount,
              progress: 0,
              processing: canContinue,
            },
            notifications: deps.addNotification(
              state.notifications,
              recipe.outputItem,
              recipe.outputAmount,
            ),
          };
        }

        const newCopper = s.copper - recipe.inputAmount;
        const canContinue = newFuel > 0 && newCopper >= recipe.inputAmount;
        return {
          ...state,
          smithy: {
            ...s,
            copper: newCopper,
            fuel: newFuel,
            outputCopperIngots: s.outputCopperIngots + recipe.outputAmount,
            progress: 0,
            processing: canContinue,
          },
          notifications: deps.addNotification(
            state.notifications,
            recipe.outputItem,
            recipe.outputAmount,
          ),
        };
      }
      return { ...state, smithy: { ...s, progress: newProgress } };
    }

    case "SMITHY_WITHDRAW": {
      const ironAmt = state.smithy.outputIngots;
      const copperAmt = state.smithy.outputCopperIngots;
      if (ironAmt <= 0 && copperAmt <= 0) return state;
      const source = deps.resolveBuildingSource(
        state,
        state.smithy.buildingId ?? state.selectedCraftingBuildingId,
      );
      const sourceInv = getCraftingSourceInventory(state, source);
      const newSourceInv = deps.addResources(sourceInv, {
        ironIngot: ironAmt,
        copperIngot: copperAmt,
      });
      return {
        ...state,
        ...applyCraftingSourceInventory(state, source, newSourceInv),
        smithy: { ...state.smithy, outputIngots: 0, outputCopperIngots: 0 },
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

// ============================================================
// Machine action handler
// ------------------------------------------------------------
// Extracts the cohesive machine-operation cluster from reducer.ts:
// - SMITHY_* actions
// - GENERATOR_* actions (without ENERGY_NET_TICK)
//
// Behaviour is intentionally unchanged.
// ============================================================

import { debugLog } from "../../debug/debugLogger";
import { getSmeltingRecipe } from "../../simulation/recipes";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
} from "../../crafting/crafting-sources";
import { GENERATOR_MAX_FUEL } from "../constants/buildings";
import { GENERATOR_TICKS_PER_WOOD } from "../constants/energy/generator";
import {
  SMITHY_PROCESS_MS,
  SMITHY_TICK_MS,
} from "../constants/workbench-timing";
import type { CraftingSource, GameAction } from "../reducer";
import type {
  GameNotification,
  GameState,
  Inventory,
  PlacedAsset,
} from "../types";

export interface MachineActionDeps {
  getSelectedCraftingAsset(
    state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
    assetType: "smithy",
  ): PlacedAsset | null;
  getActiveSmithyAsset(
    state: Pick<GameState, "assets" | "selectedCraftingBuildingId" | "smithy">,
  ): PlacedAsset | null;
  logCraftingSelectionComparison(
    state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
    assetType: "smithy",
    selectedId?: string | null,
  ): void;
  isUnderConstruction(state: GameState, assetId: string): boolean;
  resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  addNotification(
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ): GameNotification[];
  consumeResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
  addResources(
    inv: Inventory,
    items: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
}

type SmithyAddAmountDecision =
  | { kind: "eligible"; amount: number }
  | { kind: "blocked"; blockReason: "no_amount" };

type SmithyRuntimeContext = {
  smithyPowered: boolean;
  rawAmt: number;
};

function decideSmithyAddAmount(
  requestedAmount: number,
  availableAmount: number,
): SmithyAddAmountDecision {
  const amount = Math.min(requestedAmount, availableAmount);
  if (amount <= 0) {
    return { kind: "blocked", blockReason: "no_amount" };
  }

  return { kind: "eligible", amount };
}

function deriveSmithyRuntimeContext(input: {
  selectedRecipe: GameState["smithy"]["selectedRecipe"];
  iron: number;
  copper: number;
  poweredMachineIds: string[] | undefined;
  smithyAssetId: string;
}): SmithyRuntimeContext {
  const { selectedRecipe, iron, copper, poweredMachineIds, smithyAssetId } = input;
  return {
    smithyPowered: (poweredMachineIds ?? []).includes(smithyAssetId),
    rawAmt: selectedRecipe === "iron" ? iron : copper,
  };
}

export function handleMachineAction(
  state: GameState,
  action: GameAction,
  deps: MachineActionDeps,
): GameState | null {
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

    case "GENERATOR_ADD_FUEL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const source = deps.resolveBuildingSource(state, genId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const gen = state.generators[genId];
      const space = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel);
      const amt = Math.min(action.amount, (sourceInv.wood as number) ?? 0, space);
      if (amt <= 0) return state;
      debugLog.building(
        `Generator ${genId}: added ${amt} wood as fuel (${gen.fuel} → ${gen.fuel + amt}/${GENERATOR_MAX_FUEL})`,
      );
      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { wood: amt }),
        ),
        generators: {
          ...state.generators,
          [genId]: { ...gen, fuel: gen.fuel + amt },
        },
      };
    }

    case "GENERATOR_REQUEST_REFILL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      const currentReq = gen.requestedRefill ?? 0;
      const headroom = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel - currentReq);
      const desired =
        action.amount === "max"
          ? headroom
          : Math.max(0, Math.floor(action.amount));
      const add = Math.min(desired, headroom);
      if (add <= 0) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            currentReq > 0
              ? `Generator ${genId}: bereits ${currentReq} Holz angefordert`
              : `Generator ${genId}: Speicher voll`,
          ),
        };
      }
      debugLog.building(
        `Generator ${genId}: refill request +${add} (open ${currentReq} → ${currentReq + add})`,
      );
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: { ...gen, requestedRefill: currentReq + add },
        },
      };
    }

    case "GENERATOR_START": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      if (!gen || gen.running || gen.fuel <= 0) return state;
      debugLog.building(`Generator ${genId}: started`);
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: { ...gen, running: true },
        },
      };
    }

    case "GENERATOR_STOP": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      const gen = state.generators[genId];
      if (!gen) return state;
      debugLog.building(`Generator ${genId}: stopped`);
      const fuelAfterStop =
        gen.progress > 0 ? Math.max(0, gen.fuel - 1) : gen.fuel;
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: {
            ...gen,
            running: false,
            progress: 0,
            fuel: fuelAfterStop,
          },
        },
      };
    }

    case "GENERATOR_TICK": {
      const newGenerators = { ...state.generators };
      let changed = false;
      for (const id of Object.keys(newGenerators)) {
        if (deps.isUnderConstruction(state, id)) continue;
        const g = newGenerators[id];
        if (!g.running || g.fuel <= 0) {
          if (g.running) {
            newGenerators[id] = { ...g, running: false };
            changed = true;
          }
          continue;
        }
        const newProgress = g.progress + 1 / GENERATOR_TICKS_PER_WOOD;
        if (newProgress >= 1) {
          const newFuel = g.fuel - 1;
          newGenerators[id] = {
            ...g,
            fuel: newFuel,
            progress: 0,
            running: newFuel > 0,
          };
        } else {
          newGenerators[id] = { ...g, progress: newProgress };
        }
        changed = true;
      }
      if (!changed) return state;
      return { ...state, generators: newGenerators };
    }

    default:
      return null;
  }
}

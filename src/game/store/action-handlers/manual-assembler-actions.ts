// ============================================================
// Manual assembler action handler
// ------------------------------------------------------------
// Extracts manual assembler lifecycle branches from reducer.ts:
// - MANUAL_ASSEMBLER_START
// - MANUAL_ASSEMBLER_TICK
//
// Behavior is intentionally unchanged.
// ============================================================

import { getManualAssemblerRecipe } from "../../simulation/recipes";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
} from "../../crafting/crafting-sources";
import { MANUAL_ASSEMBLER_TICK_MS } from "../constants/workbench-timing";
import type { GameAction } from "../actions";
import type { CraftingSource } from "../types";
import type {
  GameNotification,
  GameState,
  Inventory,
  PlacedAsset,
} from "../types";

export interface ManualAssemblerActionDeps {
  getSelectedCraftingAsset(
    state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
    assetType: "manual_assembler",
  ): PlacedAsset | null;
  logCraftingSelectionComparison(
    state: Pick<GameState, "assets" | "selectedCraftingBuildingId">,
    assetType: "manual_assembler",
    selectedId?: string | null,
  ): void;
  isUnderConstruction(state: GameState, assetId: string): boolean;
  resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource;
  getCapacityPerResource(state: { mode: string; warehousesPlaced: number }): number;
  getZoneItemCapacity(state: GameState, zoneId: string): number;
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
  WAREHOUSE_CAPACITY: number;
}

function deriveManualAssemblerSourceCapacity(input: {
  sourceKind: CraftingSource["kind"];
  mode: GameState["mode"];
  warehouseCapacity: number;
  globalCapacity: number | null;
  zoneCapacity: number | null;
}): number {
  const {
    sourceKind,
    mode,
    warehouseCapacity,
    globalCapacity,
    zoneCapacity,
  } = input;

  if (sourceKind === "global") return globalCapacity as number;
  if (sourceKind === "zone") return zoneCapacity as number;
  return mode === "debug" ? Infinity : warehouseCapacity;
}

export function handleManualAssemblerAction(
  state: GameState,
  action: GameAction,
  deps: ManualAssemblerActionDeps,
): GameState | null {
  switch (action.type) {
    case "MANUAL_ASSEMBLER_START": {
      const maAsset = deps.getSelectedCraftingAsset(state, "manual_assembler");
      if (!maAsset) return state;
      deps.logCraftingSelectionComparison(state, "manual_assembler", maAsset.id);
      if (deps.isUnderConstruction(state, maAsset.id)) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            `Manueller Assembler [${maAsset.id}] ist noch im Bau.`,
          ),
        };
      }
      if (state.manualAssembler.processing) return state;
      const recipe = getManualAssemblerRecipe(action.recipe);
      if (!recipe) return state;
      const bId = maAsset.id;
      const source = deps.resolveBuildingSource(state, bId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const inputKey = recipe.inputItem as keyof Inventory;
      const globalCapacity = source.kind === "global"
        ? deps.getCapacityPerResource(state)
        : null;
      const zoneCapacity = source.kind === "zone"
        ? deps.getZoneItemCapacity(state, source.zoneId)
        : null;
      const cap = deriveManualAssemblerSourceCapacity({
        sourceKind: source.kind,
        mode: state.mode,
        warehouseCapacity: deps.WAREHOUSE_CAPACITY,
        globalCapacity,
        zoneCapacity,
      });
      if ((sourceInv[outputKey] as number) >= cap) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            "Lager voll! Baue mehr Lagerhäuser.",
          ),
        };
      }
      if ((sourceInv[inputKey] as number) < recipe.inputAmount) {
        const error = recipe.key === "metal_plate"
          ? "Nicht genug Metallbarren!"
          : "Nicht genug Metallplatten!";
        return {
          ...state,
          notifications: deps.addErrorNotification(state.notifications, error),
        };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { [inputKey]: recipe.inputAmount }),
        ),
        manualAssembler: {
          processing: true,
          recipe: recipe.key,
          progress: 0,
          buildingId: bId,
        },
      };
    }

    case "MANUAL_ASSEMBLER_TICK": {
      const m = state.manualAssembler;
      if (!m.processing || !m.recipe) return state;
      const recipe = getManualAssemblerRecipe(m.recipe);
      if (!recipe) {
        return {
          ...state,
          manualAssembler: {
            processing: false,
            recipe: null,
            progress: 0,
            buildingId: null,
          },
        };
      }

      const newProgress =
        m.progress + MANUAL_ASSEMBLER_TICK_MS / Math.max(1, recipe.processingTime * 1000);
      if (newProgress < 1) {
        return { ...state, manualAssembler: { ...m, progress: newProgress } };
      }

      const source = deps.resolveBuildingSource(state, m.buildingId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const outputKey = recipe.outputItem as keyof Inventory;
      const globalCapacity = source.kind === "global"
        ? deps.getCapacityPerResource(state)
        : null;
      const zoneCapacity = source.kind === "zone"
        ? deps.getZoneItemCapacity(state, source.zoneId)
        : null;
      const cap = deriveManualAssemblerSourceCapacity({
        sourceKind: source.kind,
        mode: state.mode,
        warehouseCapacity: deps.WAREHOUSE_CAPACITY,
        globalCapacity,
        zoneCapacity,
      });
      if ((sourceInv[outputKey] as number) >= cap) {
        return {
          ...state,
          manualAssembler: {
            processing: false,
            recipe: null,
            progress: 0,
            buildingId: null,
          },
          notifications: deps.addErrorNotification(
            state.notifications,
            "Lager voll! Baue mehr Lagerhäuser.",
          ),
        };
      }

      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.addResources(sourceInv, { [outputKey]: recipe.outputAmount }),
        ),
        manualAssembler: {
          processing: false,
          recipe: null,
          progress: 0,
          buildingId: null,
        },
        notifications: deps.addNotification(
          state.notifications,
          outputKey,
          recipe.outputAmount,
        ),
      };
    }

    default:
      return null;
  }
}

import type { CraftingInventorySource } from "../../../crafting/types";
import type {
  ExecutionTickDeps,
  PlanningTriggerDeps,
} from "../../../crafting/tickPhases";
import type {
  GameNotification,
  GameState,
  KeepStockByWorkbench,
  RecipeAutomationPolicyMap,
} from "../../types";
import type { CraftingSource } from "../../types";

/**
 * Reducer-internal helpers/constants the crafting/queue handler needs
 * but which still live inside reducer.ts (or its module-scope
 * configuration). Passed as deps to keep this module free of
 * circular value imports from reducer.ts.
 */
export interface CraftingQueueActionDeps {
  readonly KEEP_STOCK_MAX_TARGET: number;
  readonly planningTriggerDeps: PlanningTriggerDeps;
  readonly executionTickDeps: ExecutionTickDeps;
  isUnderConstruction(state: GameState, assetId: string): boolean;
  resolveBuildingSource(state: GameState, buildingId: string | null): CraftingSource;
  toCraftingJobInventorySource(
    state: GameState,
    source: CraftingSource,
  ): CraftingInventorySource;
  logCraftingSelectionComparison(
    state: GameState,
    assetType: "workbench",
    selectedId?: string | null,
  ): void;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  getKeepStockByWorkbench(state: GameState): KeepStockByWorkbench;
  getRecipeAutomationPolicies(state: GameState): RecipeAutomationPolicyMap;
}

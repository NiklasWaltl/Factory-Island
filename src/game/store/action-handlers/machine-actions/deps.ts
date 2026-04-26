import type { CraftingSource } from "../../reducer";
import type {
  GameNotification,
  GameState,
  Inventory,
  PlacedAsset,
} from "../../types";

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

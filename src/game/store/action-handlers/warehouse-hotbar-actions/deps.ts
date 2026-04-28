import type {
  BuildingType,
  GameNotification,
  GameState,
  HotbarSlot,
  Inventory,
  ToolKind,
} from "../../types";

export interface WarehouseHotbarActionDeps {
  EMPTY_HOTBAR_SLOT: HotbarSlot;
  hotbarAdd: (
    slots: HotbarSlot[],
    toolKind: Exclude<ToolKind, "empty">,
    buildingType?: BuildingType,
    add?: number,
  ) => HotbarSlot[] | null;
  addErrorNotification(
    notifications: GameNotification[],
    message: string,
  ): GameNotification[];
  isUnderConstruction(
    state: Pick<GameState, "constructionSites">,
    assetId: string,
  ): boolean;
  getAvailableResource(
    state: Pick<GameState, "inventory">,
    key: keyof Inventory,
  ): number;
  getWarehouseCapacity(mode: GameState["mode"]): number;
  consumeResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
  addResources(
    inv: Inventory,
    items: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
}

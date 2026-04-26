import type { GameAction } from "../reducer";
import type { MapShopItem } from "../constants/shop";
import type {
  BuildingType,
  GameNotification,
  GameState,
  HotbarSlot,
  Inventory,
  ToolKind,
} from "../types";
import type { ShopItemTargetDecision } from "../helpers/shop";

export interface ShopActionDeps {
  MAP_SHOP_ITEMS: MapShopItem[];
  hasResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): boolean;
  consumeResources(
    inv: Inventory,
    costs: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
  addNotification(
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ): GameNotification[];
  resolveShopItemTarget(input: {
    itemId: string;
    hotbar: GameState["hotbarSlots"];
    inventory: GameState["inventory"];
  }): ShopItemTargetDecision;
  hotbarAdd(
    slots: HotbarSlot[],
    toolKind: Exclude<ToolKind, "empty">,
    buildingType?: BuildingType,
    add?: number,
  ): HotbarSlot[] | null;
  addResources(
    inv: Inventory,
    items: Partial<Record<keyof Inventory, number>>,
  ): Inventory;
}

export function handleShopAction(
  state: GameState,
  action: GameAction,
  deps: ShopActionDeps,
): GameState | null {
  switch (action.type) {
    case "BUY_MAP_SHOP_ITEM": {
      const item = deps.MAP_SHOP_ITEMS.find((entry) => entry.key === action.itemKey);
      if (!item) return state;
      if (!deps.hasResources(state.inventory, { coins: item.costCoins })) return state;

      const baseInv = deps.consumeResources(state.inventory, { coins: item.costCoins });
      const notifs = deps.addNotification(state.notifications, item.key, 1);
      const shopItemTarget = deps.resolveShopItemTarget({
        itemId: item.key,
        hotbar: state.hotbarSlots,
        inventory: baseInv,
      });

      if (shopItemTarget.targetArray === "hotbar") {
        const newHotbar = deps.hotbarAdd(
          state.hotbarSlots,
          item.key as Exclude<ToolKind, "empty">,
        );
        if (newHotbar) {
          return {
            ...state,
            inventory: baseInv,
            hotbarSlots: newHotbar,
            notifications: notifs,
          };
        }
      }

      const newInv = deps.addResources(baseInv, { [item.inventoryKey]: 1 });
      return { ...state, inventory: newInv, notifications: notifs };
    }

    default:
      return null;
  }
}

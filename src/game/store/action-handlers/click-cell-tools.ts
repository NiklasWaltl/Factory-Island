// ============================================================
// CLICK_CELL tool branches
// ------------------------------------------------------------
// Extracts only the hotbar tool handling from CLICK_CELL:
// - axe
// - wood_pickaxe
// - stone_pickaxe
// - sapling
//
// UI prelude/build-mode routing stays outside this handler.
// ============================================================

import { DEPOSIT_TYPES } from "../constants/deposit-positions";
import { SAPLING_DROP_CHANCE, SAPLING_GROW_MS } from "../constants/timing";
import type {
  AssetType,
  BuildingType,
  CollectableItemType,
  CollectionNode,
  GameNotification,
  GameState,
  HotbarSlot,
  Inventory,
  PlacedAsset,
  ToolKind,
} from "../types";

export interface ClickCellToolContext {
  x: number;
  y: number;
  assetId: string | undefined;
  asset: PlacedAsset | null;
}

export interface ClickCellToolActionDeps {
  RESOURCE_1x1_DROP_AMOUNT: number;
  removeAsset: (
    state: GameState,
    assetId: string,
  ) => Pick<GameState, "assets" | "cellMap" | "saplingGrowAt">;
  addToCollectionNodeAt: (
    nodes: Record<string, CollectionNode>,
    itemType: CollectableItemType,
    tileX: number,
    tileY: number,
    amount: number,
  ) => Record<string, CollectionNode>;
  hotbarDecrement: (slots: HotbarSlot[], idx: number) => HotbarSlot[];
  getCapacityPerResource: (state: { mode: string; warehousesPlaced: number }) => number;
  hotbarAdd: (
    slots: HotbarSlot[],
    toolKind: Exclude<ToolKind, "empty">,
    buildingType?: BuildingType,
    add?: number,
  ) => HotbarSlot[] | null;
  addResources: (inv: Inventory, items: Partial<Record<keyof Inventory, number>>) => Inventory;
  addNotification: (
    notifications: GameNotification[],
    resource: string,
    amount: number,
  ) => GameNotification[];
  placeAsset: (
    assets: Record<string, PlacedAsset>,
    cellMap: Record<string, string>,
    type: AssetType,
    x: number,
    y: number,
    size: 1 | 2,
    width?: 1 | 2,
    height?: 1 | 2,
    fixed?: boolean,
  ) =>
    | {
        assets: Record<string, PlacedAsset>;
        cellMap: Record<string, string>;
        id: string;
      }
    | null;
  addErrorNotification: (notifications: GameNotification[], message: string) => GameNotification[];
  debugLog: {
    mining(message: string): void;
    inventory(message: string): void;
    building(message: string): void;
  };
}

export function handleClickCellToolAction(
  state: GameState,
  context: ClickCellToolContext,
  deps: ClickCellToolActionDeps,
): GameState {
  const { x, y, assetId, asset } = context;
  const {
    RESOURCE_1x1_DROP_AMOUNT,
    removeAsset,
    addToCollectionNodeAt,
    hotbarDecrement,
    getCapacityPerResource,
    hotbarAdd,
    addResources,
    addNotification,
    placeAsset,
    addErrorNotification,
    debugLog,
  } = deps;

  const slot = state.hotbarSlots[state.activeSlot];
  if (!slot || slot.toolKind === "empty") return state;

  // Block building placement from hotbar in normal mode.
  if (slot.toolKind === "building") return state;

  // Block tool usage on 2x2 deposits; they require an auto-miner.
  if (asset && DEPOSIT_TYPES.has(asset.type)) {
    return {
      ...state,
      notifications: addErrorNotification(state.notifications, "Benötigt Auto-Miner"),
    };
  }

  if (slot.toolKind === "axe") {
    if (!asset || asset.type !== "tree") {
      if (asset && (["stone", "iron", "copper"] as string[]).includes(asset.type)) {
        const msg = asset.type === "stone"
          ? "Du brauchst eine Holz- oder Steinspitzhacke."
          : "Du brauchst eine Steinspitzhacke.";
        return { ...state, notifications: addErrorNotification(state.notifications, msg) };
      }
      return state;
    }

    if (slot.amount <= 0) return state;

    const treeX = asset.x;
    const treeY = asset.y;
    const removed = removeAsset(state, assetId!);
    const collectionNodes = addToCollectionNodeAt(
      state.collectionNodes,
      "wood",
      treeX,
      treeY,
      RESOURCE_1x1_DROP_AMOUNT,
    );
    let notifications = state.notifications;
    let hotbarSlots = hotbarDecrement(state.hotbarSlots, state.activeSlot);
    let inventory = state.inventory;

    debugLog.mining(
      `Felled tree at (${x},${y}) with Axe → wood CollectionNode @ (${treeX},${treeY})`,
    );

    if (Math.random() < SAPLING_DROP_CHANCE) {
      const cap = getCapacityPerResource(state);
      const withSapling = hotbarAdd(hotbarSlots, "sapling");
      if (withSapling) {
        hotbarSlots = withSapling;
        notifications = addNotification(notifications, "sapling", 1);
      } else if (inventory.sapling < cap) {
        inventory = addResources(inventory, { sapling: 1 });
        notifications = addNotification(notifications, "sapling", 1);
        debugLog.inventory("Sapling drop → added to central inventory");
      }
    }

    return {
      ...state,
      ...removed,
      inventory,
      hotbarSlots,
      notifications,
      collectionNodes,
    };
  }

  if (slot.toolKind === "wood_pickaxe") {
    if (!asset || asset.type !== "stone") {
      if (asset && asset.type === "tree") {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt."),
        };
      }
      if (asset && (["iron", "copper"] as string[]).includes(asset.type)) {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, "Du brauchst eine Steinspitzhacke."),
        };
      }
      return state;
    }

    if (slot.amount <= 0) return state;

    const tileX = asset.x;
    const tileY = asset.y;
    const removed = removeAsset(state, assetId!);
    const collectionNodes = addToCollectionNodeAt(
      state.collectionNodes,
      "stone",
      tileX,
      tileY,
      RESOURCE_1x1_DROP_AMOUNT,
    );
    const nextHotbar = hotbarDecrement(state.hotbarSlots, state.activeSlot);

    debugLog.mining(
      `Mined stone at (${x},${y}) with Wood Pickaxe → CollectionNode @ (${tileX},${tileY})`,
    );

    return {
      ...state,
      ...removed,
      hotbarSlots: nextHotbar,
      collectionNodes,
    };
  }

  if (slot.toolKind === "stone_pickaxe") {
    if (!asset || !(["stone", "iron", "copper"] as string[]).includes(asset.type)) {
      if (asset && asset.type === "tree") {
        return {
          ...state,
          notifications: addErrorNotification(state.notifications, "Du brauchst eine Axt."),
        };
      }
      return state;
    }

    if (slot.amount <= 0) return state;

    const itemType = asset.type as CollectableItemType;
    const tileX = asset.x;
    const tileY = asset.y;
    const removed = removeAsset(state, assetId!);
    const collectionNodes = addToCollectionNodeAt(
      state.collectionNodes,
      itemType,
      tileX,
      tileY,
      RESOURCE_1x1_DROP_AMOUNT,
    );
    const nextHotbar = hotbarDecrement(state.hotbarSlots, state.activeSlot);

    debugLog.mining(
      `Mined ${asset.type} at (${x},${y}) with Stone Pickaxe → CollectionNode @ (${tileX},${tileY})`,
    );

    return {
      ...state,
      ...removed,
      hotbarSlots: nextHotbar,
      collectionNodes,
    };
  }

  if (slot.toolKind === "sapling") {
    if (slot.amount <= 0 || asset) return state;

    const placed = placeAsset(state.assets, state.cellMap, "sapling", x, y, 1);
    if (!placed) return state;

    const nextHotbar = hotbarDecrement(state.hotbarSlots, state.activeSlot);
    debugLog.building(`Placed Sapling at (${x},${y})`);

    return {
      ...state,
      assets: placed.assets,
      cellMap: placed.cellMap,
      hotbarSlots: nextHotbar,
      saplingGrowAt: {
        ...state.saplingGrowAt,
        [placed.id]: Date.now() + SAPLING_GROW_MS,
      },
    };
  }

  return state;
}

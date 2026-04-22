// ============================================================
// Map shop offer constants/types.
// ------------------------------------------------------------
// Extracted from store/reducer.ts. This module contains only
// static shop/economy offer metadata.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// ============================================================

import type { Inventory } from "../types";

export interface MapShopItem {
  key: string;
  label: string;
  emoji: string;
  costCoins: number;
  inventoryKey: keyof Inventory;
}

export const MAP_SHOP_ITEMS: MapShopItem[] = [
  { key: "axe", label: "Axt", emoji: "\u{1FA93}", costCoins: 10, inventoryKey: "axe" },
];

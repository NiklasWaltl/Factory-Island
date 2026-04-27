// ============================================================
// Asset display tables (labels, colours, emojis).
// ------------------------------------------------------------
// Extracted from store/reducer.ts. Pure data tables keyed by
// AssetType. Re-exported by reducer.ts for backward-compatible
// `from "../store/reducer"` consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// Type-only imports are fine (erased at runtime).
// ============================================================

import type { AssetType } from "../types";

export const ASSET_LABELS: Record<AssetType, string> = {
  tree: "Baum",
  stone: "Stein",
  iron: "Eisen",
  copper: "Kupfer",
  sapling: "Setzling",
  workbench: "Werkbank",
  warehouse: "Lagerhaus",
  smithy: "Schmiede",
  generator: "Holz-Generator",
  cable: "Stromleitung",
  battery: "Batterie",
  power_pole: "Stromknoten",
  map_shop: "Haendler",
  stone_deposit: "Stein-Vorkommen",
  iron_deposit: "Eisen-Vorkommen",
  copper_deposit: "Kupfer-Vorkommen",
  auto_miner: "Auto-Miner",
  conveyor: "Förderband",
  conveyor_corner: "Förderband-Ecke",
  conveyor_merger: "Förderband-Merger",
  conveyor_splitter: "Förderband-Splitter",
  conveyor_underground_in: "Untergrund-Eingang",
  conveyor_underground_out: "Untergrund-Ausgang",
  manual_assembler: "Manueller Assembler",
  auto_smelter: "Auto Smelter",
  auto_assembler: "Auto-Assembler",
  service_hub: "Drohnen-Hub",
};

export const ASSET_COLORS: Record<AssetType, string> = {
  tree: "#228B22",
  stone: "#808080",
  iron: "#A0A0B0",
  copper: "#CD7F32",
  sapling: "#90EE90",
  workbench: "#8B4513",
  warehouse: "#DAA520",
  smithy: "#B22222",
  generator: "#1E90FF",
  cable: "#FFD700",
  battery: "#2196F3",
  power_pole: "#FF8C00",
  map_shop: "#6A5ACD",
  stone_deposit: "#5a5a6a",
  iron_deposit: "#6a7080",
  copper_deposit: "#8b5e20",
  auto_miner: "#ff6b00",
  conveyor: "#ffa500",
  conveyor_corner: "#ff8c00",
  conveyor_merger: "#f59e0b",
  conveyor_splitter: "#14b8a6",
  conveyor_underground_in: "#5c4033",
  conveyor_underground_out: "#7a5c45",
  manual_assembler: "#4da6ff",
  auto_smelter: "#e64545",
  auto_assembler: "#2e8b57",
  service_hub: "#4169E1",
};

export const ASSET_EMOJIS: Record<AssetType, string> = {
  tree: "\u{1F332}",
  stone: "\u{1FAA8}",
  iron: "\u2699\uFE0F",
  copper: "\u{1F536}",
  sapling: "\u{1F331}",
  workbench: "\u{1F528}",
  warehouse: "\u{1F4E6}",
  smithy: "\u{1F525}",
  generator: "\u26A1",
  cable: "\u{1F50C}",
  battery: "\u{1F50B}",
  power_pole: "\u{1F5FC}",
  map_shop: "\u{1F9D1}\u200D\u{1F33E}",
  stone_deposit: "\u26F0\uFE0F",
  iron_deposit: "\u2699\uFE0F",
  copper_deposit: "\u{1F536}",
  auto_miner: "\u2699\uFE0F",
  conveyor: "\u27A1\uFE0F",
  conveyor_corner: "\u21A9\uFE0F",
  conveyor_merger: "\u{1F500}",
  conveyor_splitter: "\u21C4",
  conveyor_underground_in: "\u2B07\uFE0F",
  conveyor_underground_out: "\u2B06\uFE0F",
  manual_assembler: "\u{1F9F0}",
  auto_smelter: "\u{1F525}",
  auto_assembler: "\u{1F528}",
  service_hub: "\u{1F6F8}",
};

// ============================================================
// Resource display tables (labels, emojis).
// ------------------------------------------------------------
// Extracted from store/reducer.ts. Pure data tables keyed by
// resource / inventory / tool string identifier. Re-exported
// by reducer.ts for backward-compatible
// `from "../store/reducer"` consumers.
//
// IMPORTANT: This module must NOT import runtime values from
// store/reducer.ts to avoid an ESM initialisation cycle.
// ============================================================

export const RESOURCE_LABELS: Record<string, string> = {
  coins: "Coins",
  wood: "Holz",
  stone: "Stein",
  iron: "Eisen",
  copper: "Kupfer",
  sapling: "Setzling",
  ironIngot: "Eisenbarren",
  copperIngot: "Kupferbarren",
  metalPlate: "Metallplatte",
  gear: "Zahnrad",
  axe: "Axt",
  wood_pickaxe: "Holzspitzhacke",
  stone_pickaxe: "Steinspitzhacke",
  workbench: "Werkbank",
  warehouse: "Lagerhaus",
  smithy: "Schmiede",
  generator: "Holz-Generator",
  cable: "Stromleitung",
  battery: "Batterie",
  power_pole: "Stromknoten",
  auto_miner: "Auto-Miner",
  conveyor: "F\u00f6rderband",
  conveyor_corner: "F\u00f6rderband-Ecke",
  manual_assembler: "Manueller Assembler",
};

export const RESOURCE_EMOJIS: Record<string, string> = {
  coins: "\u{1FA99}",
  wood: "\u{1FAB5}",
  stone: "\u{1FAA8}",
  iron: "\u2699\uFE0F",
  copper: "\u{1F536}",
  sapling: "\u{1F331}",
  ironIngot: "\u{1F9F1}",
  copperIngot: "\u{1F7EB}",
  metalPlate: "\u{1F4C4}",
  gear: "\u2699\uFE0F",
  axe: "\u{1FA93}",
  wood_pickaxe: "\u26CF\uFE0F",
  stone_pickaxe: "\u26CF\uFE0F",
  workbench: "\u{1F528}",
  warehouse: "\u{1F4E6}",
  smithy: "\u{1F525}",
  generator: "\u26A1",
  cable: "\u{1F50C}",
  battery: "\u{1F50B}",
  power_pole: "\u{1F5FC}",
  auto_miner: "\u2699\uFE0F",
  conveyor: "\u27A1\uFE0F",
  conveyor_corner: "\u21A9\uFE0F",
  manual_assembler: "\u{1F9F0}",
};

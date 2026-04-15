// ============================================================
// Factory Island - Mock Data System
// ============================================================
// Provides mock / cheat data that can be toggled from the Debug UI.
// Completely tree-shaken in production because every public function
// exits early when `!import.meta.env.DEV`.

import type { GameState, GameAction, Inventory } from "../store/reducer";
import { createInitialHotbar, HOTBAR_STACK_MAX } from "../store/reducer";
import { debugLog } from "./debugLogger";

// ---- Mock presets ----

export const MOCK_RESOURCES: Partial<Inventory> = {
  coins: 99999,
  wood: 999,
  stone: 999,
  iron: 999,
  copper: 999,
  sapling: 999,
  ironIngot: 999,
  copperIngot: 999,
};

export const MOCK_TOOLS: Partial<Inventory> = {
  axe: 99,
  wood_pickaxe: 99,
  stone_pickaxe: 99,
};

/**
 * Apply mock resources to the current state.
 * Returns a synthetic GameAction that the reducer can process,
 * or we directly mutate via a special action.
 */
export type MockAction =
  | { type: "DEBUG_MOCK_RESOURCES" }
  | { type: "DEBUG_MOCK_TOOLS" }
  | { type: "DEBUG_MOCK_BUILDINGS" }
  | { type: "DEBUG_MOCK_ALL" }
  | { type: "DEBUG_RESET_STATE" };

export function applyMockToState(state: GameState, mock: MockAction["type"]): GameState {
  if (!import.meta.env.DEV) return state;

  switch (mock) {
    case "DEBUG_MOCK_RESOURCES": {
      debugLog.mock("Applied mock resources (999 each)");
      return {
        ...state,
        inventory: { ...state.inventory, ...MOCK_RESOURCES },
      };
    }

    case "DEBUG_MOCK_TOOLS": {
      debugLog.mock("Applied mock tools (99 each + hotbar)");
      const inv = { ...state.inventory, ...MOCK_TOOLS, sapling: 999 };
      const hotbar = createInitialHotbar();
      hotbar[0] = { toolKind: "axe", amount: HOTBAR_STACK_MAX, label: `Axt (${HOTBAR_STACK_MAX})`, emoji: "\u{1FA93}" };
      hotbar[1] = { toolKind: "wood_pickaxe", amount: HOTBAR_STACK_MAX, label: `Holzspitzhacke (${HOTBAR_STACK_MAX})`, emoji: "\u26CF\uFE0F" };
      hotbar[2] = { toolKind: "stone_pickaxe", amount: HOTBAR_STACK_MAX, label: `Steinspitzhacke (${HOTBAR_STACK_MAX})`, emoji: "\u26CF\uFE0F" };
      hotbar[3] = { toolKind: "sapling", amount: HOTBAR_STACK_MAX, label: `Setzling (${HOTBAR_STACK_MAX})`, emoji: "\u{1F331}" };
      return { ...state, inventory: inv, hotbarSlots: hotbar };
    }

    case "DEBUG_MOCK_BUILDINGS": {
      debugLog.mock("Applied mock buildings (all in inventory)");
      return {
        ...state,
        inventory: {
          ...state.inventory,
          workbench: state.inventory.workbench + 1,
          warehouse: state.inventory.warehouse + 1,
          smithy: state.inventory.smithy + 1,
          generator: state.inventory.generator + 1,
        },
      };
    }

    case "DEBUG_MOCK_ALL": {
      debugLog.mock("Applied ALL mock data");
      let s = applyMockToState(state, "DEBUG_MOCK_RESOURCES");
      s = applyMockToState(s, "DEBUG_MOCK_TOOLS");
      s = applyMockToState(s, "DEBUG_MOCK_BUILDINGS");
      return s;
    }

    case "DEBUG_RESET_STATE": {
      debugLog.mock("State reset requested (handled externally)");
      return state; // handled by the component that calls createInitialState
    }

    default:
      return state;
  }
}

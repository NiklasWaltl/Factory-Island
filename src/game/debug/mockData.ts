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

/**
 * Resources that have a physical home (warehouse / hub). Debug fill routes these
 * into the first available warehouse instead of state.inventory so that consumption
 * pulls from the same physical storage the player sees in the warehouse panel.
 */
const PHYSICAL_RESOURCE_KEYS: ReadonlyArray<keyof Inventory> = [
  "wood",
  "stone",
  "iron",
  "copper",
  "ironIngot",
  "copperIngot",
];

/**
 * Subset of `PHYSICAL_RESOURCE_KEYS` that service hubs can physically hold.
 * Mirrors `COLLECTABLE_KEYS` in the reducer (kept local to avoid a new export).
 */
const HUB_ELIGIBLE_KEYS: ReadonlyArray<keyof Inventory> = ["wood", "stone", "iron", "copper"];

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
  // Note: caller (DebugPanel) is already gated behind IS_DEV + state.mode === "debug".
  // We intentionally don't re-check import.meta.env.DEV here so unit tests can
  // exercise the deposit logic directly.

  switch (mock) {
    case "DEBUG_MOCK_RESOURCES": {
      // Debug fill priority (physical = wood/stone/iron/copper/ingots):
      //   1. First warehouse (accepts every physical key)
      //   2. First service hub (accepts only HUB_ELIGIBLE_KEYS = wood/stone/iron/copper)
      //   3. No-op for physical keys that found no home — we do NOT silently
      //      write them to state.inventory anymore, because that would make
      //      globalInventory diverge from the physical source of truth.
      // Non-physical keys (coins, sapling) always go to state.inventory.
      const physicalDeposit: Partial<Inventory> = {};
      const globalDeposit: Partial<Inventory> = {};
      for (const [key, amt] of Object.entries(MOCK_RESOURCES)) {
        if ((PHYSICAL_RESOURCE_KEYS as readonly string[]).includes(key)) {
          physicalDeposit[key as keyof Inventory] = amt as number;
        } else {
          globalDeposit[key as keyof Inventory] = amt as number;
        }
      }

      const firstWarehouseId = Object.keys(state.warehouseInventories)[0] ?? null;
      const firstHubId = Object.keys(state.serviceHubs)[0] ?? null;

      let nextWarehouses = state.warehouseInventories;
      let nextHubs = state.serviceHubs;
      const deposited: string[] = [];
      const skipped: string[] = [];

      for (const [key, amt] of Object.entries(physicalDeposit)) {
        if (firstWarehouseId) {
          const wh = nextWarehouses[firstWarehouseId] as unknown as Record<string, number>;
          nextWarehouses = {
            ...nextWarehouses,
            [firstWarehouseId]: { ...wh, [key]: (wh[key] ?? 0) + (amt as number) } as unknown as Inventory,
          };
          deposited.push(`${key}→wh:${firstWarehouseId}`);
          continue;
        }
        if (firstHubId && (HUB_ELIGIBLE_KEYS as readonly string[]).includes(key)) {
          const hub = nextHubs[firstHubId];
          nextHubs = {
            ...nextHubs,
            [firstHubId]: {
              ...hub,
              inventory: {
                ...hub.inventory,
                [key]: (hub.inventory[key as "wood" | "stone" | "iron" | "copper"] ?? 0) + (amt as number),
              },
            },
          };
          deposited.push(`${key}→hub:${firstHubId}`);
          continue;
        }
        // No physical home: skip rather than poison globalInventory.
        skipped.push(key);
      }

      if (skipped.length > 0) {
        debugLog.mock(
          `Mock fill: skipped physical keys without a storage target: ${skipped.join(", ")} ` +
            `(no warehouse${HUB_ELIGIBLE_KEYS.some((k) => skipped.includes(k as string)) ? " / no hub" : ""} available)`,
        );
      }
      if (deposited.length > 0) {
        debugLog.mock(`Mock fill deposited: ${deposited.join(", ")}`);
      } else if (skipped.length > 0) {
        debugLog.mock("Mock fill: no physical storage exists — only non-physical keys applied.");
      }

      return {
        ...state,
        inventory: { ...state.inventory, ...globalDeposit },
        warehouseInventories: nextWarehouses,
        serviceHubs: nextHubs,
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

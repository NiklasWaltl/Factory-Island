import type {
  CollectableItemType,
  GameState,
  Inventory,
  ServiceHubEntry,
} from "./types";

export const COLLECTABLE_KEYS = new Set<string>(["wood", "stone", "iron", "copper"]);

export function createEmptyInventory(): Inventory {
  return {
    coins: 0,
    wood: 0,
    stone: 0,
    iron: 0,
    copper: 0,
    sapling: 0,
    ironIngot: 0,
    copperIngot: 0,
    metalPlate: 0,
    gear: 0,
    axe: 0,
    wood_pickaxe: 0,
    stone_pickaxe: 0,
    workbench: 0,
    warehouse: 0,
    smithy: 0,
    generator: 0,
    cable: 0,
    battery: 0,
    power_pole: 0,
    manual_assembler: 0,
    auto_smelter: 0,
  };
}

export function hasResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): boolean {
  for (const [key, amt] of Object.entries(costs)) {
    if (((inv as unknown as Record<string, number>)[key] ?? 0) < (amt ?? 0)) return false;
  }
  return true;
}

export function addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory {
  const result = { ...inv } as Record<string, number>;
  for (const [key, amt] of Object.entries(items)) {
    result[key] = (result[key] ?? 0) + (amt ?? 0);
  }
  return result as unknown as Inventory;
}

export function getEffectiveBuildInventory(state: GameState): Inventory {
  const effective = { ...state.inventory } as Record<string, number>;
  for (const whInv of Object.values(state.warehouseInventories)) {
    for (const [key, amt] of Object.entries(whInv)) {
      effective[key] = (effective[key] ?? 0) + ((amt as number) ?? 0);
    }
  }
  for (const hub of Object.values(state.serviceHubs)) {
    for (const res of COLLECTABLE_KEYS) {
      effective[res] = (effective[res] ?? 0) + (hub.inventory[res as CollectableItemType] ?? 0);
    }
  }
  return effective as unknown as Inventory;
}

export function costIsFullyCollectable(costs: Partial<Record<keyof Inventory, number>>): boolean {
  return Object.keys(costs).every((k) => COLLECTABLE_KEYS.has(k));
}

export function fullCostAsRemaining(costs: Partial<Record<keyof Inventory, number>>): Partial<Record<CollectableItemType, number>> {
  const remaining: Partial<Record<CollectableItemType, number>> = {};
  for (const [k, v] of Object.entries(costs)) {
    if ((v ?? 0) > 0 && COLLECTABLE_KEYS.has(k)) {
      remaining[k as CollectableItemType] = v;
    }
  }
  return remaining;
}

export function consumeBuildResources(
  state: GameState,
  costs: Partial<Record<keyof Inventory, number>>,
): {
  inventory: Inventory;
  warehouseInventories: Record<string, Inventory>;
  serviceHubs: Record<string, ServiceHubEntry>;
  remaining: Partial<Record<CollectableItemType, number>>;
} {
  const inv = { ...state.inventory } as Record<string, number>;
  let warehouses = state.warehouseInventories;
  let hubs = state.serviceHubs;
  const remaining: Partial<Record<CollectableItemType, number>> = {};
  for (const [key, amt] of Object.entries(costs)) {
    let needed = amt ?? 0;
    if (needed <= 0) continue;
    for (const [whId, whInv] of Object.entries(warehouses)) {
      if (needed <= 0) break;
      const whHave = ((whInv as unknown as Record<string, number>)[key] ?? 0);
      const fromWh = Math.min(whHave, needed);
      if (fromWh > 0) {
        warehouses = {
          ...warehouses,
          [whId]: { ...whInv, [key]: whHave - fromWh } as Inventory,
        };
        needed -= fromWh;
      }
    }
    if (needed > 0 && COLLECTABLE_KEYS.has(key)) {
      for (const [hubId, hub] of Object.entries(hubs)) {
        if (needed <= 0) break;
        const hubHave = hub.inventory[key as CollectableItemType] ?? 0;
        const fromHub = Math.min(hubHave, needed);
        if (fromHub > 0) {
          hubs = {
            ...hubs,
            [hubId]: {
              ...hub,
              inventory: { ...hub.inventory, [key]: hubHave - fromHub },
            },
          };
          needed -= fromHub;
        }
      }
    }
    if (needed > 0) {
      const globalHave = inv[key] ?? 0;
      const fromGlobal = Math.min(globalHave, needed);
      inv[key] = globalHave - fromGlobal;
      needed -= fromGlobal;
    }
    if (needed > 0) {
      remaining[key as CollectableItemType] = needed;
    }
  }
  return {
    inventory: inv as unknown as Inventory,
    warehouseInventories: warehouses,
    serviceHubs: hubs,
    remaining,
  };
}

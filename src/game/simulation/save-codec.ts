import type {
  GameState,
  GameMode,
  PlacedAsset,
  CollectionNode,
  StarterDroneState,
  ServiceHubEntry,
  ConstructionSite,
} from "../store/reducer";
import {
  computeConnectedAssetIds,
  createInitialState,
  cleanBuildingSourceIds,
  cleanBuildingZoneIds,
  createEmptyHubInventory,
  createDefaultHubTargetStock,
  createDefaultProtoHubTargetStock,
  getDroneHomeDock,
  MAP_SHOP_POS,
  GRID_W,
  GRID_H,
  cellKey,
} from "../store/reducer";
import type { HubTier } from "../store/reducer";
import { debugLog } from "../debug/debugLogger";
import {
  CURRENT_SAVE_VERSION,
  type SaveGameLatest,
  clampGeneratorFuel,
  migrateSave,
} from "./save-migrations";
import {
  rebuildGlobalInventoryFromStorage,
  sanitizeNetworkSlice,
  sanitizeCraftingQueue,
  sanitizeKeepStockByWorkbench,
  sanitizeRecipeAutomationPolicies,
  sanitizeStarterDrone,
} from "./save-normalizer";
import { isRuntimeGameStateSnapshot } from "./save-legacy";

/**
 * Extract the persistable subset of runtime GameState and stamp it
 * with the current save version.
 */
export function serializeState(state: GameState): SaveGameLatest {
  debugLog.general(
    `Save: ${state.network.reservations.length} reservations, ${state.crafting.jobs.length} jobs`,
  );
  return {
    version: CURRENT_SAVE_VERSION,
    mode: state.mode,
    assets: state.assets,
    cellMap: state.cellMap,
    inventory: state.inventory,
    purchasedBuildings: state.purchasedBuildings,
    placedBuildings: state.placedBuildings,
    warehousesPurchased: state.warehousesPurchased,
    warehousesPlaced: state.warehousesPlaced,
    warehouseInventories: state.warehouseInventories,
    cablesPlaced: state.cablesPlaced,
    powerPolesPlaced: state.powerPolesPlaced,
    hotbarSlots: state.hotbarSlots,
    activeSlot: state.activeSlot,
    smithy: state.smithy,
    generators: state.generators,
    battery: state.battery,
    floorMap: state.floorMap,
    autoMiners: state.autoMiners,
    conveyors: state.conveyors,
    autoSmelters: state.autoSmelters,
    manualAssembler: state.manualAssembler,
    machinePowerRatio: state.machinePowerRatio,
    saplingGrowAt: state.saplingGrowAt,
    buildingSourceWarehouseIds: state.buildingSourceWarehouseIds,
    productionZones: state.productionZones,
    buildingZoneIds: state.buildingZoneIds,
    collectionNodes: state.collectionNodes,
    starterDrone: state.starterDrone,
    serviceHubs: state.serviceHubs,
    constructionSites: state.constructionSites,
    drones: state.drones,
    network: state.network,
    crafting: state.crafting,
    keepStockByWorkbench: state.keepStockByWorkbench ?? {},
    recipeAutomationPolicies: state.recipeAutomationPolicies ?? {},
  };
}

/**
 * Hydrate a migrated save into a full GameState by re-deriving
 * runtime-only fields (connectivity, powered machines, UI defaults).
 */
export function deserializeState(save: SaveGameLatest): GameState {
  const base = createInitialState(save.mode);

  const partial: GameState = {
    ...base,
    mode: save.mode,
    assets: save.assets,
    cellMap: save.cellMap,
    inventory: save.inventory,
    purchasedBuildings: save.purchasedBuildings,
    placedBuildings: save.placedBuildings,
    warehousesPurchased: save.warehousesPurchased,
    warehousesPlaced: save.warehousesPlaced,
    warehouseInventories: save.warehouseInventories,
    cablesPlaced: save.cablesPlaced,
    powerPolesPlaced: save.powerPolesPlaced,
    hotbarSlots: save.hotbarSlots,
    activeSlot: save.activeSlot,
    smithy: { ...base.smithy, ...save.smithy, buildingId: save.smithy?.buildingId ?? null },
    generators: clampGeneratorFuel(save.generators ?? {}),
    battery: save.battery,
    floorMap: save.floorMap,
    autoMiners: save.autoMiners,
    conveyors: save.conveyors,
    autoSmelters: save.autoSmelters,
    manualAssembler: { ...save.manualAssembler, buildingId: save.manualAssembler?.buildingId ?? null },
    machinePowerRatio: save.machinePowerRatio,
    saplingGrowAt: save.saplingGrowAt,

    buildingSourceWarehouseIds: cleanBuildingSourceIds(
      save.buildingSourceWarehouseIds ?? {},
      new Set(Object.keys(save.warehouseInventories)),
    ),

    collectionNodes: (() => {
      const raw = save.collectionNodes ?? {};
      const cleaned: Record<string, CollectionNode> = {};
      for (const [id, node] of Object.entries(raw)) {
        cleaned[id] = { ...node, reservedByDroneId: null };
      }
      return cleaned;
    })(),

    starterDrone: (() => {
      const drone = sanitizeStarterDrone(save.starterDrone);
      let d = drone;
      if (d.hubId && !save.assets[d.hubId]) {
        d = { ...d, hubId: null };
      }
      if (d.deliveryTargetId && !save.assets[d.deliveryTargetId]) {
        d = { ...d, deliveryTargetId: null, currentTaskType: null };
      }
      if (!d.hubId) {
        const existingHubId =
          Object.keys(save.assets).find((id) => save.assets[id]?.type === "service_hub") ?? null;
        if (existingHubId) {
          d = { ...d, hubId: existingHubId };
        }
      }
      if (d.status === "idle") {
        if (d.hubId && save.assets[d.hubId]) {
          d = { ...d, tileX: save.assets[d.hubId].x, tileY: save.assets[d.hubId].y };
        } else if (!d.hubId) {
          d = { ...d, tileX: MAP_SHOP_POS.x, tileY: MAP_SHOP_POS.y };
        }
      }
      return d;
    })(),

    drones: (() => {
      const raw = save.drones ?? {};
      const cleaned: Record<string, StarterDroneState> = {};
      for (const [id, rawDrone] of Object.entries(raw)) {
        let d = sanitizeStarterDrone(rawDrone);
        if (d.hubId && !save.assets[d.hubId]) d = { ...d, hubId: null };
        if (d.deliveryTargetId && !save.assets[d.deliveryTargetId]) {
          d = { ...d, deliveryTargetId: null, currentTaskType: null };
        }
        if (!d.hubId) {
          const existingHubId =
            Object.keys(save.assets).find((aid) => save.assets[aid]?.type === "service_hub") ?? null;
          if (existingHubId) d = { ...d, hubId: existingHubId };
        }
        if (d.status === "idle" && d.hubId && save.assets[d.hubId]) {
          d = { ...d, tileX: save.assets[d.hubId].x, tileY: save.assets[d.hubId].y };
        }
        cleaned[id] = d;
      }
      return cleaned;
    })(),

    serviceHubs: (() => {
      const raw = save.serviceHubs ?? {};
      const cleaned: Record<string, ServiceHubEntry> = {};
      for (const [id, entry] of Object.entries(raw)) {
        if (save.assets[id]?.type === "service_hub") {
          const tier: HubTier = (entry as any).tier === 1 ? 1 : 2;
          const rawPending = (entry as any).pendingUpgrade;
          const pendingUpgrade =
            rawPending && typeof rawPending === "object" && tier === 1
              ? { ...rawPending }
              : undefined;
          cleaned[id] = {
            inventory: { ...createEmptyHubInventory(), ...entry.inventory },
            targetStock:
              entry.targetStock ??
              (tier === 1 ? createDefaultProtoHubTargetStock() : createDefaultHubTargetStock()),
            tier,
            droneIds: Array.isArray((entry as any).droneIds) ? (entry as any).droneIds : [],
            ...(pendingUpgrade ? { pendingUpgrade } : {}),
          };
        }
      }
      return cleaned;
    })(),

    constructionSites: (() => {
      const raw = save.constructionSites ?? {};
      const cleaned: Record<string, ConstructionSite> = {};
      for (const [id, site] of Object.entries(raw)) {
        if (save.assets[id]) {
          cleaned[id] = site;
        }
      }
      return cleaned;
    })(),

    productionZones: save.productionZones ?? {},
    buildingZoneIds: cleanBuildingZoneIds(
      save.buildingZoneIds ?? {},
      new Set(Object.keys(save.assets)),
      new Set(Object.keys(save.productionZones ?? {})),
    ),
    keepStockByWorkbench: sanitizeKeepStockByWorkbench(save.keepStockByWorkbench, save.assets),
    recipeAutomationPolicies: sanitizeRecipeAutomationPolicies(save.recipeAutomationPolicies),

    connectedAssetIds: [],
    poweredMachineIds: [],
    openPanel: null,
    notifications: [],
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    selectedWarehouseId: null,
    selectedPowerPoleId: null,
    selectedAutoMinerId: null,
    selectedAutoSmelterId: null,
    selectedGeneratorId: null,
    selectedServiceHubId: null,
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    selectedCraftingBuildingId: null,
  };

  const hasAnyHub = Object.values(partial.assets).some((a) => a.type === "service_hub");
  if (!hasAnyHub) {
    const candidates: { x: number; y: number; dist: number }[] = [];
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const wx = MAP_SHOP_POS.x + dx;
        const wy = MAP_SHOP_POS.y + dy;
        if (wx < 0 || wy < 0 || wx + 2 > GRID_W || wy + 2 > GRID_H) continue;
        candidates.push({ x: wx, y: wy, dist: Math.abs(dx) + Math.abs(dy) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const { x, y } of candidates) {
      const k00 = cellKey(x, y);
      const k10 = cellKey(x + 1, y);
      const k01 = cellKey(x, y + 1);
      const k11 = cellKey(x + 1, y + 1);
      if (!partial.cellMap[k00] && !partial.cellMap[k10] && !partial.cellMap[k01] && !partial.cellMap[k11]) {
        const hubId = `proto-hub-${Date.now()}`;
        const hubAsset: PlacedAsset = {
          id: hubId,
          type: "service_hub",
          x,
          y,
          size: 2,
          fixed: true,
        } as PlacedAsset;
        partial.assets = { ...partial.assets, [hubId]: hubAsset };
        partial.cellMap = {
          ...partial.cellMap,
          [k00]: hubId,
          [k10]: hubId,
          [k01]: hubId,
          [k11]: hubId,
        };
        partial.serviceHubs = {
          ...partial.serviceHubs,
          [hubId]: {
            inventory: createEmptyHubInventory(),
            targetStock: createDefaultProtoHubTargetStock(),
            tier: 1,
            droneIds: [partial.starterDrone.droneId],
          },
        };
        partial.starterDrone = { ...partial.starterDrone, hubId, tileX: x, tileY: y };
        break;
      }
    }
  }

  if (partial.starterDrone.hubId) {
    const dHub = partial.serviceHubs[partial.starterDrone.hubId];
    if (dHub && !dHub.droneIds.includes(partial.starterDrone.droneId)) {
      partial.serviceHubs = {
        ...partial.serviceHubs,
        [partial.starterDrone.hubId]: {
          ...dHub,
          droneIds: [...dHub.droneIds, partial.starterDrone.droneId],
        },
      };
    }
  }

  const snapIdleDroneToDock = (drone: StarterDroneState): StarterDroneState => {
    if (drone.status !== "idle") return drone;
    const dock = getDroneHomeDock(drone, partial);
    if (dock) {
      return { ...drone, tileX: dock.x, tileY: dock.y };
    }
    if (!drone.hubId) {
      return { ...drone, tileX: MAP_SHOP_POS.x, tileY: MAP_SHOP_POS.y };
    }
    return drone;
  };

  partial.starterDrone = snapIdleDroneToDock(partial.starterDrone);
  partial.drones = Object.fromEntries(
    Object.entries(partial.drones).map(([id, drone]) => [id, snapIdleDroneToDock(drone)]),
  );

  partial.inventory = rebuildGlobalInventoryFromStorage(partial);
  partial.connectedAssetIds = computeConnectedAssetIds(partial);

  const liveAssetIds = new Set(Object.keys(partial.assets));
  const craftingResult = sanitizeCraftingQueue((save as any).crafting, liveAssetIds);
  partial.crafting = craftingResult.queue;
  const liveJobIds = new Set(craftingResult.queue.jobs.map((j) => j.id));
  partial.network = sanitizeNetworkSlice((save as any).network, liveJobIds);

  debugLog.general(
    `Load: restored ${partial.network.reservations.length} reservations, ${partial.crafting.jobs.length} jobs`,
  );
  if (craftingResult.cancelled > 0) {
    debugLog.general(
      `Load validation: ${craftingResult.cancelled} invalid jobs cancelled`,
    );
  }

  return partial;
}

/**
 * One-stop helper for loading: parse -> migrate -> hydrate.
 * Returns a fresh initial state if anything goes wrong.
 */
export function loadAndHydrate(raw: unknown, mode: GameMode): GameState {
  const normalizedRaw = isRuntimeGameStateSnapshot(raw)
    ? serializeState(raw)
    : raw;
  const migrated = migrateSave(normalizedRaw);
  if (!migrated) return createInitialState(mode);

  if (migrated.mode !== mode) return createInitialState(mode);

  return deserializeState(migrated);
}

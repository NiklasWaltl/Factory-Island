// ============================================================
// Build placement/removal action handler
// ------------------------------------------------------------
// Extracts the first low-risk building action slice from reducer.ts:
// - BUILD_PLACE_BUILDING
// - BUILD_REMOVE_ASSET
//
// The reducer remains composition root and injects reducer-local helpers
// through a narrow deps object to avoid value-import cycles.
// ============================================================

import type { GameAction } from "../reducer";
import {
  isBuildingSourceStateConsistent,
  isBuildingZoneStateConsistent,
  isConstructionSiteStateConsistent,
} from "../utils/asset-guards";
import type {
  AssetType,
  AutoSmelterStatus,
  BuildingType,
  CollectableItemType,
  ConveyorItem,
  Direction,
  DroneStatus,
  DroneTaskType,
  GameNotification,
  GameState,
  Inventory,
  MachinePriority,
  PlacedAsset,
  ServiceHubEntry,
  StarterDroneState,
  UIPanel,
} from "../types";

type HandledActionType = "BUILD_PLACE_BUILDING" | "BUILD_REMOVE_ASSET";

const HANDLED_ACTION_TYPES = new Set<string>([
  "BUILD_PLACE_BUILDING",
  "BUILD_REMOVE_ASSET",
]);

export function isBuildingPlacementAction(
  action: GameAction,
): action is Extract<GameAction, { type: HandledActionType }> {
  return HANDLED_ACTION_TYPES.has(action.type);
}

export interface BuildingPlacementActionDeps {
  GRID_W: number;
  GRID_H: number;
  BUILDING_COSTS: Record<BuildingType, Partial<Record<keyof Inventory, number>>>;
  CONSTRUCTION_SITE_BUILDINGS: Set<BuildingType>;
  BUILDING_LABELS: Record<BuildingType, string>;
  BUILDING_SIZES: Record<BuildingType, 1 | 2>;
  BUILDINGS_WITH_DEFAULT_SOURCE: Set<BuildingType>;
  REQUIRES_STONE_FLOOR: Set<BuildingType>;
  STACKABLE_BUILDINGS: Set<BuildingType>;
  MAX_WAREHOUSES: number;
  DEPOSIT_TYPES: Set<string>;
  DEPOSIT_RESOURCE: Record<string, "stone" | "iron" | "copper">;
  DEFAULT_MACHINE_PRIORITY: MachinePriority;
  ASSET_LABELS: Record<AssetType, string>;
  cellKey(x: number, y: number): string;
  hasResources(inv: Inventory, costs: Partial<Record<keyof Inventory, number>>): boolean;
  addResources(inv: Inventory, items: Partial<Record<keyof Inventory, number>>): Inventory;
  getEffectiveBuildInventory(state: GameState): Inventory;
  costIsFullyCollectable(costs: Partial<Record<keyof Inventory, number>>): boolean;
  fullCostAsRemaining(costs: Partial<Record<keyof Inventory, number>>): Partial<Record<CollectableItemType, number>>;
  placeAsset(
    assets: Record<string, PlacedAsset>,
    cellMap: Record<string, string>,
    type: AssetType,
    x: number,
    y: number,
    size: 1 | 2,
    width?: 1 | 2,
    height?: 1 | 2,
    fixed?: boolean,
  ): {
    assets: Record<string, PlacedAsset>;
    cellMap: Record<string, string>;
    id: string;
  } | null;
  removeAsset(
    state: GameState,
    assetId: string,
  ): Pick<GameState, "assets" | "cellMap" | "saplingGrowAt">;
  makeId(): string;
  getAutoSmelterIoCells(asset: PlacedAsset): { input: { x: number; y: number }; output: { x: number; y: number } };
  consumeBuildResources(
    state: GameState,
    costs: Partial<Record<keyof Inventory, number>>,
  ): {
    inventory: Inventory;
    warehouseInventories: Record<string, Inventory>;
    serviceHubs: Record<string, ServiceHubEntry>;
    remaining: Partial<Record<CollectableItemType, number>>;
  };
  createEmptyInventory(): Inventory;
  createEmptyHubInventory(): ServiceHubEntry["inventory"];
  createDefaultProtoHubTargetStock(): Record<CollectableItemType, number>;
  getNearestWarehouseId(state: GameState, x: number, y: number): string | null;
  reassignBuildingSourceIds(
    sourceIds: GameState["buildingSourceWarehouseIds"],
    state: GameState,
    removedWarehouseId: string,
  ): GameState["buildingSourceWarehouseIds"];
  getDroneDockOffset(slot: number): { dx: number; dy: number };
  computeConnectedAssetIds(state: GameState): string[];
  addErrorNotification(notifications: GameNotification[], message: string): GameNotification[];
  debugLog: {
    building(message: string): void;
  };
}

function logPlacementInvariantWarnings(
  state: GameState,
  actionType: string,
  debugLog: BuildingPlacementActionDeps["debugLog"],
): void {
  if (!import.meta.env.DEV) return;
  if (!isConstructionSiteStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] constructionSites inkonsistent`);
  }
  if (!isBuildingZoneStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingZoneIds inkonsistent`);
  }
  if (!isBuildingSourceStateConsistent(state)) {
    debugLog.building(`[Invariant:${actionType}] buildingSourceWarehouseIds inkonsistent`);
  }
}

export function handleBuildingPlacementAction(
  state: GameState,
  action: GameAction,
  deps: BuildingPlacementActionDeps,
): GameState | null {
  const {
    GRID_W,
    GRID_H,
    BUILDING_COSTS,
    CONSTRUCTION_SITE_BUILDINGS,
    BUILDING_LABELS,
    BUILDING_SIZES,
    BUILDINGS_WITH_DEFAULT_SOURCE,
    REQUIRES_STONE_FLOOR,
    STACKABLE_BUILDINGS,
    MAX_WAREHOUSES,
    DEPOSIT_TYPES,
    DEPOSIT_RESOURCE,
    DEFAULT_MACHINE_PRIORITY,
    ASSET_LABELS,
    cellKey,
    hasResources,
    addResources,
    getEffectiveBuildInventory,
    costIsFullyCollectable,
    fullCostAsRemaining,
    placeAsset,
    removeAsset,
    makeId,
    getAutoSmelterIoCells,
    consumeBuildResources,
    createEmptyInventory,
    createEmptyHubInventory,
    createDefaultProtoHubTargetStock,
    getNearestWarehouseId,
    reassignBuildingSourceIds,
    getDroneDockOffset,
    computeConnectedAssetIds,
    addErrorNotification,
    debugLog,
  } = deps;

  switch (action.type) {
    case "BUILD_PLACE_BUILDING": {
      const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
      const hotbarBuildingType =
        activeHotbarSlot?.toolKind === "building"
          ? activeHotbarSlot.buildingType ?? null
          : null;
      const bType = state.buildMode ? state.selectedBuildingType : hotbarBuildingType;
      if (!bType) return state;
      const { x, y } = action;
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return state;

      // Cost check
      const costs = BUILDING_COSTS[bType];
      // Construction site eligibility: building supports it AND a service hub exists.
      // Eligible buildings ALWAYS go through construction-site flow (drone supplies resources).
      const hasActiveHub = Object.values(state.assets).some((a) => a.type === "service_hub");
      const useConstructionSite = CONSTRUCTION_SITE_BUILDINGS.has(bType) && hasActiveHub
        && costIsFullyCollectable(costs);
      if (!useConstructionSite && !hasResources(getEffectiveBuildInventory(state), costs as Partial<Record<keyof Inventory, number>>)) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Nicht genug Ressourcen!") };
      }

      // ---- SPECIAL: Auto-Miner placement on deposit ----
      if (bType === "auto_miner") {
        const depositAssetId = state.cellMap[cellKey(x, y)];
        if (!depositAssetId) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Auto-Miner kann nur auf einem Ressourcenvorkommen platziert werden.") };
        }
        const depositAsset = state.assets[depositAssetId];
        if (!depositAsset || !DEPOSIT_TYPES.has(depositAsset.type)) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Auto-Miner kann nur auf einem Ressourcenvorkommen platziert werden.") };
        }
        // Only one auto-miner per deposit
        const existingMiner = Object.values(state.autoMiners).find(m => m.depositId === depositAssetId);
        if (existingMiner) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Dieses Vorkommen hat bereits einen Auto-Miner.") };
        }
        const dir: Direction = action.direction ?? "east";
        const minerId = makeId();
        const newAssets = {
          ...state.assets,
          [minerId]: {
            id: minerId,
            type: "auto_miner" as AssetType,
            x,
            y,
            size: 1 as const,
            direction: dir,
            priority: DEFAULT_MACHINE_PRIORITY,
          },
        };
        const newCellMap = { ...state.cellMap, [cellKey(x, y)]: minerId };
        const resource = DEPOSIT_RESOURCE[depositAsset.type];
        const newAutoMiners = { ...state.autoMiners, [minerId]: { depositId: depositAssetId, resource, progress: 0 } };
        debugLog.building(`[BuildMode] Placed Auto-Miner at (${x},${y}) on ${depositAsset.type}${useConstructionSite ? " as construction site" : ""}`);
        let partialM: GameState;
        if (useConstructionSite) {
          partialM = { ...state, assets: newAssets, cellMap: newCellMap, autoMiners: newAutoMiners,
            constructionSites: { ...state.constructionSites, [minerId]: { buildingType: bType, remaining: fullCostAsRemaining(costs) } } };
        } else {
          const consumedM = consumeBuildResources(state, costs as Partial<Record<keyof Inventory, number>>);
          partialM = { ...state, assets: newAssets, cellMap: newCellMap, inventory: consumedM.inventory, warehouseInventories: consumedM.warehouseInventories, serviceHubs: consumedM.serviceHubs, autoMiners: newAutoMiners };
        }
        // Auto-assign nearest warehouse source for zone-aware output
        const nearestWhIdM = getNearestWarehouseId(partialM, x, y);
        if (nearestWhIdM) {
          partialM = { ...partialM, buildingSourceWarehouseIds: { ...partialM.buildingSourceWarehouseIds, [minerId]: nearestWhIdM } };
        }
        const nextState = { ...partialM, connectedAssetIds: computeConnectedAssetIds(partialM) };
        logPlacementInvariantWarnings(nextState, action.type, debugLog);
        return nextState;
      }

      // ---- SPECIAL: Conveyor placement with direction ----
      if (bType === "conveyor" || bType === "conveyor_corner") {
        if (state.cellMap[cellKey(x, y)]) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
        }
        const dir: Direction = action.direction ?? "east";
        const placeType: AssetType = bType === "conveyor_corner" ? "conveyor_corner" : "conveyor";
        const convPlaced = placeAsset(state.assets, state.cellMap, placeType, x, y, 1);
        if (!convPlaced) return state;
        const assetWithDir = { ...convPlaced.assets[convPlaced.id], direction: dir };
        const newAssetsC = { ...convPlaced.assets, [convPlaced.id]: assetWithDir };
        const newConveyors = { ...state.conveyors, [convPlaced.id]: { queue: [] as ConveyorItem[] } };
        debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y}) facing ${dir}${useConstructionSite ? " as construction site" : ""}`);
        let partialC: GameState;
        if (useConstructionSite) {
          partialC = { ...state, assets: newAssetsC, cellMap: convPlaced.cellMap, conveyors: newConveyors,
            constructionSites: { ...state.constructionSites, [convPlaced.id]: { buildingType: bType, remaining: fullCostAsRemaining(costs) } } };
        } else {
          const consumedC = consumeBuildResources(state, costs as Partial<Record<keyof Inventory, number>>);
          partialC = { ...state, assets: newAssetsC, cellMap: convPlaced.cellMap, inventory: consumedC.inventory, warehouseInventories: consumedC.warehouseInventories, serviceHubs: consumedC.serviceHubs, conveyors: newConveyors };
        }
        const nextState = { ...partialC, connectedAssetIds: computeConnectedAssetIds(partialC) };
        logPlacementInvariantWarnings(nextState, action.type, debugLog);
        return nextState;
      }

      // ---- SPECIAL: Auto Smelter placement with directional 2x1 footprint ----
      if (bType === "auto_smelter") {
        const dir: Direction = action.direction ?? "east";
        const width: 1 | 2 = dir === "east" || dir === "west" ? 2 : 1;
        const height: 1 | 2 = dir === "east" || dir === "west" ? 1 : 2;

        // Footprint validation
        for (let dy = 0; dy < height; dy++) {
          for (let dx = 0; dx < width; dx++) {
            if (x + dx >= GRID_W || y + dy >= GRID_H) {
              return { ...state, notifications: addErrorNotification(state.notifications, "Kein Platz für Auto Smelter.") };
            }
            if (state.cellMap[cellKey(x + dx, y + dy)]) {
              return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
            }
          }
        }

        // Connector-field validation
        const tempAsset: PlacedAsset = { id: "temp", type: "auto_smelter", x, y, size: 2, width, height, direction: dir };
        const io = getAutoSmelterIoCells(tempAsset);
        const inputNeighborId = state.cellMap[cellKey(io.input.x, io.input.y)];
        const outputNeighborId = state.cellMap[cellKey(io.output.x, io.output.y)];
        const inputNeighbor = inputNeighborId ? state.assets[inputNeighborId] : null;
        const outputNeighbor = outputNeighborId ? state.assets[outputNeighborId] : null;
        const beltFound =
          (inputNeighbor?.type === "conveyor" || inputNeighbor?.type === "conveyor_corner") &&
          (outputNeighbor?.type === "conveyor" || outputNeighbor?.type === "conveyor_corner");
        if (import.meta.env.DEV) {
          console.log("[Smelter] Input-Tile:", io.input);
          console.log("[Smelter] Output-Tile:", io.output);
          console.log("[Smelter] Förderband erkannt:", beltFound, {
            inputType: inputNeighbor?.type ?? null,
            outputType: outputNeighbor?.type ?? null,
          });
        }
        if (io.input.x < 0 || io.input.x >= GRID_W || io.input.y < 0 || io.input.y >= GRID_H || io.output.x < 0 || io.output.x >= GRID_W || io.output.y < 0 || io.output.y >= GRID_H) {
          return { ...state, notifications: addErrorNotification(state.notifications, "Input/Output-Felder liegen außerhalb der Karte.") };
        }

        const placed = placeAsset(state.assets, state.cellMap, "auto_smelter", x, y, 2, width, height);
        if (!placed) return state;
        const newAssets = {
          ...placed.assets,
          [placed.id]: {
            ...placed.assets[placed.id],
            direction: dir,
            priority: DEFAULT_MACHINE_PRIORITY,
          },
        };
        const newAutoSmelters = {
          ...state.autoSmelters,
          [placed.id]: {
            inputBuffer: [],
            processing: null,
            pendingOutput: [],
            status: "IDLE" as AutoSmelterStatus,
            lastRecipeInput: null,
            lastRecipeOutput: null,
            throughputEvents: [],
            selectedRecipe: "iron" as const,
          },
        };
        let partialSmelter: GameState;
        if (useConstructionSite) {
          partialSmelter = {
            ...state,
            assets: newAssets,
            cellMap: placed.cellMap,
            autoSmelters: newAutoSmelters,
            placedBuildings: [...state.placedBuildings, bType],
            purchasedBuildings: [...state.purchasedBuildings, bType],
            constructionSites: { ...state.constructionSites, [placed.id]: { buildingType: bType, remaining: fullCostAsRemaining(costs) } },
          };
        } else {
          const newInv = consumeBuildResources(state, costs as Partial<Record<keyof Inventory, number>>);
          partialSmelter = {
            ...state,
            assets: newAssets,
            cellMap: placed.cellMap,
            inventory: newInv.inventory,
            warehouseInventories: newInv.warehouseInventories,
            serviceHubs: newInv.serviceHubs,
            autoSmelters: newAutoSmelters,
            placedBuildings: [...state.placedBuildings, bType],
            purchasedBuildings: [...state.purchasedBuildings, bType],
          };
        }
        const nextState = { ...partialSmelter, connectedAssetIds: computeConnectedAssetIds(partialSmelter) };
        logPlacementInvariantWarnings(nextState, action.type, debugLog);
        return nextState;
      }

      // Workbench is a single manual tool station — exactly one per save,
      // even in DEV. The product rule explicitly forbids a workbench network.
      if (bType === "workbench") {
        const hasWorkbench = Object.values(state.assets).some((a) => a.type === "workbench");
        if (hasWorkbench) {
          return {
            ...state,
            notifications: addErrorNotification(
              state.notifications,
              "Es kann nur eine Werkbank gebaut werden.",
            ),
          };
        }
      }
      // Non-stackable uniqueness check
      const _nonStackableLimit = import.meta.env.DEV ? 100 : 1;
      if (!STACKABLE_BUILDINGS.has(bType) && bType !== "warehouse") {
        const count = state.placedBuildings.filter(b => b === bType).length;
        if (count >= _nonStackableLimit) {
          return { ...state, notifications: addErrorNotification(state.notifications, `${BUILDING_LABELS[bType]} ist bereits platziert.`) };
        }
      }
      if (bType === "warehouse" && state.warehousesPlaced >= (import.meta.env.DEV ? 100 : MAX_WAREHOUSES)) {
        return { ...state, notifications: addErrorNotification(state.notifications, "Maximale Anzahl an Lagerhäusern erreicht.") };
      }

      const bSize = BUILDING_SIZES[bType] ?? 2;
      for (let dy = 0; dy < bSize; dy++) {
        for (let dx = 0; dx < bSize; dx++) {
          if (x + dx >= GRID_W || y + dy >= GRID_H) return state;
          if (state.cellMap[cellKey(x + dx, y + dy)]) return state;
        }
      }

      // Stone floor requirement check
      if (REQUIRES_STONE_FLOOR.has(bType)) {
        for (let dy = 0; dy < bSize; dy++) {
          for (let dx = 0; dx < bSize; dx++) {
            if (!state.floorMap[cellKey(x + dx, y + dy)]) {
              return { ...state, notifications: addErrorNotification(state.notifications, `${BUILDING_LABELS[bType]} benötigt Steinboden unter allen Feldern!`) };
            }
          }
        }
      }

      const placed = placeAsset(state.assets, state.cellMap, bType, x, y, bSize);
      if (!placed) return state;

      // Deduct costs — construction site: drone delivers everything; otherwise consume immediately
      let newInvB = state.inventory;
      let newHubsB = state.serviceHubs;
      let newWarehousesB = state.warehouseInventories;
      let newConstructionSites = state.constructionSites;
      if (useConstructionSite) {
        newConstructionSites = {
          ...state.constructionSites,
          [placed.id]: { buildingType: bType, remaining: fullCostAsRemaining(costs) },
        };
        debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y}) as construction site`);
      } else {
        const consumedB = consumeBuildResources(state, costs as Partial<Record<keyof Inventory, number>>);
        newInvB = consumedB.inventory;
        newHubsB = consumedB.serviceHubs;
        newWarehousesB = consumedB.warehouseInventories;
        debugLog.building(`[BuildMode] Placed ${BUILDING_LABELS[bType]} at (${x},${y})`);
      }

      let partialBuild: GameState =
        bType === "warehouse"
          ? {
            ...state,
            assets: {
              ...placed.assets,
              [placed.id]: {
                ...placed.assets[placed.id],
                direction: action.direction ?? "south",
              },
            },
            cellMap: placed.cellMap,
            inventory: newInvB,
            warehousesPlaced: state.warehousesPlaced + 1,
            warehousesPurchased: state.warehousesPurchased + 1,
            warehouseInventories: {
              ...state.warehouseInventories,
              [placed.id]: createEmptyInventory(),
            },
          }
          : bType === "cable"
            ? { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, cablesPlaced: state.cablesPlaced + 1 }
            : bType === "power_pole"
              ? { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, powerPolesPlaced: state.powerPolesPlaced + 1 }
              : bType === "generator"
                ? { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, generators: { ...state.generators, [placed.id]: { fuel: 0, progress: 0, running: false } } }
                : { ...state, assets: placed.assets, cellMap: placed.cellMap, inventory: newInvB, placedBuildings: [...state.placedBuildings, bType], purchasedBuildings: [...state.purchasedBuildings, bType] };

      // Apply construction site if created
      if (newConstructionSites !== state.constructionSites) {
        partialBuild = { ...partialBuild, constructionSites: newConstructionSites };
      }

      // Apply updated hub inventories (resources consumed from hubs for building)
      if (newHubsB !== state.serviceHubs) {
        partialBuild = { ...partialBuild, serviceHubs: newHubsB };
      }
      // Apply updated warehouse inventories (resources consumed from warehouses for building)
      if (newWarehousesB !== state.warehouseInventories) {
        partialBuild = { ...partialBuild, warehouseInventories: { ...newWarehousesB, ...(partialBuild.warehouseInventories ?? {}) } };
        // Note: spread order preserves any in-place additions (e.g. new warehouse asset above)
        // by overlaying them on top of the consumed map.
      }

      // Auto-assign nearest warehouse source for newly placed crafting buildings
      if (BUILDINGS_WITH_DEFAULT_SOURCE.has(bType)) {
        const nearestWhId = getNearestWarehouseId(partialBuild, x, y);
        if (nearestWhId) {
          partialBuild = {
            ...partialBuild,
            buildingSourceWarehouseIds: { ...partialBuild.buildingSourceWarehouseIds, [placed.id]: nearestWhId },
          };
        }
      }

      // Drohnen-Hub: place as Tier 1 (Proto-Hub).
      // When placed via construction site (drone delivers resources): start with droneIds: []
      // and spawn the first drone when construction completes (in tickOneDrone depositing case).
      // When placed directly (no existing hub): spawn 1 drone immediately.
      if (bType === "service_hub") {
        if (!useConstructionSite) {
          // Direct placement — spawn 1 idle drone for the new hub immediately.
          const newDroneId = `drone-${makeId()}`;
          const hubAssetPos = placed.assets[placed.id];
          const offset = getDroneDockOffset(0);
          const spawnedDrone: StarterDroneState = {
            status: "idle",
            tileX: hubAssetPos.x + offset.dx,
            tileY: hubAssetPos.y + offset.dy,
            targetNodeId: null,
            cargo: null,
            ticksRemaining: 0,
            hubId: placed.id,
            currentTaskType: null,
            deliveryTargetId: null,
            craftingJobId: null,
            droneId: newDroneId,
          };
          partialBuild = {
            ...partialBuild,
            drones: { ...partialBuild.drones, [newDroneId]: spawnedDrone },
            serviceHubs: {
              ...partialBuild.serviceHubs,
              [placed.id]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1, droneIds: [newDroneId] },
            },
          };
          debugLog.building(`[BuildMode] Proto-Hub direkt platziert — Drohne ${newDroneId} auto-gespawnt (hubId: ${placed.id}).`);
        } else {
          // Construction site — drone spawns after Bauabschluss via tickOneDrone.
          partialBuild = {
            ...partialBuild,
            serviceHubs: {
              ...partialBuild.serviceHubs,
              [placed.id]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1, droneIds: [] },
            },
          };
          debugLog.building(`[BuildMode] Proto-Hub als Baustelle platziert — Drohne spawnt nach Fertigstellung (hubId: ${placed.id}).`);
        }
      }

      const nextState = { ...partialBuild, connectedAssetIds: computeConnectedAssetIds(partialBuild) };
      logPlacementInvariantWarnings(nextState, action.type, debugLog);
      return nextState;
    }

    case "BUILD_REMOVE_ASSET": {
      const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
      const removeToolActive =
        state.buildMode || activeHotbarSlot?.toolKind === "building";
      if (!removeToolActive) return state;
      const targetAsset = state.assets[action.assetId];
      if (!targetAsset) return state;
      // Only buildings can be removed via build mode; resources and map_shop are off-limits
      const removableTypes = new Set<string>(["workbench", "warehouse", "smithy", "generator", "cable", "battery", "power_pole", "auto_miner", "conveyor", "conveyor_corner", "manual_assembler", "auto_smelter", "service_hub"]);
      if (!removableTypes.has(targetAsset.type)) return state;
      if (targetAsset.fixed) return state;

      debugLog.building(`[BuildMode] Removed ${ASSET_LABELS[targetAsset.type]} at (${targetAsset.x},${targetAsset.y}) – ~1/3 refund`);
      const removedB = removeAsset(state, action.assetId);
      const bTypeR = targetAsset.type as BuildingType;
      const costsR = BUILDING_COSTS[bTypeR];
      // Only refund building cost when the building was NOT placed via construction site
      // (player never paid resources for construction site buildings — the drone delivers them).
      const isStillConstructionSite = !!state.constructionSites?.[action.assetId];
      const refundMap: Partial<Record<keyof Inventory, number>> = {};
      if (!isStillConstructionSite) {
        for (const [res, amt] of Object.entries(costsR)) {
          refundMap[res as keyof Inventory] = Math.max(1, Math.floor((amt ?? 0) / 3));
        }
      }
      const newInvR = addResources(state.inventory, refundMap);

      let partialRemove: GameState;
      if (bTypeR === "warehouse") {
        const newWarehouseInventories = { ...state.warehouseInventories };
        delete newWarehouseInventories[action.assetId];
        // Reassign affected building→warehouse mappings to nearest remaining warehouse (or drop → global)
        const stateForReassign: GameState = { ...state, warehouseInventories: newWarehouseInventories };
        const reassignedSources = reassignBuildingSourceIds(state.buildingSourceWarehouseIds, stateForReassign, action.assetId);
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          warehousesPlaced: state.warehousesPlaced - 1,
          warehousesPurchased: state.warehousesPurchased - 1,
          warehouseInventories: newWarehouseInventories,
          buildingSourceWarehouseIds: reassignedSources,
          selectedWarehouseId: state.selectedWarehouseId === action.assetId ? null : state.selectedWarehouseId,
          openPanel: null as UIPanel,
        };
      } else if (bTypeR === "cable") {
        partialRemove = { ...state, ...removedB, inventory: newInvR, cablesPlaced: state.cablesPlaced - 1, openPanel: null as UIPanel };
      } else if (bTypeR === "power_pole") {
        partialRemove = { ...state, ...removedB, inventory: newInvR, powerPolesPlaced: state.powerPolesPlaced - 1, openPanel: null as UIPanel, selectedPowerPoleId: null };
      } else if (bTypeR === "auto_miner") {
        const minerState = state.autoMiners[action.assetId];
        const newAutoMiners = { ...state.autoMiners };
        delete newAutoMiners[action.assetId];
        // Restore deposit cell in cellMap
        const restoredCellMap = minerState
          ? { ...removedB.cellMap, [cellKey(targetAsset.x, targetAsset.y)]: minerState.depositId }
          : removedB.cellMap;
        partialRemove = {
          ...state,
          ...removedB,
          cellMap: restoredCellMap,
          inventory: newInvR,
          autoMiners: newAutoMiners,
          openPanel: null as UIPanel,
          selectedAutoMinerId: null,
        };
      } else if (bTypeR === "conveyor" || bTypeR === "conveyor_corner") {
        const newConveyors = { ...state.conveyors };
        delete newConveyors[action.assetId];
        partialRemove = { ...state, ...removedB, inventory: newInvR, conveyors: newConveyors, openPanel: null as UIPanel };
      } else if (bTypeR === "generator") {
        const newGenerators = { ...state.generators };
        delete newGenerators[action.assetId];
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          generators: newGenerators,
          selectedGeneratorId: state.selectedGeneratorId === action.assetId ? null : state.selectedGeneratorId,
          openPanel: null as UIPanel,
        };
      } else if (bTypeR === "manual_assembler") {
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
          purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
          openPanel: null as UIPanel,
          manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
        };
      } else if (bTypeR === "auto_smelter") {
        const newAutoSmelters = { ...state.autoSmelters };
        delete newAutoSmelters[action.assetId];
        partialRemove = {
          ...state,
          ...removedB,
          inventory: newInvR,
          autoSmelters: newAutoSmelters,
          selectedAutoSmelterId: state.selectedAutoSmelterId === action.assetId ? null : state.selectedAutoSmelterId,
          placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
          purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
          openPanel: null as UIPanel,
        };
      } else if (bTypeR === "service_hub") {
        // Release the drone: fall back to start module delivery
        const droneAfterRemoval = state.starterDrone.hubId === action.assetId
          ? { ...state.starterDrone, hubId: null, status: "idle" as DroneStatus, targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null as DroneTaskType | null, deliveryTargetId: null as string | null, craftingJobId: null, droneId: state.starterDrone.droneId }
          : state.starterDrone;
        // Transfer hub inventory back into global inventory
        const hubEntry = state.serviceHubs[action.assetId];
        const invAfterHubRemoval = hubEntry
          ? addResources(newInvR, hubEntry.inventory)
          : newInvR;
        const { [action.assetId]: _hubRemoved, ...remainingHubs } = state.serviceHubs;
        partialRemove = {
          ...state,
          ...removedB,
          inventory: invAfterHubRemoval,
          placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR),
          purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR),
          openPanel: null as UIPanel,
          starterDrone: droneAfterRemoval,
          serviceHubs: remainingHubs,
        };
      } else {
        partialRemove = { ...state, ...removedB, inventory: newInvR, placedBuildings: state.placedBuildings.filter((b) => b !== bTypeR), purchasedBuildings: state.purchasedBuildings.filter((b) => b !== bTypeR), openPanel: null as UIPanel };
      }
      // Clean up zone assignment for the removed building
      if (partialRemove.buildingZoneIds[action.assetId]) {
        const { [action.assetId]: _z, ...restZoneIds } = partialRemove.buildingZoneIds;
        partialRemove = { ...partialRemove, buildingZoneIds: restZoneIds };
      }
      // Clean up construction site and refund delivered resources
      if (partialRemove.constructionSites?.[action.assetId]) {
        const site = partialRemove.constructionSites[action.assetId];
        // Refund resources that were already delivered (total cost - remaining)
        const totalCost = BUILDING_COSTS[site.buildingType];
        const deliveredRefund: Partial<Record<keyof Inventory, number>> = {};
        for (const [res, totalAmt] of Object.entries(totalCost)) {
          const rem = site.remaining[res as CollectableItemType] ?? 0;
          const delivered = (totalAmt ?? 0) - rem;
          if (delivered > 0) {
            deliveredRefund[res as keyof Inventory] = Math.max(1, Math.floor(delivered / 3));
          }
        }
        const invAfterSiteRefund = addResources(partialRemove.inventory, deliveredRefund);
        const { [action.assetId]: _site, ...restSites } = partialRemove.constructionSites;
        partialRemove = { ...partialRemove, constructionSites: restSites, inventory: invAfterSiteRefund };
      }
      // If the drone was delivering to this removed asset, reset it
      if (state.starterDrone?.deliveryTargetId === action.assetId && partialRemove.starterDrone.status !== "idle") {
        partialRemove = {
          ...partialRemove,
          starterDrone: { ...partialRemove.starterDrone, status: "idle" as DroneStatus, targetNodeId: null, cargo: null, ticksRemaining: 0, currentTaskType: null, deliveryTargetId: null, craftingJobId: null, droneId: partialRemove.starterDrone.droneId },
        };
      }
      const nextState = { ...partialRemove, connectedAssetIds: computeConnectedAssetIds(partialRemove) };
      logPlacementInvariantWarnings(nextState, action.type, debugLog);
      return nextState;
    }

    default:
      return null;
  }
}

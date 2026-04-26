import type { GameAction } from "../../actions";
import type {
  AssetType,
  AutoSmelterStatus,
  ConveyorItem,
  Direction,
  GameState,
  Inventory,
  PlacedAsset,
  StarterDroneState,
} from "../../types";
import { GRID_W, GRID_H } from "../../../constants/grid";
import {
  BUILDING_COSTS,
  BUILDING_LABELS,
  BUILDING_SIZES,
  BUILDINGS_WITH_DEFAULT_SOURCE,
  CONSTRUCTION_SITE_BUILDINGS,
  MAX_WAREHOUSES,
  REQUIRES_STONE_FLOOR,
  STACKABLE_BUILDINGS,
} from "../../constants/buildings";
import { DEPOSIT_RESOURCE, DEPOSIT_TYPES } from "../../constants/deposit-positions";
import { DEFAULT_MACHINE_PRIORITY } from "../../constants/energy/energy-balance";
import { createDefaultProtoHubTargetStock } from "../../constants/hub/hub-target-stock";
import { cellKey } from "../../cell-key";
import { getAutoSmelterIoCells } from "../../asset-geometry";
import { placeAsset } from "../../asset-mutation";
import {
  consumeBuildResources,
  costIsFullyCollectable,
  createEmptyInventory,
  fullCostAsRemaining,
  getEffectiveBuildInventory,
  hasResources,
} from "../../inventory-ops";
import { decideBuildingPlacementEligibility } from "../../build-placement-eligibility";
import type { BuildPlacementEligibilityDecision } from "../../build-placement-eligibility";
import { decideAutoMinerPlacementEligibility } from "../../build-auto-miner-placement-eligibility";
import { getNearestWarehouseId } from "../../../buildings/warehouse/warehouse-assignment";
import { createEmptyHubInventory } from "../../../buildings/service-hub/hub-upgrade-workflow";
import { getDroneDockOffset } from "../../../drones/drone-dock-geometry";
import { computeConnectedAssetIds } from "../../../logistics/connectivity";
import {
  type BuildingPlacementIoDeps,
  logPlacementInvariantWarnings,
} from "./shared";

function getBuildPlacementNotificationForDecision(
  blockReason: Extract<BuildPlacementEligibilityDecision, { kind: "blocked" }>['blockReason'],
  buildingLabel: string,
): string | null {
  if (blockReason === "not_enough_resources") {
    return "Nicht genug Ressourcen!";
  }
  if (blockReason === "workbench_already_exists") {
    return "Es kann nur eine Werkbank gebaut werden.";
  }
  if (blockReason === "non_stackable_limit_reached") {
    return `${buildingLabel} ist bereits platziert.`;
  }
  if (blockReason === "warehouse_limit_reached") {
    return "Maximale Anzahl an Lagerhäusern erreicht.";
  }
  if (blockReason === "missing_stone_floor") {
    return `${buildingLabel} benötigt Steinboden unter allen Feldern!`;
  }

  // Out-of-bounds/collision remain silent no-op paths for standard placements.
  return null;
}

function getAutoSmelterFootprintDimensions(
  dir: Direction,
): { width: 1 | 2; height: 1 | 2 } {
  return dir === "east" || dir === "west"
    ? { width: 2, height: 1 }
    : { width: 1, height: 2 };
}

export function handlePlaceBuildingAction(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_PLACE_BUILDING" }>,
  deps: BuildingPlacementIoDeps,
): GameState {
  const { makeId, addErrorNotification, debugLog } = deps;

  type AutoSmelterFootprintEligibilityDecision =
    | { kind: "eligible" }
    | { kind: "blocked"; blockReason: "out_of_bounds" | "cell_occupied" };

  type AutoSmelterConnectorPreflight = {
    ioCells: {
      input: { x: number; y: number };
      output: { x: number; y: number };
    };
    neighborTypes: {
      inputType: AssetType | null;
      outputType: AssetType | null;
      inputIsConveyor: boolean;
      outputIsConveyor: boolean;
    };
    beltFound: boolean;
    ioOutOfBounds: boolean;
  };

  const checkAutoSmelterFootprintEligibility = (input: {
    x: number;
    y: number;
    width: 1 | 2;
    height: 1 | 2;
    dir: Direction;
    cellMap: Record<string, string>;
  }): AutoSmelterFootprintEligibilityDecision => {
    const { x, y, width, height, dir, cellMap } = input;
    void dir;

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        if (x + dx >= GRID_W || y + dy >= GRID_H) {
          return { kind: "blocked", blockReason: "out_of_bounds" };
        }
        if (cellMap[cellKey(x + dx, y + dy)]) {
          return { kind: "blocked", blockReason: "cell_occupied" };
        }
      }
    }

    return { kind: "eligible" };
  };

  const computeAutoSmelterConnectorPreflight = (input: {
    x: number;
    y: number;
    width: 1 | 2;
    height: 1 | 2;
    dir: Direction;
    cellMap: Record<string, string>;
    assets: Record<string, PlacedAsset>;
  }): AutoSmelterConnectorPreflight => {
    const { x, y, width, height, dir, cellMap, assets } = input;
    const tempAsset: PlacedAsset = { id: "temp", type: "auto_smelter", x, y, size: 2, width, height, direction: dir };
    const io = getAutoSmelterIoCells(tempAsset);
    const inputNeighborId = cellMap[cellKey(io.input.x, io.input.y)];
    const outputNeighborId = cellMap[cellKey(io.output.x, io.output.y)];
    const inputNeighbor = inputNeighborId ? assets[inputNeighborId] : null;
    const outputNeighbor = outputNeighborId ? assets[outputNeighborId] : null;
    const inputType = inputNeighbor?.type ?? null;
    const outputType = outputNeighbor?.type ?? null;
    const inputIsConveyor = inputType === "conveyor" || inputType === "conveyor_corner";
    const outputIsConveyor = outputType === "conveyor" || outputType === "conveyor_corner";

    return {
      ioCells: io,
      neighborTypes: {
        inputType,
        outputType,
        inputIsConveyor,
        outputIsConveyor,
      },
      beltFound: inputIsConveyor && outputIsConveyor,
      ioOutOfBounds:
        io.input.x < 0 ||
        io.input.x >= GRID_W ||
        io.input.y < 0 ||
        io.input.y >= GRID_H ||
        io.output.x < 0 ||
        io.output.x >= GRID_W ||
        io.output.y < 0 ||
        io.output.y >= GRID_H,
    };
  };

  const activeHotbarSlot = state.hotbarSlots[state.activeSlot];
  const hotbarBuildingType =
    activeHotbarSlot?.toolKind === "building"
      ? activeHotbarSlot.buildingType ?? null
      : null;
  const bType = state.buildMode ? state.selectedBuildingType : hotbarBuildingType;
  if (!bType) return state;
  const { x, y } = action;
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return state;

  // Cost + generic placement eligibility check
  const costs = BUILDING_COSTS[bType];
  // Construction site eligibility: building supports it AND a service hub exists.
  // Eligible buildings ALWAYS go through construction-site flow (drone supplies resources).
  const hasActiveHub = Object.values(state.assets).some((a) => a.type === "service_hub");
  const useConstructionSite = CONSTRUCTION_SITE_BUILDINGS.has(bType) && hasActiveHub
    && costIsFullyCollectable(costs);

  const bSize = BUILDING_SIZES[bType] ?? 2;
  const runStandardPlacementChecks =
    bType !== "auto_miner" &&
    bType !== "conveyor" &&
    bType !== "conveyor_corner" &&
    bType !== "auto_smelter";
  const eligibilityDecision = decideBuildingPlacementEligibility({
    buildingType: bType,
    hasEnoughResources:
      useConstructionSite ||
      hasResources(getEffectiveBuildInventory(state), costs as Partial<Record<keyof Inventory, number>>),
    hasWorkbenchPlaced: Object.values(state.assets).some((a) => a.type === "workbench"),
    isStackableBuilding: STACKABLE_BUILDINGS.has(bType),
    placedBuildingCountOfType: state.placedBuildings.filter((b) => b === bType).length,
    nonStackableLimit: import.meta.env.DEV ? 100 : 1,
    warehousesPlaced: state.warehousesPlaced,
    warehouseLimit: import.meta.env.DEV ? 100 : MAX_WAREHOUSES,
    requiresStoneFloor: REQUIRES_STONE_FLOOR.has(bType),
    runStandardPlacementChecks,
    x,
    y,
    footprintSize: bSize,
    gridWidth: GRID_W,
    gridHeight: GRID_H,
    cellMap: state.cellMap,
    floorMap: state.floorMap,
  });
  if (eligibilityDecision.kind === "blocked") {
    const notification = getBuildPlacementNotificationForDecision(
      eligibilityDecision.blockReason,
      BUILDING_LABELS[bType],
    );
    if (!notification) return state;
    return {
      ...state,
      notifications: addErrorNotification(state.notifications, notification),
    };
  }

  // ---- SPECIAL: Auto-Miner placement on deposit ----
  if (bType === "auto_miner") {
    const autoMinerEligibilityDecision = decideAutoMinerPlacementEligibility({
      x,
      y,
      cellMap: state.cellMap,
      assets: state.assets,
      autoMiners: state.autoMiners,
      depositTypes: DEPOSIT_TYPES,
    });
    if (autoMinerEligibilityDecision.kind === "blocked") {
      if (autoMinerEligibilityDecision.blockReason === "deposit_already_has_auto_miner") {
        return {
          ...state,
          notifications: addErrorNotification(
            state.notifications,
            "Dieses Vorkommen hat bereits einen Auto-Miner.",
          ),
        };
      }
      return { ...state, notifications: addErrorNotification(state.notifications, "Auto-Miner kann nur auf einem Ressourcenvorkommen platziert werden.") };
    }

    const depositAssetId = state.cellMap[cellKey(x, y)];
    const depositAsset = state.assets[depositAssetId];
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
    const { width, height } = getAutoSmelterFootprintDimensions(dir);

    // Footprint validation
    const footprintEligibilityDecision = checkAutoSmelterFootprintEligibility({
      x,
      y,
      width,
      height,
      dir,
      cellMap: state.cellMap,
    });
    if (footprintEligibilityDecision.kind === "blocked") {
      if (footprintEligibilityDecision.blockReason === "out_of_bounds") {
        return { ...state, notifications: addErrorNotification(state.notifications, "Kein Platz für Auto Smelter.") };
      }
      return { ...state, notifications: addErrorNotification(state.notifications, "Das Feld ist belegt.") };
    }

    // Connector-field validation
    const connectorPreflight = computeAutoSmelterConnectorPreflight({
      x,
      y,
      width,
      height,
      dir,
      cellMap: state.cellMap,
      assets: state.assets,
    });
    if (import.meta.env.DEV) {
      console.log("[Smelter] Input-Tile:", connectorPreflight.ioCells.input);
      console.log("[Smelter] Output-Tile:", connectorPreflight.ioCells.output);
      console.log("[Smelter] Förderband erkannt:", connectorPreflight.beltFound, {
        inputType: connectorPreflight.neighborTypes.inputType,
        outputType: connectorPreflight.neighborTypes.outputType,
      });
    }
    if (connectorPreflight.ioOutOfBounds) {
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

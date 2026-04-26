// ============================================================
// INITIAL STATE
// Extracted from reducer.ts (Phase 4.5.2). Behavior unchanged.
// ============================================================

import { GRID_W, GRID_H } from "../constants/grid";
import { DEPOSIT_POSITIONS } from "./constants/deposit-positions";
import {
  decideInitialWarehousePlacement,
  deriveDebugBootstrapLayout,
} from "./helpers/initialState";
import { computeConnectedAssetIds } from "../logistics/connectivity";
import { createEmptyHubInventory } from "../buildings/service-hub/hub-upgrade-workflow";
import { createEmptyNetworkSlice } from "../inventory/reservationTypes";
import { createEmptyCraftingQueue } from "../crafting/queue";
import { createInitialHotbar } from "./helpers/hotbar";
import type {
  AssetType,
  AutoMinerEntry,
  AutoSmelterEntry,
  ConveyorState,
  Direction,
  GameMode,
  GameState,
  GeneratorState,
  HubTier,
  Inventory,
  PlacedAsset,
  StarterDroneState,
} from "./types";
import {
  BATTERY_CAPACITY,
  DEFAULT_MACHINE_PRIORITY,
  MAP_SHOP_POS,
  assetHeight,
  assetWidth,
  cellKey,
  createDefaultProtoHubTargetStock,
  createEmptyInventory,
  getAutoSmelterIoCells,
  isEnergyConsumerType,
  makeId,
  placeAsset,
  withDefaultMachinePriority,
} from "./reducer";

export function createInitialState(mode: GameMode): GameState {
  const assets: Record<string, PlacedAsset> = {};
  const cellMap: Record<string, string> = {};

  function tryPlace(type: AssetType, x: number, y: number, size: 1 | 2, fixed?: boolean): string | undefined {
    if (x + size > GRID_W || y + size > GRID_H) return;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (cellMap[cellKey(x + dx, y + dy)]) return;
      }
    }
    const id = makeId();
    assets[id] = {
      id,
      type,
      x,
      y,
      size,
      ...(fixed ? { fixed: true } : {}),
      ...withDefaultMachinePriority(type),
    } as PlacedAsset;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        cellMap[cellKey(x + dx, y + dy)] = id;
      }
    }
    return id;
  }

  // Place fixed map shop (2x2) near center
  tryPlace("map_shop", MAP_SHOP_POS.x, MAP_SHOP_POS.y, 2, true);

  // Place fixed proto-hub (2x2) next to map shop
  const protoHubId = tryPlace("service_hub", MAP_SHOP_POS.x + 3, MAP_SHOP_POS.y, 2, true);

  // Place fixed 2\u00d72 resource deposits at predetermined positions
  for (const dp of DEPOSIT_POSITIONS) {
    tryPlace(dp.type, dp.x, dp.y, 2, true);
  }

  // Place starting warehouse (2x2) at the nearest free spot within 10 cells of map_shop
  {
    const warehousePlacement = decideInitialWarehousePlacement({
      shopX: MAP_SHOP_POS.x,
      shopY: MAP_SHOP_POS.y,
      gridWidth: GRID_W,
      gridHeight: GRID_H,
      cellMap,
    });
    if (warehousePlacement) {
      tryPlace("warehouse", warehousePlacement.x, warehousePlacement.y, 2);
    }
  }

  // Place resources randomly
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("tree", x, y, 1);
  }
  for (let i = 0; i < 20; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("stone", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("iron", x, y, 1);
  }
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    tryPlace("copper", x, y, 1);
  }

  const isDebug = mode === "debug";
  const floorMap: Record<string, "stone_floor"> = {};
  const autoMiners: Record<string, AutoMinerEntry> = {};
  const conveyors: Record<string, ConveyorState> = {};
  const autoSmelters: Record<string, AutoSmelterEntry> = {};
  let selectedPowerPoleId: string | null = null;

  function removeNonFixedAssetAtCell(x: number, y: number) {
    const id = cellMap[cellKey(x, y)];
    if (!id) return;
    const a = assets[id];
    if (!a || a.fixed) return;
    delete assets[id];
    for (let dy = 0; dy < assetHeight(a); dy++) {
      for (let dx = 0; dx < assetWidth(a); dx++) {
        const k = cellKey(a.x + dx, a.y + dy);
        if (cellMap[k] === id) delete cellMap[k];
      }
    }
  }

  function clearAreaForDebug(x: number, y: number, size: 1 | 2) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        removeNonFixedAssetAtCell(x + dx, y + dy);
      }
    }
  }

  function placeDirectedForDebug(type: AssetType, x: number, y: number, direction: Direction) {
    clearAreaForDebug(x, y, 1);
    const placedId = tryPlace(type, x, y, 1);
    if (!placedId) return null;
    assets[placedId] = { ...assets[placedId], direction };
    return placedId;
  }

  if (isDebug) {
    // Deterministisches Debug-Setup:
    // Auto-Miner (Eisen) -> 3 Förderbänder -> Auto Smelter -> 3 Förderbänder -> Lagerhaus,
    // plus 2 Generatoren + Stromknoten für stabile Vollversorgung.
    const ironDeposit = Object.values(assets).find((a) => a.type === "iron_deposit") ?? null;
    if (ironDeposit) {
      const {
        minerPos,
        autoSmelterPos,
        warehousePos,
        generatorA,
        generatorB,
        polePositions,
        inputBelts,
        outputBelts,
      } = deriveDebugBootstrapLayout({
        ironDepositX: ironDeposit.x,
        ironDepositY: ironDeposit.y,
        gridWidth: GRID_W,
        gridHeight: GRID_H,
      });

      clearAreaForDebug(warehousePos.x, warehousePos.y, 2);
      clearAreaForDebug(autoSmelterPos.x, autoSmelterPos.y, 2);
      clearAreaForDebug(generatorA.x, generatorA.y, 2);
      clearAreaForDebug(generatorB.x, generatorB.y, 2);
      for (const p of polePositions) clearAreaForDebug(p.x, p.y, 1);
      for (const belt of [...inputBelts, ...outputBelts]) clearAreaForDebug(belt.x, belt.y, 1);

      for (const g of [generatorA, generatorB]) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            floorMap[cellKey(g.x + dx, g.y + dy)] = "stone_floor";
          }
        }
      }

      tryPlace("warehouse", warehousePos.x, warehousePos.y, 2);
      tryPlace("generator", generatorA.x, generatorA.y, 2);
      tryPlace("generator", generatorB.x, generatorB.y, 2);

      for (const p of polePositions) {
        const poleId = placeDirectedForDebug("power_pole", p.x, p.y, "north");
        if (!selectedPowerPoleId && poleId) selectedPowerPoleId = poleId;
      }

      const depositCellId = cellMap[cellKey(minerPos.x, minerPos.y)];
      const depositAsset = depositCellId ? assets[depositCellId] : null;
      let minerId: string | null = null;
      if (depositAsset && depositAsset.type === "iron_deposit") {
        minerId = makeId();
        assets[minerId] = {
          id: minerId,
          type: "auto_miner",
          x: minerPos.x,
          y: minerPos.y,
          size: 1,
          direction: minerPos.dir,
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        cellMap[cellKey(minerPos.x, minerPos.y)] = minerId;
        autoMiners[minerId] = {
          depositId: depositCellId,
          resource: "iron",
          progress: 0,
        };
      }

      for (const belt of [...inputBelts, ...outputBelts]) {
        const convId = placeDirectedForDebug("conveyor", belt.x, belt.y, belt.dir);
        if (convId) conveyors[convId] = { queue: [] };
      }

      const smelterPlaced = placeAsset(assets, cellMap, "auto_smelter", autoSmelterPos.x, autoSmelterPos.y, 2, 2, 1);
      if (smelterPlaced) {
        Object.assign(assets, smelterPlaced.assets);
        assets[smelterPlaced.id] = {
          ...smelterPlaced.assets[smelterPlaced.id],
          direction: "west",
          priority: DEFAULT_MACHINE_PRIORITY,
        };
        for (const [k, v] of Object.entries(smelterPlaced.cellMap)) {
          cellMap[k] = v;
        }
        autoSmelters[smelterPlaced.id] = {
          inputBuffer: [],
          processing: null,
          pendingOutput: [],
          status: "IDLE",
          lastRecipeInput: null,
          lastRecipeOutput: null,
          throughputEvents: [],
          selectedRecipe: "iron",
        };

        const io = getAutoSmelterIoCells(assets[smelterPlaced.id]);
        const inputNeighborId = cellMap[cellKey(io.input.x, io.input.y)];
        const outputNeighborId = cellMap[cellKey(io.output.x, io.output.y)];
        const inputNeighbor = inputNeighborId ? assets[inputNeighborId] : null;
        const outputNeighbor = outputNeighborId ? assets[outputNeighborId] : null;
        const beltFound =
          (inputNeighbor?.type === "conveyor" || inputNeighbor?.type === "conveyor_corner") &&
          (outputNeighbor?.type === "conveyor" || outputNeighbor?.type === "conveyor_corner");

        console.log("[DebugSetup] Auto-Miner:", minerId ? assets[minerId] : null);
        console.log("[DebugSetup] Auto-Smelter:", assets[smelterPlaced.id]);
        console.log("[DebugSetup] Lagerhaus:", Object.values(assets).find((a) => a.type === "warehouse"));
        console.log("[DebugSetup] Generator A:", generatorA, "Generator B:", generatorB);
        console.log("[DebugSetup] Smelter Input-Tile:", io.input);
        console.log("[DebugSetup] Smelter Output-Tile:", io.output);
        console.log("[DebugSetup] Förderbänder korrekt erkannt:", beltFound, {
          inputType: inputNeighbor?.type ?? null,
          outputType: outputNeighbor?.type ?? null,
        });
        console.log("[DebugSetup] Miner -> Input-Band verbunden:", {
          minerOutputTile: { x: minerPos.x - 1, y: minerPos.y },
          inputTile: io.input,
          connected: minerPos.x - 1 === inputBelts[0].x && minerPos.y === inputBelts[0].y,
        });
      }

    }
  }

  // Build per-instance generator state; debug mode pre-fuels all generators and starts them.
  const generators: Record<string, GeneratorState> = {};
  for (const asset of Object.values(assets)) {
    if (asset.type === "generator") {
      generators[asset.id] = isDebug
        ? { fuel: 500, progress: 0, running: true }
        : { fuel: 0, progress: 0, running: false };
    }
  }

  const inventory: Inventory = {
    ...createEmptyInventory(),
    // Start with no resources in debug mode – use the Debug Panel (999 per click) to add them.
    // In normal mode, give the player a small coin starting grant only.
    ...(isDebug ? { coins: 99999 } : { coins: 1000 }),
  };

  const warehouseInventories: Record<string, Inventory> = {};
  for (const a of Object.values(assets)) {
    if (a.type === "warehouse") {
      warehouseInventories[a.id] = createEmptyInventory();
    }
  }

  const hotbar = createInitialHotbar();
  // No pre-filled debug hotbar – tools come from Debug Panel → warehouse → hotbar.
  const warehouseCount = Object.values(assets).filter((a) => a.type === "warehouse").length;
  const powerPoleCount = Object.values(assets).filter((a) => a.type === "power_pole").length;
  const hasGenerator = Object.values(assets).some((a) => a.type === "generator");
  const connectedAssetIds = computeConnectedAssetIds({ assets, cellMap, constructionSites: {} });
  const anyGeneratorRunning = Object.values(generators).some((g) => g.running);
  const poweredMachineIds = anyGeneratorRunning
    ? connectedAssetIds.filter((id) => {
        const a = assets[id];
        return !!a && isEnergyConsumerType(a.type);
      })
    : [];

  const initial: GameState = {
    mode,
    assets,
    cellMap,
    inventory,
    purchasedBuildings: hasGenerator ? ["generator"] : [],
    placedBuildings: hasGenerator ? ["generator"] : [],
    warehousesPurchased: warehouseCount,
    warehousesPlaced: warehouseCount,
    warehouseInventories,
    selectedWarehouseId: null,
    cablesPlaced: 0,
    powerPolesPlaced: powerPoleCount,
    selectedPowerPoleId,
    hotbarSlots: hotbar,
    activeSlot: 0,
    smithy: { fuel: 0, iron: 0, copper: 0, selectedRecipe: "iron", processing: false, progress: 0, outputIngots: 0, outputCopperIngots: 0, buildingId: null },
    generators,
    battery: { stored: 0, capacity: BATTERY_CAPACITY },
    connectedAssetIds,
    poweredMachineIds,
    openPanel: null,
    notifications: [],
    saplingGrowAt: {},
    buildMode: false,
    selectedBuildingType: null,
    selectedFloorTile: null,
    floorMap,
    autoMiners,
    conveyors,
    selectedAutoMinerId: null,
    autoSmelters,
    selectedAutoSmelterId: null,
    selectedGeneratorId: null,
    selectedServiceHubId: null,
    manualAssembler: { processing: false, recipe: null, progress: 0, buildingId: null },
    machinePowerRatio: {},
    energyDebugOverlay: false,
    autoDeliveryLog: [],
    buildingSourceWarehouseIds: {},
    productionZones: {},
    buildingZoneIds: {},
    selectedCraftingBuildingId: null,
    collectionNodes: {},
    starterDrone: {
      status: "idle",
      tileX: protoHubId ? MAP_SHOP_POS.x + 3 : MAP_SHOP_POS.x,
      tileY: MAP_SHOP_POS.y,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId: protoHubId ?? null,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId: "starter",
    },
    drones: {} as Record<string, StarterDroneState>,
    serviceHubs: protoHubId
      ? { [protoHubId]: { inventory: createEmptyHubInventory(), targetStock: createDefaultProtoHubTargetStock(), tier: 1 as HubTier, droneIds: ["starter"] } }
      : {},
    constructionSites: {},
    network: createEmptyNetworkSlice(),
    crafting: createEmptyCraftingQueue(),
    keepStockByWorkbench: {},
    recipeAutomationPolicies: {},
  };
  // Ensure drones record is pre-populated with the starter drone
  initial.drones = { starter: initial.starterDrone };
  return initial;
}

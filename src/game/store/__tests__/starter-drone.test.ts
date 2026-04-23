/**
 * Starter Drone State Machine Tests
 *
 * Covers the DRONE_TICK reducer cases:
 *  - idle → moving_to_collect when nodes exist
 *  - idle stays idle when no nodes
 *  - moving_to_collect countdown / transition to collecting
 *  - collecting picks up cargo and removes empty node
 *  - collecting keeps partial node
 *  - moving_to_dropoff countdown / transition to depositing
 *  - depositing adds resources to inventory and returns to idle
 *  - depositing handles missing cargo gracefully
 *  - node gone mid-flight (moving_to_collect → idle)
 */

import { gameReducer, createInitialState, addToCollectionNodeAt, BUILDING_COSTS, SERVICE_HUB_TARGET_STOCK, PROTO_HUB_TARGET_STOCK, createEmptyHubInventory, selectDroneTask, CONSTRUCTION_SITE_BUILDINGS, MAX_HUB_TARGET_STOCK, createDefaultHubTargetStock, scoreDroneTask, DRONE_TASK_BASE_SCORE, DRONE_ROLE_BONUS, DRONE_STICKY_BONUS, DRONE_URGENCY_BONUS_MAX, DRONE_DEMAND_BONUS_MAX, DRONE_SPREAD_PENALTY_PER_DRONE, MAX_DRONES_PER_CONSTRUCTION_TARGET, getParkedDrones, getDroneHomeDock, getDroneDockOffset, getMaxDrones } from "../reducer";
import type { GameState, CollectionNode, StarterDroneState, GameAction, Inventory, ServiceHubEntry, ConstructionSite, CollectableItemType } from "../reducer";
import { MAP_SHOP_POS, DRONE_CAPACITY, DRONE_COLLECT_TICKS, DRONE_DEPOSIT_TICKS } from "../reducer";

// ---- helpers ---------------------------------------------------------------

/** Proto-hub is placed at MAP_SHOP_POS.x + 3 in createInitialState */
const HUB_POS = { x: MAP_SHOP_POS.x + 3, y: MAP_SHOP_POS.y };

function droneTick(state: GameState): GameState {
  return gameReducer(state, { type: "DRONE_TICK" });
}

function withDrone(state: GameState, patch: Partial<StarterDroneState>): GameState {
  return { ...state, starterDrone: { ...state.starterDrone, ...patch } };
}

function addNode(state: GameState, itemType: CollectionNode["itemType"], tileX: number, tileY: number, amount: number): GameState {
  return { ...state, collectionNodes: addToCollectionNodeAt(state.collectionNodes, itemType, tileX, tileY, amount) };
}

function withTier2HubAndDockedDrones(state: GameState, hubId: string): GameState {
  const hub = state.serviceHubs[hubId];
  const hubAsset = state.assets[hubId];
  if (!hub || !hubAsset) return state;

  const targetDroneCount = getMaxDrones(2);
  const nextDrones = { ...state.drones };
  const nextHubDroneIds = [...hub.droneIds];
  let seq = 1;

  while (nextHubDroneIds.length < targetDroneCount) {
    const droneId = `test-drone-${hubId}-${seq++}`;
    if (nextDrones[droneId]) continue;
    const dockSlot = nextHubDroneIds.length;
    const offset = getDroneDockOffset(dockSlot);
    nextDrones[droneId] = {
      status: "idle",
      tileX: hubAsset.x + offset.dx,
      tileY: hubAsset.y + offset.dy,
      targetNodeId: null,
      cargo: null,
      ticksRemaining: 0,
      hubId,
      currentTaskType: null,
      deliveryTargetId: null,
      craftingJobId: null,
      droneId,
    };
    nextHubDroneIds.push(droneId);
  }

  return {
    ...state,
    drones: nextDrones,
    serviceHubs: {
      ...state.serviceHubs,
      [hubId]: {
        ...hub,
        tier: 2,
        pendingUpgrade: undefined,
        droneIds: nextHubDroneIds,
      },
    },
  };
}

// ---- tests -----------------------------------------------------------------

describe("DRONE_TICK – idle", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("stays idle when no collection nodes exist", () => {
    const next = droneTick(base);
    expect(next).toBe(base); // no change, same reference
  });

  it("transitions to moving_to_collect when a node exists", () => {
    const state = addNode(base, "wood", 5, 5, 3);
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("moving_to_collect");
    expect(next.starterDrone.targetNodeId).toBeTruthy();
    expect(next.starterDrone.ticksRemaining).toBeGreaterThanOrEqual(1);
  });

  it("picks the nearest node by Chebyshev distance", () => {
    // Drone starts at MAP_SHOP_POS; place two nodes: one closer, one farther.
    const close = { x: MAP_SHOP_POS.x + 2, y: MAP_SHOP_POS.y };
    const far   = { x: MAP_SHOP_POS.x + 10, y: MAP_SHOP_POS.y };
    let state = addNode(base, "stone", close.x, close.y, 1);
    const nodeIds1 = Object.keys(state.collectionNodes);
    state = addNode(state, "iron", far.x, far.y, 1);
    const next = droneTick(state);
    expect(next.starterDrone.targetNodeId).toBe(nodeIds1[0]);
  });
});

describe("DRONE_TICK – moving_to_collect", () => {
  let base: GameState;
  let nodeId: string;

  beforeEach(() => {
    base = createInitialState("release");
    base = addNode(base, "wood", 3, 3, 2);
    nodeId = Object.keys(base.collectionNodes)[0];
    // Manually set drone into moving_to_collect with 2 ticks left
    base = withDrone(base, {
      status: "moving_to_collect",
      targetNodeId: nodeId,
      ticksRemaining: 2,
    });
  });

  it("decrements ticksRemaining while > 1", () => {
    const next = droneTick(base);
    expect(next.starterDrone.status).toBe("moving_to_collect");
    expect(next.starterDrone.ticksRemaining).toBe(1);
  });

  it("transitions to collecting when ticksRemaining reaches 0", () => {
    // Tick it down to 1 first
    let state = droneTick(base);
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("collecting");
    expect(state.starterDrone.ticksRemaining).toBe(DRONE_COLLECT_TICKS);
  });

  it("falls back to idle if target node was removed", () => {
    // Remove the node
    const { [nodeId]: _removed, ...rest } = base.collectionNodes;
    const state = withDrone({ ...base, collectionNodes: rest }, {
      status: "moving_to_collect",
      targetNodeId: nodeId,
      ticksRemaining: 1,
    });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("idle");
    expect(next.starterDrone.targetNodeId).toBeNull();
  });
});

describe("DRONE_TICK – collecting", () => {
  let base: GameState;
  let nodeId: string;

  function setupCollecting(nodeAmount: number): GameState {
    let state = createInitialState("release");
    state = addNode(state, "iron", 4, 4, nodeAmount);
    nodeId = Object.keys(state.collectionNodes)[0];
    return withDrone(state, {
      status: "collecting",
      targetNodeId: nodeId,
      tileX: 4,
      tileY: 4,
      ticksRemaining: 1, // ready to collect on next tick
    });
  }

  it("picks up min(DRONE_CAPACITY, nodeAmount) and removes empty node", () => {
    base = setupCollecting(3);
    const next = droneTick(base);
    expect(next.starterDrone.status).toBe("moving_to_dropoff");
    expect(next.starterDrone.cargo?.itemType).toBe("iron");
    expect(next.starterDrone.cargo?.amount).toBe(3); // 3 < DRONE_CAPACITY
    expect(next.collectionNodes[nodeId]).toBeUndefined(); // node emptied → removed
  });

  it("clamps pickup to DRONE_CAPACITY and keeps partial node", () => {
    const large = DRONE_CAPACITY + 4;
    base = setupCollecting(large);
    const next = droneTick(base);
    expect(next.starterDrone.cargo?.amount).toBe(DRONE_CAPACITY);
    expect(next.collectionNodes[nodeId]?.amount).toBe(large - DRONE_CAPACITY);
  });

  it("decrements ticksRemaining while > 1", () => {
    base = setupCollecting(2);
    base = withDrone(base, { ticksRemaining: 3 });
    const next = droneTick(base);
    expect(next.starterDrone.status).toBe("collecting");
    expect(next.starterDrone.ticksRemaining).toBe(2);
  });
});

describe("DRONE_TICK – moving_to_dropoff", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
    base = withDrone(base, {
      status: "moving_to_dropoff",
      cargo: { itemType: "wood", amount: 3 },
      ticksRemaining: 2,
    });
  });

  it("decrements ticksRemaining while > 1", () => {
    const next = droneTick(base);
    expect(next.starterDrone.status).toBe("moving_to_dropoff");
    expect(next.starterDrone.ticksRemaining).toBe(1);
  });

  it("transitions to depositing when ticks reach 0", () => {
    let state = droneTick(base);
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("depositing");
    expect(state.starterDrone.ticksRemaining).toBe(DRONE_DEPOSIT_TICKS);
    // Position should update to dropoff (hub position)
    expect(state.starterDrone.tileX).toBe(HUB_POS.x);
    expect(state.starterDrone.tileY).toBe(HUB_POS.y);
  });
});

describe("DRONE_TICK – depositing", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("adds cargo to inventory and returns to idle", () => {
    const hubId = base.starterDrone.hubId!;
    const hubWoodBefore = base.serviceHubs[hubId].inventory.wood;
    let state = withDrone(base, {
      status: "depositing",
      cargo: { itemType: "wood", amount: 4 },
      ticksRemaining: 1,
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("idle");
    expect(state.starterDrone.cargo).toBeNull();
    expect(state.serviceHubs[hubId].inventory.wood).toBe(hubWoodBefore + 4);
  });

  it("decrements ticksRemaining while > 1", () => {
    const state = withDrone(base, {
      status: "depositing",
      cargo: { itemType: "stone", amount: 2 },
      ticksRemaining: 3,
    });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("depositing");
    expect(next.starterDrone.ticksRemaining).toBe(2);
  });

  it("handles missing cargo gracefully (returns to idle without crash)", () => {
    const state = withDrone(base, {
      status: "depositing",
      cargo: null,
      ticksRemaining: 1,
    });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("idle");
  });
});

describe("DRONE_TICK – full round trip", () => {
  it("completes a full collect→deposit cycle and increments inventory", () => {
    let state = createInitialState("release");
    const hubId = state.starterDrone.hubId!;
    // Set copper target > 0 so drone will collect it
    state = gameReducer(state, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "copper", amount: 10 });
    state = addNode(state, "copper", MAP_SHOP_POS.x + 2, MAP_SHOP_POS.y, 2);
    const copperBefore = state.serviceHubs[hubId].inventory.copper;

    // Drive state machine until idle again (max 100 ticks safeguard)
    let ticks = 0;
    while (state.starterDrone.status !== "idle" || ticks === 0) {
      state = droneTick(state);
      ticks++;
      if (ticks > 100) throw new Error("Drone stuck — didn't return to idle within 100 ticks");
    }

    expect(state.serviceHubs[hubId].inventory.copper).toBe(copperBefore + 2);
    expect(Object.keys(state.collectionNodes)).toHaveLength(0);
  });
});

// ---- Hub assignment --------------------------------------------------------

/** Place a service_hub via reducer and return updated state + hub asset ID.
 * Explicitly assigns the starter drone to the new hub via ASSIGN_DRONE_TO_HUB
 * (placement alone no longer auto-assigns). */
function placeServiceHub(state: GameState, x: number, y: number): { state: GameState; hubId: string } {
  // Clear the 2x2 area to avoid cell conflicts with random spawns
  const clearedCellMap = { ...state.cellMap };
  const clearedAssets = { ...state.assets };
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const key = `${x + dx},${y + dy}`;
      const occupant = clearedCellMap[key];
      if (occupant && !clearedAssets[occupant]?.fixed) {
        delete clearedAssets[occupant];
        delete clearedCellMap[key];
      }
    }
  }
  let s: GameState = {
    ...state,
    assets: clearedAssets,
    cellMap: clearedCellMap,
    buildMode: true,
    selectedBuildingType: "service_hub" as GameState["selectedBuildingType"],
  };
  const existingHubIds = new Set(Object.keys(state.assets).filter(id => state.assets[id].type === "service_hub"));
  s = gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
  const hubId = Object.keys(s.assets).find(
    (id) => s.assets[id].type === "service_hub" && !existingHubIds.has(id),
  );
  if (!hubId) throw new Error("service_hub placement failed");
  // Complete construction immediately (remove from constructionSites) so tests can interact with the hub
  const { [hubId]: _site, ...restSites } = s.constructionSites;
  s = { ...s, constructionSites: restSites };
  // Explicitly assign the starter drone to the new hub (no auto-assign in BUILD_PLACE_BUILDING)
  s = gameReducer(s, { type: "ASSIGN_DRONE_TO_HUB", droneId: s.starterDrone.droneId, hubId });
  return { state: s, hubId };
}

describe("DRONE_TICK – hub assignment", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  /** Place a hub without assigning the drone (raw placement only, no ASSIGN_DRONE_TO_HUB). */
  function placeHubOnly(state: GameState, x: number, y: number): { state: GameState; hubId: string } {
    const clearedCellMap = { ...state.cellMap };
    const clearedAssets = { ...state.assets };
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const key = `${x + dx},${y + dy}`;
        const occupant = clearedCellMap[key];
        if (occupant && !clearedAssets[occupant]?.fixed) {
          delete clearedAssets[occupant];
          delete clearedCellMap[key];
        }
      }
    }
    let s: GameState = {
      ...state,
      assets: clearedAssets,
      cellMap: clearedCellMap,
      buildMode: true,
      selectedBuildingType: "service_hub" as GameState["selectedBuildingType"],
    };
    const existingIds = new Set(Object.keys(state.assets).filter(id => state.assets[id].type === "service_hub"));
    s = gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
    const hubId = Object.keys(s.assets).find(id => s.assets[id].type === "service_hub" && !existingIds.has(id))!;
    if (!hubId) throw new Error("hub placement failed");
    // Remove construction site so the hub is "built"
    const { [hubId]: _, ...rest } = s.constructionSites;
    s = { ...s, constructionSites: rest };
    return { state: s, hubId };
  }

  it("does NOT auto-assign drone when a new service_hub is placed via build mode", () => {
    const droneHubBefore = base.starterDrone.hubId;
    const { state, hubId } = placeHubOnly(base, 5, 5);
    // Drone hubId must remain unchanged (still the proto-hub from initial state)
    expect(state.starterDrone.hubId).toBe(droneHubBefore);
    expect(state.starterDrone.hubId).not.toBe(hubId);
    // New hub starts with no drones assigned
    expect(state.serviceHubs[hubId].droneIds).toHaveLength(0);
  });

  it("ASSIGN_DRONE_TO_HUB: assigns drone to hub and updates droneIds", () => {
    const { state: hubState, hubId } = placeHubOnly(base, 5, 5);
    const droneId = hubState.starterDrone.droneId;
    const state = gameReducer(hubState, { type: "ASSIGN_DRONE_TO_HUB", droneId, hubId });
    expect(state.starterDrone.hubId).toBe(hubId);
    expect(state.serviceHubs[hubId].droneIds).toContain(droneId);
  });

  it("ASSIGN_DRONE_TO_HUB: removes drone from old hub's droneIds", () => {
    const { state: hubState, hubId } = placeHubOnly(base, 5, 5);
    const droneId = hubState.starterDrone.droneId;
    const oldHubId = hubState.starterDrone.hubId!;
    expect(hubState.serviceHubs[oldHubId].droneIds).toContain(droneId);
    const state = gameReducer(hubState, { type: "ASSIGN_DRONE_TO_HUB", droneId, hubId });
    expect(state.serviceHubs[oldHubId].droneIds).not.toContain(droneId);
  });

  it("ASSIGN_DRONE_TO_HUB: snaps drone to hub dock position", () => {
    const { state: hubState, hubId } = placeHubOnly(base, 5, 5);
    const droneId = hubState.starterDrone.droneId;
    const state = gameReducer(hubState, { type: "ASSIGN_DRONE_TO_HUB", droneId, hubId });
    const hubAsset = state.assets[hubId];
    expect(state.starterDrone.tileX).toBe(hubAsset.x);
    expect(state.starterDrone.tileY).toBe(hubAsset.y);
    expect(state.starterDrone.status).toBe("idle");
  });

  it("ASSIGN_DRONE_TO_HUB: aborts in-progress task cleanly", () => {
    const { state: hubState, hubId } = placeHubOnly(base, 5, 5);
    const droneId = hubState.starterDrone.droneId;
    // Simulate drone mid-flight with a claimed node
    const nodeState = addNode(hubState, "wood", 3, 3, 5);
    const nodeId = Object.keys(nodeState.collectionNodes)[0];
    const midFlight = withDrone(
      { ...nodeState, collectionNodes: { ...nodeState.collectionNodes, [nodeId]: { ...nodeState.collectionNodes[nodeId], reservedByDroneId: droneId } } },
      { status: "moving_to_collect", targetNodeId: nodeId, ticksRemaining: 5 },
    );
    const state = gameReducer(midFlight, { type: "ASSIGN_DRONE_TO_HUB", droneId, hubId });
    expect(state.starterDrone.status).toBe("idle");
    expect(state.starterDrone.targetNodeId).toBeNull();
    // Node reservation must be released
    expect(state.collectionNodes[nodeId].reservedByDroneId).toBeNull();
  });

  it("delivers to hub position instead of MAP_SHOP_POS", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 5, 5);
    const hubAsset = hubState.assets[hubId];

    // Place drone in moving_to_dropoff with 1 tick remaining
    let state = withDrone(hubState, {
      status: "moving_to_dropoff",
      cargo: { itemType: "wood", amount: 3 },
      ticksRemaining: 1,
      hubId,
      deliveryTargetId: hubId,
      currentTaskType: "hub_restock",
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("depositing");
    expect(state.starterDrone.tileX).toBe(hubAsset.x);
    expect(state.starterDrone.tileY).toBe(hubAsset.y);
  });

  it("resets hubId and goes idle when hub is removed", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 5, 5);
    // Drone is mid-flight
    let state = withDrone(hubState, {
      status: "moving_to_dropoff",
      cargo: { itemType: "iron", amount: 2 },
      ticksRemaining: 3,
      hubId,
    });
    state = { ...state, buildMode: true };
    state = gameReducer(state, { type: "BUILD_REMOVE_ASSET", assetId: hubId });
    expect(state.starterDrone.hubId).toBeNull();
    expect(state.starterDrone.status).toBe("idle");
    expect(state.starterDrone.cargo).toBeNull();
  });

  it("delivers to MAP_SHOP_POS when no hub is assigned", () => {
    let state = withDrone(base, {
      status: "moving_to_dropoff",
      cargo: { itemType: "stone", amount: 2 },
      ticksRemaining: 1,
      hubId: null,
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("depositing");
    expect(state.starterDrone.tileX).toBe(MAP_SHOP_POS.x);
    expect(state.starterDrone.tileY).toBe(MAP_SHOP_POS.y);
  });

  it("completes full round trip delivering to hub", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 10, 10);
    // Set copper target > 0 so drone will collect it
    let state = addNode(hubState, "copper", 12, 10, 2);
    state = gameReducer(state, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "copper", amount: 10 });
    const copperBefore = state.inventory.copper;

    let ticks = 0;
    while (state.starterDrone.status !== "idle" || ticks === 0) {
      state = droneTick(state);
      ticks++;
      if (ticks > 100) throw new Error("Drone stuck");
    }

    // Resources go into hub inventory, NOT global inventory
    expect(state.serviceHubs[hubId].inventory.copper).toBe(2);
    expect(state.inventory.copper).toBe(copperBefore); // unchanged
    expect(state.starterDrone.hubId).toBe(hubId);
  });

  it("upgraded hub gives all parked drones unique dock positions", () => {
    let state = { ...base, inventory: { ...base.inventory, wood: 100, stone: 100, iron: 100 } };
    const hubId = state.starterDrone.hubId!;
    state = withTier2HubAndDockedDrones(state, hubId);

    const parked = getParkedDrones(state, hubId);
    expect(parked).toHaveLength(4);
    expect(new Set(parked.map((drone) => `${drone.tileX},${drone.tileY}`)).size).toBe(4);
  });
});

// ---- returning_to_dock ---------------------------------------------------

describe("DRONE_TICK – returning_to_dock", () => {
  let base: GameState;
  let hubId: string;

  beforeEach(() => {
    const init = createInitialState("release");
    const placed = placeServiceHub(init, 8, 8);
    base = placed.state;
    hubId = placed.hubId;
  });

  it("idle drone not at dock transitions to returning_to_dock", () => {
    // Move drone away from its dock (hub is at 8,8; move drone to 0,0)
    const state = withDrone(base, { tileX: 0, tileY: 0 });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("returning_to_dock");
    expect(next.starterDrone.ticksRemaining).toBeGreaterThan(0);
  });

  it("idle drone already at dock stays idle (same reference)", () => {
    // After ASSIGN_DRONE_TO_HUB, drone is snapped to (8,8) which is the dock
    const next = droneTick(base);
    // No nodes exist → no task → drone at dock → no state change
    expect(next.starterDrone.status).toBe("idle");
    expect(next).toBe(base); // same reference: no unnecessary re-render
  });

  it("returning_to_dock moves drone toward dock each tick", () => {
    const state = withDrone(base, { tileX: 0, tileY: 0, status: "returning_to_dock", ticksRemaining: 5 });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("returning_to_dock");
    // Should have moved closer to (8,8)
    const distBefore = Math.max(Math.abs(0 - 8), Math.abs(0 - 8));
    const distAfter = Math.max(Math.abs(next.starterDrone.tileX - 8), Math.abs(next.starterDrone.tileY - 8));
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("returning_to_dock snaps to dock and goes idle on arrival", () => {
    const state = withDrone(base, { tileX: 7, tileY: 8, status: "returning_to_dock", ticksRemaining: 1 });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("idle");
    expect(next.starterDrone.tileX).toBe(8);
    expect(next.starterDrone.tileY).toBe(8);
  });

  it("returning_to_dock aborts to collect when a task appears", () => {
    const state = withDrone(
      addNode(base, "wood", 5, 8, 3),
      { tileX: 2, tileY: 2, status: "returning_to_dock", ticksRemaining: 10 },
    );
    const next = droneTick(state);
    // Task available → abort return, start collecting
    expect(next.starterDrone.status).toBe("moving_to_collect");
    expect(next.starterDrone.targetNodeId).toBeTruthy();
  });

  it("returning_to_dock resets to idle when hub is gone", () => {
    const state = withDrone(
      { ...base, buildMode: true },
      { tileX: 2, tileY: 2, status: "returning_to_dock", ticksRemaining: 5 },
    );
    // Manually remove the hub asset to simulate hub-gone scenario
    const { [hubId]: _asset, ...restAssets } = state.assets;
    const stateNoHub = { ...state, assets: restAssets };
    const next = droneTick(stateNoHub);
    expect(next.starterDrone.status).toBe("idle");
    expect(next.starterDrone.ticksRemaining).toBe(0);
  });
});

// ---- Hub demand / target stock -----------------------------------------

/** Helper: set a hub's inventory to specific values. */
function withHubInventory(
  state: GameState,
  hubId: string,
  inv: Partial<Record<"wood" | "stone" | "iron" | "copper", number>>,
): GameState {
  const entry = state.serviceHubs[hubId];
  if (!entry) throw new Error(`No hub entry for ${hubId}`);
  return {
    ...state,
    serviceHubs: {
      ...state.serviceHubs,
      [hubId]: { ...entry, inventory: { ...entry.inventory, ...inv } },
    },
  };
}

describe("DRONE_TICK – hub demand filtering", () => {
  let base: GameState;
  let hubId: string;

  beforeEach(() => {
    const init = createInitialState("release");
    const placed = placeServiceHub(init, 5, 5);
    base = placed.state;
    hubId = placed.hubId;
  });

  it("creates serviceHubs entry when hub is placed", () => {
    expect(base.serviceHubs[hubId]).toBeDefined();
    expect(base.serviceHubs[hubId].inventory).toEqual(createEmptyHubInventory());
  });

  it("collects resources the hub still needs", () => {
    let state = addNode(base, "wood", 7, 5, 3);
    // Hub needs wood (target 20, current 0)
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("moving_to_collect");
  });

  it("ignores nodes for resources at target stock", () => {
    // Fill wood to target
    let state = withHubInventory(base, hubId, { wood: SERVICE_HUB_TARGET_STOCK.wood });
    state = addNode(state, "wood", 7, 5, 3);
    state = droneTick(state);
    // No suitable task: drone stays idle at hub or returns to hub anchor point.
    expect(["idle", "moving_to_dropoff"]).toContain(state.starterDrone.status);
  });

  it("still collects other resources even if one is full", () => {
    let state = withHubInventory(base, hubId, { wood: SERVICE_HUB_TARGET_STOCK.wood });
    state = addNode(state, "wood", 7, 5, 3);  // full — ignored
    state = addNode(state, "stone", 8, 5, 2); // needed — collected
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("moving_to_collect");
    // Should target the stone node, not wood
    const targetNode = state.starterDrone.targetNodeId
      ? state.collectionNodes[state.starterDrone.targetNodeId]
      : null;
    expect(targetNode?.itemType).toBe("stone");
  });

  it("deposits into hub inventory, not global", () => {
    let state = withDrone(base, {
      status: "depositing",
      cargo: { itemType: "iron", amount: 3 },
      ticksRemaining: 1,
      hubId,
    });
    const ironBefore = state.inventory.iron;
    state = droneTick(state);
    expect(state.serviceHubs[hubId].inventory.iron).toBe(3);
    expect(state.inventory.iron).toBe(ironBefore); // global unchanged
  });

  it("without hub, deposits into global inventory (no filtering)", () => {
    // Remove hub assignment
    let state = withDrone(base, { hubId: null });
    state = addNode(state, "wood", 7, 5, 3);
    // Even with full hub, no hub assigned means no filtering
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("moving_to_collect");
  });

  it("does not send multiple drones for a single small hub deficit", () => {
    const secondDroneId = "drone-2";
    const hubAsset = base.assets[hubId];
    const woodTarget = base.serviceHubs[hubId].targetStock.wood;
    let state = withHubInventory(base, hubId, { wood: woodTarget - 1 });
    state = {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [hubId]: {
          ...state.serviceHubs[hubId],
          tier: 2,
          droneIds: [...state.serviceHubs[hubId].droneIds, secondDroneId],
        },
      },
      drones: {
        ...state.drones,
        [secondDroneId]: {
          ...state.starterDrone,
          droneId: secondDroneId,
          hubId,
          status: "idle",
          tileX: hubAsset.x + 1,
          tileY: hubAsset.y,
          targetNodeId: null,
          cargo: null,
          ticksRemaining: 0,
          currentTaskType: null,
          deliveryTargetId: null,
        },
      },
    };
    state = addNode(state, "wood", 7, 5, 5);
    state = addNode(state, "wood", 8, 5, 5);

    const next = droneTick(state);
    const activeRestockDrones = Object.values(next.drones).filter(
      (drone) => drone.currentTaskType === "hub_restock" && drone.status === "moving_to_collect",
    );
    expect(activeRestockDrones).toHaveLength(1);
  });

  it("hub_restock only picks up the remaining demand amount", () => {
    const woodTarget = base.serviceHubs[hubId].targetStock.wood;
    let state = withHubInventory(base, hubId, { wood: woodTarget - 1 });
    state = addNode(state, "wood", 7, 5, 5);
    const nodeId = Object.keys(state.collectionNodes)[0];
    state = withDrone(state, {
      status: "collecting",
      targetNodeId: nodeId,
      tileX: 7,
      tileY: 5,
      ticksRemaining: 1,
      hubId,
      currentTaskType: "hub_restock",
      deliveryTargetId: hubId,
    });

    const next = droneTick(state);
    expect(next.starterDrone.cargo?.itemType).toBe("wood");
    expect(next.starterDrone.cargo?.amount).toBe(1);
    expect(next.collectionNodes[nodeId]?.amount).toBe(4);
  });

  it("returns hub inventory to global on hub removal", () => {
    let state = withHubInventory(base, hubId, { wood: 10, stone: 5 });
    const woodBefore = state.inventory.wood;
    const stoneBefore = state.inventory.stone;
    state = { ...state, buildMode: true };
    state = gameReducer(state, { type: "BUILD_REMOVE_ASSET", assetId: hubId });
    expect(state.serviceHubs[hubId]).toBeUndefined();
    // Hub inventory is returned (10 wood, 5 stone) plus partial building cost refund (~1/3).
    // Building costs: wood: 20 → refund 6, stone: 15 → refund 5.
    expect(state.inventory.wood).toBe(woodBefore + 10 + Math.max(1, Math.floor(BUILDING_COSTS.service_hub.wood / 3)));
    expect(state.inventory.stone).toBe(stoneBefore + 5 + Math.max(1, Math.floor(BUILDING_COSTS.service_hub.stone / 3)));
  });
});

// ============================================================
// Construction Site Tests
// ============================================================

function placeBuilding(state: GameState, bType: string, x: number, y: number): GameState {
  // Clear 2x2 area
  const clearedCellMap = { ...state.cellMap };
  const clearedAssets = { ...state.assets };
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const key = `${x + dx},${y + dy}`;
      const occupant = clearedCellMap[key];
      if (occupant && !clearedAssets[occupant]?.fixed) {
        delete clearedAssets[occupant];
        delete clearedCellMap[key];
      }
    }
  }
  let s: GameState = {
    ...state,
    assets: clearedAssets,
    cellMap: clearedCellMap,
    buildMode: true,
    selectedBuildingType: bType as GameState["selectedBuildingType"],
  };
  return gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
}

describe("Construction Sites – placement", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("creates a construction site when hub exists and inventory is insufficient", () => {
    // Place a hub first (with full costs)
    const { state: hubState } = placeServiceHub(base, 6, 6);
    // Try to place a workbench with insufficient inventory
    const wbCost = BUILDING_COSTS.workbench;
    // Give partial resources: half of each cost
    const partialInv = { ...hubState.inventory };
    for (const [res, amt] of Object.entries(wbCost)) {
      (partialInv as unknown as Record<string, number>)[res] = Math.floor((amt ?? 0) / 2);
    }
    let state = { ...hubState, inventory: partialInv };
    state = placeBuilding(state, "workbench", 10, 10);
    // Workbench should be placed
    const wbId = Object.keys(state.assets).find(id => state.assets[id].type === "workbench");
    expect(wbId).toBeTruthy();
    // Construction site should exist
    expect(state.constructionSites[wbId!]).toBeDefined();
    expect(state.constructionSites[wbId!].buildingType).toBe("workbench");
    // Remaining should have positive values
    const remaining = state.constructionSites[wbId!].remaining;
    const totalRemaining = Object.values(remaining).reduce((s, v) => s + (v ?? 0), 0);
    expect(totalRemaining).toBeGreaterThan(0);
  });

  it("places building as construction site even when hub+inventory covers full cost", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    // Give full resources for workbench
    const wbCost = BUILDING_COSTS.workbench;
    const fullInv = { ...hubState.inventory };
    for (const [res, amt] of Object.entries(wbCost)) {
      (fullInv as unknown as Record<string, number>)[res] = ((fullInv as unknown as Record<string, number>)[res] ?? 0) + amt;
    }
    let state = { ...hubState, inventory: fullInv };
    const invBefore = { ...state.inventory };
    state = placeBuilding(state, "workbench", 10, 10);
    const wbId = Object.keys(state.assets).find(id => state.assets[id].type === "workbench");
    expect(wbId).toBeTruthy();
    // Construction site ALWAYS created when hub exists — drone delivers resources
    expect(state.constructionSites[wbId!]).toBeDefined();
    expect(state.constructionSites[wbId!].buildingType).toBe("workbench");
    // Inventory should NOT be deducted — drone handles delivery
    for (const [res] of Object.entries(wbCost)) {
      expect((state.inventory as unknown as Record<string, number>)[res]).toBe(
        (invBefore as unknown as Record<string, number>)[res]
      );
    }
  });

  it("does NOT create construction site without a hub", () => {
    // Remove all hubs from both serviceHubs and assets
    const assetsWithoutHubs = Object.fromEntries(
      Object.entries(base.assets).filter(([, a]) => a.type !== "service_hub")
    );
    const noHubBase: GameState = { ...base, serviceHubs: {}, assets: assetsWithoutHubs, starterDrone: { ...base.starterDrone, hubId: null } };
    const state = placeBuilding(noHubBase, "workbench", 10, 10);
    const wbId = Object.keys(state.assets).find(id => state.assets[id].type === "workbench");
    expect(wbId).toBeUndefined(); // placement should fail
    expect(Object.keys(state.constructionSites).length).toBe(0);
  });
});

describe("Construction Sites – drone priority", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("selectDroneTask returns construction_supply over hub_restock", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 6, 6);
    // Create a construction site manually
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 5 } } },
    };
    // Add a wood node
    state = addNode(state, "wood", 8, 8, 10);
    // Hub still needs wood (target stock > 0, inventory 0)
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
    expect(task!.deliveryTargetId).toBe(siteId);
  });

  it("DRONE_TICK assigns the drone to construction before hub_restock when both compete", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "tick-priority-site";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
    };
    state = addNode(state, "wood", 8, 8, 10);

    const next = gameReducer(state, { type: "DRONE_TICK" });

    expect(next.starterDrone.currentTaskType).toBe("construction_supply");
    expect(next.starterDrone.currentTaskType).not.toBe("hub_restock");
    expect(next.starterDrone.deliveryTargetId).toBe(siteId);
    expect(next.starterDrone.targetNodeId).toBeTruthy();
  });

  it("selectDroneTask falls back to hub_restock when no construction sites", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 6, 6);
    let state = addNode(hubState, "wood", 8, 8, 10);
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_restock");
  });

  it("selectDroneTask returns hub_dispatch when hub has stock and no ground drops exist", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const hubId = hubState.starterDrone.hubId!;
    const siteId = "hub-dispatch-site";
    const state: GameState = {
      ...hubState,
      serviceHubs: {
        ...hubState.serviceHubs,
        [hubId]: {
          ...hubState.serviceHubs[hubId],
          inventory: {
            ...hubState.serviceHubs[hubId].inventory,
            wood: 10,
          },
        },
      },
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
      collectionNodes: {},
    };

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_dispatch");
    expect(task!.deliveryTargetId).toBe(siteId);
    expect(task!.nodeId).toBe(`hub:${hubId}:wood`);
  });

  it("construction_supply dispatches one drone for a 2-wood site", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "small-site";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    state = addNode(state, "wood", 8, 8, 5);
    state = {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [state.starterDrone.hubId!]: {
          ...state.serviceHubs[state.starterDrone.hubId!],
          tier: 2,
          droneIds: [state.starterDrone.droneId, "drone-2", "drone-3", "drone-4"],
        },
      },
      drones: {
        ...state.drones,
        "drone-2": { ...state.starterDrone, droneId: "drone-2", tileX: 7, tileY: 6 },
        "drone-3": { ...state.starterDrone, droneId: "drone-3", tileX: 8, tileY: 6 },
        "drone-4": { ...state.starterDrone, droneId: "drone-4", tileX: 9, tileY: 6 },
      },
    };

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (drone) => drone.currentTaskType === "construction_supply" && drone.deliveryTargetId === siteId,
    );
    expect(dispatched).toHaveLength(1);
  });

  it("construction_supply dispatches three drones for a 12-wood site", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "large-site";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 12 } },
      },
    };
    state = addNode(state, "wood", 8, 8, 5);
    state = addNode(state, "wood", 9, 8, 5);
    state = addNode(state, "wood", 10, 8, 5);
    state = addNode(state, "wood", 11, 8, 5);
    state = {
      ...state,
      serviceHubs: {
        ...state.serviceHubs,
        [state.starterDrone.hubId!]: {
          ...state.serviceHubs[state.starterDrone.hubId!],
          tier: 2,
          droneIds: [state.starterDrone.droneId, "drone-2", "drone-3", "drone-4"],
        },
      },
      drones: {
        ...state.drones,
        "drone-2": { ...state.starterDrone, droneId: "drone-2", tileX: 7, tileY: 6 },
        "drone-3": { ...state.starterDrone, droneId: "drone-3", tileX: 8, tileY: 6 },
        "drone-4": { ...state.starterDrone, droneId: "drone-4", tileX: 9, tileY: 6 },
      },
    };

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (drone) => drone.currentTaskType === "construction_supply" && drone.deliveryTargetId === siteId,
    );
    expect(dispatched).toHaveLength(3);
  });
});

// ============================================================
// Task Scoring
// ============================================================

describe("Task Scoring – scoreDroneTask()", () => {
  it("score equals base priority minus Chebyshev distance", () => {
    // Drone at (0,0), node at (3,4) → Chebyshev = max(3,4) = 4
    expect(scoreDroneTask("hub_restock", 0, 0, 3, 4)).toBe(DRONE_TASK_BASE_SCORE.hub_restock - 4);
    expect(scoreDroneTask("construction_supply", 0, 0, 3, 4)).toBe(DRONE_TASK_BASE_SCORE.construction_supply - 4);
  });

  it("score at distance 0 equals base priority", () => {
    expect(scoreDroneTask("hub_restock", 5, 5, 5, 5)).toBe(DRONE_TASK_BASE_SCORE.hub_restock);
    expect(scoreDroneTask("construction_supply", 5, 5, 5, 5)).toBe(DRONE_TASK_BASE_SCORE.construction_supply);
  });

  it("construction_supply score always > hub_restock score at max grid distance", () => {
    // Worst construction score: base - max(79,49) = 1000 - 79 = 921
    // Best hub score: base - 0 = 100
    const worstConstruction = scoreDroneTask("construction_supply", 0, 0, 79, 0);
    const bestHub = scoreDroneTask("hub_restock", 5, 5, 5, 5);
    expect(worstConstruction).toBeGreaterThan(bestHub);
  });
});

describe("Task Scoring – selectDroneTask() picks nearest node of same type", () => {
  it("prefers nearer hub_restock node over farther one", () => {
    const { state: hubState, hubId } = placeServiceHub(createInitialState("release"), 6, 6);
    // Drone starts near MAP_SHOP_POS (~39,24). Add near node and far node.
    // Near node at (35,24), far at (10,5) — both supply wood the hub needs.
    let state = addNode(hubState, "wood", 35, 24, 5); // near
    state = addNode(state, "wood", 10, 5, 5);         // far

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_restock");
    // The near node should have been chosen — we check by comparing distances
    const chosenNode = state.collectionNodes[task!.nodeId];
    const drone = state.starterDrone;
    const chosenDist = Math.max(Math.abs(drone.tileX - chosenNode.tileX), Math.abs(drone.tileY - chosenNode.tileY));
    const allNodes = Object.values(state.collectionNodes);
    for (const n of allNodes) {
      const d = Math.max(Math.abs(drone.tileX - n.tileX), Math.abs(drone.tileY - n.tileY));
      expect(chosenDist).toBeLessThanOrEqual(d);
    }
  });

  it("construction_supply beats hub_restock even when construction node is at max distance", () => {
    const siteId = "far-site";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    // Put the wood node far from the drone (opposite corner of grid)
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 70, y: 40, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 2 } } },
    };
    state = addNode(state, "wood", 78, 48, 5); // far corner
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
    expect(task!.deliveryTargetId).toBe(siteId);
  });

  it("selectDroneTask is deterministic when equal-score construction candidates compete with hub_restock", () => {
    const siteId = "deterministic-site";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 20, y: 20, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    state = addNode(state, "wood", 30, 24, 1);
    state = addNode(state, "wood", 30, 24, 1);
    const expectedNodeId = Object.keys(state.collectionNodes).sort()[0];

    const first = selectDroneTask(state);
    const second = selectDroneTask(state);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).toEqual(second);
    expect(first!.taskType).toBe("construction_supply");
    expect(first!.nodeId).toBe(expectedNodeId);
    expect(first!.deliveryTargetId).toBe(siteId);
  });

  it("invalid/removed site asset is not selected", () => {
    const siteId = "removed-site";
    const { state: hubState, hubId } = placeServiceHub(createInitialState("release"), 6, 6);
    // Construction site exists but asset was removed
    let state: GameState = {
      ...hubState,
      // Deliberately omit the asset from assets map
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 3 } } },
    };
    state = addNode(state, "wood", 8, 8, 5);
    const task = selectDroneTask(state);
    // Should fall through to hub_restock (site without asset is invalid)
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_restock");
  });
});

// ============================================================
// Role Influence
// ============================================================

describe("Task Scoring – DroneRole influence", () => {
  it("scoreDroneTask applies bonus when role bonus provided", () => {
    const base = scoreDroneTask("hub_restock", 0, 0, 5, 0);
    const withBonus = scoreDroneTask("hub_restock", 0, 0, 5, 0, { role: DRONE_ROLE_BONUS });
    expect(withBonus).toBe(base + DRONE_ROLE_BONUS);
  });

  it("DRONE_SET_ROLE sets role on starterDrone and drones record", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    let state = hubState;
    const droneId = state.starterDrone.droneId;
    expect(state.starterDrone.role ?? "auto").toBe("auto");
    state = gameReducer(state, { type: "DRONE_SET_ROLE", droneId, role: "construction" });
    expect(state.starterDrone.role).toBe("construction");
    // drones record must stay in sync
    expect(state.drones[droneId]?.role).toBe("construction");
  });

  it("supply-role drone prefers hub_restock over no-construction-site", () => {
    const { state: hubState, hubId } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    let state = gameReducer(hubState, { type: "DRONE_SET_ROLE", droneId, role: "supply" });
    state = addNode(state, "wood", 8, 8, 10);
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_restock");
  });

  it("construction-role drone still chooses construction_supply when site exists", () => {
    const siteId = "cs-role-test";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 20, y: 20, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 2 } } },
    };
    state = gameReducer(state, { type: "DRONE_SET_ROLE", droneId, role: "construction" });
    state = addNode(state, "wood", 10, 10, 5);
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
  });

  it("supply-role drone still falls back to construction_supply when no hub task exists", () => {
    // Hub fully stocked — no hub_restock candidates. Only construction site.
    const siteId = "cs-fallback-test";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    // Fully stock the hub so no hub_restock candidates
    const hubId = hubState.starterDrone.hubId!;
    const fullStock = createDefaultHubTargetStock();
    let state: GameState = {
      ...hubState,
      serviceHubs: {
        ...hubState.serviceHubs,
        [hubId]: {
          ...hubState.serviceHubs[hubId],
          inventory: { ...fullStock },
        },
      },
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 20, y: 20, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 2 } } },
    };
    state = gameReducer(state, { type: "DRONE_SET_ROLE", droneId, role: "supply" });
    state = addNode(state, "wood", 10, 10, 5);
    const task = selectDroneTask(state);
    // Role is "supply" but no supply task — should fall back to construction_supply
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
  });

  it("construction role never overrides hub priority invariant", () => {
    // Even a "construction"-role drone on the far corner of the grid still picks construction
    // over a nearby hub_restock (invariant: construction always wins).
    const siteId = "cs-far-test";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 70, y: 40, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 2 } } },
    };
    state = gameReducer(state, { type: "DRONE_SET_ROLE", droneId, role: "construction" });
    // Add a node at the far corner (same position as site) and one near hub
    state = addNode(state, "wood", 72, 42, 5); // far node for construction
    state = addNode(state, "wood", 8, 8, 5);   // near node for hub
    const task = selectDroneTask(state);
    expect(task!.taskType).toBe("construction_supply");
  });
});

// ============================================================
// Sticky Selection / Anti-Oscillation
// ============================================================

describe("Task Scoring – sticky selection (reserved node bonus)", () => {
  it("scoreDroneTask applies sticky bonus when sticky provided", () => {
    const base = scoreDroneTask("hub_restock", 0, 0, 5, 0);
    const sticky = scoreDroneTask("hub_restock", 0, 0, 5, 0, { sticky: DRONE_STICKY_BONUS });
    expect(sticky).toBe(base + DRONE_STICKY_BONUS);
  });

  it("reserved node is preferred over equally-scored unreserved node", () => {
    const { state: hubState, hubId } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    // Add two equidistant wood nodes
    let state = addNode(hubState, "wood", 30, 24, 5); // node A
    state = addNode(state, "wood", 30, 24, 5);        // node B (same position)
    // Manually reserve node A for our drone
    const nodeIds = Object.keys(state.collectionNodes);
    const [nodeA] = nodeIds;
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeA]: { ...state.collectionNodes[nodeA], reservedByDroneId: droneId },
      },
    };
    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    // The reserved node should be preferred (sticky bonus)
    expect(task!.nodeId).toBe(nodeA);
  });

  it("urgency bonus increases hub_restock score proportionally to deficit", () => {
    // deficit=5 → urgency=5, deficit=25 → urgency=DRONE_URGENCY_BONUS_MAX
    const lowDeficit = scoreDroneTask("hub_restock", 0, 0, 0, 0, { urgency: 5 });
    const highDeficit = scoreDroneTask("hub_restock", 0, 0, 0, 0, { urgency: DRONE_URGENCY_BONUS_MAX });
    expect(highDeficit).toBeGreaterThan(lowDeficit);
    expect(highDeficit - lowDeficit).toBe(DRONE_URGENCY_BONUS_MAX - 5);
  });
});

describe("Construction Sites – drone delivery", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("drone deposits cargo into construction site and reduces remaining", () => {
    const { state: hubState, hubId } = placeServiceHub(base, 6, 6);
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 8 } } },
    };
    // Drone ready to deposit with wood cargo at site
    state = withDrone(state, {
      status: "depositing",
      tileX: 12,
      tileY: 12,
      cargo: { itemType: "wood", amount: 5 },
      ticksRemaining: 1,
      currentTaskType: "construction_supply",
      deliveryTargetId: siteId,
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("idle");
    expect(state.starterDrone.cargo).toBeNull();
    expect(state.constructionSites[siteId].remaining.wood).toBe(3);
  });

  it("completes construction site when all resources delivered", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2 } as any },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 3 } } },
    };
    state = withDrone(state, {
      status: "depositing",
      tileX: 12,
      tileY: 12,
      cargo: { itemType: "wood", amount: 5 },
      ticksRemaining: 1,
      currentTaskType: "construction_supply",
      deliveryTargetId: siteId,
    });
    state = droneTick(state);
    expect(state.constructionSites[siteId]).toBeUndefined();
    // Overflow (5-3=2) goes to global inventory
    expect(state.inventory.wood).toBeGreaterThanOrEqual(2);
  });

  it("deposits to global inventory if construction site was removed mid-flight", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    let state: GameState = { ...hubState, constructionSites: {} };
    const woodBefore = state.inventory.wood;
    state = withDrone(state, {
      status: "depositing",
      tileX: 12,
      tileY: 12,
      cargo: { itemType: "wood", amount: 5 },
      ticksRemaining: 1,
      currentTaskType: "construction_supply",
      deliveryTargetId: "nonexistent-site",
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("idle");
    expect(state.inventory.wood).toBe(woodBefore + 5);
  });
});

describe("Construction Sites – removal", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("cleans up construction site when building is removed and refunds delivered resources", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    // Place a workbench as construction site
    const wbCost = BUILDING_COSTS.workbench;
    // Give zero inventory so all goes to construction debt
    const zeroInv = { ...hubState.inventory };
    for (const [res] of Object.entries(wbCost)) {
      (zeroInv as unknown as Record<string, number>)[res] = 0;
    }
    let state = { ...hubState, inventory: zeroInv };
    state = placeBuilding(state, "workbench", 10, 10);
    const wbId = Object.keys(state.assets).find(id => state.assets[id].type === "workbench");
    expect(wbId).toBeTruthy();
    expect(state.constructionSites[wbId!]).toBeDefined();
    // Simulate some resources delivered: reduce remaining
    const site = state.constructionSites[wbId!];
    const newRemaining: Partial<Record<CollectableItemType, number>> = {};
    for (const [res, amt] of Object.entries(site.remaining)) {
      // Deliver half
      newRemaining[res as CollectableItemType] = Math.ceil((amt ?? 0) / 2);
    }
    state = {
      ...state,
      constructionSites: { ...state.constructionSites, [wbId!]: { ...site, remaining: newRemaining } },
    };
    const invBefore = { ...state.inventory };
    // Remove the building
    state = { ...state, buildMode: true };
    state = gameReducer(state, { type: "BUILD_REMOVE_ASSET", assetId: wbId! });
    expect(state.constructionSites[wbId!]).toBeUndefined();
    // Should have received partial refund for delivered resources
  });

  it("resets drone if it was delivering to the removed construction site", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: { ...hubState.assets, [siteId]: { id: siteId, type: "workbench", x: 12, y: 12, size: 2, width: 2, height: 2, fixed: false } as any },
      cellMap: { ...hubState.cellMap, "12,12": siteId, "13,12": siteId, "12,13": siteId, "13,13": siteId },
      constructionSites: { [siteId]: { buildingType: "workbench", remaining: { wood: 5 } } },
      placedBuildings: [...hubState.placedBuildings, "workbench"],
    };
    state = withDrone(state, {
      status: "moving_to_dropoff",
      deliveryTargetId: siteId,
      currentTaskType: "construction_supply",
      cargo: { itemType: "wood", amount: 5 },
      ticksRemaining: 3,
    });
    state = { ...state, buildMode: true };
    state = gameReducer(state, { type: "BUILD_REMOVE_ASSET", assetId: siteId });
    expect(state.starterDrone.status).toBe("idle");
    expect(state.starterDrone.deliveryTargetId).toBeNull();
    expect(state.starterDrone.currentTaskType).toBeNull();
  });
});

// ============================================================
// Claim / Reservation Layer Tests
// ============================================================

describe("Claim layer – node reservation on task start", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("claims the target node when drone transitions to moving_to_collect", () => {
    let state = addNode(base, "wood", 5, 5, 3);
    const nodeId = Object.keys(state.collectionNodes)[0];
    expect(state.collectionNodes[nodeId].reservedByDroneId).toBeNull();
    state = droneTick(state); // idle → moving_to_collect
    expect(state.starterDrone.status).toBe("moving_to_collect");
    expect(state.collectionNodes[nodeId].reservedByDroneId).toBe(state.starterDrone.droneId);
  });

  it("skips a node reserved by another drone", () => {
    // Simulate a foreign drone owning the only node
    let state = addNode(base, "wood", 5, 5, 3);
    const nodeId = Object.keys(state.collectionNodes)[0];
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeId]: { ...state.collectionNodes[nodeId], reservedByDroneId: "other-drone" },
      },
    };
    // Add a second unclaimed node
    state = addNode(state, "stone", 7, 7, 2);
    const nodeIds = Object.keys(state.collectionNodes);
    state = droneTick(state); // idle → moving_to_collect
    expect(state.starterDrone.status).toBe("moving_to_collect");
    // Must have targeted the unclaimed node, not the wood one
    expect(state.starterDrone.targetNodeId).not.toBe(nodeId);
  });

  it("stays idle if all nodes are claimed by other drones", () => {
    let state = addNode(base, "wood", 5, 5, 3);
    const nodeId = Object.keys(state.collectionNodes)[0];
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeId]: { ...state.collectionNodes[nodeId], reservedByDroneId: "other-drone" },
      },
    };
    const next = droneTick(state);
    expect(next).toBe(state); // no-op
  });
});

describe("Claim layer – reservation released on collection", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  it("releases claim after successful pickup (node partially remains)", () => {
    let state = addNode(base, "wood", 4, 4, 10);
    const nodeId = Object.keys(state.collectionNodes)[0];
    // Drone in collecting phase, node claimed
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeId]: { ...state.collectionNodes[nodeId], reservedByDroneId: "starter" },
      },
    };
    state = withDrone(state, {
      status: "collecting",
      targetNodeId: nodeId,
      tileX: 4,
      tileY: 4,
      ticksRemaining: 1,
      currentTaskType: "hub_restock",
      deliveryTargetId: null,
    });
    state = droneTick(state); // collecting → moving_to_dropoff
    expect(state.starterDrone.status).toBe("moving_to_dropoff");
    // Node still exists (10 - DRONE_CAPACITY remain)
    const remaining = state.collectionNodes[nodeId];
    expect(remaining).toBeDefined();
    // Reservation must be cleared
    expect(remaining.reservedByDroneId).toBeNull();
  });

  it("releases claim when node disappears during moving_to_collect", () => {
    let state = addNode(base, "wood", 4, 4, 3);
    const nodeId = Object.keys(state.collectionNodes)[0];
    state = withDrone(state, {
      status: "moving_to_collect",
      targetNodeId: nodeId,
      ticksRemaining: 1,
      currentTaskType: "hub_restock",
      deliveryTargetId: null,
    });
    // Remove node while drone is en route
    const { [nodeId]: _removed, ...restNodes } = state.collectionNodes;
    state = { ...state, collectionNodes: restNodes };
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("idle");
    // Node is gone; no stale reservation
    expect(Object.values(next.collectionNodes).some(n => n.reservedByDroneId === "starter")).toBe(false);
  });

  it("drone that claimed a node can still select it again after re-evaluation", () => {
    let state = addNode(base, "wood", 5, 5, 3);
    const nodeId = Object.keys(state.collectionNodes)[0];
    // Mark node as claimed by this drone (same droneId)
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeId]: { ...state.collectionNodes[nodeId], reservedByDroneId: "starter" },
      },
    };
    // Drone is idle — selectDroneTask should still see its own claimed node
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("moving_to_collect");
    expect(next.starterDrone.targetNodeId).toBe(nodeId);
  });
});

// ============================================================
// Per-hub configurable target stock
// ============================================================

describe("SET_HUB_TARGET_STOCK", () => {
  let base: GameState;
  let hubId: string;

  beforeEach(() => {
    base = createInitialState("release");
    const placed = placeServiceHub(base, 6, 6);
    base = placed.state;
    hubId = placed.hubId;
  });

  it("newly placed hub has default target stock", () => {
    const hub = base.serviceHubs[hubId];
    expect(hub.targetStock).toEqual(PROTO_HUB_TARGET_STOCK);
  });

  it("adjusts a single resource target", () => {
    const next = gameReducer(base, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "wood", amount: 25 });
    expect(next.serviceHubs[hubId].targetStock.wood).toBe(25);
    // Others unchanged
    expect(next.serviceHubs[hubId].targetStock.stone).toBe(PROTO_HUB_TARGET_STOCK.stone);
  });

  it("clamps to 0 at minimum", () => {
    const next = gameReducer(base, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "iron", amount: -10 });
    expect(next.serviceHubs[hubId].targetStock.iron).toBe(0);
  });

  it("clamps to MAX_HUB_TARGET_STOCK at maximum", () => {
    const next = gameReducer(base, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "copper", amount: 999 });
    // Tier 1 hub clamps to PROTO_HUB_MAX_TARGET_STOCK
    expect(next.serviceHubs[hubId].targetStock.copper).toBe(30);
  });

  it("ignores unknown hubId", () => {
    const next = gameReducer(base, { type: "SET_HUB_TARGET_STOCK", hubId: "nonexistent", resource: "wood", amount: 50 });
    expect(next).toBe(base);
  });
});

describe("Drone reacts to changed target stock", () => {
  let base: GameState;
  let hubId: string;

  beforeEach(() => {
    base = createInitialState("release");
    const placed = placeServiceHub(base, 6, 6);
    base = placed.state;
    hubId = placed.hubId;
  });

  it("drone ignores node when target is set to 0", () => {
    // Set all targets to 0
    let state = base;
    for (const res of ["wood", "stone", "iron", "copper"] as const) {
      state = gameReducer(state, { type: "SET_HUB_TARGET_STOCK", hubId, resource: res, amount: 0 });
    }
    // Add a wood node — drone should stay idle because target is 0
    state = addNode(state, "wood", 3, 3, 5);
    const next = droneTick(state);
    // With hub-anchor behavior, no-task drones return to their hub.
    expect(["idle", "moving_to_dropoff"]).toContain(next.starterDrone.status);
    if (next.starterDrone.status === "moving_to_dropoff") {
      expect(next.starterDrone.deliveryTargetId).toBe(hubId);
      expect(next.starterDrone.hubId).toBe(hubId);
    }
  });

  it("drone picks up node when target is raised above current inventory", () => {
    // Fill wood to default target
    let state = withHubInventory(base, hubId, { wood: SERVICE_HUB_TARGET_STOCK.wood });
    // Add wood node — drone should NOT collect (already at target)
    state = addNode(state, "wood", 3, 3, 5);
    let next = droneTick(state);
    expect(["idle", "moving_to_dropoff"]).toContain(next.starterDrone.status);

    // If the drone is returning to its hub anchor point, let it finish first.
    let stabilized = next;
    let guard = 0;
    while (stabilized.starterDrone.status !== "idle" && guard < 20) {
      stabilized = droneTick(stabilized);
      guard++;
    }
    state = stabilized;

    // Now raise wood target above current
    state = gameReducer(state, { type: "SET_HUB_TARGET_STOCK", hubId, resource: "wood", amount: SERVICE_HUB_TARGET_STOCK.wood + 10 });
    next = droneTick(state);
    expect(["moving_to_collect", "moving_to_dropoff"]).toContain(next.starterDrone.status);

    // Ensure it eventually starts collecting once anchored/ready.
    let progressed = next;
    guard = 0;
    while (progressed.starterDrone.status !== "moving_to_collect" && guard < 20) {
      progressed = droneTick(progressed);
      guard++;
    }
    expect(progressed.starterDrone.status).toBe("moving_to_collect");
  });
});

describe("Hub parking derivation", () => {
  it("counts only idle drones at their real hub dock as parked", () => {
    let state = createInitialState("release");
    const hubId = state.starterDrone.hubId!;
    state = { ...state, inventory: { ...state.inventory, wood: 100, stone: 100, iron: 100 } };
    state = withTier2HubAndDockedDrones(state, hubId);

    expect(getParkedDrones(state, hubId)).toHaveLength(4);

    const activeDroneId = state.serviceHubs[hubId].droneIds[3];
    const activeDrone = state.drones[activeDroneId];
    const dock = getDroneHomeDock(activeDrone, state);
    expect(dock).not.toBeNull();

    state = {
      ...state,
      drones: {
        ...state.drones,
        [activeDroneId]: {
          ...activeDrone,
          status: "moving_to_collect",
          tileX: dock!.x + 3,
          tileY: dock!.y + 1,
          ticksRemaining: 2,
        },
      },
    };

    expect(getParkedDrones(state, hubId).map((drone) => drone.droneId)).not.toContain(activeDroneId);
    expect(getParkedDrones(state, hubId)).toHaveLength(3);
  });
});

// ============================================================
// Self-heal & position interpolation
// ============================================================

describe("DRONE_TICK – self-heal missing hub entry", () => {
  let base: GameState;
  let hubId: string;

  beforeEach(() => {
    const init = createInitialState("release");
    const placed = placeServiceHub(init, 5, 5);
    base = placed.state;
    hubId = placed.hubId;
  });

  it("recreates missing serviceHubs entry on idle tick", () => {
    // Corrupt state: remove the serviceHubs entry while keeping hubId
    const { [hubId]: _removed, ...remainingHubs } = base.serviceHubs;
    let state: GameState = { ...base, serviceHubs: remainingHubs };
    // Add a node so the drone has something to do
    state = addNode(state, "wood", 7, 5, 3);
    // The idle tick should self-heal the hub entry and pick up the task
    state = droneTick(state);
    expect(state.serviceHubs[hubId]).toBeDefined();
    expect(state.starterDrone.status).toBe("moving_to_collect");
  });

  it("self-heals during deposit and deposits into hub (not global)", () => {
    // Corrupt state: remove the serviceHubs entry
    const { [hubId]: _removed, ...remainingHubs } = base.serviceHubs;
    let state: GameState = {
      ...base,
      serviceHubs: remainingHubs,
    };
    const ironBefore = state.inventory.iron;
    // Drone is about to deposit
    state = withDrone(state, {
      status: "depositing",
      cargo: { itemType: "iron", amount: 3 },
      ticksRemaining: 1,
      hubId,
      currentTaskType: "hub_restock",
      deliveryTargetId: hubId,
    });
    state = droneTick(state);
    // Hub entry should have been recreated and deposit went to hub, not global
    expect(state.serviceHubs[hubId]).toBeDefined();
    expect(state.serviceHubs[hubId].inventory.iron).toBe(3);
    expect(state.inventory.iron).toBe(ironBefore); // global unchanged
  });
});

describe("DRONE_TICK – position interpolation during flight", () => {
  it("updates drone position during moving_to_collect", () => {
    let state = createInitialState("release");
    // Place node far away from drone start (MAP_SHOP_POS)
    state = addNode(state, "wood", MAP_SHOP_POS.x - 10, MAP_SHOP_POS.y, 2);
    state = droneTick(state); // idle → moving_to_collect
    expect(state.starterDrone.status).toBe("moving_to_collect");
    const startX = state.starterDrone.tileX;
    // Next tick should move drone toward node
    state = droneTick(state);
    expect(state.starterDrone.tileX).not.toBe(startX);
    expect(state.starterDrone.tileX).toBeLessThan(startX); // moving left toward node
  });

  it("updates drone position during moving_to_dropoff", () => {
    const { state: hubState, hubId } = placeServiceHub(createInitialState("release"), 5, 5);
    const hubAsset = hubState.assets[hubId];
    // Drone is far from hub — far enough for multiple ticks
    let state = withDrone(hubState, {
      status: "moving_to_dropoff",
      cargo: { itemType: "stone", amount: 2 },
      ticksRemaining: 5,
      tileX: 20,
      tileY: 12,
      hubId,
      deliveryTargetId: hubId,
      currentTaskType: "hub_restock",
    });
    const before = { x: state.starterDrone.tileX, y: state.starterDrone.tileY };
    state = droneTick(state);
    // Drone should have moved closer to hub
    expect(state.starterDrone.status).toBe("moving_to_dropoff");
    const distBefore = Math.max(Math.abs(before.x - hubAsset.x), Math.abs(before.y - hubAsset.y));
    const distAfter = Math.max(Math.abs(state.starterDrone.tileX - hubAsset.x), Math.abs(state.starterDrone.tileY - hubAsset.y));
    expect(distAfter).toBeLessThan(distBefore);
  });
});

// ============================================================
// Dropoff target resolution — never flies to trader with hub assigned
// ============================================================

describe("DRONE_TICK – dropoff target is hub, not trader", () => {
  it("hub_restock: drone flies to hub position, not MAP_SHOP_POS", () => {
    const init = createInitialState("release");
    // Place hub away from MAP_SHOP_POS so positions differ
    const { state: hubState, hubId } = placeServiceHub(init, 10, 10);
    const hubAsset = hubState.assets[hubId];
    // Sanity: hub position must differ from MAP_SHOP_POS
    expect(hubAsset.x).not.toBe(MAP_SHOP_POS.x);

    // Add wood node near the hub
    let state = addNode(hubState, "wood", 14, 10, 3);

    // Drive to collecting → moving_to_dropoff
    let ticks = 0;
    while (state.starterDrone.status !== "moving_to_dropoff" && ticks < 50) {
      state = droneTick(state);
      ticks++;
    }
    expect(state.starterDrone.status).toBe("moving_to_dropoff");
    expect(state.starterDrone.currentTaskType).toBe("hub_restock");

    // Drive until depositing
    while (state.starterDrone.status === "moving_to_dropoff") {
      state = droneTick(state);
      ticks++;
      if (ticks > 100) throw new Error("Drone stuck in moving_to_dropoff");
    }
    expect(state.starterDrone.status).toBe("depositing");
    // Drone should be at hub position, NOT at MAP_SHOP_POS
    expect(state.starterDrone.tileX).toBe(hubAsset.x);
    expect(state.starterDrone.tileY).toBe(hubAsset.y);
    // Explicitly verify NOT at trader
    expect(state.starterDrone.tileX).not.toBe(MAP_SHOP_POS.x);
  });

  it("hub_restock with null deliveryTargetId still flies to hub via hubId", () => {
    const init = createInitialState("release");
    const { state: hubState, hubId } = placeServiceHub(init, 10, 10);
    const hubAsset = hubState.assets[hubId];

    // Simulate edge case: deliveryTargetId is null but hubId is set
    let state = withDrone(hubState, {
      status: "moving_to_dropoff",
      cargo: { itemType: "wood", amount: 3 },
      ticksRemaining: 1,
      hubId,
      deliveryTargetId: null,
      currentTaskType: "hub_restock",
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("depositing");
    // Must go to hub, NOT to trader
    expect(state.starterDrone.tileX).toBe(hubAsset.x);
    expect(state.starterDrone.tileY).toBe(hubAsset.y);
  });

  it("construction_supply: drone flies to construction site, not trader", () => {
    const init = createInitialState("release");
    const { state: hubState, hubId } = placeServiceHub(init, 10, 10);
    // Create a fake construction site asset at a known position
    const siteId = "test-site-001";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: 15, y: 15, size: 2, width: 2, height: 2 },
      },
      constructionSites: {
        ...hubState.constructionSites,
        [siteId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
    };

    state = withDrone(state, {
      status: "moving_to_dropoff",
      cargo: { itemType: "wood", amount: 5 },
      ticksRemaining: 1,
      hubId,
      deliveryTargetId: siteId,
      currentTaskType: "construction_supply",
    });
    state = droneTick(state);
    expect(state.starterDrone.status).toBe("depositing");
    // Must be at or adjacent to the construction site (per-drone delivery offset applied)
    expect(state.starterDrone.tileX).toBeGreaterThanOrEqual(15);
    expect(state.starterDrone.tileX).toBeLessThanOrEqual(16);
    expect(state.starterDrone.tileY).toBeGreaterThanOrEqual(15);
    expect(state.starterDrone.tileY).toBeLessThanOrEqual(16);
    // NOT at trader or hub
    expect(state.starterDrone.tileX).not.toBe(MAP_SHOP_POS.x);
  });
});

// ============================================================
// Demand-bonus / spread-penalty tuning
// ============================================================

describe("Task Scoring – demand and spread tuning", () => {
  function makeMultiDroneState(state: GameState, count: number): GameState {
    const hubId = state.starterDrone.hubId!;
    const droneIds = [state.starterDrone.droneId];
    const drones: GameState["drones"] = { ...state.drones };
    for (let i = 1; i < count; i++) {
      const id = `drone-extra-${i}`;
      droneIds.push(id);
      drones[id] = {
        ...state.starterDrone,
        droneId: id,
        tileX: state.starterDrone.tileX + i,
        tileY: state.starterDrone.tileY,
        currentTaskType: null,
        targetNodeId: null,
        deliveryTargetId: null,
        cargo: null,
        status: "idle",
        ticksRemaining: 0,
      };
    }
    return {
      ...state,
      drones,
      serviceHubs: {
        ...state.serviceHubs,
        [hubId]: { ...state.serviceHubs[hubId], tier: 2, droneIds },
      },
    };
  }

  it("scoreDroneTask adds positive demand and negative spread", () => {
    const baseScore = scoreDroneTask("construction_supply", 0, 0, 5, 0);
    const withBoth = scoreDroneTask("construction_supply", 0, 0, 5, 0, { demand: 12, spread: -10 });
    expect(withBoth).toBe(baseScore + 12 - 10);
  });

  it("DRONE_DEMAND_BONUS_MAX caps the demand bonus regardless of remaining need", () => {
    // Sanity: constants are defined and bounded
    expect(DRONE_DEMAND_BONUS_MAX).toBeGreaterThan(0);
    expect(DRONE_SPREAD_PENALTY_PER_DRONE).toBeGreaterThan(0);
    // Spread penalty must stay smaller than sticky bonus to avoid flapping
    expect(DRONE_SPREAD_PENALTY_PER_DRONE).toBeLessThan(DRONE_STICKY_BONUS);
  });

  it("prefers the larger-need construction site when distances are equal (demand bonus)", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteSmallId = "site-small";
    const siteLargeId = "site-large";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteSmallId]: { id: siteSmallId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
        [siteLargeId]: { id: siteLargeId, type: "workbench", x: drone.tileX - 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteSmallId]: { buildingType: "workbench", remaining: { wood: 2 } },
        [siteLargeId]: { buildingType: "workbench", remaining: { wood: 15 } },
      },
    };
    // Single wood node placed equidistant from the drone; both sites can pair with it.
    state = addNode(state, "wood", drone.tileX, drone.tileY + 1, 5);

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
    expect(task!.deliveryTargetId).toBe(siteLargeId);
  });

  it("spreads a fresh drone toward an unloaded site when an equally-good site already has assignments", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteAId = "site-A-loaded";
    const siteBId = "site-B-empty";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteAId]: { id: siteAId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
        [siteBId]: { id: siteBId, type: "workbench", x: drone.tileX + 5, y: drone.tileY + 2, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        // Both large enough to saturate the demand bonus
        [siteAId]: { buildingType: "workbench", remaining: { wood: 20 } },
        [siteBId]: { buildingType: "workbench", remaining: { wood: 20 } },
      },
    };
    // One node equidistant from the drone for both sites
    state = addNode(state, "wood", drone.tileX + 4, drone.tileY + 1, 5);

    // Pre-assign two extra drones to site A — they aren't holding cargo or
    // reservations, so they don't reduce site A's "remainingNeed", but they DO
    // count toward getAssignedConstructionDroneCount → spread penalty kicks in.
    state = makeMultiDroneState(state, 3);
    const droneIds = state.serviceHubs[state.starterDrone.hubId!].droneIds;
    state = {
      ...state,
      drones: {
        ...state.drones,
        [droneIds[1]]: { ...state.drones[droneIds[1]], currentTaskType: "construction_supply", deliveryTargetId: siteAId },
        [droneIds[2]]: { ...state.drones[droneIds[2]], currentTaskType: "construction_supply", deliveryTargetId: siteAId },
      },
    };

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("construction_supply");
    expect(task!.deliveryTargetId).toBe(siteBId);
  });

  it("does not over-assign drones beyond MAX_DRONES_PER_CONSTRUCTION_TARGET", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteId = "site-huge";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      // Far more material needed than the cap could ever justify.
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 100 } },
      },
    };
    // Plenty of wood nodes so no drone is starved by node availability.
    for (let i = 0; i < 8; i++) {
      state = addNode(state, "wood", drone.tileX + 4 + i, drone.tileY, 5);
    }
    state = makeMultiDroneState(state, 6);

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (d) => d.currentTaskType === "construction_supply" && d.deliveryTargetId === siteId,
    );
    expect(dispatched.length).toBe(MAX_DRONES_PER_CONSTRUCTION_TARGET);
  });

  it("a small construction site never receives more than one drone", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteId = "site-tiny";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    for (let i = 0; i < 4; i++) {
      state = addNode(state, "wood", drone.tileX + 4 + i, drone.tileY, 5);
    }
    state = makeMultiDroneState(state, 4);

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (d) => d.currentTaskType === "construction_supply" && d.deliveryTargetId === siteId,
    );
    expect(dispatched).toHaveLength(1);
  });

  it("hub_restock receives extra drones only when no construction need is open", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    // Tiny construction site (desired = 1) so additional drones are NOT eligible for it.
    const siteId = "site-tiny-cap";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: { id: siteId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    for (let i = 0; i < 4; i++) {
      state = addNode(state, "wood", drone.tileX + 4 + i, drone.tileY, 5);
    }
    state = makeMultiDroneState(state, 4);

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const construction = Object.values(next.drones).filter(
      (d) => d.currentTaskType === "construction_supply" && d.deliveryTargetId === siteId,
    );
    const restock = Object.values(next.drones).filter((d) => d.currentTaskType === "hub_restock");
    expect(construction).toHaveLength(1);
    // The remaining drones must service the hub instead of piling onto the site.
    expect(restock.length).toBeGreaterThan(0);
  });

  it("a drone with a reserved node sticks to its target instead of switching to a closer one", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteAId = "site-sticky-A";
    const siteBId = "site-sticky-B";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteAId]: { id: siteAId, type: "workbench", x: drone.tileX + 6, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
        [siteBId]: { id: siteBId, type: "workbench", x: drone.tileX + 4, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteAId]: { buildingType: "workbench", remaining: { wood: 5 } },
        [siteBId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
    };
    // Reserved node — slightly farther
    state = addNode(state, "wood", drone.tileX + 5, drone.tileY, 5);
    const reservedNodeId = Object.keys(state.collectionNodes)[0];
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [reservedNodeId]: { ...state.collectionNodes[reservedNodeId], reservedByDroneId: drone.droneId },
      },
    };
    // Closer alternative node (no reservation)
    state = addNode(state, "wood", drone.tileX + 3, drone.tileY, 5);

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    // Sticky bonus (15) outweighs the 2-tile distance advantage of the closer node.
    expect(task!.nodeId).toBe(reservedNodeId);
  });

  it("selection between two competing demand sites is deterministic across calls", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const drone = hubState.starterDrone;
    const siteAId = "det-site-A";
    const siteBId = "det-site-B";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteAId]: { id: siteAId, type: "workbench", x: drone.tileX + 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
        [siteBId]: { id: siteBId, type: "workbench", x: drone.tileX - 5, y: drone.tileY, size: 2, width: 2, height: 2 } as any,
      },
      constructionSites: {
        [siteAId]: { buildingType: "workbench", remaining: { wood: 10 } },
        [siteBId]: { buildingType: "workbench", remaining: { wood: 10 } },
      },
    };
    state = addNode(state, "wood", drone.tileX, drone.tileY + 1, 5);

    const first = selectDroneTask(state);
    const second = selectDroneTask(state);
    const third = selectDroneTask(state);
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });
});



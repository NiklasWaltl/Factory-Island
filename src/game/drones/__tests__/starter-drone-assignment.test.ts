import {
  addNode,
  BUILDING_COSTS,
  createDefaultHubTargetStock,
  createEmptyHubInventory,
  createInitialState,
  droneTick,
  gameReducer,
  getDroneHomeDock,
  getParkedDrones,
  MAP_SHOP_POS,
  placeServiceHub,
  PROTO_HUB_TARGET_STOCK,
  SERVICE_HUB_TARGET_STOCK,
  withDrone,
  withHubInventory,
  withTier2HubAndDockedDrones,
} from "../test-utils";
import type { GameState } from "../test-utils";

describe("DRONE_TICK – hub assignment", () => {
  let base: GameState;

  beforeEach(() => {
    base = createInitialState("release");
  });

  /** Place a hub without assigning the drone (raw placement only, no ASSIGN_DRONE_TO_HUB). */
  function placeHubOnly(
    state: GameState,
    x: number,
    y: number,
  ): { state: GameState; hubId: string } {
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
    const existingIds = new Set(
      Object.keys(state.assets).filter((id) => state.assets[id].type === "service_hub"),
    );
    s = gameReducer(s, { type: "BUILD_PLACE_BUILDING", x, y });
    const hubId = Object.keys(s.assets).find(
      (id) => s.assets[id].type === "service_hub" && !existingIds.has(id),
    )!;
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
      {
        ...nodeState,
        collectionNodes: {
          ...nodeState.collectionNodes,
          [nodeId]: {
            ...nodeState.collectionNodes[nodeId],
            reservedByDroneId: droneId,
          },
        },
      },
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
    state = gameReducer(state, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "copper",
      amount: 10,
    });
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
    let state = {
      ...base,
      inventory: { ...base.inventory, wood: 100, stone: 100, iron: 100 },
    };
    const hubId = state.starterDrone.hubId!;
    state = withTier2HubAndDockedDrones(state, hubId);

    const parked = getParkedDrones(state, hubId);
    expect(parked).toHaveLength(4);
    expect(new Set(parked.map((drone) => `${drone.tileX},${drone.tileY}`)).size).toBe(4);
  });
});

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
    let state = withHubInventory(base, hubId, {
      wood: SERVICE_HUB_TARGET_STOCK.wood,
    });
    state = addNode(state, "wood", 7, 5, 3);
    state = droneTick(state);
    // No suitable task: drone stays idle at hub or returns to hub anchor point.
    expect(["idle", "moving_to_dropoff"]).toContain(state.starterDrone.status);
  });

  it("still collects other resources even if one is full", () => {
    let state = withHubInventory(base, hubId, {
      wood: SERVICE_HUB_TARGET_STOCK.wood,
    });
    state = addNode(state, "wood", 7, 5, 3); // full — ignored
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
      (drone) =>
        drone.currentTaskType === "hub_restock" &&
        drone.status === "moving_to_collect",
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
    expect(state.inventory.wood).toBe(
      woodBefore +
        10 +
        Math.max(1, Math.floor(BUILDING_COSTS.service_hub.wood / 3)),
    );
    expect(state.inventory.stone).toBe(
      stoneBefore +
        5 +
        Math.max(1, Math.floor(BUILDING_COSTS.service_hub.stone / 3)),
    );
  });
});

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
    const next = gameReducer(base, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "wood",
      amount: 25,
    });
    expect(next.serviceHubs[hubId].targetStock.wood).toBe(25);
    // Others unchanged
    expect(next.serviceHubs[hubId].targetStock.stone).toBe(PROTO_HUB_TARGET_STOCK.stone);
  });

  it("clamps to 0 at minimum", () => {
    const next = gameReducer(base, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "iron",
      amount: -10,
    });
    expect(next.serviceHubs[hubId].targetStock.iron).toBe(0);
  });

  it("clamps to MAX_HUB_TARGET_STOCK at maximum", () => {
    const next = gameReducer(base, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "copper",
      amount: 999,
    });
    // Tier 1 hub clamps to PROTO_HUB_MAX_TARGET_STOCK
    expect(next.serviceHubs[hubId].targetStock.copper).toBe(30);
  });

  it("ignores unknown hubId", () => {
    const next = gameReducer(base, {
      type: "SET_HUB_TARGET_STOCK",
      hubId: "nonexistent",
      resource: "wood",
      amount: 50,
    });
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
      state = gameReducer(state, {
        type: "SET_HUB_TARGET_STOCK",
        hubId,
        resource: res,
        amount: 0,
      });
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
    let state = withHubInventory(base, hubId, {
      wood: SERVICE_HUB_TARGET_STOCK.wood,
    });
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
    state = gameReducer(state, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "wood",
      amount: SERVICE_HUB_TARGET_STOCK.wood + 10,
    });
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

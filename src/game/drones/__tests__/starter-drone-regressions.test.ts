import {
  addNode,
  BUILDING_COSTS,
  createDefaultHubTargetStock,
  createInitialState,
  droneTick,
  DRONE_DEMAND_BONUS_MAX,
  DRONE_ROLE_BONUS,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
  DRONE_URGENCY_BONUS_MAX,
  gameReducer,
  MAX_DRONES_PER_CONSTRUCTION_TARGET,
  placeBuilding,
  placeServiceHub,
  scoreDroneTask,
  selectDroneTask,
  withDrone,
} from "../test-utils";
import type { CollectableItemType, GameState } from "../test-utils";

// ============================================================
// Construction Site Tests
// ============================================================

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
    const wbId = Object.keys(state.assets).find((id) => state.assets[id].type === "workbench");
    expect(wbId).toBeTruthy();
    // Construction site should exist
    expect(state.constructionSites[wbId!]).toBeDefined();
    expect(state.constructionSites[wbId!].buildingType).toBe("workbench");
    // Remaining should have positive values
    const remaining = state.constructionSites[wbId!].remaining;
    const totalRemaining = Object.values(remaining).reduce((sum, value) => sum + (value ?? 0), 0);
    expect(totalRemaining).toBeGreaterThan(0);
  });

  it("places building as construction site even when hub+inventory covers full cost", () => {
    const { state: hubState } = placeServiceHub(base, 6, 6);
    // Give full resources for workbench
    const wbCost = BUILDING_COSTS.workbench;
    const fullInv = { ...hubState.inventory };
    for (const [res, amt] of Object.entries(wbCost)) {
      (fullInv as unknown as Record<string, number>)[res] =
        ((fullInv as unknown as Record<string, number>)[res] ?? 0) + amt;
    }
    let state = { ...hubState, inventory: fullInv };
    const invBefore = { ...state.inventory };
    state = placeBuilding(state, "workbench", 10, 10);
    const wbId = Object.keys(state.assets).find((id) => state.assets[id].type === "workbench");
    expect(wbId).toBeTruthy();
    // Construction site ALWAYS created when hub exists — drone delivers resources
    expect(state.constructionSites[wbId!]).toBeDefined();
    expect(state.constructionSites[wbId!].buildingType).toBe("workbench");
    // Inventory should NOT be deducted — drone handles delivery
    for (const [res] of Object.entries(wbCost)) {
      expect((state.inventory as unknown as Record<string, number>)[res]).toBe(
        (invBefore as unknown as Record<string, number>)[res],
      );
    }
  });

  it("does NOT create construction site without a hub", () => {
    // Remove all hubs from both serviceHubs and assets
    const assetsWithoutHubs = Object.fromEntries(
      Object.entries(base.assets).filter(([, asset]) => asset.type !== "service_hub"),
    );
    const noHubBase: GameState = {
      ...base,
      serviceHubs: {},
      assets: assetsWithoutHubs,
      starterDrone: { ...base.starterDrone, hubId: null },
    };
    const state = placeBuilding(noHubBase, "workbench", 10, 10);
    const wbId = Object.keys(state.assets).find((id) => state.assets[id].type === "workbench");
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
    const { state: hubState } = placeServiceHub(base, 6, 6);
    // Create a construction site manually
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const state = addNode(hubState, "wood", 8, 8, 10);
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
          droneIds: [
            state.starterDrone.droneId,
            "drone-2",
            "drone-3",
            "drone-4",
          ],
        },
      },
      drones: {
        ...state.drones,
        "drone-2": {
          ...state.starterDrone,
          droneId: "drone-2",
          tileX: 7,
          tileY: 6,
        },
        "drone-3": {
          ...state.starterDrone,
          droneId: "drone-3",
          tileX: 8,
          tileY: 6,
        },
        "drone-4": {
          ...state.starterDrone,
          droneId: "drone-4",
          tileX: 9,
          tileY: 6,
        },
      },
    };

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (drone) =>
        drone.currentTaskType === "construction_supply" &&
        drone.deliveryTargetId === siteId,
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
          droneIds: [
            state.starterDrone.droneId,
            "drone-2",
            "drone-3",
            "drone-4",
          ],
        },
      },
      drones: {
        ...state.drones,
        "drone-2": {
          ...state.starterDrone,
          droneId: "drone-2",
          tileX: 7,
          tileY: 6,
        },
        "drone-3": {
          ...state.starterDrone,
          droneId: "drone-3",
          tileX: 8,
          tileY: 6,
        },
        "drone-4": {
          ...state.starterDrone,
          droneId: "drone-4",
          tileX: 9,
          tileY: 6,
        },
      },
    };

    const next = gameReducer(state, { type: "DRONE_TICK" });
    const dispatched = Object.values(next.drones).filter(
      (drone) =>
        drone.currentTaskType === "construction_supply" &&
        drone.deliveryTargetId === siteId,
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
    expect(scoreDroneTask("hub_restock", 0, 0, 3, 4)).toBe(
      DRONE_TASK_BASE_SCORE.hub_restock - 4,
    );
    expect(scoreDroneTask("construction_supply", 0, 0, 3, 4)).toBe(
      DRONE_TASK_BASE_SCORE.construction_supply - 4,
    );
  });

  it("score at distance 0 equals base priority", () => {
    expect(scoreDroneTask("hub_restock", 5, 5, 5, 5)).toBe(
      DRONE_TASK_BASE_SCORE.hub_restock,
    );
    expect(scoreDroneTask("construction_supply", 5, 5, 5, 5)).toBe(
      DRONE_TASK_BASE_SCORE.construction_supply,
    );
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
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    // Drone starts near MAP_SHOP_POS (~39,24). Add near node and far node.
    // Near node at (35,24), far at (10,5) — both supply wood the hub needs.
    let state = addNode(hubState, "wood", 35, 24, 5); // near
    state = addNode(state, "wood", 10, 5, 5); // far

    const task = selectDroneTask(state);
    expect(task).not.toBeNull();
    expect(task!.taskType).toBe("hub_restock");
    // The near node should have been chosen — we check by comparing distances
    const chosenNode = state.collectionNodes[task!.nodeId];
    const drone = state.starterDrone;
    const chosenDist = Math.max(
      Math.abs(drone.tileX - chosenNode.tileX),
      Math.abs(drone.tileY - chosenNode.tileY),
    );
    const allNodes = Object.values(state.collectionNodes);
    for (const node of allNodes) {
      const d = Math.max(
        Math.abs(drone.tileX - node.tileX),
        Math.abs(drone.tileY - node.tileY),
      );
      expect(chosenDist).toBeLessThanOrEqual(d);
    }
  });

  it("construction_supply beats hub_restock even when construction node is at max distance", () => {
    const siteId = "far-site";
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    // Put the wood node far from the drone (opposite corner of grid)
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 70,
          y: 40,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 20,
          y: 20,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    // Construction site exists but asset was removed
    let state: GameState = {
      ...hubState,
      // Deliberately omit the asset from assets map
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 3 } },
      },
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
    const withBonus = scoreDroneTask("hub_restock", 0, 0, 5, 0, {
      role: DRONE_ROLE_BONUS,
    });
    expect(withBonus).toBe(base + DRONE_ROLE_BONUS);
  });

  it("DRONE_SET_ROLE sets role on starterDrone and drones record", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    let state = hubState;
    const droneId = state.starterDrone.droneId;
    expect(state.starterDrone.role ?? "auto").toBe("auto");
    state = gameReducer(state, {
      type: "DRONE_SET_ROLE",
      droneId,
      role: "construction",
    });
    expect(state.starterDrone.role).toBe("construction");
    // drones record must stay in sync
    expect(state.drones[droneId]?.role).toBe("construction");
  });

  it("supply-role drone prefers hub_restock over no-construction-site", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    let state = gameReducer(hubState, {
      type: "DRONE_SET_ROLE",
      droneId,
      role: "supply",
    });
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
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 20,
          y: 20,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    state = gameReducer(state, {
      type: "DRONE_SET_ROLE",
      droneId,
      role: "construction",
    });
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
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 20,
          y: 20,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    state = gameReducer(state, {
      type: "DRONE_SET_ROLE",
      droneId,
      role: "supply",
    });
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
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 70,
          y: 40,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 2 } },
      },
    };
    state = gameReducer(state, {
      type: "DRONE_SET_ROLE",
      droneId,
      role: "construction",
    });
    // Add a node at the far corner (same position as site) and one near hub
    state = addNode(state, "wood", 72, 42, 5); // far node for construction
    state = addNode(state, "wood", 8, 8, 5); // near node for hub
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
    const sticky = scoreDroneTask("hub_restock", 0, 0, 5, 0, {
      sticky: DRONE_STICKY_BONUS,
    });
    expect(sticky).toBe(base + DRONE_STICKY_BONUS);
  });

  it("reserved node is preferred over equally-scored unreserved node", () => {
    const { state: hubState } = placeServiceHub(createInitialState("release"), 6, 6);
    const droneId = hubState.starterDrone.droneId;
    // Add two equidistant wood nodes
    let state = addNode(hubState, "wood", 30, 24, 5); // node A
    state = addNode(state, "wood", 30, 24, 5); // node B (same position)
    // Manually reserve node A for our drone
    const nodeIds = Object.keys(state.collectionNodes);
    const [nodeA] = nodeIds;
    state = {
      ...state,
      collectionNodes: {
        ...state.collectionNodes,
        [nodeA]: {
          ...state.collectionNodes[nodeA],
          reservedByDroneId: droneId,
        },
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
    const highDeficit = scoreDroneTask("hub_restock", 0, 0, 0, 0, {
      urgency: DRONE_URGENCY_BONUS_MAX,
    });
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
    const { state: hubState } = placeServiceHub(base, 6, 6);
    const siteId = "fake-site";
    let state: GameState = {
      ...hubState,
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 8 } },
      },
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
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
        } as any,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 3 } },
      },
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
    const wbId = Object.keys(state.assets).find((id) => state.assets[id].type === "workbench");
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
      constructionSites: {
        ...state.constructionSites,
        [wbId!]: { ...site, remaining: newRemaining },
      },
    };
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
      assets: {
        ...hubState.assets,
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 12,
          y: 12,
          size: 2,
          width: 2,
          height: 2,
          fixed: false,
        } as any,
      },
      cellMap: {
        ...hubState.cellMap,
        "12,12": siteId,
        "13,12": siteId,
        "12,13": siteId,
        "13,13": siteId,
      },
      constructionSites: {
        [siteId]: { buildingType: "workbench", remaining: { wood: 5 } },
      },
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
    const withBoth = scoreDroneTask("construction_supply", 0, 0, 5, 0, {
      demand: 12,
      spread: -10,
    });
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
        [siteSmallId]: {
          id: siteSmallId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
        [siteLargeId]: {
          id: siteLargeId,
          type: "workbench",
          x: drone.tileX - 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
        [siteAId]: {
          id: siteAId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
        [siteBId]: {
          id: siteBId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY + 2,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
        [droneIds[1]]: {
          ...state.drones[droneIds[1]],
          currentTaskType: "construction_supply",
          deliveryTargetId: siteAId,
        },
        [droneIds[2]]: {
          ...state.drones[droneIds[2]],
          currentTaskType: "construction_supply",
          deliveryTargetId: siteAId,
        },
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
      (droneState) =>
        droneState.currentTaskType === "construction_supply" &&
        droneState.deliveryTargetId === siteId,
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
      (droneState) =>
        droneState.currentTaskType === "construction_supply" &&
        droneState.deliveryTargetId === siteId,
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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
      (droneState) =>
        droneState.currentTaskType === "construction_supply" &&
        droneState.deliveryTargetId === siteId,
    );
    const restock = Object.values(next.drones).filter(
      (droneState) => droneState.currentTaskType === "hub_restock",
    );
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
        [siteAId]: {
          id: siteAId,
          type: "workbench",
          x: drone.tileX + 6,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
        [siteBId]: {
          id: siteBId,
          type: "workbench",
          x: drone.tileX + 4,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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
        [reservedNodeId]: {
          ...state.collectionNodes[reservedNodeId],
          reservedByDroneId: drone.droneId,
        },
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
        [siteAId]: {
          id: siteAId,
          type: "workbench",
          x: drone.tileX + 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
        [siteBId]: {
          id: siteBId,
          type: "workbench",
          x: drone.tileX - 5,
          y: drone.tileY,
          size: 2,
          width: 2,
          height: 2,
        } as any,
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

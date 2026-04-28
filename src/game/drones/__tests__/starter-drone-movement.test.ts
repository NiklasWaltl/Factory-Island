import {
  addNode,
  createInitialState,
  DRONE_CAPACITY,
  DRONE_DEPOSIT_TICKS,
  droneTick,
  gameReducer,
  HUB_POS,
  MAP_SHOP_POS,
  placeServiceHub,
  withDrone,
} from "../test-utils";
import type { GameState } from "../test-utils";

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
    state = gameReducer(state, {
      type: "SET_HUB_TARGET_STOCK",
      hubId,
      resource: "copper",
      amount: 10,
    });
    state = addNode(state, "copper", MAP_SHOP_POS.x + 2, MAP_SHOP_POS.y, 2);
    const copperBefore = state.serviceHubs[hubId].inventory.copper;

    // Drive state machine until idle again (max 100 ticks safeguard)
    let ticks = 0;
    while (state.starterDrone.status !== "idle" || ticks === 0) {
      state = droneTick(state);
      ticks++;
      if (ticks > 100) {
        throw new Error("Drone stuck — didn't return to idle within 100 ticks");
      }
    }

    expect(state.serviceHubs[hubId].inventory.copper).toBe(copperBefore + 2);
    expect(Object.keys(state.collectionNodes)).toHaveLength(0);
  });
});

describe("DRONE_TICK – returning_to_dock", () => {
  let base: GameState;

  beforeEach(() => {
    const init = createInitialState("release");
    const placed = placeServiceHub(init, 8, 8);
    base = placed.state;
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
    const state = withDrone(base, {
      tileX: 0,
      tileY: 0,
      status: "returning_to_dock",
      ticksRemaining: 5,
    });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("returning_to_dock");
    // Should have moved closer to (8,8)
    const distBefore = Math.max(Math.abs(0 - 8), Math.abs(0 - 8));
    const distAfter = Math.max(
      Math.abs(next.starterDrone.tileX - 8),
      Math.abs(next.starterDrone.tileY - 8),
    );
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("returning_to_dock snaps to dock and goes idle on arrival", () => {
    const state = withDrone(base, {
      tileX: 7,
      tileY: 8,
      status: "returning_to_dock",
      ticksRemaining: 1,
    });
    const next = droneTick(state);
    expect(next.starterDrone.status).toBe("idle");
    expect(next.starterDrone.tileX).toBe(8);
    expect(next.starterDrone.tileY).toBe(8);
  });

  it("returning_to_dock aborts to collect when a task appears", () => {
    const state = withDrone(addNode(base, "wood", 5, 8, 3), {
      tileX: 2,
      tileY: 2,
      status: "returning_to_dock",
      ticksRemaining: 10,
    });
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
    const hubId = state.starterDrone.hubId!;
    const { [hubId]: _asset, ...restAssets } = state.assets;
    const stateNoHub = { ...state, assets: restAssets };
    const next = droneTick(stateNoHub);
    expect(next.starterDrone.status).toBe("idle");
    expect(next.starterDrone.ticksRemaining).toBe(0);
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
    const { state: hubState, hubId } = placeServiceHub(
      createInitialState("release"),
      5,
      5,
    );
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
    const distBefore = Math.max(
      Math.abs(before.x - hubAsset.x),
      Math.abs(before.y - hubAsset.y),
    );
    const distAfter = Math.max(
      Math.abs(state.starterDrone.tileX - hubAsset.x),
      Math.abs(state.starterDrone.tileY - hubAsset.y),
    );
    expect(distAfter).toBeLessThan(distBefore);
  });
});

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
        [siteId]: {
          id: siteId,
          type: "workbench",
          x: 15,
          y: 15,
          size: 2,
          width: 2,
          height: 2,
        },
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

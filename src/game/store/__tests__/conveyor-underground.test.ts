import {
  CONVEYOR_TILE_CAPACITY,
  cellKey,
  createInitialState,
  gameReducer,
  type ConveyorItem,
  type Direction,
  type GameAction,
  type GameState,
  type PlacedAsset,
} from "../reducer";
import { serializeState, deserializeState } from "../../simulation/save";
import { migrateSave } from "../../simulation/save-migrations";

function makeConveyor(id: string, x: number, y: number, direction: Direction): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction };
}

function makeUgIn(id: string, x: number, y: number, direction: Direction): PlacedAsset {
  return { id, type: "conveyor_underground_in", x, y, size: 1, direction };
}

function makeUgOut(id: string, x: number, y: number, direction: Direction): PlacedAsset {
  return { id, type: "conveyor_underground_out", x, y, size: 1, direction };
}

function makeState(overrides: Partial<GameState>): GameState {
  return {
    ...createInitialState("release"),
    ...overrides,
  };
}

function runTick(state: GameState): GameState {
  return gameReducer(state, { type: "LOGISTICS_TICK" } as GameAction);
}

describe("conveyor_underground", () => {
  test("moves items belt → tunnel-in → tunnel-out → belt over several ticks", () => {
    const state = makeState({
      assets: {
        prev: makeConveyor("prev", 9, 10, "east"),
        tin: makeUgIn("tin", 10, 10, "east"),
        tout: makeUgOut("tout", 13, 10, "east"),
        next: makeConveyor("next", 14, 10, "east"),
      },
      cellMap: {
        [cellKey(9, 10)]: "prev",
        [cellKey(10, 10)]: "tin",
        [cellKey(13, 10)]: "tout",
        [cellKey(14, 10)]: "next",
      },
      connectedAssetIds: ["prev", "tin", "tout", "next"],
      poweredMachineIds: ["prev", "tin", "tout", "next"],
      conveyors: {
        prev: { queue: ["iron"] },
        tin: { queue: [] },
        tout: { queue: [] },
        next: { queue: [] },
      },
      conveyorUndergroundPeers: { tin: "tout", tout: "tin" },
    });

    const t1 = runTick(state);
    expect(t1.conveyors.prev.queue).toEqual([]);
    expect(t1.conveyors.tin.queue).toEqual(["iron"]);
    expect(t1.conveyors.tout.queue).toEqual([]);
    expect(t1.conveyors.next.queue).toEqual([]);

    const t2 = runTick(t1);
    expect(t2.conveyors.tin.queue).toEqual([]);
    expect(t2.conveyors.tout.queue).toEqual(["iron"]);
    expect(t2.conveyors.next.queue).toEqual([]);

    const t3 = runTick(t2);
    expect(t3.conveyors.tout.queue).toEqual([]);
    expect(t3.conveyors.next.queue).toEqual(["iron"]);
  });

  test("orphan tunnel entrance accepts upstream items but does not tunnel forward", () => {
    const state = makeState({
      assets: {
        prev: makeConveyor("prev", 9, 10, "east"),
        tin: makeUgIn("tin", 10, 10, "east"),
      },
      cellMap: {
        [cellKey(9, 10)]: "prev",
        [cellKey(10, 10)]: "tin",
      },
      connectedAssetIds: ["prev", "tin"],
      poweredMachineIds: ["prev", "tin"],
      conveyors: {
        prev: { queue: ["iron"] },
        tin: { queue: [] },
      },
      conveyorUndergroundPeers: {},
    });

    const after = runTick(state);
    expect(after.conveyors.prev.queue).toEqual([]);
    expect(after.conveyors.tin.queue).toEqual(["iron"]);
    const after2 = runTick(after);
    expect(after2.conveyors.tin.queue).toEqual(["iron"]);
  });

  test("blocks when tunnel exit queue is full", () => {
    const full = Array(CONVEYOR_TILE_CAPACITY).fill("stone") as ConveyorItem[];
    const state = makeState({
      assets: {
        prev: makeConveyor("prev", 9, 10, "east"),
        tin: makeUgIn("tin", 10, 10, "east"),
        tout: makeUgOut("tout", 12, 10, "east"),
      },
      cellMap: {
        [cellKey(9, 10)]: "prev",
        [cellKey(10, 10)]: "tin",
        [cellKey(12, 10)]: "tout",
      },
      connectedAssetIds: ["prev", "tin", "tout"],
      poweredMachineIds: ["prev", "tin", "tout"],
      conveyors: {
        prev: { queue: ["iron"] },
        tin: { queue: [] },
        tout: { queue: full },
      },
      conveyorUndergroundPeers: { tin: "tout", tout: "tin" },
    });

    const after = runTick(state);
    expect(after.conveyors.prev.queue).toEqual([]);
    expect(after.conveyors.tin.queue).toEqual(["iron"]);
    expect(after.conveyors.tout.queue.length).toBe(CONVEYOR_TILE_CAPACITY);
    const after2 = runTick(after);
    expect(after2.conveyors.tin.queue).toEqual(["iron"]);
  });

  test("removing tunnel entrance also removes paired exit", () => {
    const state = makeState({
      assets: {
        tin: makeUgIn("tin", 20, 20, "east"),
        tout: makeUgOut("tout", 23, 20, "east"),
      },
      cellMap: {
        [cellKey(20, 20)]: "tin",
        [cellKey(23, 20)]: "tout",
      },
      conveyors: { tin: { queue: [] }, tout: { queue: [] } },
      conveyorUndergroundPeers: { tin: "tout", tout: "tin" },
      buildMode: true,
      connectedAssetIds: [],
      poweredMachineIds: [],
    });

    const after = gameReducer(state, {
      type: "BUILD_REMOVE_ASSET",
      assetId: "tin",
    } as GameAction);
    expect(after.assets.tin).toBeUndefined();
    expect(after.assets.tout).toBeUndefined();
    expect(after.conveyorUndergroundPeers.tin).toBeUndefined();
    expect(after.conveyorUndergroundPeers.tout).toBeUndefined();
  });

  test("serialize / migrate / deserialize keeps underground peer map", () => {
    const state = makeState({
      assets: {
        tin: makeUgIn("tin", 5, 5, "south"),
        tout: makeUgOut("tout", 5, 8, "south"),
      },
      cellMap: {
        [cellKey(5, 5)]: "tin",
        [cellKey(5, 8)]: "tout",
      },
      conveyors: { tin: { queue: [] }, tout: { queue: [] } },
      conveyorUndergroundPeers: { tin: "tout", tout: "tin" },
      connectedAssetIds: [],
      poweredMachineIds: [],
    });

    const blob = serializeState(state);
    const migrated = migrateSave(blob);
    expect(migrated).not.toBeNull();
    expect(migrated!.conveyorUndergroundPeers).toEqual({ tin: "tout", tout: "tin" });
    const loaded = deserializeState(migrated!);
    expect(loaded.conveyorUndergroundPeers).toEqual({ tin: "tout", tout: "tin" });
  });
});

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
import { SPLITTER_OUTPUT_SIDE_PRIORITY } from "../conveyor-decisions";

function makeConveyorAsset(
  id: string,
  x: number,
  y: number,
  direction: Direction,
): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction };
}

function makeSplitterAsset(
  id: string,
  x: number,
  y: number,
  direction: Direction,
): PlacedAsset {
  return { id, type: "conveyor_splitter", x, y, size: 1, direction };
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

function allConveyorItems(state: GameState): ConveyorItem[] {
  return Object.values(state.conveyors).flatMap((entry) => entry.queue);
}

describe("conveyor_splitter V1", () => {
  test("explicit output priority is left before right", () => {
    expect([...SPLITTER_OUTPUT_SIDE_PRIORITY]).toEqual(["left", "right"]);
  });

  test("moves item from belt through splitter to left output when both arms are free", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 1, 2, "east"),
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
      },
      cellMap: {
        [cellKey(1, 2)]: "input",
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
      },
      connectedAssetIds: ["input", "splitter", "leftOut"],
      poweredMachineIds: ["input", "splitter", "leftOut"],
      conveyors: {
        input: { queue: ["iron"] },
        splitter: { queue: [] },
        leftOut: { queue: [] },
      },
    });

    const afterIn = runTick(state);
    expect(afterIn.conveyors.input.queue).toEqual([]);
    expect(afterIn.conveyors.splitter.queue).toEqual(["iron"]);
    expect(afterIn.conveyors.leftOut.queue).toEqual([]);

    const afterLeft = runTick(afterIn);
    expect(afterLeft.conveyors.splitter.queue).toEqual([]);
    expect(afterLeft.conveyors.leftOut.queue).toEqual(["iron"]);
  });

  test("routes to right output when left arm is full", () => {
    const fullLeft = Array(CONVEYOR_TILE_CAPACITY).fill("stone") as ConveyorItem[];
    const state = makeState({
      assets: {
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
        rightOut: makeConveyorAsset("rightOut", 2, 3, "south"),
      },
      cellMap: {
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
        [cellKey(2, 3)]: "rightOut",
      },
      connectedAssetIds: ["splitter", "leftOut", "rightOut"],
      poweredMachineIds: ["splitter", "leftOut", "rightOut"],
      conveyors: {
        splitter: { queue: ["iron"] },
        leftOut: { queue: fullLeft },
        rightOut: { queue: [] },
      },
    });

    const after = runTick(state);
    expect(after.conveyors.splitter.queue).toEqual([]);
    expect(after.conveyors.leftOut.queue).toHaveLength(CONVEYOR_TILE_CAPACITY);
    expect(after.conveyors.rightOut.queue).toEqual(["iron"]);
  });

  test("keeps item on splitter when both outputs are blocked", () => {
    const full = Array(CONVEYOR_TILE_CAPACITY).fill("stone") as ConveyorItem[];
    const state = makeState({
      assets: {
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
        rightOut: makeConveyorAsset("rightOut", 2, 3, "south"),
      },
      cellMap: {
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
        [cellKey(2, 3)]: "rightOut",
      },
      connectedAssetIds: ["splitter", "leftOut", "rightOut"],
      poweredMachineIds: ["splitter", "leftOut", "rightOut"],
      conveyors: {
        splitter: { queue: ["iron"] },
        leftOut: { queue: full },
        rightOut: { queue: full },
      },
    });

    const before = allConveyorItems(state);
    const after = runTick(state);
    expect(after.conveyors.splitter.queue).toEqual(["iron"]);
    expect(allConveyorItems(after)).toEqual(before);
  });

  test("rejects lateral belt feeding into splitter (only back input is valid)", () => {
    const state = makeState({
      assets: {
        sideFeed: makeConveyorAsset("sideFeed", 2, 1, "south"),
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 1)]: "sideFeed",
        [cellKey(2, 2)]: "splitter",
      },
      connectedAssetIds: ["sideFeed", "splitter"],
      poweredMachineIds: ["sideFeed", "splitter"],
      conveyors: {
        sideFeed: { queue: ["iron"] },
        splitter: { queue: [] },
      },
    });

    const after = runTick(state);
    expect(after.conveyors.sideFeed.queue).toEqual(["iron"]);
    expect(after.conveyors.splitter.queue).toEqual([]);
  });

  test("accepts feed from back cell through straight conveyor", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 1, 2, "east"),
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
      },
      cellMap: {
        [cellKey(1, 2)]: "input",
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
      },
      connectedAssetIds: ["input", "splitter", "leftOut"],
      poweredMachineIds: ["input", "splitter", "leftOut"],
      conveyors: {
        input: { queue: ["copper"] },
        splitter: { queue: [] },
        leftOut: { queue: [] },
      },
    });

    const after = runTick(state);
    expect(after.conveyors.input.queue).toEqual([]);
    expect(after.conveyors.splitter.queue).toEqual(["copper"]);
  });

  test("zone mismatch blocks handoff into splitter without item loss", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 1, 2, "east"),
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(1, 2)]: "input",
        [cellKey(2, 2)]: "splitter",
      },
      connectedAssetIds: ["input", "splitter"],
      poweredMachineIds: ["input", "splitter"],
      conveyors: {
        input: { queue: ["iron"] },
        splitter: { queue: [] },
      },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: {
        input: "zA",
        splitter: "zB",
      },
    });

    const after = runTick(state);
    expect(after.conveyors.input.queue).toEqual(["iron"]);
    expect(after.conveyors.splitter.queue).toEqual([]);
    expect(allConveyorItems(after)).toEqual(["iron"]);
  });

  test("does not forward from splitter when splitter is unpowered", () => {
    const state = makeState({
      assets: {
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
      },
      cellMap: {
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
      },
      connectedAssetIds: ["splitter", "leftOut"],
      poweredMachineIds: ["leftOut"],
      conveyors: {
        splitter: { queue: ["iron"] },
        leftOut: { queue: [] },
      },
    });

    const after = runTick(state);
    expect(after.conveyors.splitter.queue).toEqual(["iron"]);
    expect(after.conveyors.leftOut.queue).toEqual([]);
  });

  test("no item duplication across two logistics ticks", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 1, 2, "east"),
        splitter: makeSplitterAsset("splitter", 2, 2, "east"),
        leftOut: makeConveyorAsset("leftOut", 2, 1, "north"),
      },
      cellMap: {
        [cellKey(1, 2)]: "input",
        [cellKey(2, 2)]: "splitter",
        [cellKey(2, 1)]: "leftOut",
      },
      connectedAssetIds: ["input", "splitter", "leftOut"],
      poweredMachineIds: ["input", "splitter", "leftOut"],
      conveyors: {
        input: { queue: ["iron"] },
        splitter: { queue: [] },
        leftOut: { queue: [] },
      },
    });

    const t1 = runTick(state);
    expect(allConveyorItems(t1).filter((x) => x === "iron").length).toBe(1);
    const t2 = runTick(t1);
    expect(allConveyorItems(t2).filter((x) => x === "iron").length).toBe(1);
    expect(t2.conveyors.leftOut.queue).toEqual(["iron"]);
  });
});

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

function makeConveyorAsset(
  id: string,
  x: number,
  y: number,
  direction: Direction,
): PlacedAsset {
  return { id, type: "conveyor", x, y, size: 1, direction };
}

function makeMergerAsset(
  id: string,
  x: number,
  y: number,
  direction: Direction,
): PlacedAsset {
  return { id, type: "conveyor_merger", x, y, size: 1, direction };
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

describe("conveyor_merger V1", () => {
  test("moves items from belt to merger to output belt", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 2, 1, "south"),
        merger: makeMergerAsset("merger", 2, 2, "east"),
        output: makeConveyorAsset("output", 3, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 1)]: "input",
        [cellKey(2, 2)]: "merger",
        [cellKey(3, 2)]: "output",
      },
      connectedAssetIds: ["input", "merger", "output"],
      poweredMachineIds: ["input", "merger", "output"],
      conveyors: {
        input: { queue: ["iron"] },
        merger: { queue: [] },
        output: { queue: [] },
      },
    });

    const afterInput = runTick(state);
    expect(afterInput.conveyors.input.queue).toEqual([]);
    expect(afterInput.conveyors.merger.queue).toEqual(["iron"]);
    expect(afterInput.conveyors.output.queue).toEqual([]);

    const afterOutput = runTick(afterInput);
    expect(afterOutput.conveyors.merger.queue).toEqual([]);
    expect(afterOutput.conveyors.output.queue).toEqual(["iron"]);
  });

  test("blocks cleanly when merger queue is full", () => {
    const fullQueue = Array(CONVEYOR_TILE_CAPACITY).fill("stone") as ConveyorItem[];
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 2, 1, "south"),
        merger: makeMergerAsset("merger", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 1)]: "input",
        [cellKey(2, 2)]: "merger",
      },
      connectedAssetIds: ["input", "merger"],
      poweredMachineIds: ["input", "merger"],
      conveyors: {
        input: { queue: ["iron"] },
        merger: { queue: fullQueue },
      },
    });

    const beforeItems = allConveyorItems(state);
    const after = runTick(state);

    expect(after.conveyors.input.queue).toEqual(["iron"]);
    expect(after.conveyors.merger.queue).toHaveLength(CONVEYOR_TILE_CAPACITY);
    expect(allConveyorItems(after)).toEqual(beforeItems);
  });

  test("rejects the backward input side", () => {
    const state = makeState({
      assets: {
        backward: makeConveyorAsset("backward", 1, 2, "east"),
        merger: makeMergerAsset("merger", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(1, 2)]: "backward",
        [cellKey(2, 2)]: "merger",
      },
      connectedAssetIds: ["backward", "merger"],
      poweredMachineIds: ["backward", "merger"],
      conveyors: {
        backward: { queue: ["iron"] },
        merger: { queue: [] },
      },
    });

    const after = runTick(state);

    expect(after.conveyors.backward.queue).toEqual(["iron"]);
    expect(after.conveyors.merger.queue).toEqual([]);
    expect(allConveyorItems(after)).toEqual(["iron"]);
  });

  test("uses fixed left-before-right priority when both inputs can deliver", () => {
    const state = makeState({
      assets: {
        right: makeConveyorAsset("right", 2, 3, "north"),
        left: makeConveyorAsset("left", 2, 1, "south"),
        merger: makeMergerAsset("merger", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 3)]: "right",
        [cellKey(2, 1)]: "left",
        [cellKey(2, 2)]: "merger",
      },
      connectedAssetIds: ["right", "left", "merger"],
      poweredMachineIds: ["right", "left", "merger"],
      conveyors: {
        right: { queue: ["copper"] },
        left: { queue: ["iron"] },
        merger: { queue: [] },
      },
    });

    const after = runTick(state);

    expect(after.conveyors.left.queue).toEqual([]);
    expect(after.conveyors.right.queue).toEqual(["copper"]);
    expect(after.conveyors.merger.queue).toEqual(["iron"]);
    expect(allConveyorItems(after).sort()).toEqual(["copper", "iron"]);
  });

  test("keeps merger output blocked when the merger is unpowered", () => {
    const state = makeState({
      assets: {
        merger: makeMergerAsset("merger", 2, 2, "east"),
        output: makeConveyorAsset("output", 3, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 2)]: "merger",
        [cellKey(3, 2)]: "output",
      },
      connectedAssetIds: ["merger", "output"],
      poweredMachineIds: ["output"],
      conveyors: {
        merger: { queue: ["iron"] },
        output: { queue: [] },
      },
    });

    const after = runTick(state);

    expect(after.conveyors.merger.queue).toEqual(["iron"]);
    expect(after.conveyors.output.queue).toEqual([]);
  });

  test("keeps zone-incompatible input blocked without item loss", () => {
    const state = makeState({
      assets: {
        input: makeConveyorAsset("input", 2, 1, "south"),
        merger: makeMergerAsset("merger", 2, 2, "east"),
      },
      cellMap: {
        [cellKey(2, 1)]: "input",
        [cellKey(2, 2)]: "merger",
      },
      connectedAssetIds: ["input", "merger"],
      poweredMachineIds: ["input", "merger"],
      conveyors: {
        input: { queue: ["iron"] },
        merger: { queue: [] },
      },
      productionZones: {
        zA: { id: "zA", name: "Zone A" },
        zB: { id: "zB", name: "Zone B" },
      },
      buildingZoneIds: {
        input: "zA",
        merger: "zB",
      },
    });

    const after = runTick(state);

    expect(after.conveyors.input.queue).toEqual(["iron"]);
    expect(after.conveyors.merger.queue).toEqual([]);
    expect(allConveyorItems(after)).toEqual(["iron"]);
  });
});

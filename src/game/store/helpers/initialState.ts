import type { Direction, GameState } from "../types";

type CellMap = GameState["cellMap"];

export function decideInitialWarehousePlacement(input: {
  shopX: number;
  shopY: number;
  gridWidth: number;
  gridHeight: number;
  cellMap: CellMap;
}): { x: number; y: number } | null {
  const toCellKey = (x: number, y: number): string => `${x},${y}`;
  const candidates: { x: number; y: number; dist: number }[] = [];

  for (let dy = -10; dy <= 10; dy++) {
    for (let dx = -10; dx <= 10; dx++) {
      const wx = input.shopX + dx;
      const wy = input.shopY + dy;
      if (
        wx < 0 ||
        wy < 0 ||
        wx + 2 > input.gridWidth ||
        wy + 2 > input.gridHeight
      ) {
        continue;
      }
      candidates.push({ x: wx, y: wy, dist: Math.abs(dx) + Math.abs(dy) });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);

  for (const { x, y } of candidates) {
    if (
      !input.cellMap[toCellKey(x, y)] &&
      !input.cellMap[toCellKey(x + 1, y)] &&
      !input.cellMap[toCellKey(x, y + 1)] &&
      !input.cellMap[toCellKey(x + 1, y + 1)]
    ) {
      return { x, y };
    }
  }

  return null;
}

export interface DebugBootstrapLayout {
  minerPos: { x: number; y: number; dir: Direction };
  autoSmelterPos: { x: number; y: number };
  warehousePos: { x: number; y: number };
  generatorA: { x: number; y: number };
  generatorB: { x: number; y: number };
  polePositions: { x: number; y: number }[];
  inputBelts: { x: number; y: number; dir: Direction }[];
  outputBelts: { x: number; y: number; dir: Direction }[];
}

export function deriveDebugBootstrapLayout(input: {
  ironDepositX: number;
  ironDepositY: number;
  gridWidth: number;
  gridHeight: number;
}): DebugBootstrapLayout {
  const minerPos = {
    x: input.ironDepositX,
    y: input.ironDepositY,
    dir: "west" as Direction,
  };
  const autoSmelterPos = {
    x: Math.max(2, minerPos.x - 5),
    y: minerPos.y,
  };
  const warehousePos = {
    x: Math.max(1, minerPos.x - 8),
    y: Math.max(0, minerPos.y - 2),
  };
  const generatorA = {
    x: Math.max(0, autoSmelterPos.x - 2),
    y: Math.min(input.gridHeight - 2, autoSmelterPos.y + 3),
  };
  const generatorB = {
    x: Math.min(input.gridWidth - 2, autoSmelterPos.x + 1),
    y: Math.min(input.gridHeight - 2, autoSmelterPos.y + 3),
  };
  const polePositions = [
    { x: autoSmelterPos.x + 1, y: autoSmelterPos.y + 2 },
    { x: autoSmelterPos.x - 1, y: autoSmelterPos.y + 2 },
    { x: warehousePos.x + 1, y: warehousePos.y + 2 },
    // Bridge pole so the auto-miner tile is within POWER_POLE_RANGE in debug setup.
    { x: minerPos.x - 3, y: minerPos.y + 1 },
  ].filter(
    (position) =>
      position.x >= 0 &&
      position.x < input.gridWidth &&
      position.y >= 0 &&
      position.y < input.gridHeight,
  );

  const inputBelts = [
    { x: minerPos.x - 1, y: minerPos.y, dir: "west" as Direction },
    { x: minerPos.x - 2, y: minerPos.y, dir: "west" as Direction },
    { x: minerPos.x - 3, y: minerPos.y, dir: "west" as Direction },
  ];
  const outputBelts = [
    { x: autoSmelterPos.x - 1, y: autoSmelterPos.y, dir: "west" as Direction },
    { x: autoSmelterPos.x - 2, y: autoSmelterPos.y, dir: "west" as Direction },
    { x: autoSmelterPos.x - 3, y: autoSmelterPos.y, dir: "west" as Direction },
  ];

  return {
    minerPos,
    autoSmelterPos,
    warehousePos,
    generatorA,
    generatorB,
    polePositions,
    inputBelts,
    outputBelts,
  };
}

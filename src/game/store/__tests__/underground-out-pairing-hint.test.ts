import { GRID_W } from "../../constants/grid";
import { cellKey } from "../cell-key";
import {
  explainUndergroundOutPairingFailure,
  findUnpairedUndergroundEntranceId,
  isUndergroundOutPlacementGeometricallyValid,
} from "../underground-out-pairing-hint";
import type { Direction, PlacedAsset } from "../types";

function ugIn(id: string, x: number, y: number, direction: Direction): PlacedAsset {
  return { id, type: "conveyor_underground_in", x, y, size: 1, direction };
}

describe("findUnpairedUndergroundEntranceId", () => {
  test("returns nearest unpaired entrance along flow axis", () => {
    const tin = ugIn("tin", 13, 10, "east");
    const id = findUnpairedUndergroundEntranceId(
      {
        cellMap: { [cellKey(13, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: {},
      },
      15,
      10,
      "east",
    );
    expect(id).toBe("tin");
  });

  test("skips paired entrance", () => {
    const tin = ugIn("tin", 13, 10, "east");
    const id = findUnpairedUndergroundEntranceId(
      {
        cellMap: { [cellKey(13, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: { tin: "x", x: "tin" },
      },
      15,
      10,
      "east",
    );
    expect(id).toBeNull();
  });
});

describe("isUndergroundOutPlacementGeometricallyValid", () => {
  test("true for standard in/out spacing", () => {
    const tin = ugIn("tin", 10, 10, "east");
    const ok = isUndergroundOutPlacementGeometricallyValid(
      {
        cellMap: { [cellKey(10, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: {},
      },
      13,
      10,
      "east",
    );
    expect(ok).toBe(true);
  });

  test("false when no entrance", () => {
    const ok = isUndergroundOutPlacementGeometricallyValid(
      { cellMap: {}, assets: {}, conveyorUndergroundPeers: {} },
      15,
      10,
      "east",
    );
    expect(ok).toBe(false);
  });
});

describe("explainUndergroundOutPairingFailure", () => {
  test("map edge: no in-bounds step along tunnel axis", () => {
    const outX = 0;
    const outY = 5;
    const direction: Direction = "east";
    const msg = explainUndergroundOutPairingFailure(
      { cellMap: {}, assets: {}, conveyorUndergroundPeers: {} },
      outX,
      outY,
      direction,
    );
    expect(msg).toMatch(/Kartenrand|rückwärts/i);
  });

  test("no underground in within 2–5 cells", () => {
    const msg = explainUndergroundOutPairingFailure(
      { cellMap: {}, assets: {}, conveyorUndergroundPeers: {} },
      15,
      10,
      "east",
    );
    expect(msg).toMatch(/Kein Untergrund-Eingang|kein Untergrund-Eingang/i);
  });

  test("entrance wrong direction only", () => {
    const tin = ugIn("tin", 13, 10, "west");
    const msg = explainUndergroundOutPairingFailure(
      {
        cellMap: { [cellKey(13, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: {},
      },
      15,
      10,
      "east",
    );
    expect(msg).toMatch(/Laufrichtung|Richtung/i);
  });

  test("matching direction but already paired", () => {
    const tin = ugIn("tin", 13, 10, "east");
    const msg = explainUndergroundOutPairingFailure(
      {
        cellMap: { [cellKey(13, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: { tin: "other", other: "tin" },
      },
      15,
      10,
      "east",
    );
    expect(msg).toMatch(/verbunden|Partner/i);
  });

  test("defensive generic when unpaired match exists (inconsistent caller)", () => {
    const tin = ugIn("tin", 13, 10, "east");
    const msg = explainUndergroundOutPairingFailure(
      {
        cellMap: { [cellKey(13, 10)]: "tin" },
        assets: { tin },
        conveyorUndergroundPeers: {},
      },
      15,
      10,
      "east",
    );
    expect(msg).toMatch(/freier Eingang|Kein Untergrund-Eingang/i);
  });

  test("mixed wrong direction and paired matching", () => {
    const tinA = ugIn("tinA", 12, 10, "north");
    const tinB = ugIn("tinB", 13, 10, "east");
    const msg = explainUndergroundOutPairingFailure(
      {
        cellMap: {
          [cellKey(12, 10)]: "tinA",
          [cellKey(13, 10)]: "tinB",
        },
        assets: { tinA, tinB },
        conveyorUndergroundPeers: { tinB: "x", x: "tinB" },
      },
      15,
      10,
      "east",
    );
    expect(msg).toMatch(/Richtung|verbunden|frei/i);
  });

  test("west-facing out at right edge: all tunnel steps OOB", () => {
    const msg = explainUndergroundOutPairingFailure(
      { cellMap: {}, assets: {}, conveyorUndergroundPeers: {} },
      GRID_W - 1,
      5,
      "west",
    );
    expect(msg).toMatch(/Kartenrand|rückwärts/i);
  });
});

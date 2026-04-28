/**
 * Shared helpers for conveyor_underground_out: entrance resolution (same rules
 * as placement), geometric preview validity, and UX copy when pairing fails.
 */

import { GRID_H, GRID_W } from "../constants/grid";
import { cellKey } from "./cell-key";
import {
  MAX_UNDERGROUND_SPAN,
  MIN_UNDERGROUND_SPAN,
  undergroundSpanCellsInBounds,
} from "./constants/conveyor";
import { directionOffset } from "./direction";
import type { Direction, GameState, PlacedAsset } from "./types";

export type UndergroundOutPairScanDeps = Pick<
  GameState,
  "cellMap" | "assets" | "conveyorUndergroundPeers"
>;

/**
 * First matching unpaired conveyor_underground_in along the tunnel axis
 * (same k-order and conditions as BUILD_PLACE_BUILDING for underground out).
 */
export function findUnpairedUndergroundEntranceId(
  deps: UndergroundOutPairScanDeps,
  outX: number,
  outY: number,
  direction: Direction,
): string | null {
  const [ox, oy] = directionOffset(direction);
  for (let k = MIN_UNDERGROUND_SPAN; k <= MAX_UNDERGROUND_SPAN; k++) {
    const ix = outX - ox * k;
    const iy = outY - oy * k;
    if (ix < 0 || ix >= GRID_W || iy < 0 || iy >= GRID_H) continue;
    const id = deps.cellMap[cellKey(ix, iy)] ?? null;
    if (!id) continue;
    const a = deps.assets[id];
    if (!a || a.type !== "conveyor_underground_in") continue;
    if ((a.direction ?? "east") !== direction) continue;
    if (deps.conveyorUndergroundPeers[id]) continue;
    return id;
  }
  return null;
}

/** True iff an out at (outX,outY) with direction would pass entrance + span checks (cell occupancy is not checked here). */
export function isUndergroundOutPlacementGeometricallyValid(
  deps: UndergroundOutPairScanDeps,
  outX: number,
  outY: number,
  direction: Direction,
): boolean {
  const entranceId = findUnpairedUndergroundEntranceId(deps, outX, outY, direction);
  if (!entranceId) return false;
  const entrance = deps.assets[entranceId];
  if (!entrance || entrance.type !== "conveyor_underground_in") return false;
  const tempOut: Pick<PlacedAsset, "x" | "y" | "direction" | "type" | "size" | "id"> = {
    id: "temp",
    type: "conveyor_underground_out",
    x: outX,
    y: outY,
    size: 1,
    direction,
  };
  return undergroundSpanCellsInBounds(entrance, tempOut);
}

export function explainUndergroundOutPairingFailure(
  deps: UndergroundOutPairScanDeps,
  outX: number,
  outY: number,
  direction: Direction,
): string {
  const [ox, oy] = directionOffset(direction);
  let sawInBoundsStep = false;
  let sawWrongDirectionIn = false;
  let sawRightDirectionPaired = false;
  let sawRightDirectionUnpaired = false;

  for (let k = MIN_UNDERGROUND_SPAN; k <= MAX_UNDERGROUND_SPAN; k++) {
    const ix = outX - ox * k;
    const iy = outY - oy * k;
    if (ix < 0 || ix >= GRID_W || iy < 0 || iy >= GRID_H) continue;
    sawInBoundsStep = true;
    const id = deps.cellMap[cellKey(ix, iy)] ?? null;
    if (!id) continue;
    const a = deps.assets[id];
    if (!a || a.type !== "conveyor_underground_in") continue;
    const inDir = a.direction ?? "east";
    if (inDir !== direction) {
      sawWrongDirectionIn = true;
      continue;
    }
    if (deps.conveyorUndergroundPeers[id]) {
      sawRightDirectionPaired = true;
    } else {
      sawRightDirectionUnpaired = true;
    }
  }

  if (!sawInBoundsStep) {
    return "Untergrund-Ausgang: Zu nah am Kartenrand — rückwärts der Flussrichtung reicht kein Abstand für einen Eingang (2–5 Felder).";
  }

  if (sawRightDirectionUnpaired) {
    return "Untergrund-Ausgang: Kein freier Eingang in Fluchtrichtung (2–5 Felder) gefunden.";
  }

  if (sawRightDirectionPaired && !sawWrongDirectionIn) {
    return "Untergrund-Ausgang: In Reichweite gibt es nur bereits verbundene Eingänge (gleiche Richtung). Partner-Ausgang entfernen oder neuen Eingang setzen.";
  }

  if (sawWrongDirectionIn && !sawRightDirectionPaired) {
    return "Untergrund-Ausgang: Ein Eingang liegt in Reichweite, aber die Laufrichtung passt nicht. Mit R drehen, bis beide Pfeile gleichher zeigen.";
  }

  if (sawWrongDirectionIn && sawRightDirectionPaired) {
    return "Untergrund-Ausgang: Kein freier passender Eingang — Richtung (R) prüfen oder verbundenen Eingang freimachen.";
  }

  return "Untergrund-Ausgang: Kein Untergrund-Eingang 2–5 Felder hinter diesem Feld (gegen die Flussrichtung). Zuerst einen Eingang in dieser Linie setzen.";
}

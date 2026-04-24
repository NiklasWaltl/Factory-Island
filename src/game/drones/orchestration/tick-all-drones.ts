import type { GameState, StarterDroneState } from "../../store/types";

export interface TickAllDronesDeps {
  tickOneDrone: (state: GameState, droneId: string) => GameState;
  readStarterRecord: (state: Pick<GameState, "drones">) => StarterDroneState | undefined;
  writeStarterRecord: (state: GameState, starter: StarterDroneState) => GameState;
  listDroneIds: (state: Pick<GameState, "drones">) => readonly string[];
}

/**
 * Tick all drones sequentially for one reducer step.
 *
 * Ordering is deterministic by iterating the current drone-id list once at the
 * beginning of the tick. Each subsequent drone sees all mutations made by the
 * previously ticked drones.
 */
export function tickAllDrones(state: GameState, deps: TickAllDronesDeps): GameState {
  const starterRecord = deps.readStarterRecord(state);
  const startState = starterRecord !== state.starterDrone
    ? deps.writeStarterRecord(state, state.starterDrone)
    : state;

  let nextState = startState;
  for (const droneId of deps.listDroneIds(startState)) {
    nextState = deps.tickOneDrone(nextState, droneId);
  }
  return nextState;
}

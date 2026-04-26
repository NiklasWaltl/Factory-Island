import type { GameState } from "../../types";

export interface DroneTickActionDeps {
  tickOneDrone(state: GameState, droneId: string): GameState;
}

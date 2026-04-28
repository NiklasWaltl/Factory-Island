import type { GameState } from "../../types";

export interface DroneRoleActionDeps {
  syncDrones(state: GameState): GameState;
}

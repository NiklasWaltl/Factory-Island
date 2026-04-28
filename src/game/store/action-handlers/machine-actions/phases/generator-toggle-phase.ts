import { debugLog } from "../../../../debug/debugLogger";
import type { GameState } from "../../../types";
import type { MachineActionDeps } from "../deps";
import type { GeneratorToggleAction } from "../types";

export interface GeneratorToggleContext {
  state: GameState;
  action: GeneratorToggleAction;
  deps: MachineActionDeps;
}

export function runGeneratorTogglePhase(
  ctx: GeneratorToggleContext,
): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
    case "GENERATOR_START": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      if (!gen || gen.running || gen.fuel <= 0) return state;
      debugLog.building(`Generator ${genId}: started`);
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: { ...gen, running: true },
        },
      };
    }

    case "GENERATOR_STOP": {
      const genId = state.selectedGeneratorId;
      if (!genId) return state;
      const gen = state.generators[genId];
      if (!gen) return state;
      debugLog.building(`Generator ${genId}: stopped`);
      const fuelAfterStop =
        gen.progress > 0 ? Math.max(0, gen.fuel - 1) : gen.fuel;
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: {
            ...gen,
            running: false,
            progress: 0,
            fuel: fuelAfterStop,
          },
        },
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

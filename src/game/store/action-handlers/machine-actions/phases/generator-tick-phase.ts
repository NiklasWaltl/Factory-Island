import { GENERATOR_TICKS_PER_WOOD } from "../../../constants/energy/generator";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { MachineActionDeps } from "../deps";

type GeneratorTickAction = Extract<
  GameAction,
  {
    type: "GENERATOR_TICK";
  }
>;

export interface GeneratorTickContext {
  state: GameState;
  action: GeneratorTickAction;
  deps: MachineActionDeps;
}

export function runGeneratorTickPhase(
  ctx: GeneratorTickContext,
): GameState {
  const { state, deps } = ctx;

  const newGenerators = { ...state.generators };
  let changed = false;
  for (const id of Object.keys(newGenerators)) {
    if (deps.isUnderConstruction(state, id)) continue;
    const g = newGenerators[id];
    if (!g.running || g.fuel <= 0) {
      if (g.running) {
        newGenerators[id] = { ...g, running: false };
        changed = true;
      }
      continue;
    }
    const newProgress = g.progress + 1 / GENERATOR_TICKS_PER_WOOD;
    if (newProgress >= 1) {
      const newFuel = g.fuel - 1;
      newGenerators[id] = {
        ...g,
        fuel: newFuel,
        progress: 0,
        running: newFuel > 0,
      };
    } else {
      newGenerators[id] = { ...g, progress: newProgress };
    }
    changed = true;
  }
  if (!changed) return state;
  return { ...state, generators: newGenerators };
}

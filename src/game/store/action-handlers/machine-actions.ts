// ============================================================
// Machine action handler
// ------------------------------------------------------------
// Extracts the cohesive machine-operation cluster from reducer.ts:
// - SMITHY_* actions
// - GENERATOR_* actions (without ENERGY_NET_TICK)
//
// Behaviour is intentionally unchanged.
// ============================================================

import type { GameAction } from "../actions";
import type { GameState } from "../types";
import type { MachineActionDeps } from "./machine-actions/deps";
import {
  runGeneratorTogglePhase,
  runGeneratorFuelPhase,
  runGeneratorTickPhase,
  runSmithyInputPhase,
  runSmithyLifecyclePhase,
} from "./machine-actions/phases";

export type { MachineActionDeps } from "./machine-actions/deps";

export function handleMachineAction(
  state: GameState,
  action: GameAction,
  deps: MachineActionDeps,
): GameState | null {
  switch (action.type) {
    case "SMITHY_ADD_FUEL":
    case "SMITHY_ADD_IRON":
    case "SMITHY_ADD_COPPER": {
      return runSmithyInputPhase({ state, action, deps });
    }

    case "SMITHY_SET_RECIPE":
    case "SMITHY_START":
    case "SMITHY_STOP":
    case "SMITHY_TICK":
    case "SMITHY_WITHDRAW": {
      return runSmithyLifecyclePhase({ state, action, deps });
    }

    case "GENERATOR_ADD_FUEL":
    case "GENERATOR_REQUEST_REFILL": {
      return runGeneratorFuelPhase({ state, action, deps });
    }

    case "GENERATOR_START":
    case "GENERATOR_STOP": {
      return runGeneratorTogglePhase({ state, action, deps });
    }

    case "GENERATOR_TICK": {
      return runGeneratorTickPhase({ state, action, deps });
    }

    default:
      return null;
  }
}

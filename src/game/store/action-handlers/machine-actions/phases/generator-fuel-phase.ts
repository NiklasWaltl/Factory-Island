import { debugLog } from "../../../../debug/debugLogger";
import {
  applyCraftingSourceInventory,
  getCraftingSourceInventory,
} from "../../../../crafting/crafting-sources";
import { GENERATOR_MAX_FUEL } from "../../../constants/buildings";
import type { GameAction } from "../../../reducer";
import type { GameState } from "../../../types";
import type { MachineActionDeps } from "../deps";

type GeneratorFuelAction = Extract<
  GameAction,
  {
    type: "GENERATOR_ADD_FUEL" | "GENERATOR_REQUEST_REFILL";
  }
>;

export interface GeneratorFuelContext {
  state: GameState;
  action: GeneratorFuelAction;
  deps: MachineActionDeps;
}

export function runGeneratorFuelPhase(
  ctx: GeneratorFuelContext,
): GameState {
  const { state, action, deps } = ctx;

  switch (action.type) {
    case "GENERATOR_ADD_FUEL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const source = deps.resolveBuildingSource(state, genId);
      const sourceInv = getCraftingSourceInventory(state, source);
      const gen = state.generators[genId];
      const space = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel);
      const amt = Math.min(action.amount, (sourceInv.wood as number) ?? 0, space);
      if (amt <= 0) return state;
      debugLog.building(
        `Generator ${genId}: added ${amt} wood as fuel (${gen.fuel} → ${gen.fuel + amt}/${GENERATOR_MAX_FUEL})`,
      );
      return {
        ...state,
        ...applyCraftingSourceInventory(
          state,
          source,
          deps.consumeResources(sourceInv, { wood: amt }),
        ),
        generators: {
          ...state.generators,
          [genId]: { ...gen, fuel: gen.fuel + amt },
        },
      };
    }

    case "GENERATOR_REQUEST_REFILL": {
      const genId = state.selectedGeneratorId;
      if (!genId || !state.generators[genId]) return state;
      if (deps.isUnderConstruction(state, genId)) return state;
      const gen = state.generators[genId];
      const currentReq = gen.requestedRefill ?? 0;
      const headroom = Math.max(0, GENERATOR_MAX_FUEL - gen.fuel - currentReq);
      const desired =
        action.amount === "max"
          ? headroom
          : Math.max(0, Math.floor(action.amount));
      const add = Math.min(desired, headroom);
      if (add <= 0) {
        return {
          ...state,
          notifications: deps.addErrorNotification(
            state.notifications,
            currentReq > 0
              ? `Generator ${genId}: bereits ${currentReq} Holz angefordert`
              : `Generator ${genId}: Speicher voll`,
          ),
        };
      }
      debugLog.building(
        `Generator ${genId}: refill request +${add} (open ${currentReq} → ${currentReq + add})`,
      );
      return {
        ...state,
        generators: {
          ...state.generators,
          [genId]: { ...gen, requestedRefill: currentReq + add },
        },
      };
    }

    default: {
      const _exhaustive: never = action;
      return state;
    }
  }
}

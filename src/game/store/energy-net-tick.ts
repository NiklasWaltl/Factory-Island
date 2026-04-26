// ============================================================
// ENERGY_NET_TICK flow runner
// ------------------------------------------------------------
// Keeps the energy tick sequence cohesive while reducer.ts stays
// the composition root that delegates this case.
// ============================================================

import {
  allocateEnergyByPriority,
  buildEnergyTickPhase1Snapshot,
  hasEnergyTickChanges,
} from "./energy-tick-phases";
import type { GameState } from "./types";

export function runEnergyNetTick(state: GameState): GameState {
  const {
    prioritizedConsumers,
    batteryConnected,
    initialAvailableEnergy,
  } = buildEnergyTickPhase1Snapshot(state);

  const {
    remainingEnergy,
    poweredMachineIds,
    machinePowerRatio,
  } = allocateEnergyByPriority(initialAvailableEnergy, prioritizedConsumers);

  const newBatteryStored = batteryConnected
    ? Math.min(state.battery.capacity, Math.max(0, remainingEnergy))
    : state.battery.stored;

  const hasChanges = hasEnergyTickChanges({
    previousBatteryStored: state.battery.stored,
    nextBatteryStored: newBatteryStored,
    previousPoweredMachineIds: state.poweredMachineIds,
    nextPoweredMachineIds: poweredMachineIds,
    previousMachinePowerRatio: state.machinePowerRatio,
    nextMachinePowerRatio: machinePowerRatio,
  });
  if (!hasChanges) return state;

  return {
    ...state,
    battery: { ...state.battery, stored: newBatteryStored },
    poweredMachineIds,
    machinePowerRatio,
  };
}

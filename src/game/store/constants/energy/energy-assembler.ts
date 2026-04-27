// ============================================================
// Energy / auto-assembler coupled constants (mirrors smelter scale).
// ============================================================

import { ENERGY_NET_TICK_MS } from "./energy-smelter";

export const AUTO_ASSEMBLER_IDLE_ENERGY_PER_SEC = 2.5;
export const AUTO_ASSEMBLER_PROCESSING_ENERGY_PER_SEC = 2.5;
export const AUTO_ASSEMBLER_IDLE_DRAIN_PER_PERIOD = Math.round(
  (AUTO_ASSEMBLER_IDLE_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000,
);
export const AUTO_ASSEMBLER_PROCESSING_DRAIN_PER_PERIOD = Math.round(
  (AUTO_ASSEMBLER_PROCESSING_ENERGY_PER_SEC * ENERGY_NET_TICK_MS) / 1000,
);

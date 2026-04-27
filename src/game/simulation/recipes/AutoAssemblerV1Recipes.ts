import type { AutoAssemblerRecipeId, ConveyorItem } from "../../store/types";

export interface AutoAssemblerV1Recipe {
  readonly id: AutoAssemblerRecipeId;
  /** Conveyor item consumed from the internal buffer (V1: only iron ingots). */
  readonly inputItem: Extract<ConveyorItem, "ironIngot">;
  readonly inputAmount: number;
  readonly outputItem: Extract<ConveyorItem, "metalPlate" | "gear">;
  /** Wall-clock seconds per batch at full power (no overclock for assembler). */
  readonly processingTimeSec: number;
}

export const AUTO_ASSEMBLER_V1_RECIPES: readonly AutoAssemblerV1Recipe[] = [
  {
    id: "metal_plate",
    inputItem: "ironIngot",
    inputAmount: 1,
    outputItem: "metalPlate",
    processingTimeSec: 3,
  },
  {
    id: "gear",
    inputItem: "ironIngot",
    inputAmount: 3,
    outputItem: "gear",
    processingTimeSec: 6,
  },
] as const;

export function getAutoAssemblerV1Recipe(
  id: AutoAssemblerRecipeId,
): AutoAssemblerV1Recipe | null {
  return AUTO_ASSEMBLER_V1_RECIPES.find((r) => r.id === id) ?? null;
}

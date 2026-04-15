export type ManualAssemblerRecipeKey = "metal_plate" | "gear";

export interface ManualAssemblerRecipe {
  key: ManualAssemblerRecipeKey;
  inputItem: string;
  outputItem: string;
  processingTime: number;
  outputAmount: number;
  inputAmount: number;
}

export const MANUAL_ASSEMBLER_RECIPES: ManualAssemblerRecipe[] = [
  {
    key: "metal_plate",
    inputItem: "ironIngot",
    outputItem: "metalPlate",
    processingTime: 1.5,
    outputAmount: 1,
    inputAmount: 1,
  },
  {
    key: "gear",
    inputItem: "metalPlate",
    outputItem: "gear",
    processingTime: 1.5,
    outputAmount: 1,
    inputAmount: 1,
  },
];

export function getManualAssemblerRecipe(recipeKey: ManualAssemblerRecipeKey): ManualAssemblerRecipe | null {
  return MANUAL_ASSEMBLER_RECIPES.find((recipe) => recipe.key === recipeKey) ?? null;
}

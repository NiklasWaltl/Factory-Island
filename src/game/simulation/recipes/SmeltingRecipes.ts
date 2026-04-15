export interface SmeltingRecipe {
  inputItem: string;
  outputItem: string;
  processingTime: number;
  outputAmount: number;
  inputAmount: number;
}

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  {
    inputItem: "iron",
    outputItem: "ironIngot",
    processingTime: 5,
    outputAmount: 1,
    inputAmount: 5,
  },
  {
    inputItem: "copper",
    outputItem: "copperIngot",
    processingTime: 5,
    outputAmount: 1,
    inputAmount: 5,
  },
];

export function getSmeltingRecipe(inputItem: string): SmeltingRecipe | null {
  return SMELTING_RECIPES.find((recipe) => recipe.inputItem === inputItem) ?? null;
}

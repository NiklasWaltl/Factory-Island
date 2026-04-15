import type { Inventory } from "../game";

export interface WorkbenchRecipe {
  key: string;
  label: string;
  emoji: string;
  inputItem: string;
  outputItem: string;
  processingTime: number;
  outputAmount: number;
  costs: Partial<Record<keyof Inventory, number>>;
}

export const WORKBENCH_RECIPES: WorkbenchRecipe[] = [
  {
    key: "wood_pickaxe",
    label: "Holzspitzhacke",
    emoji: "⛏️",
    inputItem: "wood",
    outputItem: "wood_pickaxe",
    processingTime: 0,
    outputAmount: 1,
    costs: { wood: 5 },
  },
  {
    key: "stone_pickaxe",
    label: "Steinspitzhacke",
    emoji: "⛏️",
    inputItem: "stone",
    outputItem: "stone_pickaxe",
    processingTime: 0,
    outputAmount: 1,
    costs: { wood: 10, stone: 5 },
  },
];

export function getWorkbenchRecipe(recipeKey: string): WorkbenchRecipe | null {
  return WORKBENCH_RECIPES.find((recipe) => recipe.key === recipeKey) ?? null;
}

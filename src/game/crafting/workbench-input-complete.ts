import type { CraftingJob } from "./types";
import { getWorkbenchJobInputAmount } from "../drones/selection/helpers/need-slot-resolvers";

export function hasCompleteWorkbenchInput(job: CraftingJob): boolean {
  return job.ingredients.every(
    (ingredient) => getWorkbenchJobInputAmount(job, ingredient.itemId) >= ingredient.count,
  );
}

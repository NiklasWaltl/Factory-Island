import type { CollectableItemType } from "../store/types";
import type { CraftingJob } from "./types";

export function isCollectableCraftingItem(
  itemId: CraftingJob["ingredients"][number]["itemId"],
): itemId is CollectableItemType {
  return itemId === "wood" || itemId === "stone" || itemId === "iron" || itemId === "copper";
}

export function addWorkbenchInputToJob(
  job: CraftingJob,
  stack: CraftingJob["ingredients"][number],
): CraftingJob {
  const existing = job.inputBuffer ?? [];
  let merged = false;
  const nextBuffer = existing.map((entry) => {
    if (entry.itemId !== stack.itemId) return entry;
    merged = true;
    return { ...entry, count: entry.count + stack.count };
  });

  return {
    ...job,
    inputBuffer: merged ? nextBuffer : [...existing, stack],
  };
}

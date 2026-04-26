import type { AutoSmelterEntry } from "./types";

export interface ConsumeAutoSmelterPendingOutputInput {
  smelter: Pick<AutoSmelterEntry, "pendingOutput" | "throughputEvents">;
  recordThroughputEvent: boolean;
}

export interface ConsumeAutoSmelterPendingOutputResult {
  changed: true;
}

export const consumeAutoSmelterPendingOutput = (
  input: ConsumeAutoSmelterPendingOutputInput,
): ConsumeAutoSmelterPendingOutputResult => {
  input.smelter.pendingOutput = input.smelter.pendingOutput.slice(1);
  if (input.recordThroughputEvent) {
    input.smelter.throughputEvents = [...input.smelter.throughputEvents, Date.now()];
  }
  return { changed: true };
};
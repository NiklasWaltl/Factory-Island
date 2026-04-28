// Save/load orchestrator facade.
// Keep public imports stable while implementation lives in split modules.

export {
  CURRENT_SAVE_VERSION,
  migrateSave,
} from "./save-migrations";

export type {
  SaveGameV1,
  SaveGameV2,
  SaveGameV3,
  SaveGameV4,
  SaveGameV5,
  SaveGameV6,
  SaveGameV7,
  SaveGameV8,
  SaveGameV9,
  SaveGameV10,
  SaveGameV11,
  SaveGameV12,
  SaveGameV13,
  SaveGameV14,
  SaveGameV15,
  SaveGameV16,
  SaveGameLatest,
} from "./save-migrations";

export {
  serializeState,
  deserializeState,
  loadAndHydrate,
} from "./save-codec";

export {
  rebuildGlobalInventoryFromStorage,
} from "./save-normalizer";

// Debug module barrel export
export { IS_DEV, isDebugEnabled, setDebugEnabled } from "./debugConfig";
export { debugLog, getLogEntries, subscribeLog, clearLogEntries } from "./debugLogger";
export type { LogEntry, LogCategory } from "./debugLogger";
export { applyMockToState } from "./mockData";
export type { MockAction } from "./mockData";
export { DebugPanel } from "./DebugPanel";
export { saveHmrState, loadHmrState, recordHmrModule, getHmrModules, getHmrStatus } from "./hmrState";

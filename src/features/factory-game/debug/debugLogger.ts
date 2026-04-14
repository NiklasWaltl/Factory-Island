// ============================================================
// Factory Island - Debug Logger
// ============================================================
// Structured logging that is completely tree-shaken in production.
// Usage:  debugLog.inventory("Added 3 Wood to Hotbar");
//         debugLog.building("Placed Werkbank at (5,3)");

import { isDebugEnabled } from "./debugConfig";

export type LogCategory =
  | "Building"
  | "Inventory"
  | "Mining"
  | "Warehouse"
  | "Hotbar"
  | "Smithy"
  | "HMR"
  | "Mock"
  | "General";

export interface LogEntry {
  timestamp: number;
  category: LogCategory;
  message: string;
}

const MAX_LOG_ENTRIES = 500;

/** In-memory ring buffer of log entries (only populated in dev) */
let _logEntries: LogEntry[] = [];

/** Subscribers notified on new entries */
type LogListener = () => void;
const _listeners = new Set<LogListener>();

export function subscribeLog(fn: LogListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getLogEntries(): readonly LogEntry[] {
  return _logEntries;
}

export function clearLogEntries(): void {
  _logEntries = [];
  _listeners.forEach((fn) => fn());
}

function _log(category: LogCategory, message: string): void {
  if (!import.meta.env.DEV) return;
  if (!isDebugEnabled()) return;

  const entry: LogEntry = { timestamp: Date.now(), category, message };
  _logEntries.push(entry);
  if (_logEntries.length > MAX_LOG_ENTRIES) {
    _logEntries = _logEntries.slice(-MAX_LOG_ENTRIES);
  }

  const tag = `%c[DEBUG][${category}]`;
  const style = LOG_STYLES[category] ?? "color: #ccc";
  console.log(`${tag} %c${message}`, style, "color: inherit");

  _listeners.forEach((fn) => fn());
}

const LOG_STYLES: Record<LogCategory, string> = {
  Building: "color: #CD7F32; font-weight: bold",
  Inventory: "color: #4caf50; font-weight: bold",
  Mining: "color: #808080; font-weight: bold",
  Warehouse: "color: #DAA520; font-weight: bold",
  Hotbar: "color: #00bcd4; font-weight: bold",
  Smithy: "color: #ff6600; font-weight: bold",
  HMR: "color: #e040fb; font-weight: bold",
  Mock: "color: #ff4081; font-weight: bold",
  General: "color: #ccc; font-weight: bold",
};

/** Namespaced logger object – each method maps to a category */
export const debugLog = {
  building: (msg: string) => _log("Building", msg),
  inventory: (msg: string) => _log("Inventory", msg),
  mining: (msg: string) => _log("Mining", msg),
  warehouse: (msg: string) => _log("Warehouse", msg),
  hotbar: (msg: string) => _log("Hotbar", msg),
  smithy: (msg: string) => _log("Smithy", msg),
  hmr: (msg: string) => _log("HMR", msg),
  mock: (msg: string) => _log("Mock", msg),
  general: (msg: string) => _log("General", msg),
};

// ============================================================
// Factory Island - HMR State Preservation
// ============================================================
// Persists GameState across Vite HMR updates so the player
// doesn't lose progress during development.
// Tree-shaken in production.

import type { GameState } from "../simulation/game";
import { debugLog } from "./debugLogger";

const HMR_STATE_KEY = "__FI_HMR_STATE__";
const HMR_MODULES_KEY = "__FI_HMR_MODULES__";

/** Save current state so the next HMR reload can restore it */
export function saveHmrState(state: GameState): void {
  if (!import.meta.env.DEV) return;
  try {
    (window as any)[HMR_STATE_KEY] = state;
  } catch {
    // ignore – serialization failure is non-critical
  }
}

/** Retrieve state saved before the HMR update, if any */
export function loadHmrState(): GameState | null {
  if (!import.meta.env.DEV) return null;
  try {
    const s = (window as any)[HMR_STATE_KEY] as GameState | undefined;
    if (s && typeof s === "object" && "mode" in s) {
      debugLog.hmr("Restored game state from HMR snapshot");
      return s;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Track which modules were hot-reloaded */
export function recordHmrModule(modulePath: string): void {
  if (!import.meta.env.DEV) return;
  const list: string[] = (window as any)[HMR_MODULES_KEY] ?? [];
  const name = modulePath.replace(/^.*\/src\//, "src/");
  list.push(`${new Date().toLocaleTimeString()} – ${name}`);
  if (list.length > 50) list.splice(0, list.length - 50);
  (window as any)[HMR_MODULES_KEY] = list;
  debugLog.hmr(`Module reloaded: ${name}`);
}

export function getHmrModules(): string[] {
  if (!import.meta.env.DEV) return [];
  return (window as any)[HMR_MODULES_KEY] ?? [];
}

/** Get Vite HMR connection status */
export function getHmrStatus(): string {
  if (!import.meta.env.DEV) return "disabled";
  try {
    // Vite exposes the WebSocket on import.meta.hot
    if (import.meta.hot) return "connected";
  } catch {
    // ignore
  }
  return "unknown";
}

// Register this module itself for HMR tracking
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    recordHmrModule("debug/hmrState.ts");
  });
}

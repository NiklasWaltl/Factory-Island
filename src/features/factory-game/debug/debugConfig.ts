// ============================================================
// Factory Island - Debug Configuration
// ============================================================
// Tree-shaken in production: all checks use import.meta.env.DEV
// which Vite statically replaces with `false` in production builds,
// allowing dead-code elimination.

/** True only in Vite dev mode (stripped in production) */
export const IS_DEV = import.meta.env.DEV;

/** Runtime flag – toggleable from Debug UI */
let _debugEnabled = IS_DEV;

export function isDebugEnabled(): boolean {
  return _debugEnabled && IS_DEV;
}

export function setDebugEnabled(v: boolean): void {
  if (!IS_DEV) return;
  _debugEnabled = v;
}

import type {
  OverrideEntry,
  OverrideKey,
  OverrideRegistryState,
} from "./contracts";

const state: OverrideRegistryState = {};

export function registerOverride<T>(
  key: OverrideKey,
  value: T,
  enabled = true,
): OverrideEntry<T> {
  const entry: OverrideEntry<T> = { key, value, enabled };
  state[key] = entry;

  return entry;
}

export function getOverride<T>(key: OverrideKey): OverrideEntry<T> | undefined {
  return state[key] as OverrideEntry<T> | undefined;
}

export function isOverrideEnabled(key: OverrideKey): boolean {
  return Boolean(state[key]?.enabled);
}

export function removeOverride(key: OverrideKey): void {
  delete state[key];
}

export function listOverrides(): OverrideEntry[] {
  return Object.values(state) as OverrideEntry[];
}

export function clearOverrides(): void {
  for (const key of Object.keys(state) as OverrideKey[]) {
    delete state[key];
  }
}

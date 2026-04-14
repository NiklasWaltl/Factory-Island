export type OverrideKey =
  | "appRoot"
  | "navigation"
  | "loadingFallback"
  | "globalStyles"
  | "portalApp";

export interface OverrideEntry<T = unknown> {
  key: OverrideKey;
  enabled: boolean;
  value: T;
}

export type OverrideRegistryState = Partial<Record<OverrideKey, OverrideEntry>>;

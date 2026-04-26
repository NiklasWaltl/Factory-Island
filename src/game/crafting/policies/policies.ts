import type { RecipeId } from "../types";

export interface RecipeAutomationPolicyEntry {
  readonly autoCraftAllowed?: boolean;
  readonly keepInStockAllowed?: boolean;
  readonly manualOnly?: boolean;
}

export type RecipeAutomationPolicyMap = Record<string, RecipeAutomationPolicyEntry>;

export interface ResolvedRecipeAutomationPolicy {
  readonly autoCraftAllowed: boolean;
  readonly keepInStockAllowed: boolean;
  readonly manualOnly: boolean;
}

export interface RecipeAutomationPolicyPatch {
  readonly autoCraftAllowed?: boolean;
  readonly keepInStockAllowed?: boolean;
  readonly manualOnly?: boolean;
}

export interface RecipePolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

const DEFAULT_RECIPE_AUTOMATION_POLICY: ResolvedRecipeAutomationPolicy = {
  autoCraftAllowed: true,
  keepInStockAllowed: true,
  manualOnly: false,
};

export function resolveRecipeAutomationPolicyEntry(
  entry: RecipeAutomationPolicyEntry | undefined,
): ResolvedRecipeAutomationPolicy {
  const manualOnly = !!entry?.manualOnly;
  if (manualOnly) {
    return {
      autoCraftAllowed: false,
      keepInStockAllowed: false,
      manualOnly: true,
    };
  }

  return {
    autoCraftAllowed: entry?.autoCraftAllowed !== false,
    keepInStockAllowed: entry?.keepInStockAllowed !== false,
    manualOnly: false,
  };
}

export function resolveRecipeAutomationPolicy(
  map: RecipeAutomationPolicyMap | undefined,
  recipeId: RecipeId | string,
): ResolvedRecipeAutomationPolicy {
  const entry = map?.[recipeId];
  if (!entry) return DEFAULT_RECIPE_AUTOMATION_POLICY;
  return resolveRecipeAutomationPolicyEntry(entry);
}

export function normalizeRecipeAutomationPolicyEntry(
  entry: RecipeAutomationPolicyEntry | undefined,
): RecipeAutomationPolicyEntry {
  const resolved = resolveRecipeAutomationPolicyEntry(entry);
  if (resolved.manualOnly) {
    return { manualOnly: true };
  }

  return {
    ...(resolved.autoCraftAllowed ? {} : { autoCraftAllowed: false }),
    ...(resolved.keepInStockAllowed ? {} : { keepInStockAllowed: false }),
  };
}

export function isRecipeAutomationPolicyEntryDefault(
  entry: RecipeAutomationPolicyEntry | undefined,
): boolean {
  const normalized = normalizeRecipeAutomationPolicyEntry(entry);
  return Object.keys(normalized).length === 0;
}

export function areRecipeAutomationPolicyEntriesEqual(
  left: RecipeAutomationPolicyEntry | undefined,
  right: RecipeAutomationPolicyEntry | undefined,
): boolean {
  const a = normalizeRecipeAutomationPolicyEntry(left);
  const b = normalizeRecipeAutomationPolicyEntry(right);
  return (
    a.manualOnly === b.manualOnly &&
    a.autoCraftAllowed === b.autoCraftAllowed &&
    a.keepInStockAllowed === b.keepInStockAllowed
  );
}

export function applyRecipeAutomationPolicyPatch(
  current: RecipeAutomationPolicyEntry | undefined,
  patch: RecipeAutomationPolicyPatch,
): RecipeAutomationPolicyEntry {
  const normalizedCurrent = normalizeRecipeAutomationPolicyEntry(current);
  const merged = {
    manualOnly: patch.manualOnly ?? normalizedCurrent.manualOnly,
    autoCraftAllowed: patch.autoCraftAllowed ?? normalizedCurrent.autoCraftAllowed,
    keepInStockAllowed: patch.keepInStockAllowed ?? normalizedCurrent.keepInStockAllowed,
  } satisfies RecipeAutomationPolicyEntry;
  return normalizeRecipeAutomationPolicyEntry(merged);
}

export function getAutoCraftPolicyBlockReason(
  policy: ResolvedRecipeAutomationPolicy,
): string | null {
  if (policy.manualOnly) return "manual only";
  if (!policy.autoCraftAllowed) return "auto-craft disabled";
  return null;
}

export function getKeepStockPolicyBlockReason(
  policy: ResolvedRecipeAutomationPolicy,
): string | null {
  if (policy.manualOnly) return "manual only";
  if (!policy.keepInStockAllowed) return "keep-in-stock disabled";
  return null;
}

export function allowRecipeDecision(): RecipePolicyDecision {
  return { allowed: true };
}

export function denyRecipeDecision(reason: string): RecipePolicyDecision {
  return { allowed: false, reason };
}

// ============================================================
// Unified policy guard
// ------------------------------------------------------------
// Single entry point for "may this recipe be used in
// automation/auto-craft right now?". Replaces five inline
// `resolveRecipeAutomationPolicy(...) → getXPolicyBlockReason`
// patterns in reducer.ts and crafting workflows.
//
// The `context` parameter selects:
//   1. which policy flag is checked (auto-craft vs keep-in-stock)
//   2. which user-/log-facing message template is used
//
// `decision.reason` is the formatted message ready for direct use
// as a notification text (UI contexts) or as a planner-callback
// reason (planner contexts) or as a dev-log fragment
// (keepStockRefill). Wording per context is preserved 1:1 from the
// pre-extraction call sites.
//
// Returns RecipePolicyDecision instead of bool so it composes
// directly with the existing planner `canUseRecipe` callback
// contract.
// ============================================================

export type RecipeAutomationPolicyContext =
  | "craftRequest"
  | "jobEnqueueAutomation"
  | "plannerAutoCraft"
  | "plannerKeepStock"
  | "keepStockRefill";

const KEEP_STOCK_CONTEXTS: ReadonlySet<RecipeAutomationPolicyContext> = new Set([
  "plannerKeepStock",
  "keepStockRefill",
]);

function formatPolicyBlockedMessage(
  context: RecipeAutomationPolicyContext,
  recipeId: string,
  reason: string,
): string {
  switch (context) {
    case "craftRequest":
      return `Auto-Craft fuer Rezept ${recipeId} blockiert: ${reason}.`;
    case "jobEnqueueAutomation":
      return `Automations-Queue blockiert Rezept ${recipeId}: ${reason}.`;
    case "plannerAutoCraft":
      return `Auto-Craft policy blockiert Rezept ${recipeId}: ${reason}`;
    case "plannerKeepStock":
      return `Keep-in-stock policy blockiert Rezept ${recipeId}: ${reason}`;
    case "keepStockRefill":
      return reason;
  }
}

export function checkRecipeAutomationPolicy(
  policies: RecipeAutomationPolicyMap | undefined,
  recipeId: RecipeId | string,
  context: RecipeAutomationPolicyContext,
): RecipePolicyDecision & { readonly rawReason?: string } {
  const policy = resolveRecipeAutomationPolicy(policies, recipeId);
  const rawReason = KEEP_STOCK_CONTEXTS.has(context)
    ? getKeepStockPolicyBlockReason(policy)
    : getAutoCraftPolicyBlockReason(policy);
  if (!rawReason) return { allowed: true };
  return {
    allowed: false,
    reason: formatPolicyBlockedMessage(context, String(recipeId), rawReason),
    rawReason,
  };
}

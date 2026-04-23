import { getItemDef, isKnownItemId } from "../items/registry";
import type { ItemId, WarehouseId } from "../items/types";
import type { NetworkSlice } from "../inventory/reservationTypes";
import {
  MANUAL_ASSEMBLER_RECIPES,
  SMELTING_RECIPES,
  WORKBENCH_RECIPES,
  getWorkbenchRecipe,
  type WorkbenchRecipe,
} from "../simulation/recipes";
import type { Inventory, PlacedAsset, ServiceHubEntry } from "../store/reducer";
import { pickCraftingPhysicalSourceForIngredient } from "./tick";
import { pickOutputWarehouseId } from "./output";
import type { CraftingInventorySource, CraftingJob, RecipeId } from "./types";
import type { RecipePolicyDecision } from "./policies";

const DEFAULT_MAX_DEPTH = 12;

type NonGlobalSource = Exclude<CraftingInventorySource, { kind: "global" }>;

type MissingKind = "manual" | "craftable" | "unknown";

// R1: only count jobs whose inputs are ALREADY locked (reserved/crafting/delivering)
// as guaranteed future output. `queued` jobs have no reservation yet, so neither
// their inputs nor their outputs may be assumed by the planner — otherwise we
// would credit phantom stock that the queued job is not yet committed to produce.
type ActiveJobStatus = "reserved" | "crafting" | "delivering";

export interface AutoCraftPlanStep {
  readonly recipeId: RecipeId;
  readonly count: number;
  readonly label: string;
}

export type AutoCraftPlanErrorKind =
  | "UNKNOWN_RECIPE"
  | "NO_PHYSICAL_SOURCE"
  | "NO_OUTPUT_DESTINATION"
  | "POLICY_BLOCKED"
  | "MISSING_MANUAL"
  | "MISSING_UNKNOWN"
  | "MISSING_CRAFTABLE_OFF_WORKBENCH"
  | "RECIPE_CYCLE"
  | "MAX_DEPTH"
  | "UNRESOLVABLE_INGREDIENT";

export interface AutoCraftPlanError {
  readonly kind: AutoCraftPlanErrorKind;
  readonly message: string;
  readonly recipeId?: RecipeId;
  readonly itemId?: ItemId;
  readonly amount?: number;
  readonly path?: readonly RecipeId[];
}

export type AutoCraftPlanResult =
  | {
      readonly ok: true;
      readonly steps: readonly AutoCraftPlanStep[];
    }
  | {
      readonly ok: false;
      readonly error: AutoCraftPlanError;
    };

export interface BuildAutoCraftPlanInput {
  readonly recipeId: RecipeId;
  readonly amount?: number;
  readonly producerAssetId?: string;
  readonly source: CraftingInventorySource;
  readonly warehouseInventories: Readonly<Record<WarehouseId, Inventory>>;
  readonly serviceHubs: Readonly<Record<string, ServiceHubEntry>>;
  readonly network: NetworkSlice;
  readonly assets: Readonly<Record<string, PlacedAsset>>;
  readonly existingJobs?: readonly CraftingJob[];
  readonly canUseRecipe?: (recipeId: RecipeId) => RecipePolicyDecision;
  readonly maxDepth?: number;
}

interface PlannerState {
  readonly source: NonGlobalSource;
  readonly assets: Readonly<Record<string, PlacedAsset>>;
  readonly producerAssetId?: string;
  readonly network: NetworkSlice;
  readonly maxDepth: number;
  readonly canUseRecipe?: (recipeId: RecipeId) => RecipePolicyDecision;
  readonly stepsInOrder: RecipeId[];
  readonly stepCounts: Map<RecipeId, number>;
  readonly recursionPath: RecipeId[];
  readonly outputWarehouseId: WarehouseId;
  warehouseInventories: Record<WarehouseId, Inventory>;
  serviceHubs: Record<string, ServiceHubEntry>;
}

function cloneWarehouseInventories(
  input: Readonly<Record<WarehouseId, Inventory>>,
): Record<WarehouseId, Inventory> {
  const out: Record<WarehouseId, Inventory> = {};
  for (const [warehouseId, inv] of Object.entries(input)) {
    out[warehouseId as WarehouseId] = { ...inv };
  }
  return out;
}

function cloneServiceHubs(
  input: Readonly<Record<string, ServiceHubEntry>>,
): Record<string, ServiceHubEntry> {
  const out: Record<string, ServiceHubEntry> = {};
  for (const [hubId, hub] of Object.entries(input)) {
    out[hubId] = {
      ...hub,
      inventory: { ...hub.inventory },
      targetStock: { ...hub.targetStock },
      droneIds: [...hub.droneIds],
    };
  }
  return out;
}

function getLegacyScopeKeyForSource(source: NonGlobalSource): string {
  if (source.kind === "warehouse") return `crafting:warehouse:${source.warehouseId}`;
  return `crafting:zone:${source.zoneId}`;
}

function getWarehouseLaneScopeKey(source: NonGlobalSource, warehouseId: WarehouseId): string {
  return `${getLegacyScopeKeyForSource(source)}:warehouse:${warehouseId}`;
}

function getReservedInScope(network: NetworkSlice, itemId: ItemId, scopeKey: string): number {
  let total = 0;
  for (const reservation of network.reservations) {
    if (reservation.itemId !== itemId) continue;
    if (reservation.scopeKey !== scopeKey) continue;
    total += reservation.amount;
  }
  return total;
}

function getOutputWarehouseId(
  source: NonGlobalSource,
  warehouseInventories: Readonly<Record<WarehouseId, Inventory>>,
  assets: Readonly<Record<string, PlacedAsset>>,
  producerAssetId?: string,
): WarehouseId | null {
  // G2: delegate to the shared helper used by the live `routeOutput` so the
  // planner forecasts the same destination warehouse the tick will deposit to.
  return pickOutputWarehouseId(source, warehouseInventories, {
    assets,
    preferredFromAssetId: producerAssetId,
  });
}

function getWarehouseLaneAvailability(
  planner: PlannerState,
  itemId: ItemId,
  warehouseId: WarehouseId,
): { stored: number; reserved: number; free: number } {
  const inv = planner.warehouseInventories[warehouseId];
  const stored = ((inv ?? {}) as unknown as Record<string, number>)[itemId] ?? 0;
  const legacyScope = getLegacyScopeKeyForSource(planner.source);
  const laneScope = getWarehouseLaneScopeKey(planner.source, warehouseId);
  const reserved =
    getReservedInScope(planner.network, itemId, legacyScope) +
    getReservedInScope(planner.network, itemId, laneScope);
  const free = Math.max(0, stored - reserved);
  return { stored, reserved, free };
}

function getRecipeLabel(recipeId: RecipeId): string {
  return getWorkbenchRecipe(recipeId)?.label ?? recipeId;
}

function classifyMissingItem(itemId: ItemId): MissingKind {
  const def = getItemDef(itemId);
  if (def?.category === "raw_resource") return "manual";
  if (isItemCraftableByAnyRecipe(itemId)) return "craftable";
  return "unknown";
}

function isItemCraftableByAnyRecipe(itemId: ItemId): boolean {
  for (const recipe of WORKBENCH_RECIPES) if (recipe.outputItem === itemId) return true;
  for (const recipe of SMELTING_RECIPES) if (recipe.outputItem === itemId) return true;
  for (const recipe of MANUAL_ASSEMBLER_RECIPES) if (recipe.outputItem === itemId) return true;
  return false;
}

function findWorkbenchRecipeByOutputItem(itemId: ItemId): WorkbenchRecipe | null {
  return WORKBENCH_RECIPES.find((recipe) => recipe.outputItem === itemId) ?? null;
}

function isSameSource(left: CraftingInventorySource, right: NonGlobalSource): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "warehouse" && right.kind === "warehouse") {
    return left.warehouseId === right.warehouseId;
  }
  if (left.kind === "zone" && right.kind === "zone") {
    if (left.zoneId !== right.zoneId) return false;
    if (left.warehouseIds.length !== right.warehouseIds.length) return false;
    const a = [...left.warehouseIds].sort();
    const b = [...right.warehouseIds].sort();
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  return false;
}

function getActivePlannedJobStatuses(): ReadonlySet<ActiveJobStatus> {
  return new Set<ActiveJobStatus>(["reserved", "crafting", "delivering"]);
}

function seedExistingJobOutputs(planner: PlannerState, jobs: readonly CraftingJob[] | undefined): void {
  if (!jobs || jobs.length === 0) return;
  const activeStatuses = getActivePlannedJobStatuses();
  for (const job of jobs) {
    if (!activeStatuses.has(job.status as ActiveJobStatus)) continue;
    if (!isSameSource(job.inventorySource, planner.source)) continue;
    addWarehouseStock(
      planner,
      planner.outputWarehouseId,
      job.output.itemId,
      job.output.count,
    );
  }
}

function addWarehouseStock(
  planner: PlannerState,
  warehouseId: WarehouseId,
  itemId: ItemId,
  amount: number,
): void {
  if (amount <= 0) return;
  const current = planner.warehouseInventories[warehouseId] ?? ({} as Inventory);
  const rec = current as unknown as Record<string, number>;
  planner.warehouseInventories[warehouseId] = {
    ...current,
    [itemId]: (rec[itemId] ?? 0) + amount,
  };
}

function consumeFromWarehouse(
  planner: PlannerState,
  warehouseId: WarehouseId,
  itemId: ItemId,
  amount: number,
): void {
  if (amount <= 0) return;
  const current = planner.warehouseInventories[warehouseId];
  if (!current) return;
  const rec = current as unknown as Record<string, number>;
  planner.warehouseInventories[warehouseId] = {
    ...current,
    [itemId]: Math.max(0, (rec[itemId] ?? 0) - amount),
  };
}

function consumeFromHub(
  planner: PlannerState,
  hubId: string,
  itemId: ItemId,
  amount: number,
): void {
  if (amount <= 0) return;
  const hub = planner.serviceHubs[hubId];
  if (!hub) return;
  const inventory = hub.inventory as Record<string, number>;
  planner.serviceHubs[hubId] = {
    ...hub,
    inventory: {
      ...hub.inventory,
      [itemId]: Math.max(0, (inventory[itemId] ?? 0) - amount),
    },
  };
}

function consumeIngredientIfAvailable(
  planner: PlannerState,
  itemId: ItemId,
  required: number,
): { ok: true } | { ok: false; decision: ReturnType<typeof pickCraftingPhysicalSourceForIngredient> } {
  const decision = pickCraftingPhysicalSourceForIngredient({
    source: planner.source,
    itemId,
    required,
    warehouseInventories: planner.warehouseInventories,
    serviceHubs: planner.serviceHubs,
    network: planner.network,
    assets: planner.assets,
    preferredFromAssetId: planner.producerAssetId,
  });

  if (!decision.source) {
    return { ok: false, decision };
  }

  if (decision.source.kind === "warehouse") {
    consumeFromWarehouse(planner, decision.source.warehouseId, itemId, required);
  } else {
    consumeFromHub(planner, decision.source.hubId, itemId, required);
  }

  return { ok: true };
}

function pushStep(planner: PlannerState, recipeId: RecipeId, count: number): void {
  if (count <= 0) return;
  if (!planner.stepCounts.has(recipeId)) {
    planner.stepsInOrder.push(recipeId);
  }
  planner.stepCounts.set(recipeId, (planner.stepCounts.get(recipeId) ?? 0) + count);
}

function addRecipeOutput(planner: PlannerState, recipe: WorkbenchRecipe, count: number): void {
  const amount = recipe.outputAmount * count;
  if (!isKnownItemId(recipe.outputItem)) return;
  addWarehouseStock(planner, planner.outputWarehouseId, recipe.outputItem, amount);
}

function createError(
  kind: AutoCraftPlanErrorKind,
  message: string,
  fields?: Omit<AutoCraftPlanError, "kind" | "message">,
): AutoCraftPlanError {
  return {
    kind,
    message,
    ...fields,
  };
}

function planRecipeRecursive(
  planner: PlannerState,
  recipeId: RecipeId,
  crafts: number,
  depth: number,
): AutoCraftPlanError | null {
  if (crafts <= 0) return null;

  if (depth > planner.maxDepth) {
    return createError(
      "MAX_DEPTH",
      `Auto-Craft-Plan zu tief (>${planner.maxDepth}) für Rezept ${getRecipeLabel(recipeId)}.`,
      {
        recipeId,
        path: [...planner.recursionPath],
      },
    );
  }

  if (planner.recursionPath.includes(recipeId)) {
    return createError(
      "RECIPE_CYCLE",
      `Rezeptzyklus erkannt: ${[...planner.recursionPath, recipeId].join(" -> ")}`,
      {
        recipeId,
        path: [...planner.recursionPath, recipeId],
      },
    );
  }

  const recipe = getWorkbenchRecipe(recipeId);
  if (!recipe) {
    return createError("UNKNOWN_RECIPE", `Rezept ${recipeId} wurde nicht gefunden.`, {
      recipeId,
    });
  }

  const policyDecision = planner.canUseRecipe?.(recipe.key);
  if (policyDecision && !policyDecision.allowed) {
    return createError(
      "POLICY_BLOCKED",
      policyDecision.reason ?? `Rezept ${recipe.label} ist per Policy fuer Automation gesperrt.`,
      {
        recipeId,
      },
    );
  }

  planner.recursionPath.push(recipeId);

  for (const [ingredientKey, rawCost] of Object.entries(recipe.costs)) {
    const unitCost = typeof rawCost === "number" ? rawCost : 0;
    if (unitCost <= 0) continue;
    if (!isKnownItemId(ingredientKey)) {
      planner.recursionPath.pop();
      return createError("MISSING_UNKNOWN", `Unbekannte Zutat ${ingredientKey} in ${recipe.label}.`, {
        recipeId,
      });
    }

    const ingredientId = ingredientKey as ItemId;
    const required = unitCost * crafts;
    if (required <= 0) continue;

    const immediate = consumeIngredientIfAvailable(planner, ingredientId, required);
    if (immediate.ok) {
      continue;
    }

    const lane = getWarehouseLaneAvailability(planner, ingredientId, planner.outputWarehouseId);
    const shortfall = Math.max(0, required - lane.free);
    const missingAmount = shortfall > 0 ? shortfall : required;
    const missingKind = classifyMissingItem(ingredientId);

    if (missingKind === "manual") {
      planner.recursionPath.pop();
      return createError(
        "MISSING_MANUAL",
        `${missingAmount}x ${getItemDef(ingredientId)?.displayName ?? ingredientId} müssen manuell beschafft werden.`,
        {
          recipeId,
          itemId: ingredientId,
          amount: missingAmount,
        },
      );
    }

    if (missingKind === "unknown") {
      planner.recursionPath.pop();
      return createError(
        "MISSING_UNKNOWN",
        `Für ${getItemDef(ingredientId)?.displayName ?? ingredientId} existiert kein bekanntes Rezept.`,
        {
          recipeId,
          itemId: ingredientId,
          amount: missingAmount,
        },
      );
    }

    const subRecipe = findWorkbenchRecipeByOutputItem(ingredientId);
    if (!subRecipe) {
      planner.recursionPath.pop();
      return createError(
        "MISSING_CRAFTABLE_OFF_WORKBENCH",
        `${getItemDef(ingredientId)?.displayName ?? ingredientId} ist craftbar, aber nicht über die Workbench-Queue (MVP).`,
        {
          recipeId,
          itemId: ingredientId,
          amount: missingAmount,
        },
      );
    }

    const subCrafts = Math.ceil(missingAmount / Math.max(1, subRecipe.outputAmount));
    const subError = planRecipeRecursive(planner, subRecipe.key, subCrafts, depth + 1);
    if (subError) {
      planner.recursionPath.pop();
      return subError;
    }

    const retry = consumeIngredientIfAvailable(planner, ingredientId, required);
    if (!retry.ok) {
      planner.recursionPath.pop();
      return createError(
        "UNRESOLVABLE_INGREDIENT",
        `${getItemDef(ingredientId)?.displayName ?? ingredientId} bleibt trotz Vorprodukt-Planung unzureichend verfügbar.`,
        {
          recipeId,
          itemId: ingredientId,
          amount: required,
        },
      );
    }
  }

  pushStep(planner, recipeId, crafts);
  addRecipeOutput(planner, recipe, crafts);
  planner.recursionPath.pop();
  return null;
}

export function buildAutoCraftPlan(input: BuildAutoCraftPlanInput): AutoCraftPlanResult {
  const targetAmount = Math.max(1, Math.floor(input.amount ?? 1));
  const recipe = getWorkbenchRecipe(input.recipeId);
  if (!recipe) {
    return {
      ok: false,
      error: createError("UNKNOWN_RECIPE", `Rezept ${input.recipeId} wurde nicht gefunden.`, {
        recipeId: input.recipeId,
      }),
    };
  }

  if (input.source.kind === "global") {
    return {
      ok: false,
      error: createError(
        "NO_PHYSICAL_SOURCE",
        "Workbench braucht eine physische Quelle (Lagerhaus/Zone) für Auto-Craft.",
        {
          recipeId: input.recipeId,
        },
      ),
    };
  }

  const clonedWarehouses = cloneWarehouseInventories(input.warehouseInventories);
  const outputWarehouseId = getOutputWarehouseId(
    input.source,
    clonedWarehouses,
    input.assets,
    input.producerAssetId,
  );
  if (!outputWarehouseId) {
    return {
      ok: false,
      error: createError(
        "NO_OUTPUT_DESTINATION",
        "Keine gültige Lagerhaus-Zielquelle für geplante Workbench-Ausgaben gefunden.",
        {
          recipeId: input.recipeId,
        },
      ),
    };
  }

  const planner: PlannerState = {
    source: input.source,
    assets: input.assets,
    producerAssetId: input.producerAssetId,
    network: input.network,
    maxDepth: Math.max(1, Math.floor(input.maxDepth ?? DEFAULT_MAX_DEPTH)),
    canUseRecipe: input.canUseRecipe,
    stepsInOrder: [],
    stepCounts: new Map<RecipeId, number>(),
    recursionPath: [],
    outputWarehouseId,
    warehouseInventories: clonedWarehouses,
    serviceHubs: cloneServiceHubs(input.serviceHubs),
  };

  seedExistingJobOutputs(planner, input.existingJobs);

  const error = planRecipeRecursive(planner, recipe.key, targetAmount, 0);
  if (error) {
    return { ok: false, error };
  }

  const steps: AutoCraftPlanStep[] = planner.stepsInOrder.map((recipeId) => ({
    recipeId,
    count: planner.stepCounts.get(recipeId) ?? 0,
    label: getRecipeLabel(recipeId),
  }));

  return {
    ok: true,
    steps: steps.filter((step) => step.count > 0),
  };
}

export function buildWorkbenchAutoCraftPlan(input: BuildAutoCraftPlanInput): AutoCraftPlanResult {
  return buildAutoCraftPlan(input);
}

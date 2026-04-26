import type {
  GameState,
  Inventory,
  PlacedAsset,
  CollectionNode,
  StarterDroneState,
  DroneRole,
  KeepStockTargetEntry,
  KeepStockByWorkbench,
} from "../store/reducer";
import {
  MAP_SHOP_POS,
  KEEP_STOCK_MAX_TARGET,
} from "../store/reducer";
import type { NetworkSlice, Reservation } from "../inventory/reservationTypes";
import { createEmptyNetworkSlice } from "../inventory/reservationTypes";
import type {
  CraftingQueueState,
  CraftingJob,
  JobStatus,
  JobPriority,
  JobSource,
} from "../crafting/types";
import { createEmptyCraftingQueue } from "../crafting/types";
import {
  isRecipeAutomationPolicyEntryDefault,
  normalizeRecipeAutomationPolicyEntry,
  type RecipeAutomationPolicyMap,
} from "../crafting/policies";
import { debugLog } from "../debug/debugLogger";

const PHYSICAL_WAREHOUSE_KEYS: ReadonlyArray<keyof Inventory> = [
  "wood",
  "stone",
  "iron",
  "copper",
  "ironIngot",
  "copperIngot",
];

const PHYSICAL_HUB_KEYS: ReadonlyArray<keyof Inventory> = [
  "wood",
  "stone",
  "iron",
  "copper",
];

export function rebuildGlobalInventoryFromStorage(
  state: Pick<GameState, "inventory" | "warehouseInventories" | "serviceHubs">,
): Inventory {
  const hasWarehouse =
    !!state.warehouseInventories && Object.keys(state.warehouseInventories).length > 0;
  const hasHub = !!state.serviceHubs && Object.keys(state.serviceHubs).length > 0;
  const keysToZero: ReadonlyArray<keyof Inventory> = hasWarehouse
    ? PHYSICAL_WAREHOUSE_KEYS
    : hasHub
      ? PHYSICAL_HUB_KEYS
      : [];
  if (keysToZero.length === 0) {
    return state.inventory;
  }

  const nextInv = { ...state.inventory } as Record<string, number>;
  let changed = false;
  for (const key of keysToZero) {
    const current = nextInv[key as string] ?? 0;
    if (current !== 0) {
      nextInv[key as string] = 0;
      changed = true;
    }
  }
  if (!changed) return state.inventory;

  debugLog.general(
    `Load: re-derived globalInventory - zeroed physical keys [${keysToZero.join(", ")}] ` +
      `(warehouse=${hasWarehouse}, hub=${hasHub}).`,
  );
  return nextInv as unknown as Inventory;
}

const VALID_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "queued", "reserved", "crafting", "delivering", "done", "cancelled",
]);
const VALID_JOB_PRIORITIES: ReadonlySet<JobPriority> = new Set([
  "high", "normal", "low",
]);
const VALID_JOB_SOURCES: ReadonlySet<JobSource> = new Set([
  "player", "automation",
]);

export function sanitizeNetworkSlice(
  raw: NetworkSlice | undefined | null,
  liveJobIds: ReadonlySet<string>,
): NetworkSlice {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.reservations)) {
    return createEmptyNetworkSlice();
  }

  const cleaned: Reservation[] = [];
  for (const r of raw.reservations) {
    if (!r || typeof r !== "object") continue;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.itemId !== "string" || !r.itemId) continue;
    if (typeof r.amount !== "number" || !Number.isFinite(r.amount) || r.amount <= 0) continue;
    if (r.ownerKind !== "crafting_job" && r.ownerKind !== "system_request") continue;
    if (typeof r.ownerId !== "string" || !r.ownerId) continue;
    if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) continue;
    if (r.ownerKind === "crafting_job" && !liveJobIds.has(r.ownerId)) continue;
    cleaned.push(r);
  }

  const maxId = cleaned.reduce((m, r) => {
    const n = Number.parseInt(r.id.replace(/^[^0-9]*/, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  const nextReservationId = Math.max(
    typeof raw.nextReservationId === "number" && Number.isFinite(raw.nextReservationId)
      ? raw.nextReservationId
      : 1,
    maxId + 1,
  );

  return {
    reservations: cleaned,
    nextReservationId,
    lastError: null,
  };
}

export function sanitizeCraftingQueue(
  raw: CraftingQueueState | undefined | null,
  liveAssetIds: ReadonlySet<string>,
): { queue: CraftingQueueState; cancelled: number } {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.jobs)) {
    return { queue: createEmptyCraftingQueue(), cancelled: 0 };
  }

  const cleaned: CraftingJob[] = [];
  let cancelled = 0;
  for (const j of raw.jobs) {
    if (!j || typeof j !== "object") { cancelled++; continue; }
    if (typeof j.id !== "string" || !j.id) { cancelled++; continue; }
    if (typeof j.recipeId !== "string" || !j.recipeId) { cancelled++; continue; }
    if (typeof j.workbenchId !== "string" || !j.workbenchId) { cancelled++; continue; }
    if (!VALID_JOB_STATUSES.has(j.status)) { cancelled++; continue; }
    if (!VALID_JOB_PRIORITIES.has(j.priority)) { cancelled++; continue; }
    if (!VALID_JOB_SOURCES.has(j.source)) { cancelled++; continue; }
    if (typeof j.enqueuedAt !== "number" || !Number.isFinite(j.enqueuedAt)) { cancelled++; continue; }
    if (!Array.isArray(j.ingredients) || !j.output || typeof j.output !== "object") { cancelled++; continue; }
    if (typeof j.processingTime !== "number" || j.processingTime < 0) { cancelled++; continue; }
    if (typeof j.progress !== "number" || j.progress < 0) { cancelled++; continue; }
    if (j.status === "done" || j.status === "cancelled") { cancelled++; continue; }
    if (!liveAssetIds.has(j.workbenchId)) { cancelled++; continue; }

    cleaned.push({
      ...j,
      inputBuffer: Array.isArray((j as Partial<CraftingJob>).inputBuffer)
        ? (j as Partial<CraftingJob>).inputBuffer!.filter(
            (stack): stack is CraftingJob["ingredients"][number] =>
              !!stack &&
              typeof stack === "object" &&
              typeof stack.itemId === "string" &&
              typeof stack.count === "number" &&
              Number.isFinite(stack.count) &&
              stack.count > 0,
          )
        : [],
    });
  }

  const maxSeq = cleaned.reduce((m, j) => (j.enqueuedAt > m ? j.enqueuedAt : m), 0);
  const nextJobSeq = Math.max(
    typeof raw.nextJobSeq === "number" && Number.isFinite(raw.nextJobSeq)
      ? raw.nextJobSeq
      : 1,
    maxSeq + 1,
  );

  return {
    queue: { jobs: cleaned, nextJobSeq, lastError: null },
    cancelled,
  };
}

export function sanitizeKeepStockByWorkbench(
  raw: KeepStockByWorkbench | undefined | null,
  assets: Readonly<Record<string, PlacedAsset>>,
): KeepStockByWorkbench {
  if (!raw || typeof raw !== "object") return {};

  const cleaned: KeepStockByWorkbench = {};
  for (const [workbenchId, recipes] of Object.entries(raw)) {
    if (assets[workbenchId]?.type !== "workbench") continue;
    if (!recipes || typeof recipes !== "object") continue;

    const cleanRecipes: Record<string, KeepStockTargetEntry> = {};
    for (const [recipeId, value] of Object.entries(recipes as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Partial<KeepStockTargetEntry>;
      const amount = Number.isFinite(entry.amount)
        ? Math.max(0, Math.min(KEEP_STOCK_MAX_TARGET, Math.floor(entry.amount as number)))
        : 0;
      const enabled = !!entry.enabled && amount > 0;
      if (!enabled && amount === 0) continue;
      cleanRecipes[recipeId] = { enabled, amount };
    }

    if (Object.keys(cleanRecipes).length > 0) {
      cleaned[workbenchId] = cleanRecipes;
    }
  }

  return cleaned;
}

export function sanitizeRecipeAutomationPolicies(
  raw: RecipeAutomationPolicyMap | undefined | null,
): RecipeAutomationPolicyMap {
  if (!raw || typeof raw !== "object") return {};

  const cleaned: RecipeAutomationPolicyMap = {};
  for (const [recipeId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const normalized = normalizeRecipeAutomationPolicyEntry(value);
    if (isRecipeAutomationPolicyEntryDefault(normalized)) continue;
    cleaned[recipeId] = normalized;
  }

  return cleaned;
}

const VALID_DRONE_STATUSES = new Set([
  "idle", "moving_to_collect", "collecting", "moving_to_dropoff", "depositing", "returning_to_dock",
]);

export function sanitizeStarterDrone(raw: StarterDroneState | undefined | null): StarterDroneState {
  const fallback: StarterDroneState = {
    status: "idle",
    tileX: MAP_SHOP_POS.x,
    tileY: MAP_SHOP_POS.y,
    targetNodeId: null,
    cargo: null,
    ticksRemaining: 0,
    hubId: null,
    currentTaskType: null,
    deliveryTargetId: null,
    craftingJobId: null,
    droneId: "starter",
  };

  if (!raw || typeof raw !== "object") return fallback;

  const status = VALID_DRONE_STATUSES.has(raw.status) ? raw.status : "idle";
  const ticksRemaining = Number.isFinite(raw.ticksRemaining) && raw.ticksRemaining >= 0
    ? raw.ticksRemaining
    : 0;
  const needsReset = status !== raw.status;

  return {
    status,
    tileX: Number.isFinite(raw.tileX) ? raw.tileX : MAP_SHOP_POS.x,
    tileY: Number.isFinite(raw.tileY) ? raw.tileY : MAP_SHOP_POS.y,
    targetNodeId: needsReset ? null : (raw.targetNodeId ?? null),
    cargo: needsReset ? null : (raw.cargo ?? null),
    ticksRemaining: needsReset ? 0 : ticksRemaining,
    hubId: typeof raw.hubId === "string" ? raw.hubId : null,
    currentTaskType: needsReset ? null : ((raw as any).currentTaskType ?? null),
    deliveryTargetId: needsReset ? null : ((raw as any).deliveryTargetId ?? null),
    craftingJobId: needsReset
      ? null
      : (typeof (raw as any).craftingJobId === "string" ? (raw as any).craftingJobId : null),
    droneId: typeof (raw as any).droneId === "string" ? (raw as any).droneId : "starter",
    role: (["auto", "construction", "supply"] as DroneRole[]).includes((raw as any).role)
      ? (raw as any).role as DroneRole
      : "auto",
  };
}

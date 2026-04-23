import React from "react";
import {
  RESOURCE_LABELS,
  RESOURCE_EMOJIS,
  KEEP_STOCK_MAX_TARGET,
  getSourceStatusInfo,
  getCraftingSourceInventory,
  type GameState,
  type GameAction,
  type Inventory,
} from "../../store/reducer";
import { WORKBENCH_RECIPES } from "../../simulation/recipes";
import { getJobsForWorkbench, sortByPriorityFifo } from "../../crafting/queue";
import {
  buildWorkbenchAutoCraftPlan,
  type AutoCraftPlanResult,
} from "../../crafting/planner";
import type { CraftingInventorySource, CraftingJob, JobStatus } from "../../crafting/types";
import { ZoneSourceSelector } from "./ZoneSourceSelector";
import {
  computeIngredientLines,
  summarizeAvailability,
  type IngredientLine,
} from "./workbenchPanelHelpers";

interface WorkbenchPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const STATUS_ICON: Record<string, string> = {
  available: "✓",
  reserved: "⚠",
  missing_manual: "⛏",
  missing_craftable: "⚙",
  missing_unknown: "✗",
};

const STATUS_COLOR: Record<string, string> = {
  available: "#7fd28a",
  reserved: "#e8a946",
  missing_manual: "#f08a4b",
  missing_craftable: "#7cb3f5",
  missing_unknown: "#f66",
};

function ingredientStatusKey(line: IngredientLine): keyof typeof STATUS_ICON {
  if (line.status !== "missing") return line.status;
  return `missing_${line.missingHint ?? "unknown"}` as keyof typeof STATUS_ICON;
}

function ingredientHintText(line: IngredientLine): string {
  if (line.status === "available") return "verfügbar";
  if (line.status === "reserved") return `${line.reserved} reserviert (von anderem Job blockiert)`;
  if (line.missingHint === "manual") return "manuell abbauen";
  if (line.missingHint === "craftable") return "über Produktionskette herstellbar";
  return "nicht verfügbar";
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "wartet",
  reserved: "reserviert",
  crafting: "läuft",
  delivering: "liefert",
  done: "fertig",
  cancelled: "abgebrochen",
};

const PRIORITY_LABEL: Record<"high" | "normal" | "low", string> = {
  high: "hoch",
  normal: "normal",
  low: "niedrig",
};

function isReorderable(status: JobStatus): boolean {
  return status === "queued" || status === "reserved";
}

function isCancellable(status: JobStatus): boolean {
  return status !== "delivering" && status !== "done" && status !== "cancelled";
}

function toInventorySourceForPlan(
  info: ReturnType<typeof getSourceStatusInfo>,
): CraftingInventorySource | null {
  if (info.source.kind === "global") return null;
  if (info.source.kind === "warehouse") {
    return { kind: "warehouse", warehouseId: info.source.warehouseId };
  }
  return {
    kind: "zone",
    zoneId: info.source.zoneId,
    warehouseIds: info.zoneWarehouseIds,
  };
}

function isSameInventorySource(left: CraftingInventorySource, right: CraftingInventorySource): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "global" && right.kind === "global") return true;
  if (left.kind === "warehouse" && right.kind === "warehouse") {
    return left.warehouseId === right.warehouseId;
  }
  if (left.kind === "zone" && right.kind === "zone") {
    if (left.zoneId !== right.zoneId) return false;
    if (left.warehouseIds.length !== right.warehouseIds.length) return false;
    const leftIds = [...left.warehouseIds].sort();
    const rightIds = [...right.warehouseIds].sort();
    for (let i = 0; i < leftIds.length; i++) {
      if (leftIds[i] !== rightIds[i]) return false;
    }
    return true;
  }
  return false;
}

function isNonTerminalStatus(status: JobStatus): boolean {
  return status !== "done" && status !== "cancelled";
}

function planPreviewKey(info: ReturnType<typeof getSourceStatusInfo>): string {
  if (info.source.kind === "global") return "global";
  if (info.source.kind === "warehouse") return `warehouse:${info.source.warehouseId}`;
  return `zone:${info.source.zoneId}:${info.zoneWarehouseIds.join(",")}`;
}

const JOB_QUEUE_BTN_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#ddd",
  padding: "2px 6px",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 11,
  lineHeight: 1,
};

interface JobQueueRowProps {
  job: CraftingJob;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dispatch: React.Dispatch<GameAction>;
}

const JobQueueRow: React.FC<JobQueueRowProps> = ({ job, canMoveUp, canMoveDown, dispatch }) => {
  const recipe = WORKBENCH_RECIPES.find((r) => r.key === job.recipeId);
  const reorderable = isReorderable(job.status);
  const cancellable = isCancellable(job.status);
  const btn = (
    enabled: boolean,
    label: string,
    title: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      style={{ ...JOB_QUEUE_BTN_STYLE, opacity: enabled ? 1 : 0.35, cursor: enabled ? "pointer" : "not-allowed" }}
      disabled={!enabled}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 6px",
        background: "rgba(255,255,255,0.03)",
        borderRadius: 3,
      }}
    >
      <span style={{ width: 18, textAlign: "center" }}>{recipe?.emoji ?? "•"}</span>
      <span style={{ flex: 1, fontSize: 12 }}>
        {recipe?.label ?? job.recipeId}
        <span style={{ marginLeft: 6, color: "#999", fontSize: 10 }}>
          {JOB_STATUS_LABEL[job.status]} · {PRIORITY_LABEL[job.priority]}
        </span>
      </span>
      {btn(reorderable && canMoveUp, "↑", "Nach oben", () =>
        dispatch({ type: "JOB_MOVE", jobId: job.id, direction: "up" }),
      )}
      {btn(reorderable && canMoveDown, "↓", "Nach unten", () =>
        dispatch({ type: "JOB_MOVE", jobId: job.id, direction: "down" }),
      )}
      {btn(reorderable && job.priority !== "high", "⏫", "Priorisieren (top + high)", () =>
        dispatch({ type: "JOB_MOVE", jobId: job.id, direction: "top" }),
      )}
      {btn(cancellable, "✕", "Abbrechen", () =>
        dispatch({ type: "JOB_CANCEL", jobId: job.id }),
      )}
    </div>
  );
};

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = React.memo(({
  state,
  dispatch,
}) => {
  const buildingId = state.selectedCraftingBuildingId;
  const info = getSourceStatusInfo(state, buildingId);
  const sourceInv: Inventory = getCraftingSourceInventory(state, info.source);
  const [planPreviews, setPlanPreviews] = React.useState<Record<string, AutoCraftPlanResult>>({});
  // R2: lock per-recipe confirm button while a dispatch is in flight, so
  // a double-click cannot enqueue the same plan twice against stale state.
  const [pendingDispatch, setPendingDispatch] = React.useState<Record<string, boolean>>({});
  const pendingDispatchRef = React.useRef<Record<string, boolean>>({});

  const inventorySourceForPlan = React.useMemo(
    () => toInventorySourceForPlan(info),
    [info],
  );

  const pendingOutputByItem = React.useMemo(() => {
    const outputByItem: Record<string, number> = {};
    if (!inventorySourceForPlan) return outputByItem;
    for (const job of state.crafting.jobs) {
      if (!isNonTerminalStatus(job.status)) continue;
      if (!isSameInventorySource(job.inventorySource, inventorySourceForPlan)) continue;
      outputByItem[job.output.itemId] = (outputByItem[job.output.itemId] ?? 0) + job.output.count;
    }
    return outputByItem;
  }, [inventorySourceForPlan, state.crafting.jobs]);

  const keepStockByWorkbench = state.keepStockByWorkbench ?? {};

  const previewResetKey = React.useMemo(() => planPreviewKey(info), [info]);

  React.useEffect(() => {
    setPlanPreviews({});
    setPendingDispatch({});
    pendingDispatchRef.current = {};
  }, [buildingId, previewResetKey]);

  const wbJobs = buildingId ? getJobsForWorkbench(state.crafting, buildingId) : [];
  const sortedJobs = sortByPriorityFifo(wbJobs).filter(
    (j) => j.status !== "done" && j.status !== "cancelled",
  );
  const reorderableSorted = sortedJobs.filter((j) => isReorderable(j.status));

  const requestPlanPreview = (recipeId: string): void => {
    if (!inventorySourceForPlan || !buildingId) return;
    const plan = buildWorkbenchAutoCraftPlan({
      recipeId,
      amount: 1,
      producerAssetId: buildingId,
      source: inventorySourceForPlan,
      warehouseInventories: state.warehouseInventories,
      serviceHubs: state.serviceHubs,
      network: state.network,
      assets: state.assets,
      existingJobs: state.crafting.jobs,
    });
    setPlanPreviews((prev) => ({
      ...prev,
      [recipeId]: plan,
    }));
  };

  const confirmPlanEnqueue = (recipeId: string): void => {
    if (!buildingId) return;
    if (pendingDispatchRef.current[recipeId]) return;
    pendingDispatchRef.current = {
      ...pendingDispatchRef.current,
      [recipeId]: true,
    };
    const preview = planPreviews[recipeId];
    const expectedStepCount =
      preview && preview.ok
        ? preview.steps.reduce((sum, step) => sum + step.count, 0)
        : undefined;
    setPendingDispatch((prev) => ({ ...prev, [recipeId]: true }));
    dispatch({
      type: "CRAFT_REQUEST_WITH_PREREQUISITES",
      recipeId,
      workbenchId: buildingId,
      source: "player",
      priority: "high",
      amount: 1,
      expectedStepCount,
    });
    setPlanPreviews((prev) => {
      if (!prev[recipeId]) return prev;
      const next = { ...prev };
      delete next[recipeId];
      return next;
    });
    // Release the per-recipe lock on the next macrotask. By then React has
    // already flushed the dispatch, so a second click sees a fresh state and
    // builds its own preview before being able to confirm again.
    setTimeout(() => {
      pendingDispatchRef.current = {
        ...pendingDispatchRef.current,
      };
      delete pendingDispatchRef.current[recipeId];
      setPendingDispatch((prev) => {
        if (!prev[recipeId]) return prev;
        const next = { ...prev };
        delete next[recipeId];
        return next;
      });
    }, 0);
  };

  return (
    <div className="fi-panel fi-workbench" onClick={(e) => e.stopPropagation()}>
      <h2>🔨 Werkbank</h2>

      {/* ---- Source / Zone selector ---- */}
      <ZoneSourceSelector state={state} buildingId={buildingId} dispatch={dispatch} />

      {sortedJobs.length > 0 && (
        <div style={{ margin: "8px 0" }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 4 }}>
            Warteschlange ({sortedJobs.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {sortedJobs.map((job) => {
              const reorderIdx = reorderableSorted.findIndex((j) => j.id === job.id);
              const canMoveUp = reorderIdx > 0;
              const canMoveDown = reorderIdx >= 0 && reorderIdx < reorderableSorted.length - 1;
              return (
                <JobQueueRow
                  key={job.id}
                  job={job}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  dispatch={dispatch}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="fi-shop-list">
        {WORKBENCH_RECIPES.map((recipe) => {
          const hasPhysicalSource = info.source.kind !== "global";
          const lines = computeIngredientLines(state, recipe, info.source, sourceInv);
          const availability = summarizeAvailability(lines);
          const canQueue = hasPhysicalSource && availability.canCraft;
          const hasCraftableMissing = lines.some(
            (line) => line.status === "missing" && line.missingHint === "craftable",
          );
          const canAutoCraftPrereqs = hasPhysicalSource && hasCraftableMissing && !!inventorySourceForPlan;
          const preview = planPreviews[recipe.key] ?? null;
          const keepStockEntry = buildingId ? keepStockByWorkbench[buildingId]?.[recipe.key] : undefined;
          const keepStockAmount = keepStockEntry?.amount ?? 0;
          const keepStockEnabled = !!keepStockEntry?.enabled && keepStockAmount > 0;
          const storedOutput = (sourceInv as unknown as Record<string, number>)[recipe.outputItem] ?? 0;
          const pendingOutput = pendingOutputByItem[recipe.outputItem] ?? 0;
          const projectedOutput = storedOutput + pendingOutput;
          const keepStockGap = Math.max(0, keepStockAmount - projectedOutput);

          let blockReason: string | null = null;
          if (!hasPhysicalSource) {
            blockReason = "Werkbank braucht physisches Lager";
          } else if (info.fallbackReason === "zone_no_warehouses") {
            blockReason = "Zone hat keine Lagerhäuser";
          } else if (!availability.canCraft) {
            if (availability.worstStatus === "reserved") {
              blockReason = "Zutaten durch andere Jobs reserviert";
            } else {
              const missingLines = lines.filter((l) => l.status === "missing");
              const hasManual = missingLines.some((l) => l.missingHint === "manual");
              const hasCraftable = missingLines.some((l) => l.missingHint === "craftable");
              if (hasManual && hasCraftable) blockReason = "Fehlende Zutaten: manuell sammeln + produzieren";
              else if (hasManual) blockReason = "Fehlende Rohstoffe – manuell abbauen";
              else if (hasCraftable) blockReason = "Vorprodukte fehlen – über Produktionskette herstellen";
              else blockReason = "Zutaten fehlen";
            }
          }

          return (
            <div key={recipe.key} className="fi-shop-item">
              <div className="fi-shop-item-icon">{recipe.emoji}</div>
              <div className="fi-shop-item-info">
                <strong>{recipe.label}</strong>
                <div className="fi-shop-item-costs" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {lines.map((line) => {
                    const key = ingredientStatusKey(line);
                    const color = STATUS_COLOR[key];
                    const icon = STATUS_ICON[key];
                    const hint = ingredientHintText(line);
                    return (
                      <span
                        key={line.resource}
                        className="fi-shop-cost"
                        style={{ color, display: "flex", gap: 4, alignItems: "baseline" }}
                        title={hint}
                      >
                        <span style={{ width: 12, textAlign: "center" }}>{icon}</span>
                        <span>{RESOURCE_EMOJIS[line.resource] ?? ""}</span>
                        <span>{RESOURCE_LABELS[line.resource] ?? line.resource}</span>
                        <span style={{ fontSize: 10 }}>
                          {line.stored}/{line.required}
                          {line.reserved > 0 ? ` (${line.reserved} res.)` : ""}
                        </span>
                        <span style={{ fontSize: 10, color: "#999", marginLeft: "auto" }}>{hint}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <button
                className="fi-btn"
                disabled={!canQueue}
                onClick={() =>
                  buildingId &&
                  dispatch({
                    type: "JOB_ENQUEUE",
                    recipeId: recipe.key,
                    workbenchId: buildingId,
                    priority: "high",
                    source: "player",
                  })
                }
              >
                Craft
              </button>
              {hasCraftableMissing && (
                <button
                  className="fi-btn"
                  disabled={!canAutoCraftPrereqs}
                  onClick={() => requestPlanPreview(recipe.key)}
                  style={{ marginTop: 4 }}
                >
                  Auto-Craft Vorprodukte
                </button>
              )}
              {preview && preview.ok && (
                <div
                  style={{
                    marginTop: 6,
                    border: "1px solid rgba(124,179,245,0.35)",
                    borderRadius: 4,
                    padding: 6,
                    fontSize: 11,
                    color: "#b8d5ff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <strong style={{ color: "#d8e8ff" }}>Planvorschau</strong>
                  {preview.steps.map((step) => (
                    <span key={`${recipe.key}:${step.recipeId}`}>{step.count}x {step.label}</span>
                  ))}
                  <span style={{ fontSize: 10, color: "#8aa3c2" }}>
                    Plan wird gegen aktuellen Lagerstand neu berechnet.
                  </span>
                  <button
                    className="fi-btn"
                    disabled={!!pendingDispatch[recipe.key]}
                    onClick={() => confirmPlanEnqueue(recipe.key)}
                    style={{ marginTop: 4 }}
                  >
                    {pendingDispatch[recipe.key] ? "Wird eingereiht…" : "Plan in Queue legen"}
                  </button>
                </div>
              )}
              {preview && !preview.ok && (
                <div style={{ fontSize: 10, color: "#e8a946", marginTop: 4 }}>
                  {preview.error.message}
                </div>
              )}
              {buildingId && (
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#9fb5cc", display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={keepStockEnabled}
                        onChange={(event) => {
                          const nextEnabled = event.currentTarget.checked;
                          const fallbackAmount = keepStockAmount > 0 ? keepStockAmount : 1;
                          dispatch({
                            type: "SET_KEEP_STOCK_TARGET",
                            workbenchId: buildingId,
                            recipeId: recipe.key,
                            amount: nextEnabled ? fallbackAmount : keepStockAmount,
                            enabled: nextEnabled,
                          });
                        }}
                      />
                      Zielbestand
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={KEEP_STOCK_MAX_TARGET}
                      step={1}
                      value={keepStockAmount}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.currentTarget.value, 10);
                        const nextAmount = Number.isFinite(parsed)
                          ? Math.max(0, Math.min(KEEP_STOCK_MAX_TARGET, parsed))
                          : 0;
                        dispatch({
                          type: "SET_KEEP_STOCK_TARGET",
                          workbenchId: buildingId,
                          recipeId: recipe.key,
                          amount: nextAmount,
                          enabled: keepStockEnabled && nextAmount > 0,
                        });
                      }}
                      style={{ width: 60, fontSize: 11 }}
                    />
                  </div>
                  {keepStockEnabled && (
                    <div
                      style={{
                        fontSize: 10,
                        color: hasPhysicalSource
                          ? (keepStockGap > 0 ? "#e8a946" : "#7fd28a")
                          : "#e8a946",
                      }}
                    >
                      {hasPhysicalSource
                        ? (keepStockGap > 0
                          ? `Auffüllen aktiv: ${projectedOutput}/${keepStockAmount} (Fehlen: ${keepStockGap})`
                          : `Zielbestand erreicht: ${projectedOutput}/${keepStockAmount}`)
                        : "Keep-in-Stock benötigt eine physische Quelle."}
                    </div>
                  )}
                </div>
              )}
              {!canQueue && blockReason && (
                <div style={{ fontSize: 10, color: "#e8a946", marginTop: 2 }}>
                  {blockReason}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "12px 0" }} />
      <p style={{ color: "#777", fontSize: 11 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
});

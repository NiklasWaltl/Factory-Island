import React from "react";
import type { GameState } from "../../store/types";
import type { GameAction } from "../../store/actions";
import {
  AUTO_ASSEMBLER_IDLE_ENERGY_PER_SEC,
  AUTO_ASSEMBLER_PROCESSING_ENERGY_PER_SEC,
} from "../../store/constants/energy/energy-assembler";
import { getAutoAssemblerV1Recipe } from "../../simulation/recipes/AutoAssemblerV1Recipes";

interface AutoAssemblerPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const AutoAssemblerPanel: React.FC<AutoAssemblerPanelProps> = React.memo(({ state, dispatch }) => {
  const assemblerId = state.selectedAutoAssemblerId;
  const asset = assemblerId ? state.assets[assemblerId] : null;
  const entry = assemblerId ? state.autoAssemblers[assemblerId] : null;

  if (!assemblerId || !asset || asset.type !== "auto_assembler" || !entry) {
    return null;
  }

  const recipe = getAutoAssemblerV1Recipe(entry.selectedRecipe);
  const powerRatio = state.machinePowerRatio?.[assemblerId] ?? 0;
  const powerPercent = powerRatio * 100;
  const currentEnergyPerSec =
    entry.status === "PROCESSING"
      ? AUTO_ASSEMBLER_PROCESSING_ENERGY_PER_SEC
      : AUTO_ASSEMBLER_IDLE_ENERGY_PER_SEC;
  const effectiveEnergyPerSec = currentEnergyPerSec * powerRatio;
  const progressPct = entry.processing
    ? Math.max(0, Math.min(100, (entry.processing.progressMs / entry.processing.durationMs) * 100))
    : 0;

  const statusMeta: Record<string, { label: string; bg: string; color: string }> = {
    IDLE: { label: "IDLE", bg: "rgba(156,163,175,0.2)", color: "#d1d5db" },
    PROCESSING: { label: "PROCESSING", bg: "rgba(34,197,94,0.2)", color: "#86efac" },
    OUTPUT_BLOCKED: { label: "OUTPUT_BLOCKED", bg: "rgba(239,68,68,0.2)", color: "#fca5a5" },
    NO_POWER: { label: "NO_POWER", bg: "rgba(244,63,94,0.2)", color: "#fda4af" },
    MISCONFIGURED: { label: "MISCONFIGURED", bg: "rgba(245,158,11,0.2)", color: "#fcd34d" },
  };
  const currentStatus = statusMeta[entry.status] ?? statusMeta.IDLE;
  const powerBadgeColor = powerPercent >= 99 ? "#86efac" : powerPercent >= 50 ? "#fcd34d" : "#fda4af";

  const canChangeRecipe =
    entry.ironIngotBuffer === 0 && !entry.processing && entry.pendingOutput.length === 0;

  return (
    <div className="fi-panel" onClick={(e) => e.stopPropagation()}>
      <h2>Auto-Assembler</h2>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Status</span>
          <strong
            style={{
              background: currentStatus.bg,
              color: currentStatus.color,
              borderRadius: 999,
              padding: "2px 8px",
              fontSize: 12,
            }}
          >
            {currentStatus.label}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Rezept</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              className={entry.selectedRecipe === "metal_plate" ? "fi-btn fi-btn-sm--active" : "fi-btn fi-btn-sm"}
              disabled={!canChangeRecipe || entry.selectedRecipe === "metal_plate"}
              onClick={() =>
                dispatch({ type: "AUTO_ASSEMBLER_SET_RECIPE", assetId: assemblerId, recipe: "metal_plate" })
              }
              style={{ padding: "4px 8px", fontSize: 12 }}
            >
              Metallplatte (1× Barren)
            </button>
            <button
              className={entry.selectedRecipe === "gear" ? "fi-btn fi-btn-sm--active" : "fi-btn fi-btn-sm"}
              disabled={!canChangeRecipe || entry.selectedRecipe === "gear"}
              onClick={() =>
                dispatch({ type: "AUTO_ASSEMBLER_SET_RECIPE", assetId: assemblerId, recipe: "gear" })
              }
              style={{ padding: "4px 8px", fontSize: 12 }}
            >
              Zahnrad (3× Barren)
            </button>
          </div>
        </div>
        {!canChangeRecipe ? (
          <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
            Rezeptwechsel nur bei leerem Puffer, ohne laufende Produktion und ohne wartendes Output.
          </p>
        ) : null}

        <div style={{ fontSize: 12, color: "#cbd5e1" }}>
          <div>Eisenbarren im Puffer: {entry.ironIngotBuffer}</div>
          {recipe ? (
            <div>
              Aktiv: {recipe.inputAmount}× Eisenbarren → {recipe.outputItem === "metalPlate" ? "Metallplatte" : "Zahnrad"}
            </div>
          ) : null}
        </div>

        {entry.processing ? (
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Fortschritt</div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${progressPct}%`, height: "100%", background: "#22c55e" }} />
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Strom</span>
          <span style={{ color: powerBadgeColor, fontWeight: 600 }}>{Math.round(powerPercent)}%</span>
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          Leistung (nominal / effektiv): {currentEnergyPerSec.toFixed(1)} / {effectiveEnergyPerSec.toFixed(1)} J/s
        </div>
      </div>
    </div>
  );
});

AutoAssemblerPanel.displayName = "AutoAssemblerPanel";

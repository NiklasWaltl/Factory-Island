import React from "react";
import {
  AUTO_SMELTER_BOOST_MULTIPLIER,
  AUTO_SMELTER_IDLE_ENERGY_PER_SEC,
  AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC,
  WAREHOUSE_CAPACITY,
  getCapacityPerResource,
  getCraftingSourceInventory,
  getSourceStatusInfo,
  getZoneItemCapacity,
  type GameAction,
  type GameState,
  type Inventory,
} from "../../store/reducer";
import { getSmeltingRecipe } from "../../simulation/recipes";
import { ZoneSourceSelector } from "./ZoneSourceSelector";

interface AutoSmelterPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const AutoSmelterPanel: React.FC<AutoSmelterPanelProps> = React.memo(({ state, dispatch }) => {
  const smelterId = state.selectedAutoSmelterId;
  const smelterAsset = smelterId ? state.assets[smelterId] : null;
  const smelter = smelterId ? state.autoSmelters[smelterId] : null;

  if (!smelterId || !smelterAsset || smelterAsset.type !== "auto_smelter" || !smelter) {
    return null;
  }

  const sourceInfo = getSourceStatusInfo(state, smelterId);
  const sourceInv = getCraftingSourceInventory(state, sourceInfo.source);
  const selectedRecipe = getSmeltingRecipe(smelter.selectedRecipe);
  const inputKey = selectedRecipe?.inputItem as keyof Inventory | undefined;
  const outputKey = selectedRecipe?.outputItem as keyof Inventory | undefined;
  const requiredInput = selectedRecipe?.inputAmount ?? 0;
  const outputAmount = selectedRecipe?.outputAmount ?? 0;
  const availableInput = inputKey ? ((sourceInv[inputKey] as number) ?? 0) : 0;
  const availableOutputSpace = outputKey
    ? ((sourceInv[outputKey] as number) ?? 0)
    : 0;
  const sourceCapacity = sourceInfo.source.kind === "global"
    ? getCapacityPerResource(state)
    : sourceInfo.source.kind === "zone"
      ? getZoneItemCapacity(state, sourceInfo.source.zoneId)
      : (state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY);
  const hasInputBatch = availableInput >= requiredInput;
  const hasOutputCapacity = outputKey ? (availableOutputSpace + outputAmount <= sourceCapacity) : true;

  const isBoosted = !!smelterAsset.boosted;
  const boostFactor = isBoosted ? AUTO_SMELTER_BOOST_MULTIPLIER : 1;
  const throughputPerMinute = smelter.throughputEvents.length;
  const currentEnergyPerSec = (smelter.status === "PROCESSING"
    ? AUTO_SMELTER_PROCESSING_ENERGY_PER_SEC
    : AUTO_SMELTER_IDLE_ENERGY_PER_SEC) * boostFactor;
  const powerRatio = state.machinePowerRatio?.[smelterId] ?? 0;
  const powerPercent = powerRatio * 100;
  const nominalEnergyPerSec = currentEnergyPerSec;
  const effectiveEnergyPerSec = currentEnergyPerSec * powerRatio;
  const effectiveSpeedPercent = smelter.status === "PROCESSING" ? powerPercent * boostFactor : 0;
  const recipeDisplay =
    smelter.lastRecipeInput && smelter.lastRecipeOutput
      ? `${smelter.lastRecipeInput} -> ${smelter.lastRecipeOutput}`
      : "Wartet auf Input";
  const progressPct = smelter.processing
    ? Math.max(0, Math.min(100, (smelter.processing.progressMs / smelter.processing.durationMs) * 100))
    : 0;
  const statusMeta: Record<string, { label: string; bg: string; color: string }> = {
    IDLE: { label: "IDLE", bg: "rgba(156,163,175,0.2)", color: "#d1d5db" },
    PROCESSING: { label: "PROCESSING", bg: "rgba(34,197,94,0.2)", color: "#86efac" },
    OUTPUT_BLOCKED: { label: "OUTPUT_BLOCKED", bg: "rgba(239,68,68,0.2)", color: "#fca5a5" },
    NO_POWER: { label: "NO_POWER", bg: "rgba(244,63,94,0.2)", color: "#fda4af" },
    MISCONFIGURED: { label: "MISCONFIGURED", bg: "rgba(245,158,11,0.2)", color: "#fcd34d" },
  };
  const currentStatus = statusMeta[smelter.status] ?? statusMeta.IDLE;
  const powerBadgeColor = powerPercent >= 99 ? "#86efac" : powerPercent >= 50 ? "#fcd34d" : "#fda4af";

  let blockReason: string | null = null;
  if (smelter.status === "NO_POWER") {
    blockReason = "Keine volle Stromversorgung";
  } else if (smelter.status === "OUTPUT_BLOCKED" || (smelter.pendingOutput.length > 0 && !hasOutputCapacity)) {
    blockReason = "Output-Ziel hat keinen Platz";
  } else if (!smelter.processing && smelter.inputBuffer.length < requiredInput) {
    blockReason = "Wartet auf Input vom Förderband";
  }

  return (
    <div className="fi-panel" onClick={(e) => e.stopPropagation()}>
      <h2>Auto Smelter</h2>

      <ZoneSourceSelector state={state} buildingId={smelterId} dispatch={dispatch} />

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
          <span>Rezept auswählen</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={smelter.selectedRecipe === "iron" ? "fi-btn fi-btn-sm--active" : "fi-btn fi-btn-sm"}
              onClick={() => dispatch({ type: "AUTO_SMELTER_SET_RECIPE", assetId: smelterId, recipe: "iron" })}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                background: smelter.selectedRecipe === "iron" ? "rgba(234,179,8,0.3)" : "rgba(100,100,100,0.2)",
                border: smelter.selectedRecipe === "iron" ? "1px solid rgba(234,179,8,0.8)" : "1px solid rgba(100,100,100,0.5)",
                color: smelter.selectedRecipe === "iron" ? "#fbbf24" : "#d1d5db",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              ⛏️ Eisen
            </button>
            <button
              className={smelter.selectedRecipe === "copper" ? "fi-btn fi-btn-sm--active" : "fi-btn fi-btn-sm"}
              onClick={() => dispatch({ type: "AUTO_SMELTER_SET_RECIPE", assetId: smelterId, recipe: "copper" })}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                background: smelter.selectedRecipe === "copper" ? "rgba(168,85,247,0.3)" : "rgba(100,100,100,0.2)",
                border: smelter.selectedRecipe === "copper" ? "1px solid rgba(168,85,247,0.8)" : "1px solid rgba(100,100,100,0.5)",
                color: smelter.selectedRecipe === "copper" ? "#d8b4fe" : "#d1d5db",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              🔶 Kupfer
            </button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Rezept</span>
          <strong>{recipeDisplay}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Input (Förderband-Buffer)</span>
          <strong>{requiredInput > 0 ? `${smelter.inputBuffer.length} / braucht ${requiredInput}` : "-"}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Output-Ziel</span>
          <strong>
            {outputKey
              ? `${availableOutputSpace}${sourceCapacity !== Infinity ? ` / ${sourceCapacity}` : " / ∞"}`
              : "-"}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Durchsatz (60s)</span>
          <strong>{throughputPerMinute} / min</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Energieversorgung</span>
          <strong style={{ color: powerBadgeColor }}>{powerPercent.toFixed(1)}%</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Energie (Soll / Ist)</span>
          <strong>{nominalEnergyPerSec.toFixed(1)} / {effectiveEnergyPerSec.toFixed(1)} / s</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Verarbeitungsrate</span>
          <strong>{effectiveSpeedPercent.toFixed(1)}%</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Input-Buffer</span>
          <strong>{smelter.inputBuffer.length} / 5</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Overclocking</span>
          <button
            className="fi-btn fi-btn-sm"
            onClick={() => dispatch({ type: "SET_MACHINE_BOOST", assetId: smelterId, boosted: !isBoosted })}
            style={{
              padding: "4px 10px",
              border: isBoosted ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.2)",
              background: isBoosted ? "rgba(245,158,11,0.2)" : "rgba(100,100,100,0.15)",
              color: isBoosted ? "#fbbf24" : "#d1d5db",
              borderRadius: 4,
              cursor: "pointer",
            }}
            title={`Boost: ${AUTO_SMELTER_BOOST_MULTIPLIER}x Verarbeitung, ${AUTO_SMELTER_BOOST_MULTIPLIER}x Verbrauch`}
          >
            {isBoosted ? `⚡ Boost AN (${AUTO_SMELTER_BOOST_MULTIPLIER}x)` : "Boost AUS"}
          </button>
        </div>
        {blockReason && (
          <div data-testid="auto-smelter-block-reason" style={{ fontSize: 11, color: "#e8a946" }}>
            ⚠ {blockReason}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Fortschritt</span>
          <strong>{smelter.processing ? `${progressPct.toFixed(0)}%` : "-"}</strong>
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: "#e64545",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      </div>

      <button
        className="fi-btn fi-btn-sm"
        style={{ marginTop: 12 }}
        onClick={() => dispatch({ type: "CLOSE_PANEL" })}
      >
        Schließen
      </button>
    </div>
  );
});

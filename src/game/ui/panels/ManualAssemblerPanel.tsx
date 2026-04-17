import React from "react";
import {
  MANUAL_ASSEMBLER_PROCESS_MS,
  RESOURCE_EMOJIS,
  RESOURCE_LABELS,
  getSourceStatusInfo,
  getCraftingSourceInventory,
  type GameAction,
  type GameState,
} from "../../store/reducer";
import { ZoneSourceSelector } from "./ZoneSourceSelector";

interface ManualAssemblerPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const ManualAssemblerPanel: React.FC<ManualAssemblerPanelProps> = React.memo(({ state, dispatch }) => {
  const hasAssembler = Object.values(state.assets).some((a) => a.type === "manual_assembler");
  if (!hasAssembler) return null;

  const assembler = state.manualAssembler;
  const isBusy = assembler.processing;
  const progressPct = Math.max(0, Math.min(100, Math.round(assembler.progress * 100)));
  const remainingMs = Math.max(0, Math.round((1 - assembler.progress) * MANUAL_ASSEMBLER_PROCESS_MS));

  const buildingId = state.selectedCraftingBuildingId;
  const info = getSourceStatusInfo(state, buildingId);
  const sourceInv = getCraftingSourceInventory(state, info.source);

  const canCraftPlate = (sourceInv.ironIngot as number) >= 1 && !isBusy;
  const canCraftGear = (sourceInv.metalPlate as number) >= 1 && !isBusy;

  return (
    <div className="fi-panel" onClick={(e) => e.stopPropagation()}>
      <h2>🧰 Manueller Assembler</h2>

      {/* ---- Source / Zone selector ---- */}
      <ZoneSourceSelector state={state} buildingId={buildingId} dispatch={dispatch} />

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{RESOURCE_EMOJIS.ironIngot} {RESOURCE_LABELS.ironIngot}</span>
          <strong>{sourceInv.ironIngot}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{RESOURCE_EMOJIS.metalPlate} {RESOURCE_LABELS.metalPlate}</span>
          <strong>{sourceInv.metalPlate}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{RESOURCE_EMOJIS.gear} {RESOURCE_LABELS.gear}</span>
          <strong>{sourceInv.gear}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <button
          className="fi-btn"
          disabled={!canCraftPlate}
          onClick={() => dispatch({ type: "MANUAL_ASSEMBLER_START", recipe: "metal_plate" })}
        >
          Metallplatte herstellen (1× Eisenbarren → 1× Metallplatte)
        </button>
        {!canCraftPlate && !isBusy && (
          <div style={{ fontSize: 10, color: "#e8a946" }}>
            {info.fallbackReason === "zone_no_warehouses"
              ? "Zone hat keine Lagerh\u00e4user"
              : (sourceInv.ironIngot as number) < 1
                ? `Zu wenig Eisenbarren (${info.source.kind === "zone" ? "Zone" : info.source.kind === "warehouse" ? "Lagerhaus" : "global"})`
                : ""}
          </div>
        )}

        <button
          className="fi-btn"
          disabled={!canCraftGear}
          onClick={() => dispatch({ type: "MANUAL_ASSEMBLER_START", recipe: "gear" })}
        >
          Zahnrad herstellen (1× Metallplatte → 1× Zahnrad)
        </button>
        {!canCraftGear && !isBusy && (
          <div style={{ fontSize: 10, color: "#e8a946" }}>
            {info.fallbackReason === "zone_no_warehouses"
              ? "Zone hat keine Lagerh\u00e4user"
              : (sourceInv.metalPlate as number) < 1
                ? `Zu wenig Metallplatten (${info.source.kind === "zone" ? "Zone" : info.source.kind === "warehouse" ? "Lagerhaus" : "global"})`
                : ""}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span>Produktionszeit</span>
          <strong>{isBusy ? `${(remainingMs / 1000).toFixed(1)} s` : "Bereit"}</strong>
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.15)", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              width: `${isBusy ? progressPct : 0}%`,
              height: "100%",
              background: "#4caf50",
              transition: "width 0.1s linear",
            }}
          />
        </div>
      </div>
    </div>
  );
});

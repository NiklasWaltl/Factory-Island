import React from "react";
import {
  GENERATOR_TICKS_PER_WOOD,
  GENERATOR_ENERGY_PER_TICK,
  GENERATOR_TICK_MS,
  ENERGY_NET_TICK_MS,
  getConnectedDemandPerPeriod,
  getEnergyProductionPerPeriod,
  getCraftingSourceInventory,
  getSourceStatusInfo,
  type GameState,
  type GameAction,
} from "../../store/reducer";
import { ZoneSourceSelector } from "./ZoneSourceSelector";

interface GeneratorPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

/** Energy produced per second by one running generator */
const ENERGY_PER_SEC = Math.round((GENERATOR_ENERGY_PER_TICK * 1000) / GENERATOR_TICK_MS);
/** Wood burned per second while running */
const WOOD_PER_SEC = (1000 / GENERATOR_TICK_MS / GENERATOR_TICKS_PER_WOOD).toFixed(2);

export const GeneratorPanel: React.FC<GeneratorPanelProps> = React.memo(({ state, dispatch }) => {
  const g = state.generator;
  const generatorId = state.selectedGeneratorId;

  const sourceInfo = getSourceStatusInfo(state, generatorId);
  const sourceInv = getCraftingSourceInventory(state, sourceInfo.source);
  const woodAvailable = (sourceInv.wood as number) ?? 0;

  const fuelPct = g.fuel > 0 ? (1 - g.progress) * 100 : 0;

  let blockReason: string | null = null;
  if (sourceInfo.fallbackReason === "zone_no_warehouses") {
    blockReason = "Zone aktiv, aber keine Lagerhäuser (Fallback: Global)";
  } else if (woodAvailable < 1) {
    blockReason = sourceInfo.source.kind === "zone"
      ? "Zone hat kein Holz"
      : sourceInfo.source.kind === "warehouse"
        ? "Lagerhaus hat kein Holz"
        : "Kein Holz im globalen Inventar";
  }

  // Connectivity info
  const genConnectedToPole = state.connectedAssetIds.some((id) => state.assets[id]?.type === "power_pole");
  const connectedMachines = state.connectedAssetIds
    .map((id) => state.assets[id])
    .filter((a) => a && (a.type === "smithy" || a.type === "workbench" || a.type === "battery"));
  const totalCables = state.cablesPlaced;

  // Energy balance as used by the scheduler: connected consumer drains per net period.
  const production = getEnergyProductionPerPeriod(state);
  const consumption = getConnectedDemandPerPeriod(state);
  const netEnergy = production - consumption;

  return (
    <div className="fi-panel fi-generator" onClick={(ev) => ev.stopPropagation()}>
      <h2>⚡ Holz-Generator</h2>

      {generatorId && (
        <ZoneSourceSelector state={state} buildingId={generatorId} dispatch={dispatch} />
      )}

      {blockReason && (
        <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#fca5a5", marginBottom: 8 }}>
          {blockReason}
        </div>
      )}

      {/* Generator status */}
      <div className="fi-generator-energy-label" style={{ marginBottom: 8 }}>
        <span className={`fi-generator-power-badge ${g.running ? "fi-generator-power-badge--on" : "fi-generator-power-badge--off"}`}>
          {g.running ? "🔥 Generator läuft" : g.fuel > 0 ? "⏸ Bereit" : "💤 Kein Brennstoff"}
        </span>
        <span className={`fi-debug-badge ${genConnectedToPole ? "fi-debug-badge--active" : "fi-debug-badge--inactive"}`} style={{ position: "static" }}>
          {genConnectedToPole ? "🗼 Mit Stromknoten verbunden" : "🗼 Kein Stromknoten"}
        </span>
      </div>

      {/* Energy output this period */}
      <div className="fi-generator-energy-bar-wrap" style={{ marginBottom: 8 }}>
        <div className="fi-generator-energy-label">
          <span>⚡ Energie-Bilanz (pro {ENERGY_NET_TICK_MS / 1000}s)</span>
          <span style={{ fontSize: 12, fontWeight: "bold", color: netEnergy > 0 ? "#7fff7f" : netEnergy < 0 ? "#ff8888" : "#aaa" }}>
            {netEnergy > 0 ? `+${netEnergy} J` : netEnergy < 0 ? `${netEnergy} J` : "0 J"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#aaa", display: "flex", justifyContent: "space-between" }}>
          <span>Produktion: <strong style={{ color: "#7fff7f" }}>+{production} J</strong></span>
          <span>Verbrauch Maschinen: <strong style={{ color: consumption > 0 ? "#ff8888" : "#555" }}>−{consumption} J</strong></span>
        </div>
      </div>

      {/* Network connectivity */}
      <div style={{ fontSize: 11, color: "#aaa", marginBottom: 12 }}>
        🔌 Verbundene Maschinen: <strong style={{ color: connectedMachines.length > 0 ? "#7CFF7C" : "#FF8888" }}>{connectedMachines.length}</strong>
        {" | "}Kabel verlegt: <strong>{totalCables}</strong>
      </div>

      {/* Fuel slot */}
      <div className="fi-generator-section-title">🪵 Brennstoff (Holz)</div>
      <div className="fi-smithy-slot" style={{ marginBottom: 12 }}>
        <span>Holz im Generator</span>
        <strong>{g.fuel}</strong>

        {g.running && g.fuel > 0 && (
          <div style={{ width: "100%" }}>
            <div className="fi-generator-bar-track" style={{ marginTop: 6 }}>
              <div
                className="fi-generator-bar-fill fi-generator-bar-fill--fuel"
                style={{ width: `${Math.min(fuelPct, 100)}%` }}
              />
            </div>
            <div className="fi-generator-bar-meta">
              <span style={{ color: "#aaa", fontSize: 10 }}>verbleibendes Holz</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            className="fi-btn fi-btn-sm"
            disabled={woodAvailable < 1}
            onClick={() => dispatch({ type: "GENERATOR_ADD_FUEL", amount: 1 })}
          >
            +1 Holz
          </button>
          <button
            className="fi-btn fi-btn-sm"
            disabled={woodAvailable < 5}
            onClick={() => dispatch({ type: "GENERATOR_ADD_FUEL", amount: 5 })}
          >
            +5 Holz
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="fi-generator-section-title">⚙️ Steuerung</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          className="fi-btn"
          disabled={g.running || g.fuel <= 0}
          onClick={() => dispatch({ type: "GENERATOR_START" })}
        >
          ▶ Starten
        </button>
        <button
          className="fi-btn fi-btn-danger"
          disabled={!g.running}
          onClick={() => dispatch({ type: "GENERATOR_STOP" })}
        >
          ⏹ Stoppen
        </button>
      </div>

      {/* Stats */}
      <div className="fi-generator-section-title">📊 Kennzahlen</div>
      <div className="fi-generator-stats">
        <div className="fi-generator-stat">
          <span>Energie-Output</span>
          <strong>+{ENERGY_PER_SEC} J/s</strong>
        </div>
        <div className="fi-generator-stat">
          <span>Holzverbrauch</span>
          <strong>{WOOD_PER_SEC} Holz/s</strong>
        </div>
        <div className="fi-generator-stat">
          <span>Reichweite</span>
          <strong>
            {g.fuel > 0
              ? `~${Math.ceil(g.fuel * GENERATOR_TICKS_PER_WOOD * GENERATOR_TICK_MS / 1000)}s`
              : "—"}
          </strong>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#aaa", marginTop: 12 }}>
        Scheduler-Nachfrage (verbundene Verbraucher): <strong style={{ color: consumption > 0 ? "#ff8888" : "#555" }}>−{consumption} J/2s</strong>
      </div>
    </div>
  );
});

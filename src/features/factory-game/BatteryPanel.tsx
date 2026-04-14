import React from "react";
import {
  BATTERY_CAPACITY,
  GENERATOR_ENERGY_PER_TICK,
  GENERATOR_TICK_MS,
  ENERGY_NET_TICK_MS,
  ENERGY_DRAIN,
  type GameState,
  type GameAction,
} from "./game";

interface BatteryPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const ENERGY_PER_NET_TICK = Math.round((GENERATOR_ENERGY_PER_TICK * ENERGY_NET_TICK_MS) / GENERATOR_TICK_MS);

export const BatteryPanel: React.FC<BatteryPanelProps> = ({ state, dispatch }) => {
  const b = state.battery;
  const storedPct = b.capacity > 0 ? (b.stored / b.capacity) * 100 : 0;

  const batteryAsset = Object.values(state.assets).find((a) => a.type === "battery");
  const isConnected = batteryAsset ? state.connectedAssetIds.includes(batteryAsset.id) : false;

  // Compute live energy balance to determine charge/discharge status
  // Generator only produces if cable-connected to at least one power pole
  const genConnectedToPole = state.connectedAssetIds.some((id) => state.assets[id]?.type === "power_pole");
  const production = state.generator.running && genConnectedToPole ? ENERGY_PER_NET_TICK : 0;
  const consumption = (["smithy", "workbench"] as const).reduce((sum, m) => {
    if (!state.placedBuildings.includes(m as any)) return sum;
    const asset = Object.values(state.assets).find((a) => a.type === m);
    return asset && state.connectedAssetIds.includes(asset.id) ? sum + (ENERGY_DRAIN[m] ?? 0) : sum;
  }, 0);
  const netEnergy = production - consumption;

  const isFull = b.stored >= BATTERY_CAPACITY;
  const isEmpty = b.stored <= 0;

  let statusLabel = "Bereit";
  let statusClass = "fi-battery-status--idle";
  if (!isConnected) {
    statusLabel = "Nicht verbunden";
    statusClass = "fi-battery-status--disconnected";
  } else if (isConnected && netEnergy > 0 && !isFull) {
    statusLabel = "Lädt";
    statusClass = "fi-battery-status--charging";
  } else if (isConnected && netEnergy < 0 && !isEmpty) {
    statusLabel = "Entlädt";
    statusClass = "fi-battery-status--discharging";
  } else if (isFull) {
    statusLabel = "Voll";
    statusClass = "fi-battery-status--full";
  } else if (isEmpty) {
    statusLabel = "Leer";
    statusClass = "fi-battery-status--empty";
  }

  return (
    <div className="fi-panel fi-battery-panel" onClick={(ev) => ev.stopPropagation()}>
      <h2>🔋 Batterie</h2>

      {/* Connection status */}
      <div className="fi-generator-energy-label" style={{ marginBottom: 8 }}>
        <span>🔌 Netzwerk</span>
        <span className={`fi-debug-badge ${isConnected ? "fi-debug-badge--active" : "fi-debug-badge--inactive"}`} style={{ position: "static" }}>
          {isConnected ? "✅ Verbunden" : "❌ Nicht verbunden"}
        </span>
      </div>

      {/* Storage bar */}
      <div className="fi-generator-energy-bar-wrap">
        <div className="fi-generator-energy-label">
          <span>🔋 Gespeicherte Energie</span>
          <span className={`fi-battery-status ${statusClass}`}>{statusLabel}</span>
        </div>
        <div className="fi-generator-bar-track">
          <div
            className="fi-generator-bar-fill fi-battery-bar-fill"
            style={{ width: `${Math.min(storedPct, 100)}%` }}
          />
        </div>
        <div className="fi-generator-bar-meta">
          <span>{Math.floor(b.stored)} / {b.capacity} J</span>
          <span style={{ color: "#aaa" }}>{storedPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Energy balance */}
      {isConnected && (
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span>Eingang: <strong style={{ color: "#7fff7f" }}>+{production} J/2s</strong></span>
          <span>Ausgang: <strong style={{ color: consumption > 0 ? "#ff8888" : "#555" }}>−{consumption} J/2s</strong></span>
          <span>Netto: <strong style={{ color: netEnergy > 0 ? "#7fff7f" : netEnergy < 0 ? "#ff8888" : "#aaa" }}>
            {netEnergy > 0 ? `+${netEnergy}` : netEnergy} J/2s
          </strong></span>
        </div>
      )}

      {/* Info */}
      <div style={{ marginTop: 12, color: "#aaa", fontSize: 11 }}>
        <p>Lädt, wenn Generatoren mehr produzieren als Maschinen verbrauchen.</p>
        <p>Entlädt, wenn Maschinen mehr verbrauchen als Generatoren liefern.</p>
        <p>Erfordert eine Kabelverbindung zum Generator.</p>
      </div>

      {/* Remove hint */}
      <p style={{ color: "#777", fontSize: 11, marginTop: 12 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
};

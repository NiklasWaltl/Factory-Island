import React from "react";
import {
  POWER_POLE_RANGE,
  ASSET_EMOJIS,
  ASSET_LABELS,
  type GameState,
  type GameAction,
  type AssetType,
} from "../../game/simulation/game";

interface PowerPolePanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const NETWORK_ASSET_TYPES = new Set<AssetType>(["generator", "cable", "battery", "smithy", "workbench", "power_pole"]);

function assetInPoleRange(
  poleX: number,
  poleY: number,
  candidate: { x: number; y: number; size: 1 | 2 },
  range: number
): boolean {
  for (let cy = 0; cy < candidate.size; cy++) {
    for (let cx = 0; cx < candidate.size; cx++) {
      const dx = Math.abs((candidate.x + cx) - poleX);
      const dy = Math.abs((candidate.y + cy) - poleY);
      if (Math.max(dx, dy) <= range) return true;
    }
  }
  return false;
}

export const PowerPolePanel: React.FC<PowerPolePanelProps> = ({ state, dispatch }) => {
  const poleId = state.selectedPowerPoleId;
  const pole = poleId ? state.assets[poleId] : null;

  if (!pole || pole.type !== "power_pole") {
    return (
      <div className="fi-panel fi-power-pole-panel" onClick={(e) => e.stopPropagation()}>
        <h2>🗼 Stromknoten</h2>
        <p style={{ color: "#aaa" }}>Kein Stromknoten ausgewählt.</p>
      </div>
    );
  }

  const isConnected = poleId ? state.connectedAssetIds.includes(poleId) : false;

  // Find all conductor assets within range of this pole
  const inRange = Object.values(state.assets).filter(
    (a) =>
      a.id !== poleId &&
      NETWORK_ASSET_TYPES.has(a.type) &&
      assetInPoleRange(pole.x, pole.y, a, POWER_POLE_RANGE)
  );

  // Separate connected vs disconnected (possibly connected through this pole)
  const connectedInRange = inRange.filter((a) => state.connectedAssetIds.includes(a.id));
  const disconnectedInRange = inRange.filter((a) => !state.connectedAssetIds.includes(a.id));

  return (
    <div className="fi-panel fi-power-pole-panel" onClick={(e) => e.stopPropagation()}>
      <h2>🗼 Stromknoten</h2>

      {/* Connection status */}
      <div className={`fi-power-pole-status ${isConnected ? "fi-power-pole-status--connected" : "fi-power-pole-status--disconnected"}`}>
        {isConnected ? "✅ Mit Netz verbunden" : "❌ Nicht verbunden"}
      </div>

      {/* Position & range info */}
      <div className="fi-power-pole-info">
        <span>📍 Position: ({pole.x}, {pole.y})</span>
        <span>📡 Reichweite: {POWER_POLE_RANGE} Felder</span>
      </div>

      {/* Assets in range */}
      <div style={{ marginTop: 10 }}>
        <strong>Gebäude in Reichweite ({inRange.length}):</strong>
        {inRange.length === 0 ? (
          <p style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>Keine Gebäude in Reichweite.</p>
        ) : (
          <ul className="fi-power-pole-asset-list">
            {connectedInRange.map((a) => (
              <li key={a.id} className="fi-power-pole-asset-item fi-power-pole-asset-item--connected">
                <span>{ASSET_EMOJIS[a.type]}</span>
                <span>{ASSET_LABELS[a.type]}</span>
                <span className="fi-badge fi-badge--green">✅ verbunden</span>
              </li>
            ))}
            {disconnectedInRange.map((a) => (
              <li key={a.id} className="fi-power-pole-asset-item fi-power-pole-asset-item--disconnected">
                <span>{ASSET_EMOJIS[a.type]}</span>
                <span>{ASSET_LABELS[a.type]}</span>
                <span className="fi-badge fi-badge--red">❌ getrennt</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p style={{ color: "#777", fontSize: 11, marginTop: 12 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
};

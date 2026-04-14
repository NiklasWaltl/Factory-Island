import React, { useEffect, useRef } from "react";
import {
  AUTO_MINER_PRODUCE_TICKS,
  DEFAULT_MACHINE_PRIORITY,
  RESOURCE_LABELS,
  type GameState,
  type GameAction,
  type MachinePriority,
} from "../../engine/simulation/game";

interface AutoMinerPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const AutoMinerPanel: React.FC<AutoMinerPanelProps> = ({ state, dispatch }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const minerId = state.selectedAutoMinerId;
  const minerAsset = minerId ? state.assets[minerId] : null;
  const minerState = minerId ? state.autoMiners[minerId] : null;

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const panelEl = panelRef.current;
      if (!panelEl) return;
      if (event.target instanceof Node && panelEl.contains(event.target)) return;
      dispatch({ type: "CLOSE_PANEL" });
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [dispatch]);

  if (!minerId || !minerAsset || minerAsset.type !== "auto_miner" || !minerState) {
    return null;
  }

  const hasPower = (state.poweredMachineIds ?? []).includes(minerId);
  const currentPriority = (minerAsset.priority ?? DEFAULT_MACHINE_PRIORITY) as MachinePriority;

  const itemsPerTick = 1 / AUTO_MINER_PRODUCE_TICKS;
  const itemsPerMinute = itemsPerTick * 60;

  return (
    <div
      ref={panelRef}
      className="fi-panel fi-auto-miner-panel"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 120,
        right: 16,
        zIndex: 40,
        minWidth: 280,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Auto-Miner</h2>
        <button
          className="fi-btn fi-btn-sm"
          onClick={() => dispatch({ type: "CLOSE_PANEL" })}
          aria-label="Schließen"
        >
          X
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Aktive Ressource</span>
          <strong>{RESOURCE_LABELS[minerState.resource] ?? minerState.resource}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Energie</span>
          <strong style={{ color: hasPower ? "#7CFC00" : "#ff6b6b" }}>
            {hasPower ? "Hat Strom" : "Kein Strom"}
          </strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Ertrag pro Minute</span>
          <strong>{itemsPerMinute.toFixed(1)} / min</strong>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <span>Priorität (1 = höchste, 5 = niedrigste)</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4, 5].map((p) => {
              const value = p as MachinePriority;
              const selected = currentPriority === value;
              return (
                <button
                  key={p}
                  className="fi-btn fi-btn-sm"
                  onClick={() => dispatch({ type: "SET_MACHINE_PRIORITY", assetId: minerId, priority: value })}
                  style={{
                    minWidth: 32,
                    padding: "4px 8px",
                    border: selected ? "1px solid #7CFC00" : undefined,
                    background: selected ? "rgba(124,252,0,0.15)" : undefined,
                    color: selected ? "#7CFC00" : undefined,
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

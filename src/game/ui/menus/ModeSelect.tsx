import React from "react";
import type { GameMode } from "../../simulation/game";
import { IS_DEV } from "../../debug/debugConfig";

interface ModeSelectProps {
  onSelect: (mode: GameMode) => void;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({ onSelect }) => {
  const handleDebugReset = () => {
    if (confirm("Alle Caches clearen und neu laden? (Debug Mode wird autoamtisch ausgewählt)")) {
      localStorage.removeItem("factory-island-save");
      delete (window as any).__FI_HMR_STATE__;
      delete (window as any).__FI_HMR_MODULES__;
      location.reload();
    }
  };

  return (
    <div className="fi-mode-select-overlay">
      <div className="fi-mode-select">
        <h1>🏭 Factory Island</h1>
        <p>Wähle einen Spielmodus:</p>
        <div className="fi-mode-buttons">
          <button
            className="fi-mode-btn fi-mode-btn--release"
            onClick={() => onSelect("release")}
          >
            <span className="fi-mode-btn-icon">🎮</span>
            <strong>Release</strong>
            <span className="fi-mode-btn-desc">
              Start mit 100 Coins. Kein Cheat.
            </span>
          </button>
          <button
            className="fi-mode-btn fi-mode-btn--debug"
            onClick={() => onSelect("debug")}
          >
            <span className="fi-mode-btn-icon">🐛</span>
            <strong>Debug</strong>
            <span className="fi-mode-btn-desc">
              Alle Ressourcen, alle Werkzeuge, freies Testen.
            </span>
          </button>
        </div>
        {IS_DEV && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
            <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>🔧 Dev-Tools:</p>
            <button
              onClick={handleDebugReset}
              style={{
                padding: "8px 12px",
                background: "rgba(249,115,22,0.2)",
                border: "1px solid rgba(249,115,22,0.5)",
                color: "#fb923c",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              🔄 HMR + Cache Clear + Debug
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

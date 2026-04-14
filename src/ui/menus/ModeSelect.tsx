import React from "react";
import type { GameMode } from "../../engine/simulation/game";

interface ModeSelectProps {
  onSelect: (mode: GameMode) => void;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({ onSelect }) => {
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
      </div>
    </div>
  );
};

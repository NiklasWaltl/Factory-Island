import React from "react";
import type { GameState, GameAction } from "../../features/factory-game/game";

interface SmithyPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const SmithyPanel: React.FC<SmithyPanelProps> = ({ state, dispatch }) => {
  const s = state.smithy;
  const isIron = s.selectedRecipe === "iron";
  const rawInQueue = isIron ? s.iron : s.copper;
  const canStart = s.fuel > 0 && rawInQueue >= 5;

  return (
    <div className="fi-panel fi-smithy" onClick={(e) => e.stopPropagation()}>
      <h2>🔥 Schmiede</h2>

      {/* Recipe selector */}
      <div className="fi-smithy-recipe-tabs">
        <button
          className={`fi-btn fi-btn-sm${isIron ? " fi-btn-active" : ""}`}
          disabled={s.processing}
          onClick={() => dispatch({ type: "SMITHY_SET_RECIPE", recipe: "iron" })}
        >
          ⚙️ Eisenbarren
        </button>
        <button
          className={`fi-btn fi-btn-sm${!isIron ? " fi-btn-active" : ""}`}
          disabled={s.processing}
          onClick={() => dispatch({ type: "SMITHY_SET_RECIPE", recipe: "copper" })}
        >
          🟫 Kupferbarren
        </button>
      </div>

      <p className="fi-smithy-recipe">
        {isIron
          ? "Rezept: 5 Eisen + 1 Holz → 1 Eisenbarren (5s)"
          : "Rezept: 5 Kupfer + 1 Holz → 1 Kupferbarren (5s)"}
      </p>

      <div className="fi-smithy-row">
        <div className="fi-smithy-slot">
          <span>🪵 Brennstoff</span>
          <strong>{s.fuel}</strong>
          <button
            className="fi-btn fi-btn-sm"
            disabled={state.inventory.wood <= 0}
            onClick={() => dispatch({ type: "SMITHY_ADD_FUEL", amount: 1 })}
          >+1</button>
          <button
            className="fi-btn fi-btn-sm"
            disabled={state.inventory.wood < 5}
            onClick={() => dispatch({ type: "SMITHY_ADD_FUEL", amount: 5 })}
          >+5</button>
        </div>

        {isIron ? (
          <div className="fi-smithy-slot">
            <span>⚙️ Eisen (braucht 5)</span>
            <strong>{s.iron}</strong>
            <button
              className="fi-btn fi-btn-sm"
              disabled={state.inventory.iron <= 0}
              onClick={() => dispatch({ type: "SMITHY_ADD_IRON", amount: 1 })}
            >+1</button>
            <button
              className="fi-btn fi-btn-sm"
              disabled={state.inventory.iron < 5}
              onClick={() => dispatch({ type: "SMITHY_ADD_IRON", amount: 5 })}
            >+5</button>
          </div>
        ) : (
          <div className="fi-smithy-slot">
            <span>🟫 Kupfer (braucht 5)</span>
            <strong>{s.copper}</strong>
            <button
              className="fi-btn fi-btn-sm"
              disabled={state.inventory.copper <= 0}
              onClick={() => dispatch({ type: "SMITHY_ADD_COPPER", amount: 1 })}
            >+1</button>
            <button
              className="fi-btn fi-btn-sm"
              disabled={state.inventory.copper < 5}
              onClick={() => dispatch({ type: "SMITHY_ADD_COPPER", amount: 5 })}
            >+5</button>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="fi-smithy-progress-wrap">
        <div className="fi-smithy-progress-bar">
          <div
            className="fi-smithy-progress-fill"
            style={{ width: `${Math.min(s.progress * 100, 100)}%` }}
          />
        </div>
        <span className="fi-smithy-progress-text">
          {s.processing ? `${Math.floor(s.progress * 100)}%` : "Gestoppt"}
        </span>
      </div>

      <div className="fi-smithy-controls">
        {!s.processing ? (
          <button
            className="fi-btn"
            disabled={!canStart}
            onClick={() => dispatch({ type: "SMITHY_START" })}
          >
            ▶ Starten
          </button>
        ) : (
          <button
            className="fi-btn fi-btn-danger"
            onClick={() => dispatch({ type: "SMITHY_STOP" })}
          >
            ⏹ Stoppen
          </button>
        )}
      </div>

      <div className="fi-smithy-output">
        {s.outputIngots > 0 && (
          <span>🧱 Eisenbarren fertig: <strong>{s.outputIngots}</strong></span>
        )}
        {s.outputCopperIngots > 0 && (
          <span>🟫 Kupferbarren fertig: <strong>{s.outputCopperIngots}</strong></span>
        )}
        {(s.outputIngots > 0 || s.outputCopperIngots > 0) ? (
          <button
            className="fi-btn"
            onClick={() => dispatch({ type: "SMITHY_WITHDRAW" })}
          >
            Ins Lager übertragen
          </button>
        ) : (
          <span style={{ color: "#888", fontSize: 13 }}>Keine fertigen Items</span>
        )}
      </div>

      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "12px 0" }} />
      <p style={{ color: "#777", fontSize: 11 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
};

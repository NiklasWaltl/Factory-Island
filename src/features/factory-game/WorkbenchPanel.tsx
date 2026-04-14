import React from "react";
import {
  WORKBENCH_RECIPES,
  RESOURCE_LABELS,
  RESOURCE_EMOJIS,
  type GameState,
  type GameAction,
} from "./game";

interface WorkbenchPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  state,
  dispatch,
}) => {
  return (
    <div className="fi-panel fi-workbench" onClick={(e) => e.stopPropagation()}>
      <h2>🔨 Werkbank</h2>
      <div className="fi-shop-list">
        {WORKBENCH_RECIPES.map((recipe) => {
          const canAfford = Object.entries(recipe.costs).every(
            ([res, amt]) =>
              (state.inventory[res as keyof typeof state.inventory] ?? 0) >=
              (amt ?? 0)
          );

          return (
            <div key={recipe.key} className="fi-shop-item">
              <div className="fi-shop-item-icon">{recipe.emoji}</div>
              <div className="fi-shop-item-info">
                <strong>{recipe.label}</strong>
                <div className="fi-shop-item-costs">
                  {Object.entries(recipe.costs).map(([res, amt]) => (
                    <span key={res} className="fi-shop-cost">
                      {RESOURCE_EMOJIS[res] ?? ""} {amt}{" "}
                      {RESOURCE_LABELS[res] ?? res}
                    </span>
                  ))}
                </div>
              </div>
              <button
                className="fi-btn"
                disabled={!canAfford}
                onClick={() =>
                  dispatch({ type: "CRAFT_WORKBENCH", recipeKey: recipe.key })
                }
              >
                Herstellen
              </button>
            </div>
          );
        })}
      </div>
      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "12px 0" }} />
      <p style={{ color: "#777", fontSize: 11 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
};

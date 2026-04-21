import React from "react";
import {
  RESOURCE_LABELS,
  RESOURCE_EMOJIS,
  getSourceStatusInfo,
  getCraftingSourceInventory,
  type GameState,
  type GameAction,
  type Inventory,
} from "../../store/reducer";
import { WORKBENCH_RECIPES } from "../../simulation/recipes";
import { ZoneSourceSelector } from "./ZoneSourceSelector";

interface WorkbenchPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = React.memo(({
  state,
  dispatch,
}) => {
  const buildingId = state.selectedCraftingBuildingId;
  const info = getSourceStatusInfo(state, buildingId);
  const sourceInv: Inventory = getCraftingSourceInventory(state, info.source);

  return (
    <div className="fi-panel fi-workbench" onClick={(e) => e.stopPropagation()}>
      <h2>🔨 Werkbank</h2>

      {/* ---- Source / Zone selector ---- */}
      <ZoneSourceSelector state={state} buildingId={buildingId} dispatch={dispatch} />

      <div className="fi-shop-list">
        {WORKBENCH_RECIPES.map((recipe) => {
          const hasPhysicalSource = info.source.kind !== "global";
          const canAfford = Object.entries(recipe.costs).every(
            ([res, amt]) =>
              (sourceInv[res as keyof Inventory] as number ?? 0) >=
              (amt ?? 0)
          );
          const canQueue = hasPhysicalSource && canAfford;

          return (
            <div key={recipe.key} className="fi-shop-item">
              <div className="fi-shop-item-icon">{recipe.emoji}</div>
              <div className="fi-shop-item-info">
                <strong>{recipe.label}</strong>
                <div className="fi-shop-item-costs">
                  {Object.entries(recipe.costs).map(([res, amt]) => {
                    const available = sourceInv[res as keyof Inventory] as number ?? 0;
                    const enough = available >= (amt ?? 0);
                    return (
                      <span key={res} className="fi-shop-cost" style={enough ? undefined : { color: "#f66" }}>
                        {RESOURCE_EMOJIS[res] ?? ""} {amt}{" "}
                        {RESOURCE_LABELS[res] ?? res}
                        <span style={{ fontSize: 10, color: "#888", marginLeft: 3 }}>({available})</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <button
                className="fi-btn"
                disabled={!canQueue}
                onClick={() =>
                  buildingId &&
                  dispatch({
                    type: "JOB_ENQUEUE",
                    recipeId: recipe.key,
                    workbenchId: buildingId,
                    priority: "high",
                    source: "player",
                  })
                }
              >
                Craft
              </button>
              {!canQueue && (
                <div style={{ fontSize: 10, color: "#e8a946", marginTop: 2 }}>
                  {!hasPhysicalSource
                    ? "Werkbank braucht physisches Lager"
                    : info.fallbackReason === "zone_no_warehouses"
                    ? "Zone hat keine Lagerh\u00e4user"
                    : info.source.kind === "zone"
                      ? "Zu wenig Ressourcen in der Zone"
                      : info.source.kind === "warehouse"
                        ? "Zu wenig Ressourcen im Lagerhaus"
                        : "Zu wenig Ressourcen (global)"}
                </div>
              )}
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
});

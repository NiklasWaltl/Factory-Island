import React from "react";
import {
  BUILDING_COSTS,
  BUILDING_LABELS,
  ASSET_EMOJIS,
  RESOURCE_LABELS,
  type GameState,
  type GameAction,
  type BuildingType,
} from "../../simulation/game";

interface ShopPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const BUILDINGS: BuildingType[] = ["workbench", "warehouse", "smithy"];

export const ShopPanel: React.FC<ShopPanelProps> = ({ state, dispatch }) => {
  return (
    <div className="fi-panel fi-shop" onClick={(e) => e.stopPropagation()}>
      <h2>🏪 Gebäude-Shop</h2>
      <div className="fi-shop-list">
        {BUILDINGS.map((bType) => {
          const purchased = state.purchasedBuildings.includes(bType);
          const costs = BUILDING_COSTS[bType];
          const canAfford = Object.entries(costs).every(
            ([res, amt]) =>
              (state.inventory[res as keyof typeof state.inventory] ?? 0) >=
              (amt ?? 0)
          );

          return (
            <div
              key={bType}
              className={`fi-shop-item ${purchased ? "fi-shop-item--purchased" : ""}`}
            >
              <div className="fi-shop-item-icon">
                {ASSET_EMOJIS[bType]}
              </div>
              <div className="fi-shop-item-info">
                <strong>{BUILDING_LABELS[bType]}</strong>
                <div className="fi-shop-item-costs">
                  {Object.entries(costs).map(([res, amt]) => (
                    <span key={res} className="fi-shop-cost">
                      {amt} {RESOURCE_LABELS[res] ?? res}
                    </span>
                  ))}
                </div>
              </div>
              {purchased ? (
                <span className="fi-shop-badge">✅ Gekauft</span>
              ) : (
                <button
                  className="fi-btn"
                  disabled={!canAfford}
                  onClick={() =>
                    dispatch({ type: "BUY_BUILDING", buildingType: bType })
                  }
                >
                  Kaufen
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

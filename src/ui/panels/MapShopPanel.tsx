import React from "react";
import {
  MAP_SHOP_ITEMS,
  RESOURCE_EMOJIS,
  RESOURCE_LABELS,
  type GameState,
  type GameAction,
} from "../../game/simulation/game";

interface MapShopPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const MapShopPanel: React.FC<MapShopPanelProps> = React.memo(({ state, dispatch }) => {
  return (
    <div className="fi-panel fi-map-shop" onClick={(e) => e.stopPropagation()}>
      <h2>🧑‍🌾 Händler</h2>

      {/* --- Werkzeuge --- */}
      <h3 className="fi-panel-section-title">🛠️ Werkzeuge</h3>
      <div className="fi-shop-list">
        {MAP_SHOP_ITEMS.map((item) => {
          const canAfford = state.inventory.coins >= item.costCoins;
          return (
            <div key={item.key} className="fi-shop-item">
              <div className="fi-shop-item-icon">{item.emoji}</div>
              <div className="fi-shop-item-info">
                <strong>{item.label}</strong>
                <div className="fi-shop-item-costs">
                  <span className="fi-shop-cost">
                    {RESOURCE_EMOJIS.coins} {item.costCoins} Coins
                  </span>
                </div>
              </div>
              <button
                className="fi-btn"
                disabled={!canAfford}
                onClick={() =>
                  dispatch({ type: "BUY_MAP_SHOP_ITEM", itemKey: item.key })
                }
              >
                Kaufen
              </button>
            </div>
          );
        })}
      </div>

      <p style={{ color: "#777", fontSize: 11, marginTop: 12 }}>
        Gebäude können über das Bau-Menü (B) platziert werden.
      </p>

      <p style={{ color: "#888", fontSize: 12, marginTop: 12 }}>
        Du hast {RESOURCE_EMOJIS.coins} {state.inventory.coins} Coins
      </p>
    </div>
  );
});

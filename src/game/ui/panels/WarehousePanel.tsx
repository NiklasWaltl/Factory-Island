import React from "react";
import {
  RESOURCE_LABELS,
  RESOURCE_EMOJIS,
  WAREHOUSE_CAPACITY,
  type GameState,
  type GameAction,
  type Inventory,
} from "../../simulation/game";

interface WarehousePanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const RESOURCE_ITEMS: (keyof Inventory)[] = [
  "coins",
  "wood",
  "stone",
  "iron",
  "copper",
  "sapling",
  "ironIngot",
  "copperIngot",
  "metalPlate",
  "gear",
];

const EQUIPPABLE_ITEMS: { key: keyof Inventory; kind: "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling" }[] = [
  { key: "axe", kind: "axe" },
  { key: "wood_pickaxe", kind: "wood_pickaxe" },
  { key: "stone_pickaxe", kind: "stone_pickaxe" },
  { key: "sapling", kind: "sapling" },
];

export const WarehousePanel: React.FC<WarehousePanelProps> = React.memo(({ state, dispatch }) => {
  const cap = state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
  const selectedWarehouseId = state.selectedWarehouseId;
  const selectedWarehouseInv = selectedWarehouseId ? state.warehouseInventories[selectedWarehouseId] : null;

  if (!selectedWarehouseId || !selectedWarehouseInv) {
    return null;
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.getData("source") === "hotbar") {
      const slot = parseInt(e.dataTransfer.getData("slot"), 10);
      if (!isNaN(slot)) dispatch({ type: "REMOVE_FROM_HOTBAR", slot });
    }
  };

  return (
    <div
      className="fi-panel fi-warehouse"
      onClick={(e) => e.stopPropagation()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h2>📦 Lagerhaus</h2>
      <p className="fi-warehouse-capacity">
        {state.mode === "debug"
          ? "Kapazität: ∞ (Debug-Modus)"
          : `Kapazität: ${WAREHOUSE_CAPACITY} / Item`}
      </p>

      <h3 className="fi-panel-section-title">Ressourcen</h3>
      <div className="fi-warehouse-grid">
        {RESOURCE_ITEMS.map((key) => {
          const amount = selectedWarehouseInv[key] as number;
          const isCapped = key !== "coins" && cap !== Infinity && amount >= cap;
          return (
            <div key={key} className={`fi-warehouse-item${isCapped ? " fi-warehouse-item--full" : ""}`}>
              <span className="fi-warehouse-emoji">{RESOURCE_EMOJIS[key] ?? "?"}</span>
              <span className="fi-warehouse-name">{RESOURCE_LABELS[key] ?? key}</span>
              <span className="fi-warehouse-amount">{amount}{isCapped ? " 🔒" : (cap !== Infinity && key !== "coins" ? `/${cap}` : "")}</span>
            </div>
          );
        })}
      </div>

      <h3 className="fi-panel-section-title" style={{ marginTop: 14 }}>Werkzeuge &amp; Ausrüstung</h3>
      <div className="fi-warehouse-equip-list">
        {EQUIPPABLE_ITEMS.map(({ key, kind }) => {
          const amount = selectedWarehouseInv[key] as number;
          const inHotbar = state.hotbarSlots
            .filter((s) => s.toolKind === kind)
            .reduce((sum, s) => sum + s.amount, 0);
          return (
            <div
              key={key}
              className="fi-warehouse-equip-row"
              draggable={amount > 0}
              onDragStart={(e) => {
                e.dataTransfer.setData("source", "warehouse");
                e.dataTransfer.setData("kind", kind);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <span className="fi-warehouse-emoji">{RESOURCE_EMOJIS[key] ?? "?"}</span>
              <span className="fi-warehouse-name" style={{ flex: 1 }}>{RESOURCE_LABELS[key] ?? key}</span>
              <span className="fi-warehouse-amount" style={{ minWidth: 60, textAlign: "right" }}>
                Lager: {amount} | Hotbar: {inHotbar}
              </span>
              <button
                className="fi-btn fi-btn-sm"
                disabled={amount <= 0}
                onClick={() => dispatch({ type: "EQUIP_FROM_WAREHOUSE", itemKind: kind, amount: 1 })}
              >
                +1 → Hotbar
              </button>
              <button
                className="fi-btn fi-btn-sm"
                disabled={amount < 5}
                onClick={() => dispatch({ type: "EQUIP_FROM_WAREHOUSE", itemKind: kind, amount: 5 })}
              >
                +5 →
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
});

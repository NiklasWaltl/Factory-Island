import React from "react";
import type { GameState, GameAction, BuildingType } from "../../store/reducer";

interface HotbarProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const Hotbar: React.FC<HotbarProps> = React.memo(({ state, dispatch }) => {
  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, idx: number) => {
    if (state.hotbarSlots[idx].toolKind === "empty") { e.preventDefault(); return; }
    e.dataTransfer.setData("source", "hotbar");
    e.dataTransfer.setData("slot", String(idx));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, _toIdx: number) => {
    e.preventDefault();
    const source = e.dataTransfer.getData("source");
    if (source === "warehouse") {
      const kind = e.dataTransfer.getData("kind");
      const bType = e.dataTransfer.getData("buildingType") as BuildingType | "";
      // Buildings are placed exclusively via Build Menu – block drag to hotbar
      if (kind === "building" && bType) {
        return;
      } else if (kind) {
        dispatch({ type: "EQUIP_FROM_WAREHOUSE", itemKind: kind as "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling", amount: 1 });
      }
    }
  };

  return (
    <div className="fi-hotbar">
      {state.hotbarSlots.map((slot, idx) => {
        const active = state.activeSlot === idx;
        return (
          <div
            key={idx}
            className="fi-hotbar-drop-zone"
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("fi-hotbar-drop-zone--over"); }}
            onDragLeave={(e) => e.currentTarget.classList.remove("fi-hotbar-drop-zone--over")}
            onDrop={(e) => { e.stopPropagation(); e.currentTarget.classList.remove("fi-hotbar-drop-zone--over"); handleDrop(e, idx); }}
          >
            <button
              draggable={slot.toolKind !== "empty"}
              onDragStart={(e) => handleDragStart(e, idx)}
              className={`fi-hotbar-slot ${active ? "fi-hotbar-slot--active" : ""} ${slot.toolKind === "empty" ? "fi-hotbar-slot--empty" : ""}`}
              onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_ACTIVE_SLOT", slot: idx }); }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); dispatch({ type: "REMOVE_FROM_HOTBAR", slot: idx }); }}
              title={slot.toolKind !== "empty" ? `${slot.label} (Rechtsklick/Ziehen: ins Lager)` : ""}
            >
              <span className="fi-hotbar-emoji">{slot.emoji}</span>
              {slot.amount > 1 && <span className="fi-hotbar-amount">{slot.amount}</span>}
              <span className="fi-hotbar-label">{slot.toolKind === "empty" ? "" : slot.label}</span>
              <span className="fi-hotbar-key">{idx + 1}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
});

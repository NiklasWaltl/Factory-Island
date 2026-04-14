import React from "react";
import { RESOURCE_LABELS, RESOURCE_EMOJIS, type GameState } from "../../game/simulation/game";

interface ResourceBarProps {
  state: GameState;
}

export const ResourceBar: React.FC<ResourceBarProps> = React.memo(({ state }) => {
  return (
    <div className="fi-resource-bar">
      <div className="fi-resource-item fi-resource-item--coins">
        <span>{RESOURCE_EMOJIS["coins"]}</span>
        <span>{RESOURCE_LABELS["coins"]}</span>
        <strong>{state.inventory.coins}</strong>
      </div>
    </div>
  );
});

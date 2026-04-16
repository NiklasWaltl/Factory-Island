import React from "react";
import {
  RESOURCE_EMOJIS,
  getCapacityPerResource,
  type GameState,
  type Inventory,
} from "../../store/reducer";

interface ResourceBarProps {
  state: GameState;
}

/** Resources shown in the compact HUD — excludes tools and building items. */
const CORE_RESOURCES: (keyof Inventory)[] = [
  "wood",
  "stone",
  "iron",
  "copper",
  "ironIngot",
  "copperIngot",
];

export const ResourceBar: React.FC<ResourceBarProps> = React.memo(({ state }) => {
  const cap = getCapacityPerResource(state);
  const capLabel = cap === Infinity ? "∞" : String(cap);

  return (
    <div className="fi-resource-bar">
      {/* Coins — no capacity cap */}
      <div className="fi-resource-item fi-resource-item--coins">
        <span>{RESOURCE_EMOJIS["coins"]}</span>
        <strong>{state.inventory.coins}</strong>
      </div>

      {/* Core resources with capacity indicator */}
      {CORE_RESOURCES.map((key) => {
        const amount = state.inventory[key] as number;
        const atCap = cap !== Infinity && amount >= cap;
        const nearCap = !atCap && cap !== Infinity && amount >= cap * 0.9;
        return (
          <div
            key={key}
            className={`fi-resource-item${
              atCap ? " fi-resource-item--full" : nearCap ? " fi-resource-item--near" : ""
            }`}
          >
            <span>{RESOURCE_EMOJIS[key] ?? "📦"}</span>
            <strong>{amount}</strong>
            {cap !== Infinity && (
              <span className="fi-resource-cap">/{capLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
});

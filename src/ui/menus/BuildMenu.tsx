import React from "react";
import {
  BUILDING_COSTS,
  BUILDING_LABELS,
  BUILDING_SIZES,
  RESOURCE_EMOJIS,
  RESOURCE_LABELS,
  STACKABLE_BUILDINGS,
  MAX_WAREHOUSES,
  FLOOR_TILE_COSTS,
  FLOOR_TILE_LABELS,
  FLOOR_TILE_DESCRIPTIONS,
  type GameState,
  type GameAction,
  type BuildingType,
  type FloorTileType,
} from "../../game/simulation/game";
import { ASSET_SPRITES, FLOOR_SPRITES, GRASS_TILE_SPRITES } from "../../game/assets/sprites/sprites";

interface BuildMenuProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

interface BuildCategory {
  label: string;
  emoji: string;
  buildings: BuildingType[];
}

const CATEGORIES: BuildCategory[] = [
  { label: "Energie", emoji: "⚡", buildings: ["generator", "cable", "power_pole", "battery"] },
  { label: "Produktion", emoji: "🔨", buildings: ["workbench", "smithy", "auto_miner", "manual_assembler"] },
  { label: "Logistik", emoji: "➡️", buildings: ["conveyor", "conveyor_corner"] },
  { label: "Lager", emoji: "📦", buildings: ["warehouse"] },
];

const FLOOR_TILES: FloorTileType[] = ["stone_floor", "grass_block"];

const BUILDING_DESCRIPTIONS: Record<BuildingType, string> = {
  generator: "Verbrennt Holz und erzeugt Energie für das Netzwerk.",
  cable: "Verbindet Generator mit Stromknoten (1×1).",
  power_pole: "Verteilt Energie kabellos an Gebäude in Reichweite (3 Felder).",
  battery: "Speichert überschüssige Energie für später.",
  workbench: "Stelle Werkzeuge und Items her.",
  smithy: "Schmelze Erze zu Barren.",
  warehouse: "Erhöht die Lagerkapazität für Ressourcen.",
  auto_miner: "Baut automatisch Ressourcen von Vorkommen ab. Nur auf 2×2 Deposits. Benötigt Energie. R zum Drehen.",
  manual_assembler: "Stellt per Hand Metallplatten und Zahnräder her. Keine Energie nötig.",
  conveyor: "Transportiert Items automatisch in eine Richtung. Benötigt Energie. R zum Drehen.",
  conveyor_corner: "Leitet Items in einer 90°-Ecke weiter. Benötigt Energie. R zum Drehen.",
};

export const BuildMenu: React.FC<BuildMenuProps> = React.memo(({ state, dispatch }) => {
  const selected = state.selectedBuildingType;

  const canAfford = (bType: BuildingType): boolean => {
    const costs = BUILDING_COSTS[bType];
    return Object.entries(costs).every(
      ([res, amt]) => (state.inventory[res as keyof typeof state.inventory] ?? 0) >= (amt ?? 0)
    );
  };

  const canAffordFloor = (tileType: FloorTileType): boolean => {
    const costs = FLOOR_TILE_COSTS[tileType];
    return Object.entries(costs).every(
      ([res, amt]) => (state.inventory[res as keyof typeof state.inventory] ?? 0) >= (amt ?? 0)
    );
  };

  const isAlreadyPlaced = (bType: BuildingType): boolean => {
    if (STACKABLE_BUILDINGS.has(bType)) return false;
    if (bType === "warehouse") return state.warehousesPlaced >= MAX_WAREHOUSES;
    return state.placedBuildings.includes(bType);
  };

  const getStatus = (bType: BuildingType): { label: string; className: string } => {
    if (isAlreadyPlaced(bType)) return { label: "Bereits platziert", className: "fi-build-status--placed" };
    if (!canAfford(bType)) return { label: "Nicht genug Ressourcen", className: "fi-build-status--no-res" };
    return { label: "Kann platziert werden", className: "fi-build-status--ok" };
  };

  return (
    <div className="fi-build-menu" onClick={(e) => e.stopPropagation()}>
      <div className="fi-build-menu-header">
        <h2>🏗️ Bau-Menü</h2>
        <button className="fi-btn fi-btn-sm" onClick={() => dispatch({ type: "TOGGLE_BUILD_MODE" })}>
          ✕ Schließen
        </button>
      </div>

      <div className="fi-build-menu-hint">
        Wähle ein Gebäude und klicke auf das Spielfeld zum Platzieren.
        <br />Rechtsklick auf ein platziertes Gebäude zum Entfernen.
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat.label} className="fi-build-category">
          <h3 className="fi-build-category-title">{cat.emoji} {cat.label}</h3>
          <div className="fi-build-items">
            {cat.buildings.map((bType) => {
              const costs = BUILDING_COSTS[bType];
              const status = getStatus(bType);
              const isSelected = selected === bType;
              const affordable = canAfford(bType);
              const placed = isAlreadyPlaced(bType);
              const size = BUILDING_SIZES[bType];
              return (
                <div
                  key={bType}
                  className={`fi-build-item ${isSelected ? "fi-build-item--selected" : ""} ${placed ? "fi-build-item--placed" : ""} ${!affordable && !placed ? "fi-build-item--disabled" : ""}`}
                  onClick={() => {
                    if (placed) return;
                    dispatch({ type: "SELECT_BUILD_BUILDING", buildingType: isSelected ? null : bType });
                  }}
                >
                <div className="fi-build-item-icon"><img src={ASSET_SPRITES[bType]} alt={BUILDING_LABELS[bType]} style={{ width: 36, height: 36, imageRendering: "pixelated" }} /></div>
                  <div className="fi-build-item-info">
                    <div className="fi-build-item-name">
                      {BUILDING_LABELS[bType]}
                      <span className="fi-build-item-size">{size}×{size}</span>
                    </div>
                    <div className="fi-build-item-desc">{BUILDING_DESCRIPTIONS[bType]}</div>
                    <div className="fi-build-item-costs">
                      {Object.entries(costs).map(([res, amt]) => {
                        const have = (state.inventory[res as keyof typeof state.inventory] ?? 0) as number;
                        const enough = have >= (amt ?? 0);
                        return (
                          <span key={res} className={`fi-build-cost ${enough ? "" : "fi-build-cost--lacking"}`}>
                            {RESOURCE_EMOJIS[res] ?? ""} {amt} {RESOURCE_LABELS[res] ?? res}
                          </span>
                        );
                      })}
                    </div>
                    <div className={`fi-build-status ${status.className}`}>{status.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ---- Boden ---- */}
      <div className="fi-build-category">
        <h3 className="fi-build-category-title">🌿 Boden</h3>
        <div className="fi-build-items">
          {FLOOR_TILES.map((tileType) => {
            const costs = FLOOR_TILE_COSTS[tileType];
            const isSelectedF = state.selectedFloorTile === tileType;
            const affordable = canAffordFloor(tileType);
            return (
              <div
                key={tileType}
                className={`fi-build-item ${isSelectedF ? "fi-build-item--selected" : ""} ${!affordable ? "fi-build-item--disabled" : ""}`}
                onClick={() =>
                  dispatch({ type: "SELECT_BUILD_FLOOR_TILE", tileType: isSelectedF ? null : tileType })
                }
              >
                <div className="fi-build-item-icon"><img src={tileType === "stone_floor" ? FLOOR_SPRITES.stone_floor : GRASS_TILE_SPRITES[0]} alt={FLOOR_TILE_LABELS[tileType]} style={{ width: 36, height: 36, imageRendering: "pixelated" }} /></div>
                <div className="fi-build-item-info">
                  <div className="fi-build-item-name">
                    {FLOOR_TILE_LABELS[tileType]}
                    <span className="fi-build-item-size">1×1</span>
                  </div>
                  <div className="fi-build-item-desc">{FLOOR_TILE_DESCRIPTIONS[tileType]}</div>
                  <div className="fi-build-item-costs">
                    {Object.entries(costs).map(([res, amt]) => {
                      const have = (state.inventory[res as keyof typeof state.inventory] ?? 0) as number;
                      const enough = have >= (amt ?? 0);
                      return (
                        <span key={res} className={`fi-build-cost ${enough ? "" : "fi-build-cost--lacking"}`}>
                          {RESOURCE_EMOJIS[res] ?? ""} {amt} {RESOURCE_LABELS[res] ?? res}
                        </span>
                      );
                    })}
                  </div>
                  <div className={`fi-build-status ${affordable ? "fi-build-status--ok" : "fi-build-status--no-res"}`}>
                    {affordable ? "Kann platziert werden" : "Nicht genug Ressourcen"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* ---- Stromnetz-Analyse Toggle ---- */}
      <div className="fi-build-category">
        <h3 className="fi-build-category-title">🔍 Debug</h3>
        <div className="fi-build-items">
          <div
            className={`fi-build-item ${state.energyDebugOverlay ? "fi-build-item--selected" : ""}`}
            onClick={() => dispatch({ type: "TOGGLE_ENERGY_DEBUG" })}
            title="Stromnetz-Analyse ein/aus"
          >
            <div className="fi-build-item-icon" style={{ fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36 }}>⚡</div>
            <div className="fi-build-item-info">
              <div className="fi-build-item-name">Stromnetz-Analyse</div>
              <div className="fi-build-item-desc">Zeigt Stromknoten, Verbindungen, Verbraucher und Energie-Bilanz an.</div>
              <div className={`fi-build-status ${state.energyDebugOverlay ? "fi-build-status--ok" : "fi-build-status--no-res"}`}>
                {state.energyDebugOverlay ? "Aktiv" : "Inaktiv"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

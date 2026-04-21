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
  hasResources,
  selectBuildMenuInventoryView,
  selectGlobalInventoryView,
  hasResourcesInPhysicalStorage,
  type GameState,
  type GameAction,
  type BuildingType,
  type FloorTileType,
  type Inventory,
} from "../../store/reducer";
import { ASSET_SPRITES, FLOOR_SPRITES, GRASS_TILE_SPRITES } from "../../assets/sprites/sprites";

interface BuildMenuProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

interface BuildCategory {
  label: string;
  emoji: string;
  buildings: BuildingType[];
}

interface BuildMenuDebugSectionProps {
  energyDebugOverlay: boolean;
  onToggle: () => void;
}

const CATEGORIES: BuildCategory[] = [
  { label: "Energie", emoji: "?", buildings: ["generator", "cable", "power_pole", "battery"] },
  { label: "Produktion", emoji: "??", buildings: ["workbench", "smithy", "auto_miner", "manual_assembler", "auto_smelter"] },
  { label: "Logistik", emoji: "??", buildings: ["conveyor", "conveyor_corner"] },
  { label: "Lager", emoji: "??", buildings: ["warehouse"] },
  { label: "Hub", emoji: "\uD83D\uDEF8", buildings: ["service_hub"] },
];

const FLOOR_TILES: FloorTileType[] = ["stone_floor", "grass_block"];

const BUILDING_DESCRIPTIONS: Record<BuildingType, string> = {
  generator: "Verbrennt Holz und erzeugt Energie f�r das Netzwerk.",
  cable: "Verbindet Generator mit Stromknoten (1�1).",
  power_pole: "Verteilt Energie kabellos an Geb�ude in Reichweite (3 Felder).",
  battery: "Speichert �bersch�ssige Energie f�r sp�ter.",
  workbench: "Stelle Werkzeuge und Items her.",
  smithy: "Schmelze Erze zu Barren.",
  warehouse: "Erh�ht die Lagerkapazit�t f�r Ressourcen.",
  auto_miner: "Baut automatisch Ressourcen von Vorkommen ab. Nur auf 2�2 Deposits. Ben�tigt Energie. R zum Drehen.",
  manual_assembler: "Stellt per Hand Metallplatten und Zahnr�der her. Keine Energie n�tig.",
  auto_smelter: "Automatisches Schmelzen per F�rderband. 2�1, rotierbar, Input/Output auf gegen�berliegenden Seiten.",
  conveyor: "Transportiert Items automatisch in eine Richtung. Ben�tigt Energie. R zum Drehen.",
  conveyor_corner: "Leitet Items in einer 90�-Ecke weiter. Ben�tigt Energie. R zum Drehen.",
  service_hub: "Platziert einen Proto-Hub (Stufe 1). Kann sp\u00e4ter zu einem Service-Hub (Stufe 2) aufger\u00fcstet werden.",
};

const BuildMenuDebugSection: React.FC<BuildMenuDebugSectionProps> = ({
  energyDebugOverlay,
  onToggle,
}) => (
  <div className="fi-build-category">
    <h3 className="fi-build-category-title">?? Debug</h3>
    <div className="fi-build-items">
      <div
        className={`fi-build-item ${energyDebugOverlay ? "fi-build-item--selected" : ""}`}
        onClick={onToggle}
        title="Stromnetz-Analyse ein/aus"
      >
        <div className="fi-build-item-icon" style={{ fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36 }}>?</div>
        <div className="fi-build-item-info">
          <div className="fi-build-item-name">Stromnetz-Analyse</div>
          <div className="fi-build-item-desc">Zeigt Stromknoten, Verbindungen, Verbraucher und Energie-Bilanz an.</div>
          <div className={`fi-build-status ${energyDebugOverlay ? "fi-build-status--ok" : "fi-build-status--no-res"}`}>
            {energyDebugOverlay ? "Aktiv" : "Inaktiv"}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const BuildMenu: React.FC<BuildMenuProps> = React.memo(({ state, dispatch }) => {
  const selected = state.selectedBuildingType;
  const buildingInventoryView: Inventory = selectBuildMenuInventoryView(state);
  const floorInventoryView: Inventory = selectGlobalInventoryView(state);

  const canAfford = (bType: BuildingType): boolean =>
    hasResources(buildingInventoryView, BUILDING_COSTS[bType] as Partial<Record<keyof Inventory, number>>);

  const canAffordFloor = (tileType: FloorTileType): boolean =>
    hasResourcesInPhysicalStorage(state, FLOOR_TILE_COSTS[tileType] as Partial<Record<keyof Inventory, number>>);

  const getBuildSourceDebugTitle = (costs: Partial<Record<keyof Inventory, number>>): string => {
    const missing = Object.entries(costs).flatMap(([res, amt]) => {
      const required = amt ?? 0;
      const available = (buildingInventoryView[res as keyof Inventory] ?? 0) as number;
      const shortfall = required - available;
      return shortfall > 0 ? [`${shortfall} ${RESOURCE_LABELS[res] ?? res}`] : [];
    });

    return missing.length === 0
      ? "Bauquelle UI: Drohnen-Hub + Ressourcen-Drops. Lagerhaus/global werden ignoriert."
      : `Bauquelle UI: Drohnen-Hub + Ressourcen-Drops. Fehlt: ${missing.join(", ")}. Lagerhaus/global werden ignoriert.`;
  };

  const isAlreadyPlaced = (bType: BuildingType): boolean => {
    if (STACKABLE_BUILDINGS.has(bType)) return false;
    if (bType === "warehouse") return state.warehousesPlaced >= (import.meta.env.DEV ? 100 : MAX_WAREHOUSES);
    const limit = import.meta.env.DEV ? 100 : 1;
    return state.placedBuildings.filter(b => b === bType).length >= limit;
  };

  const getStatus = (bType: BuildingType): { label: string; className: string } => {
    if (isAlreadyPlaced(bType)) return { label: "Bereits platziert", className: "fi-build-status--placed" };
    if (!canAfford(bType)) return { label: "Nicht genug Ressourcen", className: "fi-build-status--no-res" };
    return { label: "Kann platziert werden", className: "fi-build-status--ok" };
  };

  return (
    <div className="fi-build-menu" onClick={(e) => e.stopPropagation()}>
      <div className="fi-build-menu-header">
        <h2>??? Bau-Men�</h2>
        <button className="fi-btn fi-btn-sm" onClick={() => dispatch({ type: "TOGGLE_BUILD_MODE" })}>
          ? Schlie�en
        </button>
      </div>

      <div className="fi-build-menu-hint">
        W�hle ein Geb�ude und klicke auf das Spielfeld zum Platzieren.
        <br />Rechtsklick auf ein platziertes Geb�ude zum Entfernen.
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
                  title={placed ? status.label : getBuildSourceDebugTitle(costs)}
                  onClick={() => {
                    if (placed || !affordable) {
                      if (import.meta.env.DEV && !placed && !affordable) {
                        console.debug(`[BuildMenu] Blocked ${bType}: ${getBuildSourceDebugTitle(costs)}`);
                      }
                      return;
                    }
                    dispatch({ type: "SELECT_BUILD_BUILDING", buildingType: isSelected ? null : bType });
                  }}
                >
                <div className="fi-build-item-icon"><img src={ASSET_SPRITES[bType]} alt={BUILDING_LABELS[bType]} style={{ width: 36, height: 36, imageRendering: "pixelated" }} /></div>
                  <div className="fi-build-item-info">
                    <div className="fi-build-item-name">
                      {BUILDING_LABELS[bType]}
                      <span className="fi-build-item-size">{size}�{size}</span>
                    </div>
                    <div className="fi-build-item-desc">{BUILDING_DESCRIPTIONS[bType]}</div>
                    <div className="fi-build-item-costs">
                      {Object.entries(costs).map(([res, amt]) => {
                        const have = (buildingInventoryView[res as keyof Inventory] ?? 0) as number;
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
        <h3 className="fi-build-category-title">?? Boden</h3>
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
                    <span className="fi-build-item-size">1�1</span>
                  </div>
                  <div className="fi-build-item-desc">{FLOOR_TILE_DESCRIPTIONS[tileType]}</div>
                  <div className="fi-build-item-costs">
                    {Object.entries(costs).map(([res, amt]) => {
                      const have = (floorInventoryView[res as keyof Inventory] ?? 0) as number;
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
      <BuildMenuDebugSection
        energyDebugOverlay={state.energyDebugOverlay}
        onToggle={() => dispatch({ type: "TOGGLE_ENERGY_DEBUG" })}
      />
    </div>
  );
});

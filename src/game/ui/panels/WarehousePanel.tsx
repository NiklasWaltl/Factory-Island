import React from "react";
import {
  RESOURCE_LABELS,
  RESOURCE_EMOJIS,
  WAREHOUSE_CAPACITY,
  MAX_ZONES,
  BUILDING_LABELS,
  getZoneWarehouseIds,
  getZoneBuildingIds,
  getZoneAggregateInventory,
  getZoneItemCapacity,
  type GameState,
  type GameAction,
  type Inventory,
  type BuildingType,
} from "../../store/reducer";

interface WarehousePanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

type EquipKind = "axe" | "wood_pickaxe" | "stone_pickaxe" | "sapling";

// Tools come from the workbench and are the primary action target in this panel.
const TOOL_ITEMS: { key: keyof Inventory; kind: EquipKind }[] = [
  { key: "axe", kind: "axe" },
  { key: "wood_pickaxe", kind: "wood_pickaxe" },
  { key: "stone_pickaxe", kind: "stone_pickaxe" },
];

// Seeds are hotbar-eligible too, but visually grouped as a separate sub-section
// so that the player understands they are not crafted tools.
const SEED_ITEMS: { key: keyof Inventory; kind: EquipKind }[] = [
  { key: "sapling", kind: "sapling" },
];

// Bulk materials are read-only here — auto-stocked by belts / miners.
const MATERIAL_ITEMS: (keyof Inventory)[] = [
  "wood",
  "stone",
  "iron",
  "copper",
  "ironIngot",
  "copperIngot",
  "metalPlate",
  "gear",
];

export const WarehousePanel: React.FC<WarehousePanelProps> = React.memo(({ state, dispatch }) => {
  const whCap = state.mode === "debug" ? Infinity : WAREHOUSE_CAPACITY;
  const selectedWarehouseId = state.selectedWarehouseId;
  const selectedWarehouseInv = selectedWarehouseId ? state.warehouseInventories[selectedWarehouseId] : null;

  if (!selectedWarehouseId || !selectedWarehouseInv) {
    return null;
  }

  const hasToolOrSeedStock = [...TOOL_ITEMS, ...SEED_ITEMS].some(
    ({ key }) => (selectedWarehouseInv[key] as number) > 0,
  );
  const isWorkbenchTargetWarehouse = Object.values(state.assets).some(
    (asset) => asset.type === "workbench" && state.buildingSourceWarehouseIds[asset.id] === selectedWarehouseId,
  );
  const shouldRenderToolsSection = isWorkbenchTargetWarehouse || hasToolOrSeedStock;

  return (
    <div
      className="fi-panel fi-warehouse"
      onClick={(e) => e.stopPropagation()}
    >
      <h2>📦 Lagerhaus</h2>
      <p className="fi-warehouse-capacity">
        {whCap === Infinity
          ? "Kapazität: ∞ (Debug-Modus)"
          : `Kapazität: ${whCap} / Ressource`}
      </p>

      {/* ---- 1. Werkzeuge (immer für Werkbank-Ziellagerhaus, sonst nur bei Bestand) ---- */}
      {shouldRenderToolsSection ? (
        <>
          <h3 className="fi-panel-section-title fi-warehouse-tools-title">🔨 Werkzeuge</h3>
          {hasToolOrSeedStock ? (
            <>
              <p className="fi-warehouse-hint">Nur diese Items können in die Hotbar gelegt werden.</p>
              <div className="fi-warehouse-tools-list" data-testid="wh-tools-list">
                {TOOL_ITEMS.map(({ key, kind }) => {
                  const amount = selectedWarehouseInv[key] as number;
                  const inHotbar = state.hotbarSlots
                    .filter((s) => s.toolKind === kind)
                    .reduce((sum, s) => sum + s.amount, 0);
                  const canEquip = amount > 0;
                  return (
                    <div key={key} className="fi-warehouse-tool-row">
                      <span className="fi-warehouse-tool-emoji">{RESOURCE_EMOJIS[key] ?? "?"}</span>
                      <div className="fi-warehouse-tool-meta">
                        <span className="fi-warehouse-tool-name">{RESOURCE_LABELS[key] ?? key}</span>
                        <span className="fi-warehouse-tool-counts">
                          <span>Im Lager: <strong>{amount}</strong></span>
                          <span className="fi-warehouse-tool-counts-sep">·</span>
                          <span>In Hotbar: <strong>{inHotbar}</strong></span>
                        </span>
                      </div>
                      <button
                        className="fi-btn fi-btn-primary fi-warehouse-tool-btn"
                        disabled={!canEquip}
                        title={canEquip ? "In die Hotbar legen" : "Nicht im Lager"}
                        onClick={() => dispatch({ type: "EQUIP_FROM_WAREHOUSE", itemKind: kind, amount: 1 })}
                      >
                        In Hotbar
                      </button>
                    </div>
                  );
                })}

                {/* Saatgut visuell klar getrennte Untersektion innerhalb des Werkzeug-Bereichs */}
                <div className="fi-warehouse-seeds-subhead">Saatgut</div>
                {SEED_ITEMS.map(({ key, kind }) => {
                  const amount = selectedWarehouseInv[key] as number;
                  const inHotbar = state.hotbarSlots
                    .filter((s) => s.toolKind === kind)
                    .reduce((sum, s) => sum + s.amount, 0);
                  const canEquip = amount > 0;
                  return (
                    <div key={key} className="fi-warehouse-tool-row fi-warehouse-tool-row--seed">
                      <span className="fi-warehouse-tool-emoji">{RESOURCE_EMOJIS[key] ?? "?"}</span>
                      <div className="fi-warehouse-tool-meta">
                        <span className="fi-warehouse-tool-name">{RESOURCE_LABELS[key] ?? key}</span>
                        <span className="fi-warehouse-tool-counts">
                          <span>Im Lager: <strong>{amount}</strong></span>
                          <span className="fi-warehouse-tool-counts-sep">·</span>
                          <span>In Hotbar: <strong>{inHotbar}</strong></span>
                        </span>
                      </div>
                      <button
                        className="fi-btn fi-btn-primary fi-warehouse-tool-btn"
                        disabled={!canEquip}
                        title={canEquip ? "In die Hotbar legen" : "Nicht im Lager"}
                        onClick={() => dispatch({ type: "EQUIP_FROM_WAREHOUSE", itemKind: kind, amount: 1 })}
                      >
                        In Hotbar
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="fi-warehouse-tools-empty" data-testid="wh-tools-empty-hint">
              <p className="fi-warehouse-tools-empty-line">Werkzeuge aus der Werkbank landen hier.</p>
              <p className="fi-warehouse-tools-empty-line fi-warehouse-tools-empty-line--muted">
                Aktuell keine Werkzeuge eingelagert.
              </p>
            </div>
          )}
        </>
      ) : null}

      {/* ---- 2. Materialien (read-only, ruhige Übersicht) ---- */}
      <h3 className="fi-panel-section-title fi-warehouse-materials-title">📦 Materialien</h3>
      <p className="fi-warehouse-hint fi-warehouse-hint--quiet">Automatisch eingelagert.</p>
      <ul className="fi-warehouse-materials-list" data-testid="wh-materials-list">
        {MATERIAL_ITEMS.map((key) => {
          const whAmount = selectedWarehouseInv[key] as number;
          const isCapped = whCap !== Infinity && whAmount >= whCap;
          return (
            <li
              key={key}
              className={`fi-warehouse-material-row${isCapped ? " fi-warehouse-material-row--full" : ""}`}
            >
              <span className="fi-warehouse-material-emoji">{RESOURCE_EMOJIS[key] ?? "?"}</span>
              <span className="fi-warehouse-material-name">{RESOURCE_LABELS[key] ?? key}</span>
              <span className="fi-warehouse-material-amount">
                {whAmount}{whCap !== Infinity ? `/${whCap}` : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <hr style={{ borderColor: "rgba(255,255,255,0.1)", margin: "12px 0" }} />

      {/* ---- 3. Produktionszone (technisches Detail, unten) ---- */}
      <h3 className="fi-panel-section-title">Produktionszone</h3>
      {(() => {
        const currentZoneId = selectedWarehouseId ? state.buildingZoneIds[selectedWarehouseId] ?? null : null;
        const currentZone = currentZoneId ? state.productionZones[currentZoneId] ?? null : null;
        const zones = Object.values(state.productionZones);
        const canCreate = zones.length < MAX_ZONES;

        return (
          <div style={{ marginBottom: 8 }}>
            {currentZone ? (
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#7cb3f5" }}>Zone: <strong>{currentZone.name}</strong></span>
                {" "}({getZoneWarehouseIds(state, currentZone.id).length} Lagerh&auml;user, {getZoneBuildingIds(state, currentZone.id).length} Geb&auml;ude)
                <button
                  className="fi-btn fi-btn-sm"
                  style={{ marginLeft: 6 }}
                  onClick={() => selectedWarehouseId && dispatch({ type: "SET_BUILDING_ZONE", buildingId: selectedWarehouseId, zoneId: null })}
                >
                  Entfernen
                </button>
                <button
                  className="fi-btn fi-btn-sm fi-btn-danger"
                  style={{ marginLeft: 4 }}
                  onClick={() => dispatch({ type: "DELETE_ZONE", zoneId: currentZone.id })}
                >
                  Zone l&ouml;schen
                </button>

                {/* ---- Zone members overview ---- */}
                {(() => {
                  const zWhIds = getZoneWarehouseIds(state, currentZone.id);
                  const zBldIds = getZoneBuildingIds(state, currentZone.id);
                  const aggInv = getZoneAggregateInventory(state, currentZone.id);
                  const zoneCap = getZoneItemCapacity(state, currentZone.id);
                  return (
                    <div data-testid="wh-zone-overview" style={{ fontSize: 11, color: "#aaa", marginTop: 4, paddingLeft: 4 }}>
                      <div>
                        Lagerh&auml;user:&nbsp;
                        {zWhIds.map((whId, i) => {
                          const idx = Object.keys(state.warehouseInventories).indexOf(whId) + 1;
                          return <span key={whId}>{i > 0 ? ", " : ""}Lagerhaus {idx || "?"}</span>;
                        })}
                      </div>
                      {zBldIds.length > 0 && (
                        <div>
                          Geb&auml;ude:&nbsp;
                          {zBldIds.map((bId, i) => {
                            const asset = state.assets[bId];
                            const label = asset ? (BUILDING_LABELS[asset.type as BuildingType] ?? asset.type) : bId;
                            return <span key={bId}>{i > 0 ? ", " : ""}{label}</span>;
                          })}
                        </div>
                      )}
                      {zWhIds.length > 0 && (
                        <div style={{ marginTop: 2 }}>
                          Zonenbestand (Kapazit&auml;t: {zoneCap}/Ressource):&nbsp;
                          {(["wood", "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear"] as (keyof Inventory)[])
                            .filter((k) => (aggInv[k] as number) > 0)
                            .map((k, i) => (
                              <span key={k}>
                                {i > 0 ? " | " : ""}
                                {RESOURCE_EMOJIS[k] ?? ""} {aggInv[k]}
                              </span>
                            ))}
                          {(["wood", "stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear"] as (keyof Inventory)[])
                            .every((k) => (aggInv[k] as number) === 0) && (
                            <span style={{ color: "#666" }}>leer</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Keiner Zone zugewiesen</div>
            )}
            <div className="fi-workbench-source">
              {zones.filter((z) => z.id !== currentZoneId).map((z) => (
                <button
                  key={z.id}
                  className="fi-btn fi-btn-sm"
                  onClick={() => selectedWarehouseId && dispatch({ type: "SET_BUILDING_ZONE", buildingId: selectedWarehouseId, zoneId: z.id })}
                >
                  {z.name}
                </button>
              ))}
              {canCreate && (
                <button
                  className="fi-btn fi-btn-sm"
                  onClick={() => dispatch({ type: "CREATE_ZONE" })}
                >
                  + Neue Zone
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <p style={{ color: "#777", fontSize: 11 }}>
        Entfernen nur im Bau-Modus (Rechtsklick).
      </p>
    </div>
  );
});

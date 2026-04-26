import React from "react";
import type { BuildingType, GameState } from "../../store/types";
import type { GameAction } from "../../store/actions";
import {
  getSourceStatusInfo,
  getZoneWarehouseIds,
  getZoneAggregateInventory,
  getZoneItemCapacity,
  BUILDING_LABELS,
} from "../../store/reducer";

interface ZoneSourceSelectorProps {
  state: GameState;
  buildingId: string | null;
  dispatch: React.Dispatch<GameAction>;
}

/**
 * Unified source/zone selector shown in crafting building panels.
 * Shows the current source (global / warehouse / zone), allows switching,
 * and provides source status, zone members, and DEV debug info.
 */
export const ZoneSourceSelector: React.FC<ZoneSourceSelectorProps> = React.memo(({ state, buildingId, dispatch }) => {
  const info = getSourceStatusInfo(state, buildingId);
  const warehouseIds = Object.keys(state.warehouseInventories);
  const zones = Object.values(state.productionZones);
  const currentZoneId = buildingId ? state.buildingZoneIds[buildingId] ?? null : null;

  return (
    <>
      {/* ---- Source selector (legacy: per-building warehouse or global) ---- */}
      <div className="fi-workbench-source">
        <span style={{ fontSize: 12, color: "#aaa" }}>Quelle:</span>
        <button
          className={`fi-btn fi-btn-sm${info.source.kind === "global" ? " fi-btn-active" : ""}`}
          onClick={() => {
            if (!buildingId) return;
            dispatch({ type: "SET_BUILDING_ZONE", buildingId, zoneId: null });
            dispatch({ type: "SET_BUILDING_SOURCE", buildingId, warehouseId: null });
          }}
        >
          Global
        </button>
        {warehouseIds.map((whId, i) => (
          <button
            key={whId}
            className={`fi-btn fi-btn-sm${info.source.kind === "warehouse" && info.source.warehouseId === whId ? " fi-btn-active" : ""}`}
            onClick={() => {
              if (!buildingId) return;
              dispatch({ type: "SET_BUILDING_ZONE", buildingId, zoneId: null });
              dispatch({ type: "SET_BUILDING_SOURCE", buildingId, warehouseId: whId });
            }}
          >
            Lagerhaus {i + 1}
          </button>
        ))}
      </div>

      {/* ---- Zone selector ---- */}
      <div className="fi-workbench-source" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "#aaa" }}>Zone:</span>
        {zones.map((z) => {
          const zoneWhCount = getZoneWarehouseIds(state, z.id).length;
          const isActive = info.source.kind === "zone" && info.source.zoneId === z.id;
          const isAssigned = currentZoneId === z.id;
          return (
            <button
              key={z.id}
              className={`fi-btn fi-btn-sm${isActive ? " fi-btn-active" : isAssigned ? " fi-btn-active" : ""}`}
              style={isAssigned && !isActive ? { borderColor: "#e8a946" } : undefined}
              title={`${z.name} (${zoneWhCount} Lagerhaus${zoneWhCount !== 1 ? "\u00e4user" : ""})`}
              onClick={() => {
                if (!buildingId) return;
                if (isAssigned) {
                  dispatch({ type: "SET_BUILDING_ZONE", buildingId, zoneId: null });
                } else {
                  dispatch({ type: "SET_BUILDING_ZONE", buildingId, zoneId: z.id });
                }
              }}
            >
              {z.name} ({zoneWhCount})
            </button>
          );
        })}
        {zones.length === 0 && (
          <span style={{ fontSize: 11, color: "#666" }}>Keine Zonen vorhanden</span>
        )}
      </div>

      {/* ---- Active source status line ---- */}
      <div data-testid="source-status" style={{ fontSize: 11, marginTop: 4 }}>
        <span style={{ color: info.source.kind === "zone" ? "#7cb3f5" : info.source.kind === "warehouse" ? "#a5d6a7" : "#bbb" }}>
          {info.source.kind === "zone" && "\u{1F4E6} "}
          {info.source.kind === "warehouse" && "\u{1F3E0} "}
          {info.source.kind === "global" && "\u{1F310} "}
          Quelle: {info.sourceLabel}
        </span>
        <span style={{ color: "#888", marginLeft: 6 }}>
          {"\u2014"} {info.reasonLabel}
        </span>
      </div>

      {/* Stale source warning */}
      {info.isStale && (
        <div style={{ fontSize: 11, color: "#e8a946", marginTop: 2 }}>
          {"\u26A0"} Zugewiesenes Lagerhaus nicht mehr vorhanden {"\u2014"} Quelle: Global
        </div>
      )}

      {/* ---- Zone members (when zone source is active) ---- */}
      {info.source.kind === "zone" && info.zoneWarehouseIds.length > 0 && (
        <div data-testid="zone-members" style={{ fontSize: 11, color: "#aaa", marginTop: 4, paddingLeft: 4 }}>
          <div>
            Lagerh{"\u00e4"}user ({info.zoneWarehouseIds.length}):&nbsp;
            {info.zoneWarehouseIds.map((whId, i) => {
              const idx = Object.keys(state.warehouseInventories).indexOf(whId) + 1;
              return <span key={whId}>{i > 0 ? ", " : ""}Lagerhaus {idx || "?"}</span>;
            })}
          </div>
          {info.zoneBuildingIds.length > 0 && (
            <div>
              Geb{"\u00e4"}ude ({info.zoneBuildingIds.length}):&nbsp;
              {info.zoneBuildingIds.map((bId, i) => {
                const asset = state.assets[bId];
                const label = asset ? (BUILDING_LABELS[asset.type as BuildingType] ?? asset.type) : bId;
                return <span key={bId}>{i > 0 ? ", " : ""}{label}</span>;
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Fallback / empty zone warning ---- */}
      {info.fallbackReason === "zone_no_warehouses" && (
        <div data-testid="zone-warning" style={{ fontSize: 11, color: "#e8a946", marginTop: 2 }}>
          {"\u26A0"} Die zugewiesene Zone hat keine Lagerh{"\u00e4"}user {"\u2014"} weise zuerst ein Lagerhaus der Zone zu.
        </div>
      )}

      {/* ---- DEV debug section ---- */}
      {import.meta.env.DEV && (
        <details style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
          <summary style={{ cursor: "pointer", userSelect: "none" }}>Debug: Quellenaufl{"\u00f6"}sung</summary>
          <pre style={{ margin: "2px 0", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{JSON.stringify({
  "source.kind": info.source.kind,
  buildingId,
  assignedZoneId: info.assignedZoneId,
  legacyWarehouseId: info.legacyWarehouseId,
  fallbackReason: info.fallbackReason,
  isStale: info.isStale,
  zoneWarehouseIds: info.zoneWarehouseIds,
  zoneBuildingIds: info.zoneBuildingIds,
  ...(info.source.kind === "zone" ? {
    aggregateInventory: getZoneAggregateInventory(state, info.source.zoneId),
    zoneCapacity: getZoneItemCapacity(state, info.source.zoneId),
  } : {}),
}, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
});

import type { GameState, CraftingSource } from "../types";
import { resolveBuildingSource } from "../building-source";
import { getZoneWarehouseIds } from "../../zones/production-zone-aggregation";

export type FallbackReason =
  | "none"                  // source is primary (zone or explicitly set)
  | "zone_no_warehouses"    // building has a zone, but zone has no warehouses
  | "no_zone"               // building has no zone assignment
  | "stale_warehouse"       // legacy warehouse mapping points to deleted warehouse
  | "no_assignment";        // no zone and no legacy mapping

export interface SourceStatusInfo {
  /** The resolved source used for crafting. */
  source: CraftingSource;
  /** Human-readable label for the active source (e.g. "Zone 1 (2 Lagerhäuser)"). */
  sourceLabel: string;
  /** Why this source was chosen — helpful when source is a fallback. */
  fallbackReason: FallbackReason;
  /** Short human-readable explanation of why this source is active. */
  reasonLabel: string;
  /** Zone ID if building is assigned to a zone (even if zone is empty). */
  assignedZoneId: string | null;
  /** Zone name if assigned. */
  assignedZoneName: string | null;
  /** Warehouse IDs in the active zone (empty if not zone source). */
  zoneWarehouseIds: string[];
  /** Building IDs (non-warehouse) in the active zone. */
  zoneBuildingIds: string[];
  /** Legacy warehouse ID from buildingSourceWarehouseIds (may be stale). */
  legacyWarehouseId: string | null;
  /** Whether the legacy warehouse mapping is stale (points to deleted warehouse). */
  isStale: boolean;
}

function getZoneBuildingIds(state: GameState, zoneId: string): string[] {
  const result: string[] = [];
  for (const [bid, zid] of Object.entries(state.buildingZoneIds)) {
    if (zid !== zoneId) continue;
    if (state.assets[bid] && state.assets[bid].type !== "warehouse") {
      result.push(bid);
    }
  }
  return result.sort();
}

/**
 * Returns true if a building has a warehouse mapping that no longer resolves
 * to a valid warehouse (stale reference). Used by panels to show a hint.
 */
export function hasStaleWarehouseAssignment(state: GameState, buildingId: string | null): boolean {
  if (!buildingId) return false;
  const whId = state.buildingSourceWarehouseIds[buildingId];
  if (!whId) return false;
  return !state.assets[whId] || !state.warehouseInventories[whId];
}

/**
 * Compute full source status diagnosis for a building.
 * Pure function — used by UI panels for transparency and debug info.
 */
export function getSourceStatusInfo(state: GameState, buildingId: string | null): SourceStatusInfo {
  const source = resolveBuildingSource(state, buildingId);
  const assignedZoneId = buildingId ? (state.buildingZoneIds[buildingId] ?? null) : null;
  const assignedZoneName = assignedZoneId ? (state.productionZones[assignedZoneId]?.name ?? null) : null;
  const legacyWhId = buildingId ? (state.buildingSourceWarehouseIds[buildingId] ?? null) : null;
  const isStale = hasStaleWarehouseAssignment(state, buildingId);

  let fallbackReason: FallbackReason = "none";
  let sourceLabel: string;
  let reasonLabel: string;
  let zoneWarehouseIds: string[] = [];
  let zoneBuildingIds: string[] = [];

  if (source.kind === "zone") {
    zoneWarehouseIds = getZoneWarehouseIds(state, source.zoneId);
    zoneBuildingIds = getZoneBuildingIds(state, source.zoneId);
    const zoneName = state.productionZones[source.zoneId]?.name ?? source.zoneId;
    sourceLabel = `${zoneName} (${zoneWarehouseIds.length} Lagerhaus${zoneWarehouseIds.length !== 1 ? "äuser" : ""})`;
    reasonLabel = "Zone aktiv";
  } else if (source.kind === "warehouse") {
    const whIdx = Object.keys(state.warehouseInventories).indexOf(source.warehouseId) + 1;
    sourceLabel = `Lagerhaus ${whIdx || "?"}`;
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      fallbackReason = "zone_no_warehouses";
      reasonLabel = "Zone hat keine Lagerhäuser — Einzelzuweisung aktiv";
    } else {
      fallbackReason = "no_zone";
      reasonLabel = "Keine Zone — Einzelzuweisung aktiv";
    }
  } else {
    // global
    sourceLabel = "Globaler Puffer";
    if (assignedZoneId && state.productionZones[assignedZoneId]) {
      const zwhIds = getZoneWarehouseIds(state, assignedZoneId);
      if (zwhIds.length === 0) {
        fallbackReason = "zone_no_warehouses";
        reasonLabel = "Zone hat keine Lagerhäuser — Fallback: Globaler Puffer";
      } else {
        fallbackReason = "none";
        reasonLabel = "Globaler Puffer";
      }
    } else if (isStale) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Zugewiesenes Lagerhaus entfernt — Fallback: Globaler Puffer";
    } else if (legacyWhId) {
      fallbackReason = "stale_warehouse";
      reasonLabel = "Ungültige Lagerhauszuweisung — Fallback: Globaler Puffer";
    } else {
      fallbackReason = "no_assignment";
      reasonLabel = "Keine Zone oder Lagerhaus zugewiesen";
    }
  }

  return {
    source,
    sourceLabel,
    fallbackReason,
    reasonLabel,
    assignedZoneId,
    assignedZoneName,
    zoneWarehouseIds,
    zoneBuildingIds,
    legacyWarehouseId: legacyWhId,
    isStale,
  };
}

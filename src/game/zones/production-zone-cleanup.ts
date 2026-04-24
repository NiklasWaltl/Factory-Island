/**
 * Remove buildingZoneIds entries whose building or zone no longer exists.
 * Used for defensive cleanup on Save/Load.
 */
export function cleanBuildingZoneIds(
  mapping: Record<string, string>,
  validBuildingIds: Set<string>,
  validZoneIds: Set<string>,
): Record<string, string> {
  let changed = false;
  const result: Record<string, string> = {};
  for (const [buildingId, zoneId] of Object.entries(mapping)) {
    if (validBuildingIds.has(buildingId) && validZoneIds.has(zoneId)) {
      result[buildingId] = zoneId;
    } else {
      changed = true;
    }
  }
  return changed ? result : mapping;
}
/** Number of parking columns laid out on top of the 2x2 hub footprint. */
const DRONE_DOCK_COLUMNS = 2;

/**
 * Deterministic dock offset for a drone slot relative to hub top-left.
 *
 * The hub's droneIds order is the source of truth for slot assignment.
 * We derive parking positions from that live state instead of maintaining a
 * separate parked-drone count for the render layer.
 */
export function getDroneDockOffset(slotIndex: number): { dx: number; dy: number } {
  const safeSlot = Math.max(0, Math.floor(slotIndex));
  return {
    dx: safeSlot % DRONE_DOCK_COLUMNS,
    dy: Math.floor(safeSlot / DRONE_DOCK_COLUMNS),
  };
}

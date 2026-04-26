import React from "react";
import {
  GRID_W,
  GRID_H,
  CELL_PX,
  BUILDING_SIZES,
  POWER_POLE_RANGE,
  FLOOR_TILE_EMOJIS,
  REQUIRES_STONE_FLOOR,
  DEPOSIT_TYPES,
  directionOffset,
  cellKey,
  getWarehouseInputCell,
  type GameState,
  type Direction,
  type PlacedAsset,
} from "../store/reducer";
import { WAREHOUSE_INPUT_SPRITE } from "../assets/sprites/sprites";

interface BuildSelectionOverlaysParams {
  state: GameState;
  hover: { x: number; y: number } | null;
  dragging: boolean;
  buildDirection: Direction;
  connectedSet: ReadonlySet<string>;
  assetW: (asset: { size: 1 | 2; width?: 1 | 2 }) => 1 | 2;
  assetH: (asset: { size: 1 | 2; height?: 1 | 2 }) => 1 | 2;
}

export interface GridSelectionOverlays {
  placementOverlayElement: React.ReactNode;
  inspectionOverlayElement: React.ReactNode;
}

function renderFloorPlacementOverlay(
  x: number,
  y: number,
  tileType: keyof typeof FLOOR_TILE_EMOJIS,
  valid: boolean,
): React.ReactNode {
  return (
    <div
      style={{
        position: "absolute",
        left: x * CELL_PX,
        top: y * CELL_PX,
        width: CELL_PX,
        height: CELL_PX,
        background: valid ? "rgba(0, 255, 0, 0.25)" : "rgba(255, 0, 0, 0.25)",
        border: valid ? "2px solid rgba(0,255,0,0.6)" : "2px solid rgba(255,0,0,0.6)",
        borderRadius: 4,
        zIndex: 10,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
      }}
    >
      {FLOOR_TILE_EMOJIS[tileType]}
    </div>
  );
}

export function buildSelectionOverlays({
  state,
  hover,
  dragging,
  buildDirection,
  connectedSet,
  assetW,
  assetH,
}: BuildSelectionOverlaysParams): GridSelectionOverlays {
  const slot = state.hotbarSlots[state.activeSlot];
  const buildBuildingType = state.buildMode ? state.selectedBuildingType : null;
  const isPlacingBuilding = buildBuildingType != null || slot?.toolKind === "building";
  const activeBuildingType =
    buildBuildingType ?? (slot?.toolKind === "building" ? slot.buildingType : null);
  const isPlacingPowerPole = isPlacingBuilding && activeBuildingType === "power_pole";

  const collectPowerPoleRangeHighlightElements = (
    poleX: number,
    poleY: number,
    options?: {
      excludeAssetId?: string;
      getBorderColor?: (assetId: string) => string;
      keyPrefix?: string;
    },
  ): React.ReactNode[] => {
    const highlightElements: React.ReactNode[] = [];
    for (const asset of Object.values(state.assets)) {
      if (options?.excludeAssetId && asset.id === options.excludeAssetId) continue;
      let inRange = false;
      for (let cy = 0; cy < assetH(asset) && !inRange; cy++) {
        for (let cx = 0; cx < assetW(asset) && !inRange; cx++) {
          const dx = Math.abs(asset.x + cx - poleX);
          const dy = Math.abs(asset.y + cy - poleY);
          if (Math.max(dx, dy) <= POWER_POLE_RANGE) inRange = true;
        }
      }
      if (!inRange) continue;
      highlightElements.push(
        <div
          key={`${options?.keyPrefix ?? "range"}-${asset.id}`}
          style={{
            position: "absolute",
            left: asset.x * CELL_PX + 2,
            top: asset.y * CELL_PX + 2,
            width: assetW(asset) * CELL_PX - 4,
            height: assetH(asset) * CELL_PX - 4,
            border: `2px dashed ${options?.getBorderColor?.(asset.id) ?? "rgba(255, 200, 0, 0.8)"}`,
            borderRadius: 6,
            zIndex: 9,
            pointerEvents: "none",
          }}
        />,
      );
    }
    return highlightElements;
  };

  const renderPowerPoleRangeArea = (
    poleX: number,
    poleY: number,
    colors: { background: string; border: string },
    key?: string,
  ): React.ReactNode => {
    const rx1 = Math.max(0, poleX - POWER_POLE_RANGE);
    const ry1 = Math.max(0, poleY - POWER_POLE_RANGE);
    const rx2 = Math.min(GRID_W - 1, poleX + POWER_POLE_RANGE);
    const ry2 = Math.min(GRID_H - 1, poleY + POWER_POLE_RANGE);
    const rangeW = rx2 - rx1 + 1;
    const rangeH = ry2 - ry1 + 1;

    return (
      <div
        key={key}
        style={{
          position: "absolute",
          left: rx1 * CELL_PX,
          top: ry1 * CELL_PX,
          width: rangeW * CELL_PX,
          height: rangeH * CELL_PX,
          background: colors.background,
          border: `2px dashed ${colors.border}`,
          borderRadius: 8,
          zIndex: 8,
          pointerEvents: "none",
        }}
      />
    );
  };

  let placementOverlayElement: React.ReactNode = null;
  let inspectionOverlayElement: React.ReactNode = null;

  if (isPlacingBuilding && hover && !dragging) {
    const { x, y } = hover;
    const isAutoSmelterPlacement = activeBuildingType === "auto_smelter";
    const bWidth: 1 | 2 = isAutoSmelterPlacement
      ? buildDirection === "east" || buildDirection === "west"
        ? 2
        : 1
      : (activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2;
    const bHeight: 1 | 2 = isAutoSmelterPlacement
      ? buildDirection === "east" || buildDirection === "west"
        ? 1
        : 2
      : (activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2;
    let valid = x >= 0 && y >= 0 && x + bWidth <= GRID_W && y + bHeight <= GRID_H;

    if (valid && activeBuildingType === "auto_miner") {
      const depId = state.cellMap[cellKey(x, y)];
      const depAsset = depId ? state.assets[depId] : null;
      valid = !!depAsset && DEPOSIT_TYPES.has(depAsset.type);
      if (valid && depId) {
        const existingMiner = Object.values(state.autoMiners).find((miner) => miner.depositId === depId);
        if (existingMiner) valid = false;
      }
    } else if (valid) {
      for (let dy = 0; dy < bHeight && valid; dy++) {
        for (let dx = 0; dx < bWidth && valid; dx++) {
          if (state.cellMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }
    if (valid && activeBuildingType && REQUIRES_STONE_FLOOR.has(activeBuildingType)) {
      for (let dy = 0; dy < bHeight && valid; dy++) {
        for (let dx = 0; dx < bWidth && valid; dx++) {
          if (!state.floorMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }

    const isDirectional =
      activeBuildingType === "auto_miner" ||
      activeBuildingType === "conveyor" ||
      activeBuildingType === "conveyor_corner" ||
      activeBuildingType === "auto_smelter" ||
      activeBuildingType === "warehouse";
    const isWarehousePlacement = activeBuildingType === "warehouse";
    const showDirectionArrow = isDirectional && !isWarehousePlacement;
    const dirLabels: Record<Direction, string> = {
      north: "↑ Nord",
      east: "→ Ost",
      south: "↓ Süd",
      west: "← West",
    };
    const [aDx, aDy] = directionOffset(buildDirection);
    const arrowX = (x + aDx) * CELL_PX;
    const arrowY = (y + aDy) * CELL_PX;
    const ghostInput =
      buildDirection === "east"
        ? { left: x * CELL_PX - CELL_PX, top: y * CELL_PX }
        : buildDirection === "west"
          ? { left: (x + bWidth) * CELL_PX, top: y * CELL_PX }
          : buildDirection === "north"
            ? { left: x * CELL_PX, top: (y + bHeight) * CELL_PX }
            : { left: x * CELL_PX, top: y * CELL_PX - CELL_PX };
    const ghostOutput =
      buildDirection === "east"
        ? { left: (x + bWidth) * CELL_PX, top: y * CELL_PX }
        : buildDirection === "west"
          ? { left: x * CELL_PX - CELL_PX, top: y * CELL_PX }
          : buildDirection === "north"
            ? { left: x * CELL_PX, top: y * CELL_PX - CELL_PX }
            : { left: x * CELL_PX, top: (y + bHeight) * CELL_PX };

    const placementBox = (
      <>
        <div
          key="placement"
          style={{
            position: "absolute",
            left: x * CELL_PX,
            top: y * CELL_PX,
            width: bWidth * CELL_PX,
            height: bHeight * CELL_PX,
            background: valid ? "rgba(0, 255, 0, 0.25)" : "rgba(255, 0, 0, 0.25)",
            border: valid ? "2px solid rgba(0,255,0,0.6)" : "2px solid rgba(255,0,0,0.6)",
            borderRadius: bWidth === 2 || bHeight === 2 ? 8 : 6,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
        {isDirectional && (
          <>
            {showDirectionArrow && (
              <div
                style={{
                  position: "absolute",
                  left: arrowX,
                  top: arrowY,
                  width: CELL_PX,
                  height: CELL_PX,
                  border: "2px dashed rgba(255,215,0,0.75)",
                  borderRadius: 6,
                  background: "rgba(255,215,0,0.08)",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              />
            )}
            <div
              style={{
                position: "absolute",
                left: x * CELL_PX,
                top: y * CELL_PX - 18,
                background: "rgba(0,0,0,0.75)",
                color: "#ffd700",
                fontSize: 11,
                padding: "2px 6px",
                borderRadius: 4,
                zIndex: 11,
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              Richtung: {dirLabels[buildDirection]} (R)
            </div>
            {isAutoSmelterPlacement && (
              <div
                style={{
                  position: "absolute",
                  left: x * CELL_PX,
                  top: y * CELL_PX - 36,
                  background: "rgba(0,0,0,0.75)",
                  color: "#ddd",
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  zIndex: 11,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                IN: blau, OUT: gelb
              </div>
            )}
            {isAutoSmelterPlacement && (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: ghostInput.left,
                    top: ghostInput.top,
                    width: CELL_PX,
                    height: CELL_PX,
                    border: "2px dashed rgba(80,160,255,0.9)",
                    borderRadius: 6,
                    background: "rgba(80,160,255,0.12)",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: ghostOutput.left,
                    top: ghostOutput.top,
                    width: CELL_PX,
                    height: CELL_PX,
                    border: "2px dashed rgba(255,200,80,0.9)",
                    borderRadius: 6,
                    background: "rgba(255,200,80,0.12)",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: ghostInput.left + 6,
                    top: ghostInput.top + 4,
                    fontSize: 11,
                    color: "#9cd3ff",
                    background: "rgba(0,0,0,0.7)",
                    padding: "1px 4px",
                    borderRadius: 4,
                    zIndex: 11,
                    pointerEvents: "none",
                  }}
                >
                  IN
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: ghostOutput.left + 4,
                    top: ghostOutput.top + 4,
                    fontSize: 11,
                    color: "#ffd28a",
                    background: "rgba(0,0,0,0.7)",
                    padding: "1px 4px",
                    borderRadius: 4,
                    zIndex: 11,
                    pointerEvents: "none",
                  }}
                >
                  OUT
                </div>
              </>
            )}
            {isWarehousePlacement &&
              (() => {
                const tempWh: PlacedAsset = {
                  id: "ghost",
                  type: "warehouse",
                  x,
                  y,
                  size: 2,
                  direction: buildDirection,
                };
                const { x: whInX, y: whInY } = getWarehouseInputCell(tempWh);
                const inLeft = whInX * CELL_PX;
                const inTop = whInY * CELL_PX;
                return (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        left: inLeft,
                        top: inTop,
                        width: CELL_PX,
                        height: CELL_PX,
                        border: "2px dashed rgba(80,200,120,0.9)",
                        borderRadius: 6,
                        background: "rgba(80,200,120,0.12)",
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    />
                    <img
                      src={WAREHOUSE_INPUT_SPRITE}
                      alt=""
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: inLeft,
                        top: inTop,
                        width: CELL_PX,
                        height: CELL_PX,
                        opacity: 0.7,
                        pointerEvents: "none",
                        imageRendering: "pixelated",
                        zIndex: 10,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: inLeft + 4,
                        top: inTop + 4,
                        fontSize: 10,
                        color: "#90f0a0",
                        background: "rgba(0,0,0,0.7)",
                        padding: "1px 4px",
                        borderRadius: 4,
                        zIndex: 11,
                        pointerEvents: "none",
                      }}
                    >
                      IN
                    </div>
                  </>
                );
              })()}
          </>
        )}
      </>
    );

    if (isPlacingPowerPole && valid) {
      const rangeConnectedElements = collectPowerPoleRangeHighlightElements(x, y, {
        keyPrefix: "range",
      });

      placementOverlayElement = (
        <>
          {renderPowerPoleRangeArea(
            x,
            y,
            {
              background: "rgba(255, 180, 0, 0.08)",
              border: "rgba(255, 180, 0, 0.45)",
            },
            "range-area",
          )}
          {rangeConnectedElements}
          {placementBox}
        </>
      );
    } else {
      placementOverlayElement = placementBox;
    }
  } else if (state.buildMode && state.selectedFloorTile && hover && !dragging) {
    const { x, y } = hover;
    const tileType = state.selectedFloorTile;
    const key = cellKey(x, y);
    const valid =
      tileType === "stone_floor"
        ? !state.floorMap[key] && !state.cellMap[key]
        : !!state.floorMap[key] && !state.cellMap[key];
    placementOverlayElement = renderFloorPlacementOverlay(x, y, tileType, valid);
  }

  if (!placementOverlayElement && hover && !dragging) {
    const hoveredId = state.cellMap[cellKey(hover.x, hover.y)];
    const hoveredAsset = hoveredId ? state.assets[hoveredId] : null;
    if (hoveredAsset?.type === "power_pole") {
      const { x, y } = hoveredAsset;
      const inRangeElements = collectPowerPoleRangeHighlightElements(x, y, {
        excludeAssetId: hoveredId,
        keyPrefix: "hover-range",
        getBorderColor: (assetId) =>
          connectedSet.has(assetId) ? "rgba(0,255,100,0.8)" : "rgba(255,80,80,0.7)",
      });

      inspectionOverlayElement = (
        <>
          {renderPowerPoleRangeArea(x, y, {
            background: "rgba(255, 140, 0, 0.08)",
            border: "rgba(255, 140, 0, 0.5)",
          })}
          {inRangeElements}
        </>
      );
    }
  }

  return { placementOverlayElement, inspectionOverlayElement };
}

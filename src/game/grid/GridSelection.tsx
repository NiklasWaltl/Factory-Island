import React from "react";
import { GRID_W, GRID_H, CELL_PX } from "../constants/grid";
import {
  BUILDING_LABELS,
  BUILDING_SIZES,
  FLOOR_TILE_EMOJIS,
  REQUIRES_STONE_FLOOR,
  DEPOSIT_TYPES,
  RESOURCE_EMOJIS,
  directionOffset,
  cellKey,
  getWarehouseInputCell,
} from "../store/reducer";
import type { Direction, GameState, PlacedAsset } from "../store/types";
import { POWER_POLE_RANGE } from "../store/constants/energy/power-pole";
import {
  isConveyorPreviewBuildingType,
  previewBuildingPlacementAtCell,
} from "../store/building-placement-preview";
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
        border: valid
          ? "2px solid rgba(0,255,0,0.6)"
          : "2px solid rgba(255,0,0,0.6)",
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
  const isPlacingBuilding =
    buildBuildingType != null || slot?.toolKind === "building";
  const activeBuildingType =
    buildBuildingType ??
    (slot?.toolKind === "building" ? slot.buildingType : null);
  const isPlacingPowerPole =
    isPlacingBuilding && activeBuildingType === "power_pole";

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
      if (options?.excludeAssetId && asset.id === options.excludeAssetId)
        continue;
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
    const isDirectedTwoByOneMachine =
      activeBuildingType === "auto_smelter" || activeBuildingType === "auto_assembler";
    const bWidth: 1 | 2 = isDirectedTwoByOneMachine
      ? buildDirection === "east" || buildDirection === "west"
        ? 2
        : 1
      : ((activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2);
    const bHeight: 1 | 2 = isDirectedTwoByOneMachine
      ? buildDirection === "east" || buildDirection === "west"
        ? 1
        : 2
      : ((activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2);
    let valid =
      x >= 0 && y >= 0 && x + bWidth <= GRID_W && y + bHeight <= GRID_H;

    const conveyorPreview =
      activeBuildingType && isConveyorPreviewBuildingType(activeBuildingType)
        ? previewBuildingPlacementAtCell(
            state,
            activeBuildingType,
            x,
            y,
            buildDirection,
          )
        : null;

    if (conveyorPreview) {
      valid = conveyorPreview.ok;
    } else if (valid && activeBuildingType === "auto_miner") {
      const depId = state.cellMap[cellKey(x, y)];
      const depAsset = depId ? state.assets[depId] : null;
      valid = !!depAsset && DEPOSIT_TYPES.has(depAsset.type);
      if (valid && depId) {
        const existingMiner = Object.values(state.autoMiners).find(
          (miner) => miner.depositId === depId,
        );
        if (existingMiner) valid = false;
      }
    } else if (valid) {
      for (let dy = 0; dy < bHeight && valid; dy++) {
        for (let dx = 0; dx < bWidth && valid; dx++) {
          if (state.cellMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }
    if (
      valid &&
      activeBuildingType &&
      REQUIRES_STONE_FLOOR.has(activeBuildingType)
    ) {
      for (let dy = 0; dy < bHeight && valid; dy++) {
        for (let dx = 0; dx < bWidth && valid; dx++) {
          if (!state.floorMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }

    const isUgOutBuild = activeBuildingType === "conveyor_underground_out";
    const ugOutPreviewOk = isUgOutBuild && conveyorPreview?.ok === true;

    const undergroundOutPlacementHint: string | null = !isUgOutBuild
      ? null
      : conveyorPreview
        ? conveyorPreview.ok
          ? "Untergrund: Eingang in Reichweite (2–5 Felder)."
          : conveyorPreview.message
        : null;

    const conveyorNonUgHint: string | null =
      activeBuildingType &&
      isConveyorPreviewBuildingType(activeBuildingType) &&
      activeBuildingType !== "conveyor_underground_out" &&
      conveyorPreview &&
      !conveyorPreview.ok
        ? conveyorPreview.message
        : null;

    const isDirectional =
      activeBuildingType === "auto_miner" ||
      activeBuildingType === "conveyor" ||
      activeBuildingType === "conveyor_corner" ||
      activeBuildingType === "conveyor_merger" ||
      activeBuildingType === "conveyor_splitter" ||
      activeBuildingType === "conveyor_underground_in" ||
      activeBuildingType === "conveyor_underground_out" ||
      activeBuildingType === "auto_smelter" ||
      activeBuildingType === "auto_assembler" ||
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
            background: valid
              ? "rgba(0, 255, 0, 0.25)"
              : "rgba(255, 0, 0, 0.25)",
            border: valid
              ? "2px solid rgba(0,255,0,0.6)"
              : "2px solid rgba(255,0,0,0.6)",
            borderRadius: bWidth === 2 || bHeight === 2 ? 8 : 6,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
        {activeBuildingType != null &&
        isConveyorPreviewBuildingType(activeBuildingType) ? (
          <div
            key="conveyor-preview-role"
            style={{
              position: "absolute",
              left: x * CELL_PX,
              top: y * CELL_PX,
              width: bWidth * CELL_PX,
              height: bHeight * CELL_PX,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingBottom: 4,
              zIndex: 11,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                maxWidth: bWidth * CELL_PX - 8,
                padding: "2px 5px",
                borderRadius: 4,
                background: "rgba(0,0,0,0.78)",
                color: "#f5f5f5",
              }}
            >
              {RESOURCE_EMOJIS[activeBuildingType] ? (
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    filter: valid ? "none" : "grayscale(0.35)",
                  }}
                  aria-hidden
                >
                  {RESOURCE_EMOJIS[activeBuildingType]}
                </span>
              ) : null}
              <span
                style={{
                  fontSize: 9,
                  lineHeight: 1.15,
                  textAlign: "center",
                  fontWeight: 600,
                  wordBreak: "break-word",
                }}
              >
                {BUILDING_LABELS[activeBuildingType]}
              </span>
            </div>
          </div>
        ) : null}
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
            {undergroundOutPlacementHint != null ? (
              <div
                style={{
                  position: "absolute",
                  left: x * CELL_PX,
                  top: y * CELL_PX - 36,
                  maxWidth: 280,
                  background: "rgba(0,0,0,0.82)",
                  color: ugOutPreviewOk ? "#b8f5c4" : "#ffc8bc",
                  fontSize: 10,
                  lineHeight: 1.25,
                  padding: "2px 6px",
                  borderRadius: 4,
                  zIndex: 11,
                  pointerEvents: "none",
                  whiteSpace: "normal",
                }}
              >
                {undergroundOutPlacementHint}
              </div>
            ) : null}
            {conveyorNonUgHint != null ? (
              <div
                style={{
                  position: "absolute",
                  left: x * CELL_PX,
                  top: y * CELL_PX - 36,
                  maxWidth: 280,
                  background: "rgba(0,0,0,0.82)",
                  color: "#ffc8bc",
                  fontSize: 10,
                  lineHeight: 1.25,
                  padding: "2px 6px",
                  borderRadius: 4,
                  zIndex: 11,
                  pointerEvents: "none",
                  whiteSpace: "normal",
                }}
              >
                {conveyorNonUgHint}
              </div>
            ) : null}
            {isDirectedTwoByOneMachine && (
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
            {isDirectedTwoByOneMachine && (
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
      const rangeConnectedElements = collectPowerPoleRangeHighlightElements(
        x,
        y,
        {
          keyPrefix: "range",
        },
      );

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
    placementOverlayElement = renderFloorPlacementOverlay(
      x,
      y,
      tileType,
      valid,
    );
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
          connectedSet.has(assetId)
            ? "rgba(0,255,100,0.8)"
            : "rgba(255,80,80,0.7)",
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

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  GRID_W,
  GRID_H,
  CELL_PX,
  ASSET_LABELS,
  BUILDING_SIZES,
  POWER_POLE_RANGE,
  FLOOR_TILE_EMOJIS,
  REQUIRES_STONE_FLOOR,
  DEPOSIT_TYPES,
  directionOffset,
  cellKey,
  isValidWarehouseInput,
  type GameState,
  type GameAction,
  type Direction,
} from "../simulation/game";
import { ASSET_SPRITES, GRASS_TILE_SPRITES, FLOOR_SPRITES, WAREHOUSE_INPUT_SPRITE } from "../../assets/sprites/sprites";
import { EnergyDebugOverlay, EnergyDebugHud } from "../../ui/panels/EnergyDebugOverlay";

const WORLD_W = GRID_W * CELL_PX;
const WORLD_H = GRID_H * CELL_PX;

interface GridProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const Grid: React.FC<GridProps> = ({ state, dispatch }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const didDrag = useRef(false);
  // Direction for auto_miner / conveyor placement (cycles with R key)
  const [buildDirection, setBuildDirection] = useState<Direction>("east");

  const clampCam = useCallback(
    (cx: number, cy: number, z: number) => {
      const el = containerRef.current;
      if (!el) return { x: cx, y: cy };
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const maxX = 0;
      const maxY = 0;
      const minX = -(WORLD_W * z - vw);
      const minY = -(WORLD_H * z - vh);
      return {
        x: Math.min(maxX, Math.max(minX, cx)),
        y: Math.min(maxY, Math.max(minY, cy)),
      };
    },
    []
  );

  // Pan
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setDragging(true);
      didDrag.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y };
    },
    [cam]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      const newCam = clampCam(
        dragStart.current.camX + dx,
        dragStart.current.camY + dy,
        zoom
      );
      setCam(newCam);
    },
    [dragging, zoom, clampCam]
  );

  const onMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Zoom
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(3, Math.max(0.3, zoom * factor));
      // Zoom toward mouse
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - cam.x) / zoom;
      const wy = (my - cam.y) / zoom;
      const nx = mx - wx * newZoom;
      const ny = my - wy * newZoom;
      const clamped = clampCam(nx, ny, newZoom);
      setZoom(newZoom);
      setCam(clamped);
    },
    [zoom, cam, clampCam]
  );

  // Click cell
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (didDrag.current) return;
      if (state.openPanel) {
        dispatch({ type: "CLOSE_PANEL" });
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - cam.x) / zoom;
      const wy = (my - cam.y) / zoom;
      const gx = Math.floor(wx / CELL_PX);
      const gy = Math.floor(wy / CELL_PX);
      const slot = state.hotbarSlots[state.activeSlot];
      const hotbarBuildingType =
        slot?.toolKind === "building" ? slot.buildingType : null;
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        if (state.buildMode && state.selectedBuildingType) {
          dispatch({ type: "BUILD_PLACE_BUILDING", x: gx, y: gy, direction: buildDirection });
        } else if (!state.buildMode && hotbarBuildingType) {
          dispatch({ type: "BUILD_PLACE_BUILDING", x: gx, y: gy, direction: buildDirection });
        } else if (state.buildMode && state.selectedFloorTile) {
          dispatch({ type: "BUILD_PLACE_FLOOR_TILE", x: gx, y: gy });
        } else {
          dispatch({ type: "CLICK_CELL", x: gx, y: gy });
        }
      }
    },
    [cam, zoom, state.openPanel, state.buildMode, state.selectedBuildingType, state.selectedFloorTile, state.hotbarSlots, state.activeSlot, buildDirection, dispatch]
  );

  // Right-click to remove in build mode or with active hotbar building slot
  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const slot = state.hotbarSlots[state.activeSlot];
      const removeToolActive =
        state.buildMode || slot?.toolKind === "building";
      if (!removeToolActive) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - cam.x) / zoom;
      const wy = (my - cam.y) / zoom;
      const gx = Math.floor(wx / CELL_PX);
      const gy = Math.floor(wy / CELL_PX);
      if (gx >= 0 && gx < GRID_W && gy >= 0 && gy < GRID_H) {
        const assetId = state.cellMap[cellKey(gx, gy)];
        if (assetId) {
          dispatch({ type: "BUILD_REMOVE_ASSET", assetId });
        }
      }
    },
    [cam, zoom, state.buildMode, state.hotbarSlots, state.activeSlot, state.cellMap, dispatch]
  );

  useEffect(() => {
    // Center camera initially
    const el = containerRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    const vh = el.clientHeight;
    const cx = -(WORLD_W - vw) / 2;
    const cy = -(WORLD_H - vh) / 2;
    setCam(clampCam(cx, cy, 1));
  }, [clampCam]);

  // R key: rotate build direction for auto_miner / conveyor
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") {
        const cycle: Direction[] = ["north", "east", "south", "west"];
        setBuildDirection(prev => {
          const idx = cycle.indexOf(prev);
          return cycle[(idx + 1) % 4];
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Build hover indicator
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const onGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      onMouseMove(e);
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - cam.x) / zoom;
      const wy = (my - cam.y) / zoom;
      const gx = Math.floor(wx / CELL_PX);
      const gy = Math.floor(wy / CELL_PX);
      setHover({ x: gx, y: gy });
    },
    [onMouseMove, cam, zoom]
  );

  // Render grid with assets rendered per-asset (not per-cell for 2x2)
  const renderedAssets = new Set<string>();
  const assetElements: React.ReactNode[] = [];

  const DIRECTION_ROTATION: Record<Direction, number> = { north: 270, east: 0, south: 90, west: 180 };
  const ITEM_COLORS: Record<string, string> = { stone: "#808080", iron: "#A0A0B0", copper: "#CD7F32" };

  for (const asset of Object.values(state.assets)) {
    if (renderedAssets.has(asset.id)) continue;
    renderedAssets.add(asset.id);
    const px = asset.x * CELL_PX;
    const py = asset.y * CELL_PX;
    const w = asset.size * CELL_PX;
    const h = asset.size * CELL_PX;
    const label = ASSET_LABELS[asset.type];
    const sprite = ASSET_SPRITES[asset.type];

    const isConnected = state.connectedAssetIds.includes(asset.id);
    const isPowerPole = asset.type === "power_pole";
    const isConveyor = asset.type === "conveyor" || asset.type === "conveyor_corner";
    const isAutoMiner = asset.type === "auto_miner";
    const hasDir = (isConveyor || isAutoMiner) && asset.direction;
    const rotDeg = hasDir ? DIRECTION_ROTATION[asset.direction!] : 0;

    // Conveyor item indicator
    const convItem = isConveyor ? state.conveyors[asset.id]?.item : null;
    // Auto-miner progress indicator
    const minerEntry = isAutoMiner ? state.autoMiners[asset.id] : null;

    assetElements.push(
      <div
        key={asset.id}
        style={{
          position: "absolute",
          left: px,
          top: py,
          width: w,
          height: h,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <img
          src={sprite}
          alt={label}
          draggable={false}
          style={{
            width: w - 4,
            height: h - 16,
            imageRendering: "pixelated",
            border: isPowerPole
              ? `2px solid ${isConnected ? "rgba(0,255,100,0.9)" : "rgba(255,80,80,0.7)"}`
              : "none",
            borderRadius: isPowerPole ? 6 : 0,
            boxShadow: isPowerPole && isConnected
              ? "0 0 8px rgba(0,255,100,0.5)"
              : "0 2px 6px rgba(0,0,0,0.3)",
            filter: isPowerPole && !isConnected ? "saturate(0.5)" : "none",
            transform: hasDir ? `rotate(${rotDeg}deg)` : "none",
          }}
        />
        {/* Conveyor item dot */}
        {convItem && (
          <div style={{
            position: "absolute",
            top: h / 2 - 6,
            left: w / 2 - 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: ITEM_COLORS[convItem] ?? "#fff",
            border: "2px solid rgba(0,0,0,0.6)",
            pointerEvents: "none",
            zIndex: 4,
          }} />
        )}
        {/* Auto-miner progress arc */}
        {minerEntry !== null && minerEntry !== undefined && (
          <div style={{
            position: "absolute",
            bottom: 2,
            left: 2,
            right: 2,
            height: 4,
            background: "rgba(0,0,0,0.5)",
            borderRadius: 2,
            zIndex: 4,
          }}>
            <div style={{
              height: "100%",
              width: `${(minerEntry.progress / 6) * 100}%`,
              background: "#ffd700",
              borderRadius: 2,
              transition: "width 0.4s linear",
            }} />
          </div>
        )}
        <span
          style={{
            fontSize: 9,
            color: "#fff",
            background: "rgba(0,0,0,0.6)",
            padding: "1px 4px",
            borderRadius: 3,
            marginTop: 1,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  // Warehouse input tile overlays – one fixed marker per warehouse
  for (const asset of Object.values(state.assets)) {
    if (asset.type !== "warehouse") continue;
    const inputX = asset.x;
    const inputY = asset.y + asset.size; // directly below bottom-left cell
    if (inputX >= GRID_W || inputY >= GRID_H) continue;

    // Determine whether the tile currently has a correctly-oriented conveyor on it
    const tileAssetId = state.cellMap[cellKey(inputX, inputY)];
    const tileAsset = tileAssetId ? state.assets[tileAssetId] : null;
    const hasFeedingBelt =
      tileAsset?.type === "conveyor" &&
      isValidWarehouseInput(tileAsset.x, tileAsset.y, tileAsset.direction ?? "east", asset);

    assetElements.push(
      <div
        key={`wh-input-${asset.id}`}
        style={{
          position: "absolute",
          left: inputX * CELL_PX,
          top: inputY * CELL_PX,
          width: CELL_PX,
          height: CELL_PX,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        <img
          src={WAREHOUSE_INPUT_SPRITE}
          alt="Lagerhaus Eingang"
          draggable={false}
          style={{
            width: CELL_PX,
            height: CELL_PX,
            imageRendering: "pixelated",
            opacity: hasFeedingBelt ? 0.6 : 0.85,
            filter: hasFeedingBelt ? "drop-shadow(0 0 4px #ffd700)" : "none",
          }}
        />
      </div>
    );
  }

  // Hover highlight for building placement
  const slot = state.hotbarSlots[state.activeSlot];
  const buildBuildingType = state.buildMode ? state.selectedBuildingType : null;
  const isPlacingBuilding = buildBuildingType != null || slot?.toolKind === "building";
  const activeBuildingType = buildBuildingType ?? (slot?.toolKind === "building" ? slot.buildingType : null);
  const isPlacingPowerPole = isPlacingBuilding && activeBuildingType === "power_pole";
  let hoverElement: React.ReactNode = null;

  if (isPlacingBuilding && hover && !dragging) {
    const { x, y } = hover;
    const bSize: 1 | 2 = (activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2;
    let valid = x >= 0 && y >= 0 && x + bSize <= GRID_W && y + bSize <= GRID_H;

    if (valid && activeBuildingType === "auto_miner") {
      // Auto-miner: must be placed on a deposit cell with no existing miner
      const depId = state.cellMap[cellKey(x, y)];
      const depAsset = depId ? state.assets[depId] : null;
      valid = !!depAsset && DEPOSIT_TYPES.has(depAsset.type);
      if (valid && depId) {
        const existingMiner = Object.values(state.autoMiners).find(m => m.depositId === depId);
        if (existingMiner) valid = false;
      }
    } else if (valid) {
      // Normal cell collision check
      for (let dy = 0; dy < bSize && valid; dy++) {
        for (let dx = 0; dx < bSize && valid; dx++) {
          if (state.cellMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }
    if (valid && activeBuildingType && REQUIRES_STONE_FLOOR.has(activeBuildingType)) {
      for (let dy = 0; dy < bSize && valid; dy++) {
        for (let dx = 0; dx < bSize && valid; dx++) {
          if (!state.floorMap[cellKey(x + dx, y + dy)]) valid = false;
        }
      }
    }

    // Direction arrow label for directional buildings
    const isDirectional = activeBuildingType === "auto_miner" || activeBuildingType === "conveyor" || activeBuildingType === "conveyor_corner";
    const dirLabels: Record<Direction, string> = { north: "↑ Nord", east: "→ Ost", south: "↓ Süd", west: "← West" };
    const [aDx, aDy] = directionOffset(buildDirection);
    const arrowX = (x + aDx) * CELL_PX;
    const arrowY = (y + aDy) * CELL_PX;

    const placementBox = (
      <>
        <div
          key="placement"
          style={{
            position: "absolute",
            left: x * CELL_PX,
            top: y * CELL_PX,
            width: bSize * CELL_PX,
            height: bSize * CELL_PX,
            background: valid ? "rgba(0, 255, 0, 0.25)" : "rgba(255, 0, 0, 0.25)",
            border: valid ? "2px solid rgba(0,255,0,0.6)" : "2px solid rgba(255,0,0,0.6)",
            borderRadius: bSize === 2 ? 8 : 6,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
        {isDirectional && (
          <>
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
          </>
        )}
      </>
    );

    if (isPlacingPowerPole && valid) {
      // Show range ring and highlight assets within range
      const rx1 = Math.max(0, x - POWER_POLE_RANGE);
      const ry1 = Math.max(0, y - POWER_POLE_RANGE);
      const rx2 = Math.min(GRID_W - 1, x + POWER_POLE_RANGE);
      const ry2 = Math.min(GRID_H - 1, y + POWER_POLE_RANGE);
      const rangeW = rx2 - rx1 + 1;
      const rangeH = ry2 - ry1 + 1;

      // Assets within range that would connect
      const rangeConnectedElements: React.ReactNode[] = [];
      for (const asset of Object.values(state.assets)) {
        let inRange = false;
        for (let cy = 0; cy < asset.size && !inRange; cy++) {
          for (let cx = 0; cx < asset.size && !inRange; cx++) {
            const dx = Math.abs((asset.x + cx) - x);
            const dy = Math.abs((asset.y + cy) - y);
            if (Math.max(dx, dy) <= POWER_POLE_RANGE) inRange = true;
          }
        }
        if (!inRange) continue;
        rangeConnectedElements.push(
          <div
            key={`range-${asset.id}`}
            style={{
              position: "absolute",
              left: asset.x * CELL_PX + 2,
              top: asset.y * CELL_PX + 2,
              width: asset.size * CELL_PX - 4,
              height: asset.size * CELL_PX - 4,
              border: "2px dashed rgba(255, 200, 0, 0.8)",
              borderRadius: 6,
              zIndex: 9,
              pointerEvents: "none",
            }}
          />
        );
      }

      hoverElement = (
        <>
          <div
            key="range-area"
            style={{
              position: "absolute",
              left: rx1 * CELL_PX,
              top: ry1 * CELL_PX,
              width: rangeW * CELL_PX,
              height: rangeH * CELL_PX,
              background: "rgba(255, 180, 0, 0.08)",
              border: "2px dashed rgba(255, 180, 0, 0.45)",
              borderRadius: 8,
              zIndex: 8,
              pointerEvents: "none",
            }}
          />
          {rangeConnectedElements}
          {placementBox}
        </>
      );
    } else {
      hoverElement = placementBox;
    }
  } else if (state.buildMode && state.selectedFloorTile && hover && !dragging) {
    const { x, y } = hover;
    const tileType = state.selectedFloorTile;
    const key = cellKey(x, y);
    const valid =
      tileType === "stone_floor"
        ? !state.floorMap[key] && !state.cellMap[key]
        : !!state.floorMap[key] && !state.cellMap[key];
    hoverElement = (
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
  } else if (hover && !dragging) {
    // Hover over a placed power pole → show its range ring
    const hoveredId = state.cellMap[cellKey(hover.x, hover.y)];
    const hoveredAsset = hoveredId ? state.assets[hoveredId] : null;
    if (hoveredAsset?.type === "power_pole") {
      const { x, y } = hoveredAsset;
      const rx1 = Math.max(0, x - POWER_POLE_RANGE);
      const ry1 = Math.max(0, y - POWER_POLE_RANGE);
      const rx2 = Math.min(GRID_W - 1, x + POWER_POLE_RANGE);
      const ry2 = Math.min(GRID_H - 1, y + POWER_POLE_RANGE);
      const rangeW = rx2 - rx1 + 1;
      const rangeH = ry2 - ry1 + 1;

      const inRangeElements: React.ReactNode[] = [];
      for (const asset of Object.values(state.assets)) {
        if (asset.id === hoveredId) continue;
        let inRange = false;
        for (let cy = 0; cy < asset.size && !inRange; cy++) {
          for (let cx = 0; cx < asset.size && !inRange; cx++) {
            const dx = Math.abs((asset.x + cx) - x);
            const dy = Math.abs((asset.y + cy) - y);
            if (Math.max(dx, dy) <= POWER_POLE_RANGE) inRange = true;
          }
        }
        if (!inRange) continue;
        const isConn = state.connectedAssetIds.includes(asset.id);
        inRangeElements.push(
          <div
            key={`hover-range-${asset.id}`}
            style={{
              position: "absolute",
              left: asset.x * CELL_PX + 2,
              top: asset.y * CELL_PX + 2,
              width: asset.size * CELL_PX - 4,
              height: asset.size * CELL_PX - 4,
              border: `2px dashed ${isConn ? "rgba(0,255,100,0.8)" : "rgba(255,80,80,0.7)"}`,
              borderRadius: 6,
              zIndex: 9,
              pointerEvents: "none",
            }}
          />
        );
      }

      hoverElement = (
        <>
          <div
            style={{
              position: "absolute",
              left: rx1 * CELL_PX,
              top: ry1 * CELL_PX,
              width: rangeW * CELL_PX,
              height: rangeH * CELL_PX,
              background: "rgba(255, 140, 0, 0.08)",
              border: "2px dashed rgba(255, 140, 0, 0.5)",
              borderRadius: 8,
              zIndex: 8,
              pointerEvents: "none",
            }}
          />
          {inRangeElements}
        </>
      );
    }
  }

  return (
    <div
      ref={containerRef}
      className="fi-grid-container"
      onMouseDown={onMouseDown}
      onMouseMove={onGridMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        cursor: dragging ? "grabbing" : "grab",
        background: "#1a3a1a",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: cam.x,
          top: cam.y,
          width: WORLD_W,
          height: WORLD_H,
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {/* Grid lines & coordinates */}
        <svg
          width={WORLD_W}
          height={WORLD_H}
          style={{ position: "absolute", top: 0, left: 0, zIndex: 0 }}
        >
          {/* Grid cells – pixel-art grass tiles */}
          {Array.from({ length: GRID_H }, (_, y) =>
            Array.from({ length: GRID_W }, (_, x) => (
              <image
                key={`${x},${y}`}
                href={GRASS_TILE_SPRITES[(x + y) % 2]}
                x={x * CELL_PX}
                y={y * CELL_PX}
                width={CELL_PX}
                height={CELL_PX}
                style={{ imageRendering: "pixelated" }}
              />
            ))
          )}
          {/* Stone floor tiles */}
          {Object.entries(state.floorMap).map(([key]) => {
            const [gx, gy] = key.split(",").map(Number);
            return (
              <image
                key={`floor-${key}`}
                href={FLOOR_SPRITES.stone_floor}
                x={gx * CELL_PX}
                y={gy * CELL_PX}
                width={CELL_PX}
                height={CELL_PX}
                style={{ imageRendering: "pixelated" }}
              />
            );
          })}
          {/* Coordinates */}
          {Array.from({ length: GRID_H }, (_, y) =>
            Array.from({ length: GRID_W }, (_, x) => (
              <text
                key={`t${x},${y}`}
                x={x * CELL_PX + 3}
                y={y * CELL_PX + 10}
                fontSize={8}
                fill="rgba(255,255,255,0.2)"
                fontFamily="monospace"
              >
                {x},{y}
              </text>
            ))
          )}
        </svg>

        {/* Assets */}
        {assetElements}

        {/* Hover */}
        {hoverElement}

        {/* Energy Debug Overlay */}
        {state.energyDebugOverlay && <EnergyDebugOverlay state={state} />}
      </div>

      {/* Energy network stats HUD anchored to viewport */}
      {state.energyDebugOverlay && <EnergyDebugHud state={state} />}
    </div>
  );
};

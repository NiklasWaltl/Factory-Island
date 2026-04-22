import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
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
  isValidWarehouseInput,
  getWarehouseInputCell,
  type GameState,
  type GameAction,
  type Direction,
  type PlacedAsset,
  isUnderConstruction,
} from "../store/reducer";
import { WAREHOUSE_INPUT_SPRITE } from "../assets/sprites/sprites";
import { EnergyDebugOverlay, EnergyDebugHud } from "../ui/panels/EnergyDebugOverlay";
import { PhaserHost } from "../world/PhaserHost";

const WORLD_W = GRID_W * CELL_PX;
const WORLD_H = GRID_H * CELL_PX;

interface GridProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const SKIP_CONFIRM_TYPES = new Set(["cable", "conveyor", "conveyor_corner"]);

export const Grid: React.FC<GridProps> = ({ state, dispatch }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });
  const didDrag = useRef(false);
  // Direction for auto_miner / conveyor placement (cycles with R key)
  const [buildDirection, setBuildDirection] = useState<Direction>("east");
  const warnedUnmigratedTypesRef = useRef<Set<string>>(new Set());
  const [pendingRemoveAssetId, setPendingRemoveAssetId] = useState<string | null>(null);

  const assetW = useCallback((asset: { size: 1 | 2; width?: 1 | 2 }) => asset.width ?? asset.size, []);
  const assetH = useCallback((asset: { size: 1 | 2; height?: 1 | 2 }) => asset.height ?? asset.size, []);

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
          const asset = state.assets[assetId];
          if (asset && SKIP_CONFIRM_TYPES.has(asset.type)) {
            dispatch({ type: "BUILD_REMOVE_ASSET", assetId });
          } else if (asset) {
            setPendingRemoveAssetId(assetId);
          }
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
      setHover(prev => (prev && prev.x === gx && prev.y === gy) ? prev : { x: gx, y: gy });
    },
    [onMouseMove, cam, zoom]
  );

  // O(1) lookup set for connected assets
  const connectedSet = useMemo(() => new Set(state.connectedAssetIds), [state.connectedAssetIds]);

  // Viewport culling: compute visible cell range
  const el = containerRef.current;
  const vw = el?.clientWidth ?? window.innerWidth;
  const vh = el?.clientHeight ?? window.innerHeight;
  const worldX1 = -cam.x / zoom;
  const worldY1 = -cam.y / zoom;
  const worldX2 = worldX1 + vw / zoom;
  const worldY2 = worldY1 + vh / zoom;
  const minCellX = Math.max(0, Math.floor(worldX1 / CELL_PX) - 1);
  const minCellY = Math.max(0, Math.floor(worldY1 / CELL_PX) - 1);
  const maxCellX = Math.min(GRID_W - 1, Math.ceil(worldX2 / CELL_PX) + 1);
  const maxCellY = Math.min(GRID_H - 1, Math.ceil(worldY2 / CELL_PX) + 1);

  // Render grid with assets rendered per-asset (not per-cell for 2x2)
  const renderedAssets = new Set<string>();
  const migrationGuardOverlayElements: React.ReactNode[] = [];
  const connectionOverlayElements: React.ReactNode[] = [];
  const logisticsOverlayElements: React.ReactNode[] = [];
  const machineOverlayElements: React.ReactNode[] = [];
  const debugWorldOverlayElements: React.ReactNode[] = [];
  const phaserStaticAssets: Array<{
    id: string;
    type:
      | "map_shop"
      | "stone_deposit"
      | "iron_deposit"
      | "copper_deposit"
      | "stone"
      | "iron"
      | "copper"
      | "tree"
      | "sapling"
      | "cable"
      | "generator"
      | "battery"
      | "power_pole"
      | "conveyor"
      | "conveyor_corner"
      | "auto_miner"
      | "auto_smelter"
      | "warehouse"
      | "workbench"
      | "smithy"
      | "manual_assembler"
      | "service_hub";
    x: number;
    y: number;
    width: 1 | 2;
    height: 1 | 2;
    direction?: Direction;
    isUnderConstruction?: boolean;
  }> = [];
  const warehouseMarkers: Array<{ id: string; x: number; y: number; hasFeedingBelt: boolean }> = [];

  const DIRECTION_ROTATION: Record<Direction, number> = { north: 270, east: 0, south: 90, west: 180 };
  const ITEM_COLORS: Record<string, string> = {
    stone: "#808080",
    iron: "#A0A0B0",
    copper: "#CD7F32",
    ironIngot: "#d4d7e0",
    copperIngot: "#d88f54",
    metalPlate: "#8c95a6",
    gear: "#a1a7b8",
  };

  for (const asset of Object.values(state.assets)) {
    if (renderedAssets.has(asset.id)) continue;
    renderedAssets.add(asset.id);
    // Viewport culling: skip assets outside visible range
    const aw = assetW(asset);
    const ah = assetH(asset);
    if (asset.x + aw < minCellX || asset.x > maxCellX || asset.y + ah < minCellY || asset.y > maxCellY) continue;
    const px = asset.x * CELL_PX;
    const py = asset.y * CELL_PX;
    const w = aw * CELL_PX;
    const h = ah * CELL_PX;

    const isConnected = connectedSet.has(asset.id);
    const isPowerPole = asset.type === "power_pole";
    const isConveyor = asset.type === "conveyor" || asset.type === "conveyor_corner";
    const isAutoMiner = asset.type === "auto_miner";
    const isAutoSmelter = asset.type === "auto_smelter";
    const hasDir = (isConveyor || isAutoMiner || isAutoSmelter) && asset.direction;
    const rotDeg = hasDir ? DIRECTION_ROTATION[asset.direction!] : 0;
    const underConstruction = isUnderConstruction(state, asset.id);

    // Conveyor item indicators
    const convQueue = isConveyor ? state.conveyors[asset.id]?.queue ?? [] : [];
    // Auto-miner progress indicator
    const minerEntry = isAutoMiner ? state.autoMiners[asset.id] : null;

    if (
      asset.type === "map_shop" ||
      asset.type === "stone_deposit" ||
      asset.type === "iron_deposit" ||
      asset.type === "copper_deposit" ||
      asset.type === "stone" ||
      asset.type === "iron" ||
      asset.type === "copper" ||
      asset.type === "tree" ||
      asset.type === "sapling" ||
      asset.type === "cable" ||
      asset.type === "generator" ||
      asset.type === "battery" ||
      asset.type === "power_pole" ||
      asset.type === "conveyor" ||
      asset.type === "conveyor_corner" ||
      asset.type === "auto_miner" ||
      asset.type === "auto_smelter" ||
      asset.type === "warehouse" ||
      asset.type === "workbench" ||
      asset.type === "smithy" ||
      asset.type === "manual_assembler" ||
      asset.type === "service_hub"
    ) {
      phaserStaticAssets.push({
        id: asset.id,
        type: asset.type,
        x: asset.x,
        y: asset.y,
        width: aw,
        height: ah,
        direction: asset.direction,
        isUnderConstruction: underConstruction,
      });

      if (isPowerPole) {
        connectionOverlayElements.push(
          <div
            key={`${asset.id}-power-overlay`}
            style={{
              position: "absolute",
              left: px + 2,
              top: py,
              width: w - 4,
              height: h - 16,
              border: `2px solid ${isConnected ? "rgba(0,255,100,0.9)" : "rgba(255,80,80,0.7)"}`,
              borderRadius: 6,
              boxShadow: isConnected ? "0 0 8px rgba(0,255,100,0.5)" : "none",
              filter: !isConnected ? "saturate(0.5)" : "none",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        );
      }

      if (isConveyor) {
        logisticsOverlayElements.push(
          <div
            key={`${asset.id}-conveyor-overlay`}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: h,
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            {convQueue.slice(0, 4).map((item, idx) => {
              const slotSize = 10;
              const gap = 2;
              const startX = w / 2 - ((slotSize * 2 + gap) / 2);
              const startY = h / 2 - ((slotSize * 2 + gap) / 2);
              const col = idx % 2;
              const row = Math.floor(idx / 2);
              return (
                <div
                  key={`${asset.id}-item-${idx}`}
                  style={{
                    position: "absolute",
                    left: startX + col * (slotSize + gap),
                    top: startY + row * (slotSize + gap),
                    width: slotSize,
                    height: slotSize,
                    borderRadius: "50%",
                    background: ITEM_COLORS[item] ?? "#fff",
                    border: "2px solid rgba(0,0,0,0.6)",
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
              );
            })}
          </div>
        );

        if (state.energyDebugOverlay) {
          debugWorldOverlayElements.push(
            <span
              key={`${asset.id}-conveyor-debug-count`}
              style={{
                position: "absolute",
                left: px + w - 22,
                top: py + 2,
                fontSize: 10,
                lineHeight: 1,
                color: "#fff",
                background: "rgba(0,0,0,0.75)",
                borderRadius: 4,
                padding: "2px 4px",
                zIndex: 6,
                pointerEvents: "none",
              }}
            >
              {convQueue.length}
            </span>
          );
        }
      }

      if (isAutoSmelter) {
        const status = state.autoSmelters?.[asset.id]?.status ?? "IDLE";
        const statusColor = status === "PROCESSING"
          ? "#22c55e"
          : status === "OUTPUT_BLOCKED" || status === "NO_POWER" || status === "MISCONFIGURED"
            ? "#ef4444"
            : "#9ca3af";
        const dir = asset.direction ?? "east";
        const inputBox =
          dir === "east"
            ? { left: -CELL_PX, top: 0 }
            : dir === "west"
              ? { left: w, top: 0 }
              : dir === "north"
                ? { left: 0, top: h }
                : { left: 0, top: -CELL_PX };
        const outputBox =
          dir === "east"
            ? { left: w, top: 0 }
            : dir === "west"
              ? { left: -CELL_PX, top: 0 }
              : dir === "north"
                ? { left: 0, top: -CELL_PX }
                : { left: 0, top: h };

        machineOverlayElements.push(
          <div
            key={`${asset.id}-smelter-overlay`}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: h,
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <div style={{ position: "absolute", left: inputBox.left, top: inputBox.top, width: CELL_PX, height: CELL_PX, border: "2px dashed rgba(80,160,255,0.9)", borderRadius: 6, pointerEvents: "none", zIndex: 5 }} />
            <div style={{ position: "absolute", left: outputBox.left, top: outputBox.top, width: CELL_PX, height: CELL_PX, border: "2px dashed rgba(255,200,80,0.9)", borderRadius: 6, pointerEvents: "none", zIndex: 5 }} />
            <div style={{ position: "absolute", left: 2, top: 2, width: 10, height: 10, borderRadius: "50%", background: statusColor, border: "1px solid rgba(0,0,0,0.6)", zIndex: 6 }} />
          </div>
        );
      }

      if (minerEntry !== null && minerEntry !== undefined) {
        machineOverlayElements.push(
          <div
            key={`${asset.id}-miner-overlay`}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: h,
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <div style={{
              position: "absolute",
              bottom: 2,
              left: 2,
              right: 2,
              height: 4,
              background: "rgba(0,0,0,0.5)",
              borderRadius: 2,
              zIndex: 5,
            }}>
              <div style={{
                height: "100%",
                width: `${(minerEntry.progress / 6) * 100}%`,
                background: "#ffd700",
                borderRadius: 2,
                transition: "width 0.4s linear",
              }} />
            </div>
          </div>
        );
      }

      continue;
    }

    // Exception-only fallback: if a new asset type is added but not yet routed
    // through Phaser static assets, render an explicit placeholder instead of
    // silently using a normal React base-sprite path.
    if (import.meta.env.DEV && !warnedUnmigratedTypesRef.current.has(asset.type)) {
      warnedUnmigratedTypesRef.current.add(asset.type);
      console.warn(
        `[Grid] Unmigrated world asset type rendered via React exception fallback: ${asset.type}. ` +
        "Route this type through phaserStaticAssets to keep Phaser as world renderer."
      );
    }

    migrationGuardOverlayElements.push(
      <div
        key={`${asset.id}-unmigrated-fallback`}
        style={{
          position: "absolute",
          left: px,
          top: py,
          width: w,
          height: h,
          border: "2px solid rgba(239,68,68,0.95)",
          background: "rgba(127,29,29,0.35)",
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#fecaca",
            background: "rgba(0,0,0,0.75)",
            padding: "2px 6px",
            borderRadius: 4,
            whiteSpace: "nowrap",
            maxWidth: w - 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          UNMIGRATED: {asset.type}
        </span>
      </div>
    );
  }

  const dynamicAssetOverlayElements: React.ReactNode[] = [
    ...connectionOverlayElements,
    ...logisticsOverlayElements,
    ...machineOverlayElements,
    ...debugWorldOverlayElements,
  ];

  // Warehouse input tile overlays are a deliberate React world-space exception:
  // they stay in React, share the common Grid world transform, and should not be
  // "cleaned up" into the Phaser base world renderer during later refactors.
  for (const asset of Object.values(state.assets)) {
    if (asset.type !== "warehouse") continue;
    const { x: inputX, y: inputY } = getWarehouseInputCell(asset);
    if (inputX >= GRID_W || inputY >= GRID_H) continue;
    // Viewport culling
    if (inputX < minCellX || inputX > maxCellX || inputY < minCellY || inputY > maxCellY) continue;

    // Determine whether the tile currently has a correctly-oriented conveyor on it
    const tileAssetId = state.cellMap[cellKey(inputX, inputY)];
    const tileAsset = tileAssetId ? state.assets[tileAssetId] : null;
    const hasFeedingBelt =
      tileAsset?.type === "conveyor" &&
      isValidWarehouseInput(tileAsset.x, tileAsset.y, tileAsset.direction ?? "east", asset);

    warehouseMarkers.push({
      id: asset.id,
      x: inputX,
      y: inputY,
      hasFeedingBelt,
    });
  }

  // Render warehouse input markers in React on the shared world-space overlay layer.
  const warehouseMarkerElements = warehouseMarkers.map((m) => (
    <div
      key={`wh-marker-${m.id}`}
      style={{
        position: "absolute",
        left: m.x * CELL_PX,
        top: m.y * CELL_PX,
        width: CELL_PX,
        height: CELL_PX,
        zIndex: 2,
      }}
    >
      {m.hasFeedingBelt && (
        <div
          style={{
            position: "absolute",
            inset: 5,
            border: "2px solid rgba(255,215,0,0.7)",
            background: "rgba(255,215,0,0.16)",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        />
      )}
      <img
        src={WAREHOUSE_INPUT_SPRITE}
        alt=""
        draggable={false}
        style={{
          width: CELL_PX,
          height: CELL_PX,
          opacity: m.hasFeedingBelt ? 0.6 : 0.85,
          pointerEvents: "none",
          imageRendering: "pixelated",
        }}
      />
    </div>
  ));

  const worldTransformStyle: React.CSSProperties = {
    position: "absolute",
    left: cam.x,
    top: cam.y,
    width: WORLD_W,
    height: WORLD_H,
    transform: `scale(${zoom})`,
    transformOrigin: "0 0",
  };

  const worldCanvasLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
  };

  const worldOverlayLayerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
  };

  const staticAssetsSignature = phaserStaticAssets
    .map((a) => `${a.id}|${a.type}|${a.x}|${a.y}|${a.width}|${a.height}|${a.direction ?? ""}|${a.isUnderConstruction ? 1 : 0}`)
    .join(";");

  const stableStaticAssets = useMemo(() => phaserStaticAssets, [staticAssetsSignature]);

  // Build drone snapshots for Phaser. Memoized by a stable signature so
  // PhaserHost only re-emits when something actually changed.
  const droneSnapshots = useMemo(() => {
    return Object.values(state.drones).map((d) => ({
      droneId: d.droneId,
      status: d.status,
      tileX: d.tileX,
      tileY: d.tileY,
      cargo: d.cargo ? { itemType: d.cargo.itemType, amount: d.cargo.amount } : null,
      hubId: d.hubId,
      isParkedAtHub: d.status === "idle" && d.hubId !== null,
      parkingSlot: null as number | null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    Object.values(state.drones)
      .map((d) => `${d.droneId}|${d.status}|${d.tileX}|${d.tileY}|${d.hubId ?? ""}|${d.cargo?.itemType ?? ""}|${d.cargo?.amount ?? 0}`)
      .join(";"),
  ]);

  // Build collection-node snapshots (manual harvest drops) for Phaser.
  const collectionNodeSnapshots = useMemo(() => {
    return Object.values(state.collectionNodes).map((n) => ({
      id: n.id,
      itemType: n.itemType,
      amount: n.amount,
      tileX: n.tileX,
      tileY: n.tileY,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    Object.values(state.collectionNodes)
      .map((n) => `${n.id}|${n.itemType}|${n.amount}|${n.tileX}|${n.tileY}`)
      .join(";"),
  ]);

  // Hover highlight for building placement
  const slot = state.hotbarSlots[state.activeSlot];
  const buildBuildingType = state.buildMode ? state.selectedBuildingType : null;
  const isPlacingBuilding = buildBuildingType != null || slot?.toolKind === "building";
  const activeBuildingType = buildBuildingType ?? (slot?.toolKind === "building" ? slot.buildingType : null);
  const isPlacingPowerPole = isPlacingBuilding && activeBuildingType === "power_pole";

  const collectPowerPoleRangeHighlightElements = (
    poleX: number,
    poleY: number,
    options?: {
      excludeAssetId?: string;
      getBorderColor?: (assetId: string) => string;
      keyPrefix?: string;
    }
  ): React.ReactNode[] => {
    const highlightElements: React.ReactNode[] = [];
    for (const asset of Object.values(state.assets)) {
      if (options?.excludeAssetId && asset.id === options.excludeAssetId) continue;
      let inRange = false;
      for (let cy = 0; cy < assetH(asset) && !inRange; cy++) {
        for (let cx = 0; cx < assetW(asset) && !inRange; cx++) {
          const dx = Math.abs((asset.x + cx) - poleX);
          const dy = Math.abs((asset.y + cy) - poleY);
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
        />
      );
    }
    return highlightElements;
  };

  const renderPowerPoleRangeArea = (
    poleX: number,
    poleY: number,
    colors: { background: string; border: string },
    key?: string
  ) => {
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

  const renderFloorPlacementOverlay = (x: number, y: number, tileType: keyof typeof FLOOR_TILE_EMOJIS, valid: boolean) => (
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

  let placementOverlayElement: React.ReactNode = null;
  let inspectionOverlayElement: React.ReactNode = null;

  if (isPlacingBuilding && hover && !dragging) {
    const { x, y } = hover;
    const isAutoSmelterPlacement = activeBuildingType === "auto_smelter";
    const bWidth: 1 | 2 = isAutoSmelterPlacement
      ? (buildDirection === "east" || buildDirection === "west" ? 2 : 1)
      : ((activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2);
    const bHeight: 1 | 2 = isAutoSmelterPlacement
      ? (buildDirection === "east" || buildDirection === "west" ? 1 : 2)
      : ((activeBuildingType && BUILDING_SIZES[activeBuildingType]) ?? 2);
    let valid = x >= 0 && y >= 0 && x + bWidth <= GRID_W && y + bHeight <= GRID_H;

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

    // Direction arrow label for directional buildings
    const isDirectional = activeBuildingType === "auto_miner" || activeBuildingType === "conveyor" || activeBuildingType === "conveyor_corner" || activeBuildingType === "auto_smelter" || activeBuildingType === "warehouse";
    const isWarehousePlacement = activeBuildingType === "warehouse";
    const showDirectionArrow = isDirectional && !isWarehousePlacement;
    const dirLabels: Record<Direction, string> = { north: "↑ Nord", east: "→ Ost", south: "↓ Süd", west: "← West" };
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
            {isWarehousePlacement && (() => {
              const tempWh: PlacedAsset = { id: "ghost", type: "warehouse", x, y, size: 2, direction: buildDirection };
              const { x: whInX, y: whInY } = getWarehouseInputCell(tempWh);
              const inLeft = whInX * CELL_PX;
              const inTop  = whInY * CELL_PX;
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
          {renderPowerPoleRangeArea(x, y, {
            background: "rgba(255, 180, 0, 0.08)",
            border: "rgba(255, 180, 0, 0.45)",
          }, "range-area")}
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
    // Hover over a placed power pole -> show its range ring as an inspection overlay.
    const hoveredId = state.cellMap[cellKey(hover.x, hover.y)];
    const hoveredAsset = hoveredId ? state.assets[hoveredId] : null;
    if (hoveredAsset?.type === "power_pole") {
      const { x, y } = hoveredAsset;
      const inRangeElements = collectPowerPoleRangeHighlightElements(x, y, {
        excludeAssetId: hoveredId,
        keyPrefix: "hover-range",
        getBorderColor: (assetId) => connectedSet.has(assetId)
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
      <div style={worldTransformStyle}>
        {/* Phaser world layer: shares the same world transform as all React world overlays. */}
        <div style={worldCanvasLayerStyle}>
          <PhaserHost floorMap={state.floorMap} staticAssets={stableStaticAssets} drones={droneSnapshots} collectionNodes={collectionNodeSnapshots} />
        </div>

        {/* React world overlays: intentionally share the exact same transformed world root. */}
        <div style={worldOverlayLayerStyle}>
          {warehouseMarkerElements}
          {dynamicAssetOverlayElements}
        </div>

        {/* Exception fallback visuals for unmigrated world assets */}
        {migrationGuardOverlayElements}

        {/* Placement and inspection overlays share the same world transform. */}
        {placementOverlayElement}
        {inspectionOverlayElement}

        {/* Energy Debug Overlay */}
        {state.energyDebugOverlay && <EnergyDebugOverlay state={state} />}
      </div>

      {/* Energy network stats HUD anchored to viewport */}
      {state.energyDebugOverlay && <EnergyDebugHud state={state} />}
    </div>
  );
};

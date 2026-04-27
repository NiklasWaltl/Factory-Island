import React from "react";
import { GRID_W, GRID_H, CELL_PX } from "../constants/grid";
import { cellKey } from "../store/cell-key";
import { isUnderConstruction } from "../store/asset-status";
import { getWarehouseInputCell, isValidWarehouseInput } from "../store/warehouse-input";
import type { Direction, GameState } from "../store/types";
import { WAREHOUSE_INPUT_SPRITE } from "../assets/sprites/sprites";
import type { StaticAssetSnapshot } from "../world/PhaserGame";

interface BuildWorldOverlayDataParams {
  state: GameState;
  connectedSet: ReadonlySet<string>;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
  assetW: (asset: { size: 1 | 2; width?: 1 | 2 }) => 1 | 2;
  assetH: (asset: { size: 1 | 2; height?: 1 | 2 }) => 1 | 2;
  warnedUnmigratedTypesRef: React.MutableRefObject<Set<string>>;
}

export interface GridWorldOverlayData {
  phaserStaticAssets: StaticAssetSnapshot[];
  migrationGuardOverlayElements: React.ReactNode[];
  dynamicAssetOverlayElements: React.ReactNode[];
  warehouseMarkerElements: React.ReactNode[];
}

const ITEM_COLORS: Record<string, string> = {
  stone: "#808080",
  iron: "#A0A0B0",
  copper: "#CD7F32",
  ironIngot: "#d4d7e0",
  copperIngot: "#d88f54",
  metalPlate: "#8c95a6",
  gear: "#a1a7b8",
};

export function buildWorldOverlayData({
  state,
  connectedSet,
  minCellX,
  minCellY,
  maxCellX,
  maxCellY,
  assetW,
  assetH,
  warnedUnmigratedTypesRef,
}: BuildWorldOverlayDataParams): GridWorldOverlayData {
  const renderedAssets = new Set<string>();
  const migrationGuardOverlayElements: React.ReactNode[] = [];
  const connectionOverlayElements: React.ReactNode[] = [];
  const logisticsOverlayElements: React.ReactNode[] = [];
  const machineOverlayElements: React.ReactNode[] = [];
  const debugWorldOverlayElements: React.ReactNode[] = [];
  const phaserStaticAssets: StaticAssetSnapshot[] = [];
  const warehouseMarkers: Array<{ id: string; x: number; y: number; hasFeedingBelt: boolean }> = [];

  for (const asset of Object.values(state.assets)) {
    if (renderedAssets.has(asset.id)) continue;
    renderedAssets.add(asset.id);

    const aw = assetW(asset);
    const ah = assetH(asset);
    if (
      asset.x + aw < minCellX ||
      asset.x > maxCellX ||
      asset.y + ah < minCellY ||
      asset.y > maxCellY
    ) {
      continue;
    }
    const px = asset.x * CELL_PX;
    const py = asset.y * CELL_PX;
    const w = aw * CELL_PX;
    const h = ah * CELL_PX;

    const isConnected = connectedSet.has(asset.id);
    const isPowerPole = asset.type === "power_pole";
    const isConveyor =
      asset.type === "conveyor" ||
      asset.type === "conveyor_corner" ||
      asset.type === "conveyor_merger" ||
      asset.type === "conveyor_splitter" ||
      asset.type === "conveyor_underground_in" ||
      asset.type === "conveyor_underground_out";
    const isAutoMiner = asset.type === "auto_miner";
    const isTwoTileBeltMachine = asset.type === "auto_smelter" || asset.type === "auto_assembler";
    const underConstruction = isUnderConstruction(state, asset.id);

    const convQueue = isConveyor ? state.conveyors[asset.id]?.queue ?? [] : [];
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
      asset.type === "conveyor_merger" ||
      asset.type === "conveyor_splitter" ||
      asset.type === "conveyor_underground_in" ||
      asset.type === "conveyor_underground_out" ||
      asset.type === "auto_miner" ||
      asset.type === "auto_smelter" ||
      asset.type === "auto_assembler" ||
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
          />,
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
            {import.meta.env.DEV &&
            (asset.type === "conveyor_underground_in" ||
              asset.type === "conveyor_underground_out") ? (
              <span
                key={`${asset.id}-ug-peer`}
                style={{
                  position: "absolute",
                  left: 2,
                  top: 2,
                  fontSize: 8,
                  lineHeight: 1,
                  color: "#eea",
                  background: "rgba(0,0,0,0.65)",
                  padding: "1px 3px",
                  borderRadius: 3,
                  zIndex: 6,
                  pointerEvents: "none",
                }}
              >
                {state.conveyorUndergroundPeers[asset.id]
                  ? `peer:${state.conveyorUndergroundPeers[asset.id].slice(0, 8)}`
                  : "peer:—"}
              </span>
            ) : null}
          </div>,
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
            </span>,
          );
        }
      }

      if (isTwoTileBeltMachine) {
        const status =
          asset.type === "auto_smelter"
            ? (state.autoSmelters?.[asset.id]?.status ?? "IDLE")
            : (state.autoAssemblers?.[asset.id]?.status ?? "IDLE");
        const statusColor =
          status === "PROCESSING"
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
            <div
              style={{
                position: "absolute",
                left: inputBox.left,
                top: inputBox.top,
                width: CELL_PX,
                height: CELL_PX,
                border: "2px dashed rgba(80,160,255,0.9)",
                borderRadius: 6,
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: outputBox.left,
                top: outputBox.top,
                width: CELL_PX,
                height: CELL_PX,
                border: "2px dashed rgba(255,200,80,0.9)",
                borderRadius: 6,
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 2,
                top: 2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: statusColor,
                border: "1px solid rgba(0,0,0,0.6)",
                zIndex: 6,
              }}
            />
          </div>,
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
            <div
              style={{
                position: "absolute",
                bottom: 2,
                left: 2,
                right: 2,
                height: 4,
                background: "rgba(0,0,0,0.5)",
                borderRadius: 2,
                zIndex: 5,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(minerEntry.progress / 6) * 100}%`,
                  background: "#ffd700",
                  borderRadius: 2,
                  transition: "width 0.4s linear",
                }}
              />
            </div>
          </div>,
        );
      }

      continue;
    }

    if (import.meta.env.DEV && !warnedUnmigratedTypesRef.current.has(asset.type)) {
      warnedUnmigratedTypesRef.current.add(asset.type);
      console.warn(
        `[Grid] Unmigrated world asset type rendered via React exception fallback: ${asset.type}. ` +
          "Route this type through phaserStaticAssets to keep Phaser as world renderer.",
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
      </div>,
    );
  }

  const dynamicAssetOverlayElements: React.ReactNode[] = [
    ...connectionOverlayElements,
    ...logisticsOverlayElements,
    ...machineOverlayElements,
    ...debugWorldOverlayElements,
  ];

  for (const asset of Object.values(state.assets)) {
    if (asset.type !== "warehouse") continue;
    const { x: inputX, y: inputY } = getWarehouseInputCell(asset);
    if (inputX >= GRID_W || inputY >= GRID_H) continue;
    if (inputX < minCellX || inputX > maxCellX || inputY < minCellY || inputY > maxCellY) continue;

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

  const warehouseMarkerElements = warehouseMarkers.map((marker) => (
    <div
      key={`wh-marker-${marker.id}`}
      style={{
        position: "absolute",
        left: marker.x * CELL_PX,
        top: marker.y * CELL_PX,
        width: CELL_PX,
        height: CELL_PX,
        zIndex: 2,
      }}
    >
      {marker.hasFeedingBelt && (
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
          opacity: marker.hasFeedingBelt ? 0.6 : 0.85,
          pointerEvents: "none",
          imageRendering: "pixelated",
        }}
      />
    </div>
  ));

  return {
    phaserStaticAssets,
    migrationGuardOverlayElements,
    dynamicAssetOverlayElements,
    warehouseMarkerElements,
  };
}

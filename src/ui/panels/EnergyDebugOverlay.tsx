import React from "react";
import {
  CELL_PX,
  GRID_W,
  GRID_H,
  POWER_POLE_RANGE,
  ENERGY_DRAIN,
  GENERATOR_ENERGY_PER_TICK,
  GENERATOR_TICK_MS,
  ENERGY_NET_TICK_MS,
  type GameState,
  type PlacedAsset,
} from "../../features/factory-game/game";

const WORLD_W = GRID_W * CELL_PX;
const WORLD_H = GRID_H * CELL_PX;

interface EnergyDebugOverlayProps {
  state: GameState;
}

interface EnergyStats {
  production: number;
  consumption: number;
  difference: number;
}

function getEnergyStats(state: GameState): EnergyStats {
  const ticksPerPeriod = Math.round(ENERGY_NET_TICK_MS / GENERATOR_TICK_MS);
  const genConnectedToPole = state.connectedAssetIds.some(
    (id) => state.assets[id]?.type === "power_pole",
  );
  const production =
    state.generator.running && genConnectedToPole
      ? ticksPerPeriod * GENERATOR_ENERGY_PER_TICK
      : 0;

  let consumption = 0;
  for (const cId of state.poweredMachineIds ?? []) {
    const cAsset = state.assets[cId];
    if (cAsset && ENERGY_DRAIN[cAsset.type]) {
      consumption += ENERGY_DRAIN[cAsset.type];
    }
  }

  return { production, consumption, difference: production - consumption };
}

/**
 * Purely visual overlay that shows the energy network topology:
 * - Power nodes (blue = active, grey = inactive) with range circles
 * - Lines between connected power poles
 * - Consumer power status (green / yellow / red)
 * - Production vs. consumption HUD
 */
export const EnergyDebugOverlay: React.FC<EnergyDebugOverlayProps> = ({ state }) => {
  const allAssets = Object.values(state.assets);
  const connectedSet = new Set(state.connectedAssetIds);
  const poweredSet = new Set(state.poweredMachineIds ?? []);

  const { difference } = getEnergyStats(state);

  // ---- Collect power poles for markers/range ----
  const allPoles = allAssets.filter((a) => a.type === "power_pole");
  const generators = allAssets.filter((a) => a.type === "generator" && connectedSet.has(a.id));

  // ---- Determine consumer status colors ----
  function getConsumerColor(asset: PlacedAsset): string | null {
    if (!ENERGY_DRAIN[asset.type]) return null; // Not a consumer
    if (!connectedSet.has(asset.id)) return "#ef4444"; // red – not connected
    if (poweredSet.has(asset.id)) return "#22c55e"; // green – powered by scheduler
    return "#eab308"; // yellow – connected but currently under-supplied
  }

  return (
    <>
      {/* SVG layer for range circles and node/consumer markers */}
      <svg
        width={WORLD_W}
        height={WORLD_H}
        style={{ position: "absolute", top: 0, left: 0, zIndex: 15, pointerEvents: "none" }}
      >
        {/* Power pole range areas (semi-transparent) */}
        {allPoles.map((pole) => {
          const isActive = connectedSet.has(pole.id);
          const cx = pole.x * CELL_PX + CELL_PX / 2;
          const cy = pole.y * CELL_PX + CELL_PX / 2;
          const r = POWER_POLE_RANGE * CELL_PX + CELL_PX / 2;
          return (
            <circle
              key={`range-${pole.id}`}
              cx={cx}
              cy={cy}
              r={r}
              fill={isActive ? "rgba(59,130,246,0.07)" : "rgba(156,163,175,0.06)"}
              stroke={isActive ? "rgba(59,130,246,0.35)" : "rgba(156,163,175,0.25)"}
              strokeWidth={2}
              strokeDasharray="8 4"
            />
          );
        })}

        {/* Power node markers (poles + generators) */}
        {allPoles.map((pole) => {
          const isActive = connectedSet.has(pole.id);
          const cx = pole.x * CELL_PX + CELL_PX / 2;
          const cy = pole.y * CELL_PX + CELL_PX / 2;
          return (
            <React.Fragment key={`node-${pole.id}`}>
              <circle
                cx={cx}
                cy={cy}
                r={10}
                fill={isActive ? "#3b82f6" : "#6b7280"}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill="#fff"
              >⚡</text>
            </React.Fragment>
          );
        })}

        {/* Generator markers */}
        {generators.map((gen) => {
          const cx = (gen.x + gen.size / 2) * CELL_PX;
          const cy = (gen.y + gen.size / 2) * CELL_PX;
          return (
            <React.Fragment key={`gen-${gen.id}`}>
              <circle
                cx={cx}
                cy={cy}
                r={14}
                fill={state.generator.running ? "#f59e0b" : "#6b7280"}
                stroke="#fff"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={cy + 5}
                textAnchor="middle"
                fontSize={13}
                fontWeight="bold"
                fill="#fff"
              >G</text>
            </React.Fragment>
          );
        })}

        {/* Consumer status outlines */}
        {allAssets.map((asset) => {
          const color = getConsumerColor(asset);
          if (!color) return null;
          const px = asset.x * CELL_PX;
          const py = asset.y * CELL_PX;
          const w = asset.size * CELL_PX;
          const h = asset.size * CELL_PX;
          return (
            <rect
              key={`consumer-${asset.id}`}
              x={px + 2}
              y={py + 2}
              width={w - 4}
              height={h - 4}
              rx={6}
              fill="none"
              stroke={color}
              strokeWidth={3}
            />
          );
        })}

        {/* Battery marker */}
        {allAssets
          .filter((a) => a.type === "battery")
          .map((bat) => {
            const cx = (bat.x + bat.size / 2) * CELL_PX;
            const cy = (bat.y + bat.size / 2) * CELL_PX;
            const pct = state.battery.capacity > 0
              ? Math.round((state.battery.stored / state.battery.capacity) * 100)
              : 0;
            return (
              <React.Fragment key={`bat-${bat.id}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  fill={connectedSet.has(bat.id) ? "#8b5cf6" : "#6b7280"}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="bold"
                  fill="#fff"
                >{pct}%</text>
              </React.Fragment>
            );
          })}
      </svg>

    </>
  );
};

export const EnergyDebugHud: React.FC<EnergyDebugOverlayProps> = ({ state }) => {
  const { production, consumption, difference } = getEnergyStats(state);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 88,
        left: 12,
        zIndex: 40,
        background: "rgba(0,0,0,0.8)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 8,
        fontFamily: "monospace",
        fontSize: 13,
        lineHeight: 1.6,
        pointerEvents: "none",
        minWidth: 220,
        border: "1px solid rgba(255,255,255,0.15)",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4, fontSize: 14 }}>⚡ Stromnetz-Analyse</div>
      <div>
        Produktion:{" "}
        <span style={{ color: "#22c55e" }}>{production} E/t</span>
      </div>
      <div>
        Verbrauch:{" "}
        <span style={{ color: "#ef4444" }}>{consumption} E/t</span>
      </div>
      <div>
        Differenz:{" "}
        <span style={{ color: difference >= 0 ? "#22c55e" : "#ef4444" }}>
          {difference >= 0 ? "+" : ""}{difference} E/t
        </span>
      </div>
      <div style={{ marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 4 }}>
        Batterie: {Math.round(state.battery.stored)}/{state.battery.capacity} J
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        <span style={{ color: "#3b82f6" }}>●</span> Aktiver Knoten{" "}
        <span style={{ color: "#6b7280" }}>●</span> Inaktiv
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
        <span style={{ color: "#22c55e" }}>■</span> Versorgt{" "}
        <span style={{ color: "#eab308" }}>■</span> Unterversorgt{" "}
        <span style={{ color: "#ef4444" }}>■</span> Kein Strom
      </div>
    </div>
  );
};

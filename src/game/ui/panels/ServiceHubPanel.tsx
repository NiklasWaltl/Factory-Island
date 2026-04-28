import React from "react";
import type { GameState, CollectableItemType, DroneRole, Inventory } from "../../store/types";
import type { GameAction } from "../../store/actions";
import { RESOURCE_LABELS as GLOBAL_RESOURCE_LABELS } from "../../store/constants/resources";
import {
  getDroneStatusDetail,
  getHubTierLabel,
  getMaxTargetStockForTier,
  getHubRange,
  getActiveResources,
  getMaxDrones,
  getHubDrones,
  HUB_UPGRADE_COST,
  hasResourcesInPhysicalStorage,
} from "../../store/reducer";

interface ServiceHubPanelProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const HUB_RESOURCE_EMOJIS: Record<CollectableItemType, string> = {
  wood: "🪵",
  stone: "🪨",
  iron: "⛏️",
  copper: "🟠",
};

const RESOURCE_ORDER: CollectableItemType[] = ["wood", "stone", "iron", "copper"];
const formatHubResourceLabel = (resource: CollectableItemType): string =>
  `${HUB_RESOURCE_EMOJIS[resource]} ${GLOBAL_RESOURCE_LABELS[resource] ?? resource}`;

const UPGRADE_COST_LABEL = Object.entries(HUB_UPGRADE_COST)
  .filter(([, v]) => (v ?? 0) > 0)
  .map(([k, v]) => `${v} ${formatHubResourceLabel(k as CollectableItemType)}`)
  .join(", ");

function demandLabel(current: number, target: number): { text: string; color: string } {
  if (target === 0) return { text: "kein Bedarf", color: "#666" };
  if (current >= target) return { text: "gedeckt", color: "#4caf50" };
  return { text: "benötigt", color: "#ffa500" };
}

export const ServiceHubPanel: React.FC<ServiceHubPanelProps> = ({ state, dispatch }) => {
  const hubId = state.selectedServiceHubId;
  const hubEntry = hubId ? state.serviceHubs[hubId] ?? null : null;
  const hubDrones = hubId ? getHubDrones(state, hubId) : [];
  const tier = hubEntry?.tier ?? 1;
  const tierLabel = getHubTierLabel(tier);
  const maxStock = getMaxTargetStockForTier(tier);
  const range = getHubRange(tier);
  const activeResources = new Set(getActiveResources(tier));
  const maxDrones = getMaxDrones(tier);
  const canUpgrade = tier === 1 && !hubEntry?.pendingUpgrade && hasResourcesInPhysicalStorage(state, HUB_UPGRADE_COST as Partial<Record<keyof Inventory, number>>);

  // Node-Aufschlüsselung nach Typ
  const nodesByType: Record<CollectableItemType, { count: number; amount: number }> = {
    wood: { count: 0, amount: 0 },
    stone: { count: 0, amount: 0 },
    iron: { count: 0, amount: 0 },
    copper: { count: 0, amount: 0 },
  };
  let totalNodes = 0;
  let totalItems = 0;
  for (const n of Object.values(state.collectionNodes)) {
    if (n.amount <= 0) continue;
    const entry = nodesByType[n.itemType];
    if (entry) {
      entry.count++;
      entry.amount += n.amount;
    }
    totalNodes++;
    totalItems += n.amount;
  }

  return (
    <div className="fi-panel" style={{ minWidth: 290 }}>
      <div className="fi-panel-header">
        <span>🚁 {tierLabel}</span>
        <button className="fi-panel-close" onClick={() => dispatch({ type: "CLOSE_PANEL" })}>✕</button>
      </div>
      <div className="fi-panel-body" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* ---- Stufe / Upgrade ---- */}
        <div style={{ fontSize: 13, color: "#aaa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ color: "#eee" }}>Stufe {tier}</strong>
              <span style={{ marginLeft: 8, color: tier === 1 ? "#ffa500" : "#4caf50" }}>
                {tier === 1 ? "Proto-Hub" : "Service-Hub"}
              </span>
            </div>
          </div>
          {/* Stats summary */}
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: "#999" }}>
            <span>📡 Reichweite: <strong style={{ color: "#ccc" }}>{range}</strong></span>
            <span>📦 Max Ziel: <strong style={{ color: "#ccc" }}>{maxStock}</strong></span>
            <span>🚁 Drohnen: <strong style={{ color: "#ccc" }}>{hubDrones.length}/{maxDrones}</strong></span>
            <span>🔧 Ressourcen: <strong style={{ color: "#ccc" }}>{activeResources.size}/{RESOURCE_ORDER.length}</strong></span>
          </div>
          {tier === 1 && hubId && (
            <div style={{ marginTop: 8 }}>
              <button
                style={{ padding: "4px 10px", cursor: canUpgrade ? "pointer" : "not-allowed", opacity: canUpgrade ? 1 : 0.5 }}
                disabled={!canUpgrade}
                onClick={() => dispatch({ type: "UPGRADE_HUB", hubId })}
                title={canUpgrade ? "Upgrade auf Service-Hub (Stufe 2)" : "Nicht genug Ressourcen"}
              >
                ⬆ Upgrade → Service-Hub
              </button>
              <div style={{ marginTop: 3, fontSize: 11, color: "#888" }}>
                Kosten: {UPGRADE_COST_LABEL}
              </div>
            </div>
          )}
          {tier === 2 && hubDrones.length < maxDrones && (
            <div style={{ marginTop: 4, fontSize: 11, color: "#555", fontStyle: "italic" }}>
              Weitere Drohnen-Slots verfügbar ({hubDrones.length}/{maxDrones})
            </div>
          )}
        </div>
        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />

        {/* ---- Drohnen ---- */}
        <div style={{ fontSize: 13, color: "#aaa" }}>
          <strong style={{ color: "#eee" }}>Drohnen ({hubDrones.length}/{maxDrones})</strong>
          {hubDrones.map((d, i) => {
            const detail = getDroneStatusDetail(state, d);
            const statusColor = d.status === "idle" ? "#888" : "#4da6ff";
            return (
              <div key={d.droneId} style={{ marginTop: i === 0 ? 4 : 8, display: "flex", flexDirection: "column", gap: 4, paddingLeft: 8, borderLeft: "2px solid rgba(77,166,255,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#888" }}>#{i + 1} ({d.droneId})</span>
                </div>
                <span>Status: <strong style={{ color: statusColor }}>{detail.label}</strong></span>
                {detail.taskGoal && (
                  <span>Aufgabe: <strong style={{ color: "#ccc" }}>{detail.taskGoal}</strong></span>
                )}
                {d.cargo && (
                  <span>Ladung: <strong>{d.cargo.amount}× {d.cargo.itemType}</strong></span>
                )}
                {/* Role selector — Tier 2+ drones can be assigned a preferred work role */}
                {tier >= 2 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ color: "#888" }}>Rolle:</span>
                    <select
                      value={d.role ?? "auto"}
                      style={{ background: "#222", color: "#ccc", border: "1px solid #444", borderRadius: 3, padding: "2px 4px", cursor: "pointer", fontSize: 12 }}
                      onChange={(e) =>
                        dispatch({ type: "DRONE_SET_ROLE", droneId: d.droneId, role: e.target.value as DroneRole })
                      }
                    >
                      <option value="auto">🔄 Auto (kein Einfluss)</option>
                      <option value="construction">🏗 Baustellen bevorzugen</option>
                      <option value="supply">📦 Lager-Nachschub bevorzugen</option>
                    </select>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: "#555" }}>
                    Rolle: Auto <span style={{ color: "#444" }}>(ab Stufe 2 konfigurierbar)</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />

        {/* ---- Zielmengen ---- */}
        {hubEntry && hubId && (
          <>
            <div style={{ fontSize: 13, color: "#aaa" }}>
              <strong style={{ color: "#eee" }}>Zielmengen <span style={{ fontSize: 11, color: "#888" }}>(max {maxStock})</span></strong>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                {RESOURCE_ORDER.map((res) => {
                  const isActive = activeResources.has(res);
                  const current = hubEntry.inventory[res] ?? 0;
                  const target = hubEntry.targetStock[res] ?? 0;
                  const demand = demandLabel(current, target);
                  return (
                    <div key={res} style={{ display: "flex", alignItems: "center", gap: 6, opacity: isActive ? 1 : 0.4 }}>
                      <span style={{ minWidth: 85 }}>{formatHubResourceLabel(res)}</span>
                      {isActive ? (
                        <>
                          <span style={{ minWidth: 30, textAlign: "right", color: current >= target ? "#4caf50" : "#ffa500" }}>
                            {current}
                          </span>
                          <span style={{ color: "#666" }}>/</span>
                          <button
                            style={{ width: 22, height: 22, padding: 0, cursor: "pointer", fontSize: 13 }}
                            onClick={() => dispatch({ type: "SET_HUB_TARGET_STOCK", hubId, resource: res, amount: target - 5 })}
                            disabled={target <= 0}
                          >−</button>
                          <span style={{ minWidth: 22, textAlign: "center" }}>{target}</span>
                          <button
                            style={{ width: 22, height: 22, padding: 0, cursor: "pointer", fontSize: 13 }}
                            onClick={() => dispatch({ type: "SET_HUB_TARGET_STOCK", hubId, resource: res, amount: target + 5 })}
                          >+</button>
                          <span style={{ fontSize: 11, color: demand.color, marginLeft: 2 }}>{demand.text}</span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: "#666", fontStyle: "italic" }}>🔒 ab Stufe 2</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "4px 0" }} />
          </>
        )}

        {/* ---- Sammel-Nodes ---- */}
        {tier === 2 && (
          <div style={{ fontSize: 13, color: "#aaa" }}>
            <strong style={{ color: "#eee" }}>Sammel-Nodes</strong>
            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
              <span>{totalNodes} Nodes, {totalItems} Items gesamt</span>
              {totalNodes > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 2 }}>
                  {RESOURCE_ORDER.map((res) => {
                    const entry = nodesByType[res];
                    if (entry.count === 0) return null;
                    return (
                      <span key={res} style={{ fontSize: 12, color: "#bbb" }}>
                        {formatHubResourceLabel(res)}: {entry.amount}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {tier === 1 && totalNodes > 0 && (
          <div style={{ fontSize: 12, color: "#777" }}>
            {totalNodes} Sammel-Node{totalNodes !== 1 ? "s" : ""} verfügbar
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from "react";
import type { GameState } from "../../store/reducer";
import { buildProductionTransparency } from "./productionTransparency";

interface ProductionStatusFeedProps {
  state: GameState;
}

const JOB_TYPE_LABEL: Record<string, string> = {
  "player-craft": "player craft",
  "keep-in-stock": "keep-in-stock",
  "automation-craft": "automation craft",
  "construction": "construction",
  "upgrade": "upgrade",
};

const STATUS_LABEL: Record<string, string> = {
  queued: "queued",
  reserved: "reserved",
  crafting: "crafting",
  delivering: "delivering",
  waiting: "waiting",
};

export const ProductionStatusFeed: React.FC<ProductionStatusFeedProps> = React.memo(({ state }) => {
  const [collapsed, setCollapsed] = useState(false);
  const snapshot = useMemo(() => buildProductionTransparency(state), [state]);
  const relevantKeepStock = snapshot.keepStock.filter(
    (row) => row.decision !== "satisfied" || row.pendingAmount > 0,
  );

  if (snapshot.jobs.length === 0 && relevantKeepStock.length === 0) return null;

  return (
    <div className="fi-production-status-feed">
      <button
        className="fi-production-status-header"
        onClick={() => setCollapsed((value) => !value)}
        title="Produktions- und Logistik-Status"
      >
        <span>Systemstatus</span>
        <span className="fi-production-status-toggle">{collapsed ? "▲" : "▼"}</span>
      </button>

      {!collapsed && (
        <div className="fi-production-status-body">
          {snapshot.jobs.length > 0 && (
            <div className="fi-production-status-section">
              <div className="fi-production-status-title">Aktive Auftraege</div>
              <div className="fi-production-status-list">
                {snapshot.jobs.slice(0, 8).map((row) => (
                  <div key={row.id} className="fi-production-status-entry">
                    <div className="fi-production-status-line">
                      <span className="fi-production-status-badge">{JOB_TYPE_LABEL[row.type] ?? row.type}</span>
                      <span className="fi-production-status-status">{STATUS_LABEL[row.status] ?? row.status}</span>
                      {row.priorityLabel && (
                        <span className="fi-production-status-priority">prio: {row.priorityLabel}</span>
                      )}
                    </div>
                    <div className="fi-production-status-line fi-production-status-line--sub">
                      <span>target: {row.targetLabel}</span>
                      {row.sourceLabel && <span>source: {row.sourceLabel}</span>}
                    </div>
                    {row.reason && (
                      <div className="fi-production-status-reason">{row.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {relevantKeepStock.length > 0 && (
            <div className="fi-production-status-section">
              <div className="fi-production-status-title">Keep-in-stock</div>
              <div className="fi-production-status-list">
                {relevantKeepStock.slice(0, 6).map((row) => (
                  <div key={row.id} className="fi-production-status-entry">
                    <div className="fi-production-status-line">
                      <span className="fi-production-status-badge">{row.itemLabel}</span>
                      <span className="fi-production-status-status">{row.decision}</span>
                    </div>
                    <div className="fi-production-status-line fi-production-status-line--sub">
                      <span>target: {row.targetAmount}</span>
                      <span>available: {row.availableAmount}</span>
                      <span>pending: {row.pendingAmount}</span>
                    </div>
                    <div className="fi-production-status-reason">{row.decisionReason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

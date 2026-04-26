import React, { useState } from "react";
import type { AutoDeliveryEntry } from "../../store/types";
import { RESOURCE_EMOJIS, RESOURCE_LABELS } from "../../store/reducer";

interface Props {
  log: AutoDeliveryEntry[];
}

const SOURCE_EMOJI: Record<AutoDeliveryEntry["sourceType"], string> = {
  auto_miner:   "⛏️",
  conveyor:     "🏭",
  auto_smelter: "🔥",
};

const SOURCE_LABEL: Record<AutoDeliveryEntry["sourceType"], string> = {
  auto_miner:   "Auto-Miner",
  conveyor:     "Förderband",
  auto_smelter: "Auto-Smelter",
};

function relativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  return `${Math.floor(diffMin / 60)}h`;
}

/** Shows the last deliveries made by auto-devices into warehouses. */
export const AutoDeliveryFeed: React.FC<Props> = React.memo(({ log }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (log.length === 0) return null;

  // Take the newest 20 raw entries and aggregate by sourceType+resource.
  // First occurrence determines stable insertion order; amounts are summed;
  // the most recent timestamp is kept for the relative-time label.
  const aggregated = [...log]
    .reverse()
    .slice(0, 20)
    .reduce<Array<{ key: string; sourceType: AutoDeliveryEntry["sourceType"]; resource: string; amount: number; timestamp: number }>>(
      (acc, entry) => {
        const key = `${entry.sourceType}:${entry.resource}`;
        const existing = acc.find((e) => e.key === key);
        if (existing) {
          existing.amount += entry.amount;
          if (entry.timestamp > existing.timestamp) existing.timestamp = entry.timestamp;
        } else {
          acc.push({ key, sourceType: entry.sourceType, resource: entry.resource, amount: entry.amount, timestamp: entry.timestamp });
        }
        return acc;
      },
      []
    )
    .slice(0, 8);

  return (
    <div className="fi-auto-delivery-feed">
      <button
        className="fi-auto-delivery-header"
        onClick={() => setCollapsed((v) => !v)}
        title="Automatische Lieferungen"
      >
        <span>🤖 Auto-Lieferungen</span>
        <span className="fi-auto-delivery-toggle">{collapsed ? "▲" : "▼"}</span>
      </button>

      {!collapsed && (
        <div className="fi-auto-delivery-list">
          {aggregated.map((entry) => (
            <div key={entry.key} className="fi-auto-delivery-entry">
              <span
                className="fi-auto-delivery-source"
                title={SOURCE_LABEL[entry.sourceType]}
              >
                {SOURCE_EMOJI[entry.sourceType]}
              </span>
              <span className="fi-auto-delivery-resource">
                {RESOURCE_EMOJIS[entry.resource] ?? "📦"}{" "}
                {RESOURCE_LABELS[entry.resource] ?? entry.resource}
              </span>
              <span className="fi-auto-delivery-amount">×{entry.amount}</span>
              <span className="fi-auto-delivery-time">{relativeTime(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

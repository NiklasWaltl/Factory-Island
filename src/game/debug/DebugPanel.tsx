// ============================================================
// Factory Island - Debug UI Panel
// ============================================================
// Floating overlay only rendered when import.meta.env.DEV is true.

import React, { useState, useEffect, useCallback, useRef } from "react";
import { IS_DEV, isDebugEnabled, setDebugEnabled } from "./debugConfig";
import {
  getLogEntries,
  subscribeLog,
  clearLogEntries,
  type LogCategory,
} from "./debugLogger";
import type { MockAction } from "./mockData";

interface DebugPanelProps {
  onMock: (action: MockAction["type"]) => void;
  onResetState: () => void;
  hmrStatus: string;
  hmrModules: string[];
}

const CATEGORY_COLORS: Record<LogCategory, string> = {
  Building: "#CD7F32",
  Inventory: "#4caf50",
  Mining: "#808080",
  Warehouse: "#DAA520",
  Hotbar: "#00bcd4",
  Smithy: "#ff6600",
  HMR: "#e040fb",
  Mock: "#ff4081",
  General: "#ccc",
};

export const DebugPanel: React.FC<DebugPanelProps> = ({
  onMock,
  onResetState,
  hmrStatus,
  hmrModules,
}) => {
  if (!IS_DEV) return null;

  const [collapsed, setCollapsed] = useState(true);
  const [tab, setTab] = useState<"cheats" | "logs" | "hmr">("cheats");
  const [, setTick] = useState(0);
  const [cheatsOn, setCheatsOn] = useState(isDebugEnabled());
  const logEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to log updates
  useEffect(() => {
    return subscribeLog(() => setTick((t) => t + 1));
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (tab === "logs") {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  const toggleCheats = useCallback(() => {
    const next = !cheatsOn;
    setCheatsOn(next);
    setDebugEnabled(next);
  }, [cheatsOn]);

  const logs = getLogEntries();

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed",
          top: 44,
          right: 10,
          zIndex: 9999,
          background: "rgba(255,0,0,0.25)",
          border: "1px solid rgba(255,0,0,0.5)",
          color: "#ff4444",
          borderRadius: 6,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        🛠 Debug
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <strong>🛠 Debug Panel</strong>
        <button onClick={() => setCollapsed(true)} style={closeBtnStyle}>
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div style={tabBarStyle}>
        {(["cheats", "logs", "hmr"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...tabBtnStyle,
              ...(tab === t ? tabBtnActiveStyle : {}),
            }}
          >
            {t === "cheats" ? "⚡ Cheats" : t === "logs" ? "📋 Logs" : "🔄 HMR"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={bodyStyle}>
        {tab === "cheats" && (
          <>
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={cheatsOn}
                onChange={toggleCheats}
              />
              <span>Debug-Logs aktiv</span>
            </label>
            <div style={sectionTitle}>Mock-Daten laden</div>
            <div style={btnGridStyle}>
              <button style={mockBtnStyle} onClick={() => onMock("DEBUG_MOCK_RESOURCES")}>
                🪵 Ressourcen (999)
              </button>
              <button style={mockBtnStyle} onClick={() => onMock("DEBUG_MOCK_DRONE_HUB_INVENTORY")}>
                🚁 Alle Drohnen-Hubs fuellen
              </button>
              <button style={mockBtnStyle} onClick={() => onMock("DEBUG_MOCK_TOOLS")}>
                🪓 Werkzeuge (alle)
              </button>
              <button style={mockBtnStyle} onClick={() => onMock("DEBUG_MOCK_BUILDINGS")}>
                🏗 Gebäude (alle)
              </button>
              <button style={mockBtnStyle} onClick={() => onMock("DEBUG_MOCK_ALL")}>
                ✨ Alles laden
              </button>
            </div>
            <hr style={hrStyle} />
            <button
              style={{ ...mockBtnStyle, background: "rgba(255,50,50,0.2)", borderColor: "rgba(255,50,50,0.4)", color: "#ff6666" }}
              onClick={onResetState}
            >
              🔄 State zurücksetzen
            </button>
          </>
        )}

        {tab === "logs" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#888" }}>
                {logs.length} Einträge
              </span>
              <button style={smallBtnStyle} onClick={clearLogEntries}>
                Löschen
              </button>
            </div>
            <div style={logContainerStyle}>
              {logs.length === 0 && (
                <div style={{ color: "#555", fontSize: 11, padding: 8 }}>
                  Keine Logs vorhanden.
                </div>
              )}
              {logs.map((entry, i) => (
                <div key={i} style={logEntryStyle}>
                  <span style={{ color: "#555", fontSize: 9, minWidth: 55 }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    style={{
                      color: CATEGORY_COLORS[entry.category],
                      fontWeight: "bold",
                      fontSize: 10,
                      minWidth: 70,
                    }}
                  >
                    [{entry.category}]
                  </span>
                  <span style={{ fontSize: 11 }}>{entry.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </>
        )}

        {tab === "hmr" && (
          <>
            <div style={rowStyle}>
              <span style={{ fontSize: 12 }}>Status:</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: "bold",
                  color: hmrStatus === "connected" ? "#4caf50" : "#ff6666",
                }}
              >
                {hmrStatus}
              </span>
            </div>
            <div style={sectionTitle}>Zuletzt nachgeladene Module</div>
            <div style={logContainerStyle}>
              {hmrModules.length === 0 && (
                <div style={{ color: "#555", fontSize: 11, padding: 8 }}>
                  Noch keine Module nachgeladen.
                </div>
              )}
              {hmrModules.map((m, i) => (
                <div key={i} style={{ fontSize: 11, padding: "2px 0", color: "#e040fb" }}>
                  🔄 {m}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---- Inline Styles (no CSS file needed, stripped in prod) ----

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 10,
  right: 10,
  zIndex: 9999,
  width: 340,
  maxHeight: "80vh",
  background: "rgba(15, 15, 20, 0.96)",
  border: "1px solid rgba(255, 0, 0, 0.35)",
  borderRadius: 12,
  fontFamily: "'Segoe UI', system-ui, monospace",
  color: "#ddd",
  fontSize: 12,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,0,0,0.08)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#ff4444",
  cursor: "pointer",
  fontSize: 14,
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  background: "none",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "#888",
  padding: "6px 0",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: "bold",
};

const tabBtnActiveStyle: React.CSSProperties = {
  color: "#ff4444",
  borderBottomColor: "#ff4444",
};

const bodyStyle: React.CSSProperties = {
  padding: 12,
  overflowY: "auto",
  flex: 1,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginTop: 10,
  marginBottom: 6,
};

const btnGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const mockBtnStyle: React.CSSProperties = {
  background: "rgba(255,215,0,0.12)",
  border: "1px solid rgba(255,215,0,0.3)",
  color: "#ffd700",
  borderRadius: 6,
  padding: "6px 8px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
};

const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  margin: "10px 0",
};

const smallBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#aaa",
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  fontSize: 10,
};

const logContainerStyle: React.CSSProperties = {
  maxHeight: 250,
  overflowY: "auto",
  background: "rgba(0,0,0,0.3)",
  borderRadius: 6,
  padding: 6,
};

const logEntryStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "baseline",
  padding: "1px 0",
  borderBottom: "1px solid rgba(255,255,255,0.03)",
};

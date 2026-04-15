import React, { useReducer, useEffect, useState, useCallback, useRef } from "react";
import {
  gameReducer,
  createInitialState,
  NATURAL_SPAWN_MS,
  SMITHY_TICK_MS,
  MANUAL_ASSEMBLER_TICK_MS,
  GENERATOR_TICK_MS,
  ENERGY_NET_TICK_MS,
  LOGISTICS_TICK_MS,
  type GameMode,
  type GameState,
  type ConveyorItem,
} from "../simulation/game";
import { ModeSelect } from "../ui/menus/ModeSelect";
import { Grid } from "../grid/Grid";
import { Hotbar } from "../ui/hud/Hotbar";
import { MapShopPanel } from "../ui/panels/MapShopPanel";
import { WorkbenchPanel } from "../ui/panels/WorkbenchPanel";
import { WarehousePanel } from "../ui/panels/WarehousePanel";
import { SmithyPanel } from "../ui/panels/SmithyPanel";
import { GeneratorPanel } from "../ui/panels/GeneratorPanel";
import { BatteryPanel } from "../ui/panels/BatteryPanel";
import { PowerPolePanel } from "../ui/panels/PowerPolePanel";
import { AutoMinerPanel } from "../ui/panels/AutoMinerPanel";
import { AutoSmelterPanel } from "../ui/panels/AutoSmelterPanel";
import { ManualAssemblerPanel } from "../ui/panels/ManualAssemblerPanel";
import { BuildMenu } from "../ui/menus/BuildMenu";
import { Notifications } from "../ui/hud/Notifications";
import { ResourceBar } from "../ui/hud/ResourceBar";
import "../ui/styles/factory-game.css";

// Debug system (tree-shaken in production)
import {
  IS_DEV,
  DebugPanel,
  applyMockToState,
  saveHmrState,
  loadHmrState,
  recordHmrModule,
  getHmrModules,
  getHmrStatus,
  debugLog,
} from "../debug";
import type { MockAction } from "../debug";

const SAVE_KEY = "factory-island-save";

function normalizeLoadedState(raw: unknown, mode: GameMode): GameState {
  const base = createInitialState(mode);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Record<string, unknown>;

  const conveyorItems: ConveyorItem[] = ["stone", "iron", "copper", "ironIngot", "copperIngot", "metalPlate", "gear"];
  const isConveyorItem = (value: unknown): value is ConveyorItem =>
    typeof value === "string" && conveyorItems.includes(value as ConveyorItem);

  const normalizedConveyors: Record<string, { queue: ConveyorItem[] }> = {};
  const conveyorsRaw = data.conveyors;
  if (conveyorsRaw && typeof conveyorsRaw === "object") {
    for (const [id, value] of Object.entries(conveyorsRaw as Record<string, unknown>)) {
      const conv = value as { queue?: unknown[]; item?: unknown } | null;
      if (conv && Array.isArray(conv.queue)) {
        normalizedConveyors[id] = { queue: conv.queue.filter(isConveyorItem) };
      } else if (conv && isConveyorItem(conv.item)) {
        normalizedConveyors[id] = { queue: [conv.item] };
      } else {
        normalizedConveyors[id] = { queue: [] };
      }
    }
  }

  const autoSmelters = data.autoSmelters && typeof data.autoSmelters === "object"
    ? Object.entries(data.autoSmelters as Record<string, unknown>).reduce((acc, [id, smelter]) => {
        const smelterObj = (smelter as any) || {};
        acc[id] = {
          ...smelterObj,
          selectedRecipe: (smelterObj.selectedRecipe === "iron" || smelterObj.selectedRecipe === "copper")
            ? smelterObj.selectedRecipe
            : "iron",
        };
        return acc;
      }, {} as GameState["autoSmelters"])
    : {};

  const machinePowerRatio = data.machinePowerRatio && typeof data.machinePowerRatio === "object"
    ? (data.machinePowerRatio as Record<string, number>)
    : {};

  return {
    ...base,
    ...data,
    conveyors: {
      ...base.conveyors,
      ...normalizedConveyors,
    },
    autoSmelters,
    selectedAutoSmelterId: (data.selectedAutoSmelterId as string | null | undefined) ?? null,
    machinePowerRatio,
  };
}

/* Error boundary to prevent white-screen crashes */
class GameErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: "#fff", background: "#1a1a2e", textAlign: "center", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2>Etwas ist schiefgelaufen</h2>
          <p style={{ color: "#aaa", maxWidth: 500 }}>{this.state.error?.message}</p>
          <button
            style={{ marginTop: 16, padding: "8px 24px", fontSize: 16, cursor: "pointer" }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onReset?.();
            }}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Inner game component that gets remounted per mode via key */
const GameInner: React.FC<{ mode: GameMode }> = ({ mode }) => {
  // Try to restore HMR state (dev), localStorage save (prod), or fresh state
  const [state, dispatch] = useReducer(
    gameReducer,
    mode,
    (m) => {
      if (IS_DEV) {
        const hmr = loadHmrState();
        if (hmr) return normalizeLoadedState(hmr, m);
      }
      try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.mode === m) return normalizeLoadedState(parsed, m);
        }
      } catch { /* corrupt save, ignore */ }
      return createInitialState(m);
    },
  );

  // Persist state for HMR on every change
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!IS_DEV) return;
    saveHmrState(state);
  }, [state]);

  // Periodic localStorage save (every 10s + on unload)
  useEffect(() => {
    const save = () => {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(stateRef.current)); } catch { /* quota */ }
    };
    const id = setInterval(save, 10_000);
    window.addEventListener("beforeunload", save);
    return () => { clearInterval(id); window.removeEventListener("beforeunload", save); };
  }, []);

  // HMR status tracking
  const [hmrModules, setHmrModules] = useState<string[]>(() =>
    IS_DEV ? getHmrModules() : [],
  );
  const [hmrStatus, setHmrStatus] = useState<string>(() =>
    IS_DEV ? getHmrStatus() : "disabled",
  );

  useEffect(() => {
    if (!IS_DEV) return;
    const id = setInterval(() => {
      setHmrModules([...getHmrModules()]);
      setHmrStatus(getHmrStatus());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // Mock data handler � dispatches directly into the reducer
  const handleMock = useCallback(
    (action: MockAction["type"]) => {
      if (!IS_DEV) return;
      if (action === "DEBUG_RESET_STATE") {
        debugLog.mock("Full state reset");
        dispatch({ type: "DEBUG_SET_STATE", state: createInitialState(mode) });
        return;
      }
      const newState = applyMockToState(stateRef.current, action);
      dispatch({ type: "DEBUG_SET_STATE", state: newState });
    },
    [mode],
  );

  // Keyboard shortcuts for hotbar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in input fields
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const idx = num - 1;
        if (idx < state.hotbarSlots.length) {
          dispatch({ type: "SET_ACTIVE_SLOT", slot: idx });
        }
      }
      if (e.key === "Escape") {
        if (state.buildMode) {
          dispatch({ type: "TOGGLE_BUILD_MODE" });
        } else {
          dispatch({ type: "CLOSE_PANEL" });
        }
      }
      if (e.key === "b" || e.key === "B") {
        dispatch({ type: "TOGGLE_BUILD_MODE" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.hotbarSlots.length, state.buildMode]);

  // Natural spawn timer
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "NATURAL_SPAWN" });
    }, NATURAL_SPAWN_MS);
    return () => clearInterval(id);
  }, []);

  // Sapling growth timer – uses ref to avoid stale closure + batch dispatch
  const saplingGrowAtRef = useRef(state.saplingGrowAt);
  saplingGrowAtRef.current = state.saplingGrowAt;

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const readyIds = Object.entries(saplingGrowAtRef.current)
        .filter(([, growAt]) => now >= growAt)
        .map(([assetId]) => assetId);
      if (readyIds.length > 0) {
        dispatch({ type: "GROW_SAPLINGS", assetIds: readyIds });
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Smithy processing tick
  useEffect(() => {
    if (!state.smithy.processing) return;
    const id = setInterval(() => {
      dispatch({ type: "SMITHY_TICK" });
    }, SMITHY_TICK_MS);
    return () => clearInterval(id);
  }, [state.smithy.processing]);

  // Manual assembler processing tick
  useEffect(() => {
    if (!state.manualAssembler.processing) return;
    const id = setInterval(() => {
      dispatch({ type: "MANUAL_ASSEMBLER_TICK" });
    }, MANUAL_ASSEMBLER_TICK_MS);
    return () => clearInterval(id);
  }, [state.manualAssembler.processing]);

  // Notification cleanup
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "EXPIRE_NOTIFICATIONS" });
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Generator tick
  useEffect(() => {
    if (!state.generator.running) return;
    const id = setInterval(() => {
      dispatch({ type: "GENERATOR_TICK" });
    }, GENERATOR_TICK_MS);
    return () => clearInterval(id);
  }, [state.generator.running]);

  // Unified energy-network balance: production � consumption ? battery
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "ENERGY_NET_TICK" });
    }, ENERGY_NET_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Logistics tick: auto-miner production + conveyor movement
  useEffect(() => {
    const id = setInterval(() => {
      dispatch({ type: "LOGISTICS_TICK" });
    }, LOGISTICS_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Grid state={state} dispatch={dispatch} />
      <ResourceBar state={state} />
      <Notifications notifications={state.notifications} />

      {state.openPanel === "map_shop" && (
        <MapShopPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "warehouse" && (
        <WarehousePanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "smithy" && (
        <SmithyPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "generator" && (
        <GeneratorPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "battery" && (
        <BatteryPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "power_pole" && (
        <PowerPolePanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "workbench" && (
        <WorkbenchPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "auto_miner" && (
        <AutoMinerPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "auto_smelter" && (
        <AutoSmelterPanel state={state} dispatch={dispatch} />
      )}
      {state.openPanel === "manual_assembler" && (
        <ManualAssemblerPanel state={state} dispatch={dispatch} />
      )}

      <Hotbar state={state} dispatch={dispatch} />

      {/* Build Mode toggle button */}
      <button
        className={`fi-build-toggle ${state.buildMode ? "fi-build-toggle--active" : ""}`}
        onClick={() => dispatch({ type: "TOGGLE_BUILD_MODE" })}
        title="Bau-Men� �ffnen/schlie�en (B)"
      >
        ??? {state.buildMode ? "Bauen ?" : "Bauen"}
      </button>

      {/* Build Menu overlay */}
      {state.buildMode && (
        <BuildMenu state={state} dispatch={dispatch} />
      )}

      {IS_DEV && state.mode === "debug" && (
        <>
          <div className="fi-debug-badge">DEBUG MODE</div>
          <DebugPanel
            onMock={handleMock}
            onResetState={() => handleMock("DEBUG_RESET_STATE")}
            hmrStatus={hmrStatus}
            hmrModules={hmrModules}
          />
        </>
      )}
    </>
  );
};

export const FactoryGame: React.FC = () => {
  const [mode, setMode] = useState<GameMode | null>(null);

  if (mode === null) {
    return (
      <div className="fi-root">
        <ModeSelect onSelect={setMode} />
      </div>
    );
  }

  return (
    <div className="fi-root">
      <GameErrorBoundary onReset={() => { try { localStorage.removeItem(SAVE_KEY); } catch {} }}>
        <GameInner key={mode} mode={mode} />
      </GameErrorBoundary>
    </div>
  );
};

export default FactoryGame;

// HMR self-accept: preserve state across hot reloads
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    recordHmrModule("FactoryGame.tsx");
  });
}

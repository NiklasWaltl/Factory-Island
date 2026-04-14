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
} from "./game";
import { ModeSelect } from "../../ui/menus/ModeSelect";
import { Grid } from "./Grid";
import { Hotbar } from "./Hotbar";
import { MapShopPanel } from "./MapShopPanel";
import { WorkbenchPanel } from "./WorkbenchPanel";
import { WarehousePanel } from "./WarehousePanel";
import { SmithyPanel } from "./SmithyPanel";
import { GeneratorPanel } from "./GeneratorPanel";
import { BatteryPanel } from "./BatteryPanel";
import { PowerPolePanel } from "./PowerPolePanel";
import { AutoMinerPanel } from "./AutoMinerPanel";
import { ManualAssemblerPanel } from "../../ui/panels/ManualAssemblerPanel";
import { BuildMenu } from "./BuildMenu";
import { Notifications } from "../../ui/hud/Notifications";
import { ResourceBar } from "../../ui/hud/ResourceBar";
import "./factory-game.css";

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
} from "./debug";
import type { MockAction } from "./debug";

/* Inner game component that gets remounted per mode via key */
const GameInner: React.FC<{ mode: GameMode }> = ({ mode }) => {
  // Try to restore HMR state, fall back to fresh state
  const [state, dispatch] = useReducer(
    gameReducer,
    mode,
    (m) => (IS_DEV ? loadHmrState() : null) ?? createInitialState(m),
  );

  // Persist state for HMR on every change
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!IS_DEV) return;
    saveHmrState(state);
  }, [state]);

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

  // Mock data handler – dispatches directly into the reducer
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

  // Sapling growth timer
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const [assetId, growAt] of Object.entries(state.saplingGrowAt)) {
        if (now >= growAt) {
          dispatch({ type: "GROW_SAPLING", assetId });
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state.saplingGrowAt]);

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

  // Unified energy-network balance: production – consumption → battery
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
      {state.openPanel === "manual_assembler" && (
        <ManualAssemblerPanel state={state} dispatch={dispatch} />
      )}

      <Hotbar state={state} dispatch={dispatch} />

      {/* Build Mode toggle button */}
      <button
        className={`fi-build-toggle ${state.buildMode ? "fi-build-toggle--active" : ""}`}
        onClick={() => dispatch({ type: "TOGGLE_BUILD_MODE" })}
        title="Bau-Menü öffnen/schließen (B)"
      >
        🏗️ {state.buildMode ? "Bauen ✕" : "Bauen"}
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
      <GameInner key={mode} mode={mode} />
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

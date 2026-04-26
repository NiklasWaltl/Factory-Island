import React, { useRef } from "react";
import { type GameState, type GameAction } from "../store/reducer";
import { useGridInput } from "./GridInput";
import { GridRenderer } from "./GridRenderer";

interface GridProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const Grid: React.FC<GridProps> = ({ state, dispatch }) => {
  const warnedUnmigratedTypesRef = useRef<Set<string>>(new Set());
  const input = useGridInput(state, dispatch);

  return (
    <div
      ref={input.containerRef}
      className="fi-grid-container"
      onMouseDown={input.onMouseDown}
      onMouseMove={input.onGridMouseMove}
      onMouseUp={input.onMouseUp}
      onMouseLeave={input.onMouseUp}
      onWheel={input.onWheel}
      onClick={input.onClick}
      onContextMenu={input.onContextMenu}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        cursor: input.dragging ? "grabbing" : "grab",
        background: "#1a3a1a",
      }}
    >
      <GridRenderer
        state={state}
        containerRef={input.containerRef}
        cam={input.cam}
        zoom={input.zoom}
        dragging={input.dragging}
        hover={input.hover}
        buildDirection={input.buildDirection}
        warnedUnmigratedTypesRef={warnedUnmigratedTypesRef}
      />
    </div>
  );
};

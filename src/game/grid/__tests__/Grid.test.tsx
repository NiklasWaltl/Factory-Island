import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Grid } from "../Grid";
import type { StaticAssetSnapshot } from "../../world/PhaserGame";
import { createInitialState } from "../../store/reducer";
import type { GameState } from "../../store/types";

let phaserHostProps: { staticAssets: StaticAssetSnapshot[] } | null = null;
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

jest.mock("../../world/PhaserHost", () => ({
  PhaserHost: (props: { staticAssets: StaticAssetSnapshot[] }) => {
    phaserHostProps = props;
    return null;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createGridState(): GameState {
  const base = createInitialState("release");

  return {
    ...base,
    assets: {
      ...base.assets,
      "grid-site": {
        id: "grid-site",
        type: "workbench",
        x: 34,
        y: 20,
        size: 2,
        width: 2,
        height: 2,
      },
      "grid-hub": {
        id: "grid-hub",
        type: "service_hub",
        x: 44,
        y: 20,
        size: 2,
        width: 2,
        height: 2,
      },
    },
    constructionSites: {
      ...base.constructionSites,
      "grid-site": {
        buildingType: "workbench",
        remaining: { wood: 5 },
      },
    },
  };
}

describe("Grid construction rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 1024,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 768,
    });
  });

  afterAll(() => {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeightDescriptor);
    }
  });

  beforeEach(() => {
    phaserHostProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("passes construction-site state and service hubs into Phaser snapshots", () => {
    act(() => {
      root.render(<Grid state={createGridState()} dispatch={jest.fn()} />);
    });

    expect(phaserHostProps).not.toBeNull();
    expect(phaserHostProps!.staticAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "grid-site",
          type: "workbench",
          isUnderConstruction: true,
        }),
        expect.objectContaining({
          id: "grid-hub",
          type: "service_hub",
        }),
      ]),
    );
  });

  it("updates Phaser snapshots when a construction site finishes", () => {
    const state = createGridState();

    act(() => {
      root.render(<Grid state={state} dispatch={jest.fn()} />);
    });

    expect(
      phaserHostProps!.staticAssets.find((asset) => asset.id === "grid-site")?.isUnderConstruction,
    ).toBe(true);

    const { ["grid-site"]: _completed, ...remainingSites } = state.constructionSites;

    act(() => {
      root.render(<Grid state={{ ...state, constructionSites: remainingSites }} dispatch={jest.fn()} />);
    });

    expect(
      phaserHostProps!.staticAssets.find((asset) => asset.id === "grid-site")?.isUnderConstruction,
    ).toBe(false);
  });
});
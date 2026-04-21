// ============================================================
// Debug fill (DEBUG_MOCK_RESOURCES) — target selection tests
// ============================================================
//
// Physical resource keys must land in real physical storage
// (warehouse → hub), never silently in state.inventory.

import { applyMockToState, MOCK_RESOURCES } from "../mockData";
import {
  createInitialState,
  type GameState,
  type Inventory,
  type ServiceHubEntry,
} from "../../store/reducer";

function emptyInv(): Inventory {
  const inv = createInitialState("release").inventory;
  for (const k of Object.keys(inv) as (keyof Inventory)[]) {
    (inv as unknown as Record<string, number>)[k] = 0;
  }
  return inv;
}

function withWarehouse(state: GameState, id: string): GameState {
  return {
    ...state,
    warehousesPlaced: state.warehousesPlaced + 1,
    warehouseInventories: { ...state.warehouseInventories, [id]: emptyInv() },
  };
}

function withHub(state: GameState, id: string): GameState {
  const hub: ServiceHubEntry = {
    inventory: { wood: 0, stone: 0, iron: 0, copper: 0 },
    targetStock: { wood: 0, stone: 0, iron: 0, copper: 0 },
    tier: 1,
    droneIds: [],
  };
  return { ...state, serviceHubs: { ...state.serviceHubs, [id]: hub } };
}

function bareState(): GameState {
  const s = createInitialState("release");
  return { ...s, inventory: emptyInv(), warehouseInventories: {}, serviceHubs: {} };
}

describe("applyMockToState / DEBUG_MOCK_RESOURCES", () => {
  it("routes physical keys into the first warehouse", () => {
    const s0 = withWarehouse(bareState(), "wh-1");
    const s1 = applyMockToState(s0, "DEBUG_MOCK_RESOURCES");
    const wh = s1.warehouseInventories["wh-1"] as unknown as Record<string, number>;
    expect(wh.wood).toBe(MOCK_RESOURCES.wood);
    expect(wh.stone).toBe(MOCK_RESOURCES.stone);
    expect(wh.iron).toBe(MOCK_RESOURCES.iron);
    expect(wh.copper).toBe(MOCK_RESOURCES.copper);
    expect(wh.ironIngot).toBe(MOCK_RESOURCES.ironIngot);
    expect(wh.copperIngot).toBe(MOCK_RESOURCES.copperIngot);
    // Physical keys must NOT also be mirrored into globalInventory.
    expect(s1.inventory.wood).toBe(0);
    expect(s1.inventory.iron).toBe(0);
  });

  it("falls back to the first service hub when no warehouse exists (collectables only)", () => {
    const s0 = withHub(bareState(), "hub-1");
    const s1 = applyMockToState(s0, "DEBUG_MOCK_RESOURCES");
    const hubInv = s1.serviceHubs["hub-1"].inventory;
    expect(hubInv.wood).toBe(MOCK_RESOURCES.wood);
    expect(hubInv.iron).toBe(MOCK_RESOURCES.iron);
    // Ingots cannot live in a hub — must be skipped, not shoved into global.
    expect(s1.inventory.ironIngot).toBe(0);
    expect(s1.inventory.copperIngot).toBe(0);
  });

  it("never silently fills globalInventory with physical keys when no storage exists", () => {
    const s0 = bareState();
    const s1 = applyMockToState(s0, "DEBUG_MOCK_RESOURCES");
    expect(s1.inventory.wood).toBe(0);
    expect(s1.inventory.stone).toBe(0);
    expect(s1.inventory.iron).toBe(0);
    expect(s1.inventory.copper).toBe(0);
    expect(s1.inventory.ironIngot).toBe(0);
    expect(s1.inventory.copperIngot).toBe(0);
    // But non-physical keys are still applied.
    expect(s1.inventory.coins).toBe(MOCK_RESOURCES.coins);
    expect(s1.inventory.sapling).toBe(MOCK_RESOURCES.sapling);
  });

  it("always applies non-physical keys (coins, sapling) to globalInventory", () => {
    const s0 = withWarehouse(bareState(), "wh-1");
    const s1 = applyMockToState(s0, "DEBUG_MOCK_RESOURCES");
    expect(s1.inventory.coins).toBe(MOCK_RESOURCES.coins);
    expect(s1.inventory.sapling).toBe(MOCK_RESOURCES.sapling);
  });
});

import type { GameState, PlacedAsset, UIPanel } from "../types";

function isUnderConstruction(
  state: Pick<GameState, "constructionSites">,
  assetId: string,
): boolean {
  return !!state.constructionSites[assetId];
}

export function tryTogglePanelFromAsset(
  state: GameState,
  asset: PlacedAsset | null,
): GameState | null {
  if (!asset) return null;
  if (isUnderConstruction(state, asset.id)) return null;

  if ((["workbench", "warehouse", "smithy", "generator", "battery", "power_pole", "manual_assembler", "service_hub"] as string[]).includes(asset.type)) {
    const panel = asset.type as UIPanel;
    if (asset.type === "warehouse") {
      const newPanel = state.openPanel === panel && state.selectedWarehouseId === asset.id ? null : panel;
      return { ...state, openPanel: newPanel, selectedWarehouseId: newPanel ? asset.id : null };
    }
    if (asset.type === "power_pole") {
      const newPanel = state.openPanel === panel ? null : panel;
      return { ...state, openPanel: newPanel, selectedPowerPoleId: newPanel ? asset.id : state.selectedPowerPoleId };
    }
    // Crafting buildings: track which specific instance is open
    if (asset.type === "workbench" || asset.type === "smithy" || asset.type === "manual_assembler") {
      const opening = state.openPanel !== panel || state.selectedCraftingBuildingId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedCraftingBuildingId: opening ? asset.id : null,
      };
    }
    if (asset.type === "generator") {
      const opening = state.openPanel !== panel || state.selectedGeneratorId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedGeneratorId: opening ? asset.id : null,
      };
    }
    if (asset.type === "service_hub") {
      const opening = state.openPanel !== panel || state.selectedServiceHubId !== asset.id;
      return {
        ...state,
        openPanel: opening ? panel : null,
        selectedServiceHubId: opening ? asset.id : null,
      };
    }
    return { ...state, openPanel: state.openPanel === panel ? null : panel };
  }

  if (asset.type === "auto_miner") {
    const opening = state.openPanel !== "auto_miner" || state.selectedAutoMinerId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_miner" : null,
      selectedAutoMinerId: opening ? asset.id : null,
    };
  }

  if (asset.type === "auto_smelter") {
    const opening = state.openPanel !== "auto_smelter" || state.selectedAutoSmelterId !== asset.id;
    return {
      ...state,
      openPanel: opening ? "auto_smelter" : null,
      selectedAutoSmelterId: opening ? asset.id : null,
    };
  }

  return null;
}

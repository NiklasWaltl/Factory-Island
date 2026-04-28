import type { GameState } from "./types";

export function isUnderConstruction(
  state: Pick<GameState, "constructionSites">,
  assetId: string,
): boolean {
  return !!state.constructionSites[assetId];
}

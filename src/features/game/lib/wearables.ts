import { BumpkinItem } from "../types/bumpkin";
import { GameState } from "../types/game";

export function isWearableActive({
  game,
  name,
}: {
  game: GameState;
  name: BumpkinItem;
}) {
  if (Object.values(game.bumpkin?.equipped ?? {}).includes(name)) {
    return true;
  }

  return Object.values(game.farmHands.bumpkins).some((bumpkin) =>
    Object.values(bumpkin.equipped).includes(name),
  );
}

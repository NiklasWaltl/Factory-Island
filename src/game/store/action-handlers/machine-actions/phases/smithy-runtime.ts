// Shared runtime helper for smithy phases.
// Lives outside the input/lifecycle phase files because it is only
// consumed by the lifecycle phase but logically not owned by either.

import type { GameState } from "../../../types";

export type SmithyRuntimeContext = {
  smithyPowered: boolean;
  rawAmt: number;
};

export function deriveSmithyRuntimeContext(input: {
  selectedRecipe: GameState["smithy"]["selectedRecipe"];
  iron: number;
  copper: number;
  poweredMachineIds: string[] | undefined;
  smithyAssetId: string;
}): SmithyRuntimeContext {
  const { selectedRecipe, iron, copper, poweredMachineIds, smithyAssetId } = input;
  return {
    smithyPowered: (poweredMachineIds ?? []).includes(smithyAssetId),
    rawAmt: selectedRecipe === "iron" ? iron : copper,
  };
}

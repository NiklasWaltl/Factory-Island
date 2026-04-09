import React, { useMemo } from "react";
import Decimal from "decimal.js-light";

import { Box } from "components/ui/Box";
import { Button } from "components/ui/Button";
import { InnerPanel } from "components/ui/Panel";
import { Label } from "components/ui/Label";
import { RequirementLabel } from "components/ui/RequirementsLabel";
import { getFishBaseXP, isFishName } from "features/game/types/aging";
import {
  getBoostedAgingFishCost,
  getBoostedAgingSaltCost,
  getBoostedAgingTimeMs,
} from "features/game/types/agingFormulas";
import type { FishName } from "features/game/types/fishing";
import type {
  GameState,
  Inventory,
  InventoryItemName,
} from "features/game/types/game";
import { ITEM_DETAILS } from "features/game/types/images";
import {
  getBasketItems,
  getChestItems,
} from "features/island/hud/components/inventory/utils/inventory";
import { useAppTranslation } from "lib/i18n/useAppTranslations";
import { secondsToString } from "lib/utils/time";
import { getObjectEntries } from "lib/object";
import { SUNNYSIDE } from "assets/sunnyside";

function getMergedInventory(state: GameState): Inventory {
  return {
    ...getBasketItems(state.inventory),
    ...getChestItems(state),
  };
}

function hasEnoughAgingIngredients(
  merged: Inventory,
  fishName: FishName,
  gameState: GameState,
): boolean {
  const baseXP = getFishBaseXP(fishName);
  const saltCost = getBoostedAgingSaltCost(baseXP, gameState);
  const fishCost = getBoostedAgingFishCost(gameState);
  return (
    (merged["Salt"]?.gte(saltCost) && merged[fishName]?.gte(fishCost)) ?? false
  );
}

type Props = {
  gameState: GameState;
  selectedFish?: FishName;
  onSelectFish: (fish: FishName) => void;
  onStart: () => void;
  startDisabled: boolean;
  validationMessage?: string;
  startError?: string;
};

export const AgingRackEmpty: React.FC<Props> = ({
  gameState,
  selectedFish,
  onSelectFish,
  onStart,
  startDisabled,
  validationMessage,
  startError,
}) => {
  const { t } = useAppTranslation();
  const merged = useMemo(() => getMergedInventory(gameState), [gameState]);

  const fishOptions = useMemo(() => {
    return getObjectEntries(merged)
      .filter((entry): entry is [FishName, Decimal | undefined] => {
        const [name, qty] = entry;
        return isFishName(name) && (qty?.gte(1) ?? false);
      })
      .sort((a, b) => {
        const durationA = getBoostedAgingTimeMs(getFishBaseXP(a[0]), gameState);
        const durationB = getBoostedAgingTimeMs(getFishBaseXP(b[0]), gameState);
        return durationA - durationB;
      })
      .map(([fishName]) => {
        const baseXP = getFishBaseXP(fishName);
        const saltCost = getBoostedAgingSaltCost(baseXP, gameState);
        const timeMs = getBoostedAgingTimeMs(baseXP, gameState);
        return {
          value: fishName,
          icon: ITEM_DETAILS[fishName]?.image,
          detail: `${saltCost} Salt · ${secondsToString(timeMs / 1000, { length: "medium" })}`,
        };
      });
  }, [merged, gameState]);

  const recipeDef = selectedFish
    ? {
        saltCost: getBoostedAgingSaltCost(
          getFishBaseXP(selectedFish),
          gameState,
        ),
        fishCost: getBoostedAgingFishCost(gameState),
        timeMs: getBoostedAgingTimeMs(getFishBaseXP(selectedFish), gameState),
      }
    : undefined;

  return (
    <>
      <InnerPanel className="mb-1">
        <Label
          type={selectedFish ? "info" : "default"}
          className="text-xs mb-2 ml-1"
          icon={selectedFish && ITEM_DETAILS[selectedFish]?.image}
        >
          {selectedFish ?? t("agingShed.agingRack.selectFish")}
        </Label>
        <div className="flex flex-wrap gap-1 px-1 pb-1 overflow-auto max-h-48 scrollable items-start">
          {fishOptions.map((opt) => {
            const fishName = opt.value;

            return (
              <div
                key={fishName}
                className="flex flex-col items-center shrink-0 max-w-[72px]"
              >
                <Box
                  image={opt.icon}
                  hideCount
                  isSelected={selectedFish === fishName}
                  onClick={() => onSelectFish(fishName)}
                  secondaryImage={
                    hasEnoughAgingIngredients(merged, fishName, gameState)
                      ? SUNNYSIDE.icons.confirm
                      : SUNNYSIDE.icons.cancel
                  }
                />
              </div>
            );
          })}
        </div>
      </InnerPanel>

      {selectedFish && recipeDef && (
        <InnerPanel className="mb-1">
          <Label type="default" className="text-xs mb-2 ml-1">
            {t("agingShed.agingRack.requirements")}
          </Label>
          <div className="flex flex-wrap p-2 gap-2">
            <RequirementLabel
              type="item"
              item={"Salt" as InventoryItemName}
              balance={merged["Salt"] ?? new Decimal(0)}
              requirement={new Decimal(recipeDef.saltCost)}
            />
            <RequirementLabel
              type="item"
              item={selectedFish as InventoryItemName}
              balance={merged[selectedFish] ?? new Decimal(0)}
              requirement={new Decimal(recipeDef.fishCost)}
            />
            <RequirementLabel
              type="time"
              waitSeconds={recipeDef.timeMs / 1000}
            />
          </div>
        </InnerPanel>
      )}

      {validationMessage && (
        <Label type="danger" className="text-xs px-1 mb-1">
          {validationMessage}
        </Label>
      )}
      {startError && (
        <Label type="danger" className="text-xs px-1 mb-1">
          {startError}
        </Label>
      )}

      <Button disabled={startDisabled} onClick={onStart}>
        {t("agingShed.agingRack.startAging")}
      </Button>
    </>
  );
};

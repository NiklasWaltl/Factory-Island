import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  CollectionNode,
  DroneRole,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import { gatherWarehouseBuildingSupplyCandidates } from "../candidates/building-supply-warehouse-source-candidates";
import { gatherConstructionSupplyCandidates } from "../candidates/construction-supply-candidates";
import { gatherGroundBuildingSupplyCandidates } from "../candidates/ground-building-supply-candidates";
import { gatherHubBuildingSupplyCandidates } from "../candidates/hub-building-supply-candidates";
import { gatherHubDispatchCandidates } from "../candidates/hub-dispatch-candidates";
import { gatherHubRestockCandidates } from "../candidates/hub-restock-candidates";
import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_ROLE_BONUS,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  scoreDroneTask,
  DRONE_STICKY_BONUS,
  DRONE_URGENCY_BONUS_MAX,
  DRONE_WAREHOUSE_PRIORITY_BONUS,
} from "../candidates/scoring";
import type { DroneSelectionCandidate } from "../candidates/types";
import { gatherWarehouseConstructionCandidates } from "../candidates/warehouse-construction-candidates";
import { gatherWorkbenchInputCandidates } from "../candidates/workbench-input-candidates";
import { gatherWorkbenchOutputDeliveryCandidates } from "../candidates/workbench-output-delivery-candidates";
import {
  getAssignedBuildingSupplyDroneCount,
  getAssignedConstructionDroneCount,
  getAssignedWorkbenchDeliveryDroneCount,
  getAssignedWorkbenchInputDroneCount,
  getOpenBuildingSupplyDroneSlots,
  getOpenConstructionDroneSlots,
  getOpenHubRestockDroneSlots,
  getRemainingBuildingInputDemand,
  getRemainingConstructionNeed,
  getRemainingHubRestockNeed,
  getWorkbenchJobInputAmount,
} from "./helpers/need-slot-resolvers";

interface NearbyWarehouseDispatchCandidate {
  readonly warehouseId: string;
  readonly x: number;
  readonly y: number;
  readonly available: number;
  readonly distance: number;
}

export interface SelectDroneTaskDeps {
  getAvailableHubDispatchSupply: (
    state: Pick<GameState, "drones" | "serviceHubs" | "constructionSites">,
    hubId: string,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => number;
  getNearbyWarehousesForDispatch: (
    state: GameState,
    fromX: number,
    fromY: number,
    itemType: CollectableItemType,
    excludeDroneId?: string,
  ) => NearbyWarehouseDispatchCandidate[];
  getBuildingInputTargets: (
    state: Pick<GameState, "assets">,
  ) => { assetId: string; resource: CollectableItemType; capacity: number }[];
  isUnderConstruction: (state: Pick<GameState, "constructionSites">, assetId: string) => boolean;
  hasCompleteWorkbenchInput: (job: CraftingJob) => boolean;
  isCollectableCraftingItem: (
    itemId: CraftingJob["ingredients"][number]["itemId"],
  ) => itemId is CollectableItemType;
  resolveWorkbenchInputPickup: (
    state: Pick<GameState, "assets" | "warehouseInventories" | "serviceHubs" | "network">,
    job: CraftingJob,
    reservation: {
      id: string;
      itemId: CraftingJob["ingredients"][number]["itemId"];
      amount: number;
    },
  ) => { x: number; y: number; sourceKind: "warehouse" | "hub"; sourceId: string } | null;
}

export type SelectedDroneTask = {
  taskType: DroneTaskType;
  nodeId: string;
  deliveryTargetId: string;
};

/**
 * Selects the highest-scoring drone task from all valid candidates.
 *
 * Scoring: score = BASE_PRIORITY[taskType] - chebyshevDistanceDroneToNode + bonuses
 */
export function selectDroneTask(
  state: GameState,
  droneOverride: StarterDroneState | undefined,
  deps: SelectDroneTaskDeps,
): SelectedDroneTask | null {
  type TopDroneCandidateSelectionDecision = {
    selected: DroneSelectionCandidate | null;
    bestConstruction?: DroneSelectionCandidate;
    bestHubRestock?: DroneSelectionCandidate;
  };

  const decideTopDroneCandidateSelection = (
    candidates: DroneSelectionCandidate[],
  ): TopDroneCandidateSelectionDecision => {
    if (candidates.length === 0) {
      return { selected: null };
    }

    const rankedCandidates = [...candidates].sort(
      (left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId),
    );

    return {
      selected: rankedCandidates[0] ?? null,
      bestConstruction: rankedCandidates.find(
        (candidate) => candidate.taskType === "construction_supply" || candidate.taskType === "hub_dispatch",
      ),
      bestHubRestock: rankedCandidates.find((candidate) => candidate.taskType === "hub_restock"),
    };
  };

  const drone = droneOverride ?? state.starterDrone;
  const role: DroneRole = drone.role ?? "auto";

  const availableNodes = Object.values(state.collectionNodes).filter(
    (node) => node.amount > 0 && (node.reservedByDroneId === null || node.reservedByDroneId === drone.droneId),
  );

  const availableTypes = new Set<CollectableItemType>();
  for (const node of availableNodes) availableTypes.add(node.itemType);

  const constructionRoleBonus = role === "construction" ? DRONE_ROLE_BONUS : 0;
  const restockRoleBonus = role === "supply" ? DRONE_ROLE_BONUS : 0;
  const collectDroneTaskCandidates = (input: {
    state: GameState;
    drone: StarterDroneState;
    availableNodes: CollectionNode[];
    availableTypes: Set<CollectableItemType>;
    constructionRoleBonus: number;
    restockRoleBonus: number;
    deps: SelectDroneTaskDeps;
  }): DroneSelectionCandidate[] => {
    const {
      state,
      drone,
      availableNodes,
      availableTypes,
      constructionRoleBonus,
      restockRoleBonus,
      deps,
    } = input;

    const candidates: DroneSelectionCandidate[] = [];

    candidates.push(
      ...gatherConstructionSupplyCandidates(
        state,
        drone,
        availableNodes,
        availableTypes,
        constructionRoleBonus,
        {
          demandBonusMax: DRONE_DEMAND_BONUS_MAX,
          stickyBonus: DRONE_STICKY_BONUS,
          spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
        },
        {
          getOpenConstructionDroneSlots,
          getAssignedConstructionDroneCount,
          getRemainingConstructionNeed,
          scoreDroneTask,
        },
      ),
    );

    const hubEntry = drone.hubId ? state.serviceHubs[drone.hubId] ?? null : null;
    if (hubEntry && drone.hubId) {
      candidates.push(
        ...gatherHubRestockCandidates(
          state,
          drone,
          drone.hubId,
          availableNodes,
          restockRoleBonus,
          {
            stickyBonus: DRONE_STICKY_BONUS,
            urgencyBonusMax: DRONE_URGENCY_BONUS_MAX,
          },
          {
            getRemainingHubRestockNeed,
            getOpenHubRestockDroneSlots,
            scoreDroneTask,
          },
        ),
      );
    }

    if (hubEntry && drone.hubId) {
      candidates.push(
        ...gatherHubDispatchCandidates(
          state,
          drone,
          constructionRoleBonus,
          {
            demandBonusMax: DRONE_DEMAND_BONUS_MAX,
            stickyBonus: DRONE_STICKY_BONUS,
            spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
          },
          {
            getOpenConstructionDroneSlots,
            getAssignedConstructionDroneCount,
            getRemainingConstructionNeed,
            getAvailableHubDispatchSupply: deps.getAvailableHubDispatchSupply,
            scoreDroneTask,
          },
        ),
      );
    }

    candidates.push(
      ...gatherWarehouseConstructionCandidates(
        state,
        drone,
        constructionRoleBonus,
        {
          demandBonusMax: DRONE_DEMAND_BONUS_MAX,
          stickyBonus: DRONE_STICKY_BONUS,
          spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
          warehousePriorityBonus: DRONE_WAREHOUSE_PRIORITY_BONUS,
        },
        {
          getOpenConstructionDroneSlots,
          getAssignedConstructionDroneCount,
          getRemainingConstructionNeed,
          getNearbyWarehousesForDispatch: deps.getNearbyWarehousesForDispatch,
          scoreDroneTask,
        },
      ),
    );

    candidates.push(
      ...gatherGroundBuildingSupplyCandidates(
        state,
        drone,
        availableNodes,
        availableTypes,
        {
          demandBonusMax: DRONE_DEMAND_BONUS_MAX,
          stickyBonus: DRONE_STICKY_BONUS,
          spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
        },
        {
          getBuildingInputTargets: deps.getBuildingInputTargets,
          isUnderConstruction: deps.isUnderConstruction,
          getRemainingBuildingInputDemand,
          getOpenBuildingSupplyDroneSlots,
          getAssignedBuildingSupplyDroneCount,
          scoreDroneTask,
        },
      ),
    );

    if (hubEntry && drone.hubId) {
      candidates.push(
        ...gatherHubBuildingSupplyCandidates(
          state,
          drone,
          {
            demandBonusMax: DRONE_DEMAND_BONUS_MAX,
            stickyBonus: DRONE_STICKY_BONUS,
            spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
          },
          {
            getBuildingInputTargets: deps.getBuildingInputTargets,
            isUnderConstruction: deps.isUnderConstruction,
            getRemainingBuildingInputDemand,
            getOpenBuildingSupplyDroneSlots,
            getAvailableHubDispatchSupply: deps.getAvailableHubDispatchSupply,
            getAssignedBuildingSupplyDroneCount,
            scoreDroneTask,
          },
        ),
      );
    }

    candidates.push(
      ...gatherWarehouseBuildingSupplyCandidates(
        state,
        drone,
        {
          demandBonusMax: DRONE_DEMAND_BONUS_MAX,
          stickyBonus: DRONE_STICKY_BONUS,
          spreadPenaltyPerDrone: DRONE_SPREAD_PENALTY_PER_DRONE,
          warehousePriorityBonus: DRONE_WAREHOUSE_PRIORITY_BONUS,
        },
        {
          getBuildingInputTargets: deps.getBuildingInputTargets,
          isUnderConstruction: deps.isUnderConstruction,
          getRemainingBuildingInputDemand,
          getOpenBuildingSupplyDroneSlots,
          getAssignedBuildingSupplyDroneCount,
          getNearbyWarehousesForDispatch: deps.getNearbyWarehousesForDispatch,
          scoreDroneTask,
        },
      ),
    );

    candidates.push(
      ...gatherWorkbenchInputCandidates(
        state,
        drone,
        { stickyBonus: DRONE_STICKY_BONUS },
        {
          hasCompleteWorkbenchInput: deps.hasCompleteWorkbenchInput,
          isCollectableCraftingItem: deps.isCollectableCraftingItem,
          getWorkbenchJobInputAmount,
          getAssignedWorkbenchInputDroneCount,
          resolveWorkbenchInputPickup: deps.resolveWorkbenchInputPickup,
          scoreDroneTask,
        },
      ),
    );

    candidates.push(
      ...gatherWorkbenchOutputDeliveryCandidates(
        state,
        drone,
        { stickyBonus: DRONE_STICKY_BONUS },
        {
          getAssignedWorkbenchDeliveryDroneCount,
          scoreDroneTask,
        },
      ),
    );

    if (!drone.hubId || !hubEntry) {
      for (const node of availableNodes) {
        const stickyBonus = node.reservedByDroneId === drone.droneId ? DRONE_STICKY_BONUS : 0;
        candidates.push({
          taskType: "hub_restock",
          nodeId: node.id,
          deliveryTargetId: "",
          score: scoreDroneTask("hub_restock", drone.tileX, drone.tileY, node.tileX, node.tileY, {
            role: restockRoleBonus,
            sticky: stickyBonus,
          }),
          _roleBonus: restockRoleBonus,
          _stickyBonus: stickyBonus,
          _urgencyBonus: 0,
          _demandBonus: 0,
          _spreadPenalty: 0,
        });
      }
    }

    return candidates;
  };

  const candidates = collectDroneTaskCandidates({
    state,
    drone,
    availableNodes,
    availableTypes,
    constructionRoleBonus,
    restockRoleBonus,
    deps,
  });

  const {
    selected: chosen,
    bestConstruction: bestConstructionCandidate,
    bestHubRestock: bestHubRestockCandidate,
  } = decideTopDroneCandidateSelection(candidates);

  if (!chosen) return null;

  if (import.meta.env.DEV) {
    console.debug(
      `[DroneTask] drone=${drone.droneId} role=${role} chose ${chosen.taskType}` +
        ` node=${chosen.nodeId} target=${chosen.deliveryTargetId}` +
        ` score=${chosen.score}` +
        ` (+role:${chosen._roleBonus} +sticky:${chosen._stickyBonus} +urgency:${chosen._urgencyBonus}` +
        ` +demand:${chosen._demandBonus} spread:${chosen._spreadPenalty})` +
        ` (from ${candidates.length} candidates)`,
    );

    if (
      bestHubRestockCandidate &&
      (chosen.taskType === "construction_supply" || chosen.taskType === "hub_dispatch")
    ) {
      console.debug(
        `[DroneTaskPriority] drone=${drone.droneId} construction wins over hub_restock` +
          ` chosen=${chosen.taskType}:${chosen.nodeId}->${chosen.deliveryTargetId}` +
          ` chosenScore=${chosen.score}` +
          ` hubNode=${bestHubRestockCandidate.nodeId}` +
          ` hubScore=${bestHubRestockCandidate.score}` +
          ` diff=${chosen.score - bestHubRestockCandidate.score}`,
      );
    } else if (chosen.taskType === "hub_restock" && !bestConstructionCandidate) {
      console.debug(
        `[DroneTaskPriority] drone=${drone.droneId} hub_restock fallback` +
          ` node=${chosen.nodeId}` +
          ` target=${chosen.deliveryTargetId}` +
          ` score=${chosen.score}` +
          ` noConstructionCandidate=true`,
      );
    }
  }

  return { taskType: chosen.taskType, nodeId: chosen.nodeId, deliveryTargetId: chosen.deliveryTargetId };
}

import type { CraftingJob } from "../../crafting/types";
import type {
  CollectableItemType,
  CollectionNode,
  DroneRole,
  DroneTaskType,
  GameState,
  StarterDroneState,
} from "../../store/types";
import type { gatherWarehouseBuildingSupplyCandidates } from "../candidates/building-supply-warehouse-source-candidates";
import type { gatherConstructionSupplyCandidates } from "../candidates/construction-supply-candidates";
import type { gatherGroundBuildingSupplyCandidates } from "../candidates/ground-building-supply-candidates";
import type { gatherHubBuildingSupplyCandidates } from "../candidates/hub-building-supply-candidates";
import type { gatherHubDispatchCandidates } from "../candidates/hub-dispatch-candidates";
import type { gatherHubRestockCandidates } from "../candidates/hub-restock-candidates";
import type { scoreDroneTask } from "../candidates/score-drone-task";
import type { DroneSelectionCandidate } from "../candidates/types";
import type { gatherWarehouseConstructionCandidates } from "../candidates/warehouse-construction-candidates";
import type { gatherWorkbenchInputCandidates } from "../candidates/workbench-input-candidates";
import type { gatherWorkbenchOutputDeliveryCandidates } from "../candidates/workbench-output-delivery-candidates";
import type { NeedSlotResolverDeps } from "./helpers/need-slot-resolvers";

interface NearbyWarehouseDispatchCandidate {
  readonly warehouseId: string;
  readonly x: number;
  readonly y: number;
  readonly available: number;
  readonly distance: number;
}

export interface SelectDroneTaskDeps extends NeedSlotResolverDeps {
  roleBonus: number;
  stickyBonus: number;
  urgencyBonusMax: number;
  demandBonusMax: number;
  spreadPenaltyPerDrone: number;
  warehousePriorityBonus: number;
  gatherConstructionSupplyCandidates: typeof gatherConstructionSupplyCandidates;
  gatherHubRestockCandidates: typeof gatherHubRestockCandidates;
  gatherHubDispatchCandidates: typeof gatherHubDispatchCandidates;
  gatherWarehouseConstructionCandidates: typeof gatherWarehouseConstructionCandidates;
  gatherGroundBuildingSupplyCandidates: typeof gatherGroundBuildingSupplyCandidates;
  gatherHubBuildingSupplyCandidates: typeof gatherHubBuildingSupplyCandidates;
  gatherWarehouseBuildingSupplyCandidates: typeof gatherWarehouseBuildingSupplyCandidates;
  gatherWorkbenchInputCandidates: typeof gatherWorkbenchInputCandidates;
  gatherWorkbenchOutputDeliveryCandidates: typeof gatherWorkbenchOutputDeliveryCandidates;
  scoreDroneTask: typeof scoreDroneTask;
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
  const drone = droneOverride ?? state.starterDrone;
  const role: DroneRole = drone.role ?? "auto";

  const availableNodes = Object.values(state.collectionNodes).filter(
    (node) => node.amount > 0 && (node.reservedByDroneId === null || node.reservedByDroneId === drone.droneId),
  );

  const availableTypes = new Set<CollectableItemType>();
  for (const node of availableNodes) availableTypes.add(node.itemType);

  const candidates: DroneSelectionCandidate[] = [];

  const constructionRoleBonus = role === "construction" ? deps.roleBonus : 0;
  const restockRoleBonus = role === "supply" ? deps.roleBonus : 0;

  candidates.push(
    ...deps.gatherConstructionSupplyCandidates(
      state,
      drone,
      availableNodes,
      availableTypes,
      constructionRoleBonus,
      {
        demandBonusMax: deps.demandBonusMax,
        stickyBonus: deps.stickyBonus,
        spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
      },
      {
        getOpenConstructionDroneSlots: deps.getOpenConstructionDroneSlots,
        getAssignedConstructionDroneCount: deps.getAssignedConstructionDroneCount,
        getRemainingConstructionNeed: deps.getRemainingConstructionNeed,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  const hubEntry = drone.hubId ? state.serviceHubs[drone.hubId] ?? null : null;
  if (hubEntry && drone.hubId) {
    candidates.push(
      ...deps.gatherHubRestockCandidates(
        state,
        drone,
        drone.hubId,
        availableNodes,
        restockRoleBonus,
        {
          stickyBonus: deps.stickyBonus,
          urgencyBonusMax: deps.urgencyBonusMax,
        },
        {
          getRemainingHubRestockNeed: deps.getRemainingHubRestockNeed,
          getOpenHubRestockDroneSlots: deps.getOpenHubRestockDroneSlots,
          scoreDroneTask: deps.scoreDroneTask,
        },
      ),
    );
  }

  if (hubEntry && drone.hubId) {
    candidates.push(
      ...deps.gatherHubDispatchCandidates(
        state,
        drone,
        constructionRoleBonus,
        {
          demandBonusMax: deps.demandBonusMax,
          stickyBonus: deps.stickyBonus,
          spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
        },
        {
          getOpenConstructionDroneSlots: deps.getOpenConstructionDroneSlots,
          getAssignedConstructionDroneCount: deps.getAssignedConstructionDroneCount,
          getRemainingConstructionNeed: deps.getRemainingConstructionNeed,
          getAvailableHubDispatchSupply: deps.getAvailableHubDispatchSupply,
          scoreDroneTask: deps.scoreDroneTask,
        },
      ),
    );
  }

  candidates.push(
    ...deps.gatherWarehouseConstructionCandidates(
      state,
      drone,
      constructionRoleBonus,
      {
        demandBonusMax: deps.demandBonusMax,
        stickyBonus: deps.stickyBonus,
        spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
        warehousePriorityBonus: deps.warehousePriorityBonus,
      },
      {
        getOpenConstructionDroneSlots: deps.getOpenConstructionDroneSlots,
        getAssignedConstructionDroneCount: deps.getAssignedConstructionDroneCount,
        getRemainingConstructionNeed: deps.getRemainingConstructionNeed,
        getNearbyWarehousesForDispatch: deps.getNearbyWarehousesForDispatch,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  candidates.push(
    ...deps.gatherGroundBuildingSupplyCandidates(
      state,
      drone,
      availableNodes,
      availableTypes,
      {
        demandBonusMax: deps.demandBonusMax,
        stickyBonus: deps.stickyBonus,
        spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
      },
      {
        getBuildingInputTargets: deps.getBuildingInputTargets,
        isUnderConstruction: deps.isUnderConstruction,
        getRemainingBuildingInputDemand: deps.getRemainingBuildingInputDemand,
        getOpenBuildingSupplyDroneSlots: deps.getOpenBuildingSupplyDroneSlots,
        getAssignedBuildingSupplyDroneCount: deps.getAssignedBuildingSupplyDroneCount,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  if (hubEntry && drone.hubId) {
    candidates.push(
      ...deps.gatherHubBuildingSupplyCandidates(
        state,
        drone,
        {
          demandBonusMax: deps.demandBonusMax,
          stickyBonus: deps.stickyBonus,
          spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
        },
        {
          getBuildingInputTargets: deps.getBuildingInputTargets,
          isUnderConstruction: deps.isUnderConstruction,
          getRemainingBuildingInputDemand: deps.getRemainingBuildingInputDemand,
          getOpenBuildingSupplyDroneSlots: deps.getOpenBuildingSupplyDroneSlots,
          getAvailableHubDispatchSupply: deps.getAvailableHubDispatchSupply,
          getAssignedBuildingSupplyDroneCount: deps.getAssignedBuildingSupplyDroneCount,
          scoreDroneTask: deps.scoreDroneTask,
        },
      ),
    );
  }

  candidates.push(
    ...deps.gatherWarehouseBuildingSupplyCandidates(
      state,
      drone,
      {
        demandBonusMax: deps.demandBonusMax,
        stickyBonus: deps.stickyBonus,
        spreadPenaltyPerDrone: deps.spreadPenaltyPerDrone,
        warehousePriorityBonus: deps.warehousePriorityBonus,
      },
      {
        getBuildingInputTargets: deps.getBuildingInputTargets,
        isUnderConstruction: deps.isUnderConstruction,
        getRemainingBuildingInputDemand: deps.getRemainingBuildingInputDemand,
        getOpenBuildingSupplyDroneSlots: deps.getOpenBuildingSupplyDroneSlots,
        getAssignedBuildingSupplyDroneCount: deps.getAssignedBuildingSupplyDroneCount,
        getNearbyWarehousesForDispatch: deps.getNearbyWarehousesForDispatch,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  candidates.push(
    ...deps.gatherWorkbenchInputCandidates(
      state,
      drone,
      { stickyBonus: deps.stickyBonus },
      {
        hasCompleteWorkbenchInput: deps.hasCompleteWorkbenchInput,
        isCollectableCraftingItem: deps.isCollectableCraftingItem,
        getWorkbenchJobInputAmount: deps.getWorkbenchJobInputAmount,
        getAssignedWorkbenchInputDroneCount: deps.getAssignedWorkbenchInputDroneCount,
        resolveWorkbenchInputPickup: deps.resolveWorkbenchInputPickup,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  candidates.push(
    ...deps.gatherWorkbenchOutputDeliveryCandidates(
      state,
      drone,
      { stickyBonus: deps.stickyBonus },
      {
        getAssignedWorkbenchDeliveryDroneCount: deps.getAssignedWorkbenchDeliveryDroneCount,
        scoreDroneTask: deps.scoreDroneTask,
      },
    ),
  );

  if (!drone.hubId || !hubEntry) {
    for (const node of availableNodes) {
      const stickyBonus = node.reservedByDroneId === drone.droneId ? deps.stickyBonus : 0;
      candidates.push({
        taskType: "hub_restock",
        nodeId: node.id,
        deliveryTargetId: "",
        score: deps.scoreDroneTask("hub_restock", drone.tileX, drone.tileY, node.tileX, node.tileY, {
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

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId));
  const chosen = candidates[0];
  const bestConstructionCandidate = candidates.find(
    (candidate) => candidate.taskType === "construction_supply" || candidate.taskType === "hub_dispatch",
  );
  const bestHubRestockCandidate = candidates.find((candidate) => candidate.taskType === "hub_restock");

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

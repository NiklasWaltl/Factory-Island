import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
} from "../../constants/drone-config";
import { decideConstructionDispatchPlanningActions } from "../construction-dispatch-planning";

describe("decideConstructionDispatchPlanningActions", () => {
  it("returns no actions when there are no open slots", () => {
    const actions = decideConstructionDispatchPlanningActions({
      droneTileX: 10,
      droneTileY: 10,
      roleBonus: 30,
      stickyNodeId: null,
      siteId: "site-1",
      hubId: "hub-1",
      hubTileX: 5,
      hubTileY: 5,
      openSlots: 0,
      assignedConstructionDrones: 0,
      needs: [
        {
          itemType: "wood",
          remainingNeed: 5,
          availableHubSupply: 5,
        },
      ],
    });

    expect(actions).toEqual([]);
  });

  it("queues hub_dispatch candidate with expected score components", () => {
    const actions = decideConstructionDispatchPlanningActions({
      droneTileX: 10,
      droneTileY: 10,
      roleBonus: 30,
      stickyNodeId: "hub:hub-1:wood",
      siteId: "site-1",
      hubId: "hub-1",
      hubTileX: 7,
      hubTileY: 8,
      openSlots: 2,
      assignedConstructionDrones: 2,
      needs: [
        {
          itemType: "wood",
          remainingNeed: 999,
          availableHubSupply: 3,
        },
      ],
    });

    const demandBonus = DRONE_DEMAND_BONUS_MAX;
    const spreadPenalty = -DRONE_SPREAD_PENALTY_PER_DRONE * 2;
    const stickyBonus = DRONE_STICKY_BONUS;
    const distance = 3; // Chebyshev distance from (10,10) -> (7,8)
    const expectedScore =
      DRONE_TASK_BASE_SCORE.hub_dispatch +
      30 +
      stickyBonus +
      demandBonus +
      spreadPenalty -
      distance;

    expect(actions).toEqual([
      {
        type: "queue_hub_dispatch_candidate",
        candidate: {
          taskType: "hub_dispatch",
          nodeId: "hub:hub-1:wood",
          deliveryTargetId: "site-1",
          score: expectedScore,
          _roleBonus: 30,
          _stickyBonus: stickyBonus,
          _urgencyBonus: 0,
          _demandBonus: demandBonus,
          _spreadPenalty: spreadPenalty,
        },
      },
    ]);
  });

  it("skips needs with zero need or zero hub supply", () => {
    const actions = decideConstructionDispatchPlanningActions({
      droneTileX: 0,
      droneTileY: 0,
      roleBonus: 0,
      stickyNodeId: null,
      siteId: "site-1",
      hubId: "hub-1",
      hubTileX: 1,
      hubTileY: 1,
      openSlots: 1,
      assignedConstructionDrones: 0,
      needs: [
        {
          itemType: "wood",
          remainingNeed: 0,
          availableHubSupply: 10,
        },
        {
          itemType: "stone",
          remainingNeed: 3,
          availableHubSupply: 0,
        },
        {
          itemType: "iron",
          remainingNeed: 2,
          availableHubSupply: 2,
        },
      ],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].candidate.nodeId).toBe("hub:hub-1:iron");
  });
});

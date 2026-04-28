import {
  DRONE_DEMAND_BONUS_MAX,
  DRONE_SPREAD_PENALTY_PER_DRONE,
  DRONE_STICKY_BONUS,
  DRONE_TASK_BASE_SCORE,
} from "../../constants/drone-config";
import { decideConstructionPlanningActions } from "../construction-planning";

describe("decideConstructionPlanningActions", () => {
  it("returns no actions when there are no open slots", () => {
    const actions = decideConstructionPlanningActions({
      droneId: "d1",
      droneTileX: 10,
      droneTileY: 10,
      roleBonus: 0,
      siteId: "site-1",
      openSlots: 0,
      assignedConstructionDrones: 0,
      siteNeeds: [{ itemType: "wood", remainingNeed: 5 }],
      availableNodes: [
        {
          nodeId: "n1",
          itemType: "wood",
          tileX: 11,
          tileY: 10,
          reservedByDroneId: null,
        },
      ],
    });

    expect(actions).toEqual([]);
  });

  it("emits queue_site_supply_candidate with expected score components", () => {
    const actions = decideConstructionPlanningActions({
      droneId: "d1",
      droneTileX: 10,
      droneTileY: 10,
      roleBonus: 30,
      siteId: "site-1",
      openSlots: 2,
      assignedConstructionDrones: 2,
      siteNeeds: [{ itemType: "wood", remainingNeed: 999 }],
      availableNodes: [
        {
          nodeId: "n1",
          itemType: "wood",
          tileX: 12,
          tileY: 11,
          reservedByDroneId: "d1",
        },
      ],
    });

    const demandBonus = DRONE_DEMAND_BONUS_MAX;
    const spreadPenalty = -DRONE_SPREAD_PENALTY_PER_DRONE * 2;
    const stickyBonus = DRONE_STICKY_BONUS;
    const distance = 2; // Chebyshev distance from (10,10) -> (12,11)
    const expectedScore =
      DRONE_TASK_BASE_SCORE.construction_supply +
      30 +
      stickyBonus +
      demandBonus +
      spreadPenalty -
      distance;

    expect(actions).toEqual([
      {
        type: "queue_site_supply_candidate",
        candidate: {
          taskType: "construction_supply",
          nodeId: "n1",
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

  it("skips non-matching resources and zero need", () => {
    const actions = decideConstructionPlanningActions({
      droneId: "d1",
      droneTileX: 0,
      droneTileY: 0,
      roleBonus: 0,
      siteId: "site-1",
      openSlots: 1,
      assignedConstructionDrones: 0,
      siteNeeds: [
        { itemType: "wood", remainingNeed: 0 },
        { itemType: "iron", remainingNeed: 2 },
      ],
      availableNodes: [
        {
          nodeId: "wood-node",
          itemType: "wood",
          tileX: 1,
          tileY: 1,
          reservedByDroneId: null,
        },
        {
          nodeId: "iron-node",
          itemType: "iron",
          tileX: 1,
          tileY: 1,
          reservedByDroneId: null,
        },
      ],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].candidate.nodeId).toBe("iron-node");
  });
});

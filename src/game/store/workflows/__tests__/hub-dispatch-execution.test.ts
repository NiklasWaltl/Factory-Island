import { DRONE_CAPACITY } from "../../constants/drone-config";
import { decideHubDispatchExecutionAction } from "../hub-dispatch-execution";

describe("decideHubDispatchExecutionAction", () => {
  it("aborts when hub is missing", () => {
    const action = decideHubDispatchExecutionAction({
      hubId: "hub-1",
      itemType: "wood",
      availableInHub: null,
      remainingNeed: 5,
    });

    expect(action).toEqual({
      type: "abort_hub_dispatch",
      reason: "hub_missing",
    });
  });

  it("aborts when hub stock is empty", () => {
    const action = decideHubDispatchExecutionAction({
      hubId: "hub-1",
      itemType: "wood",
      availableInHub: 0,
      remainingNeed: 5,
    });

    expect(action).toEqual({ type: "abort_hub_dispatch", reason: "hub_empty" });
  });

  it("aborts when remaining need is zero", () => {
    const action = decideHubDispatchExecutionAction({
      hubId: "hub-1",
      itemType: "wood",
      availableInHub: 3,
      remainingNeed: 0,
    });

    expect(action).toEqual({
      type: "abort_hub_dispatch",
      reason: "no_remaining_need",
    });
  });

  it("starts delivery with capped pickup amount", () => {
    const action = decideHubDispatchExecutionAction({
      hubId: "hub-1",
      itemType: "wood",
      availableInHub: DRONE_CAPACITY + 5,
      remainingNeed: DRONE_CAPACITY + 2,
    });

    expect(action).toEqual({
      type: "start_hub_dispatch_delivery",
      hubId: "hub-1",
      itemType: "wood",
      pickupAmount: DRONE_CAPACITY,
      nextTaskType: "construction_supply",
    });
  });
});

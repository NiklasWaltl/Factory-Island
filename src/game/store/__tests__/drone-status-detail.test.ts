import { createInitialState } from "../reducer";
import { getDroneStatusDetail } from "../drone-status-detail";

describe("drone status detail classifier", () => {
  test("returns ready label for idle drones", () => {
    const state = createInitialState("release");
    const drone = { ...state.starterDrone, status: "idle" as const };

    expect(getDroneStatusDetail(state, drone)).toEqual({ label: "Bereit" });
  });

  test("classifies hub dispatch collect goal from target node", () => {
    const state = createInitialState("release");
    const drone = {
      ...state.starterDrone,
      status: "moving_to_collect" as const,
      currentTaskType: "hub_dispatch" as const,
      targetNodeId: "hub:hub-A:wood",
    };

    expect(getDroneStatusDetail(state, drone)).toEqual({
      label: "Unterwegs zum Hub",
      taskGoal: "wood abholen",
    });
  });
});

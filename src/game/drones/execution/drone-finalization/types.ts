import type { TickOneDroneDeps } from "../tick-one-drone";

export type DroneFinalizationDeps = Pick<
  TickOneDroneDeps,
  | "applyDroneUpdate"
  | "parseWorkbenchTaskNodeId"
  | "getCraftingJobById"
  | "commitWorkbenchInputReservation"
  | "resolveDroneDropoff"
  | "addResources"
  | "makeId"
  | "addNotification"
  | "syncDrones"
  | "isHubUpgradeDeliverySatisfied"
  | "finalizeWorkbenchInputDelivery"
  | "finalizeWorkbenchDelivery"
  | "createEmptyHubInventory"
  | "createDefaultProtoHubTargetStock"
  | "debugLog"
>;

import type {
  ConnectionState,
  IntersectionHealth,
  IntersectionSnapshot,
  TrafficFlowState,
} from "@/types/command-platform";
import type { TrafficGraphCarrefourSummary } from "@/types/traffic-graph";
import type { PredictionRunResult } from "@/types/prediction";

export type EquipmentStatus =
  | "Équipé en service"
  | "Équipé hors service"
  | "Non régulé"
  | "Non spécifié";

export function formatCommandLabel(value: string) {
  return value
    .split(/[_-]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatControllerType(value?: string | null) {
  if (!value) return "Non spécifié";
  return value.toUpperCase();
}

export function statusToneToFlow(status: IntersectionHealth): TrafficFlowState {
  if (status === "critical") return "congestion";
  if (status === "watch") return "pressure";
  return "smooth";
}

export function resolveEquipmentStatus(
  intersection: Pick<
    IntersectionSnapshot,
    "controllerId" | "controllerConnectionState" | "mode"
  >,
  graphCarrefour?: Pick<
    TrafficGraphCarrefourSummary,
    "primaryControllerCode" | "primaryControllerConnectionState" | "regulationType"
  > | null,
): EquipmentStatus {
  const controllerCode =
    graphCarrefour?.primaryControllerCode ?? intersection.controllerId;
  const connectionState =
    graphCarrefour?.primaryControllerConnectionState ??
    intersection.controllerConnectionState;

  if (!controllerCode || controllerCode === "unassigned") {
    return "Non spécifié";
  }
  if (connectionState === "offline" || intersection.mode === "fail-safe") {
    return "Équipé hors service";
  }
  if (
    connectionState === "degraded" ||
    intersection.mode === "flash" ||
    graphCarrefour?.regulationType === "unregulated"
  ) {
    return "Non régulé";
  }
  return "Équipé en service";
}

export function deriveLinkFlowState(input: {
  leftStatus: IntersectionHealth;
  rightStatus: IntersectionHealth;
  queueSpillbackRisk?: number | null;
}): TrafficFlowState {
  const risk = input.queueSpillbackRisk ?? 0;
  if (
    input.leftStatus === "critical" ||
    input.rightStatus === "critical" ||
    risk >= 0.72
  ) {
    return "congestion";
  }
  if (
    input.leftStatus === "watch" ||
    input.rightStatus === "watch" ||
    risk >= 0.4
  ) {
    return "pressure";
  }
  return "smooth";
}

export function derivePredictionFlowState(
  prediction: PredictionRunResult | null | undefined,
  fallback: IntersectionHealth,
): TrafficFlowState {
  if (!prediction) return statusToneToFlow(fallback);
  const forecast =
    prediction.forecasts.find((entry) => entry.horizon === "H+15") ??
    prediction.forecasts[0];
  if (!forecast) return statusToneToFlow(fallback);
  if (forecast.saturationForecast >= 0.95 || forecast.queueLengthForecast >= 120) {
    return "congestion";
  }
  if (forecast.saturationForecast >= 0.72 || forecast.queueLengthForecast >= 55) {
    return "pressure";
  }
  return "smooth";
}

export function connectionStateLabel(state: ConnectionState) {
  if (state === "online") return "En ligne";
  if (state === "degraded") return "Dégradé";
  return "Hors ligne";
}

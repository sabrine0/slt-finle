import { CommandPlatformApiError, getApiBaseUrl } from "@/lib/command-platform-api";
import type {
  IntersectionConfig as StudioIntersectionConfig,
  ApproachBearing,
} from "@/components/studio/state/types";
import type { IntersectionRuntimeState } from "@/types/intersection-runtime";

export type RuntimeBearing =
  | "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface RuntimeConfigPayload {
  signalGroups: Array<{
    id: string;
    approachBearing: RuntimeBearing;
    label?: string;
  }>;
  detectors: Array<{
    id: string;
    approachBearing: RuntimeBearing;
    label?: string;
  }>;
  phases: Array<{
    id: string;
    label: string;
    greenSignalGroupIds: string[];
    minGreenSeconds: number;
    yellowSeconds: number;
    redClearanceSeconds: number;
  }>;
  stages: Array<{
    id: string;
    phaseId: string;
    order: number;
  }>;
  conflicts: Array<{ a: string; b: string }>;
}

export interface RuntimeConfigResponse extends RuntimeConfigPayload {
  intersectionId: string;
  isDefault: boolean;
  cycleSeconds: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string | string[] } | undefined;
      const message = body?.message;
      if (Array.isArray(message)) detail = message.join("; ");
      else if (typeof message === "string" && message.length > 0) detail = message;
    } catch {
      /* non-JSON body */
    }
    throw new CommandPlatformApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export async function fetchIntersectionState(intersectionId: string) {
  return requestJson<IntersectionRuntimeState>(
    `/intersections/${encodeURIComponent(intersectionId)}/state`,
  );
}

export async function forceIntersectionPhase(
  intersectionId: string,
  phaseId: string | null,
) {
  return requestJson<IntersectionRuntimeState>(
    `/intersections/${encodeURIComponent(intersectionId)}/phase`,
    {
      method: "POST",
      body: JSON.stringify({ phaseId }),
    },
  );
}

export async function fetchIntersectionConfig(intersectionId: string) {
  return requestJson<RuntimeConfigResponse>(
    `/intersections/${encodeURIComponent(intersectionId)}/config`,
  );
}

export async function applyIntersectionConfig(
  intersectionId: string,
  payload: RuntimeConfigPayload,
) {
  return requestJson<IntersectionRuntimeState>(
    `/intersections/${encodeURIComponent(intersectionId)}/config`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

const RENDERABLE_BEARINGS: RuntimeBearing[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function isRuntimeBearing(value: ApproachBearing): value is RuntimeBearing {
  return (RENDERABLE_BEARINGS as string[]).includes(value);
}

export function runtimeConfigToStudioConfig(
  intersectionId: string,
  runtime: RuntimeConfigResponse,
  baseline: StudioIntersectionConfig,
): StudioIntersectionConfig {
  const bearings = new Set<RuntimeBearing>();
  for (const sg of runtime.signalGroups) bearings.add(sg.approachBearing);
  for (const det of runtime.detectors) bearings.add(det.approachBearing);

  const baselineByBearing = new Map(
    baseline.approaches.map((approach) => [approach.bearing, approach]),
  );

  const approaches = Array.from(bearings).map((bearing) => {
    const existing = baselineByBearing.get(bearing as ApproachBearing);
    if (existing) return existing;
    const label = (
      {
        N: "North",
        NE: "North-East",
        E: "East",
        SE: "South-East",
        S: "South",
        SW: "South-West",
        W: "West",
        NW: "North-West",
      } as const
    )[bearing];
    return {
      id: `appr-${bearing.toLowerCase()}`,
      bearing: bearing as ApproachBearing,
      label,
      lanes: 2,
    };
  });

  const approachIdByBearing = new Map(
    approaches.map((approach) => [approach.bearing, approach.id]),
  );

  return {
    id: intersectionId,
    identity: baseline.identity,
    controllerId: baseline.controllerId,
    approaches,
    signalGroups: runtime.signalGroups.map((sg) => ({
      id: sg.id,
      label: sg.label ?? sg.id,
      approachId: approachIdByBearing.get(sg.approachBearing as ApproachBearing),
      aspects: ["red", "yellow", "green"],
    })),
    detectors: runtime.detectors.map((det) => ({
      id: det.id,
      label: det.label ?? det.id,
      approachId: approachIdByBearing.get(det.approachBearing as ApproachBearing),
      channel: det.id,
      kind: "loop",
    })),
    phases: runtime.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      greenSignalGroupIds: [...phase.greenSignalGroupIds],
      minGreenSeconds: phase.minGreenSeconds,
      yellowSeconds: phase.yellowSeconds,
      redClearanceSeconds: phase.redClearanceSeconds,
    })),
    stages: runtime.stages.map((stage) => ({
      id: stage.id,
      label: `Stage ${stage.order}`,
      phaseId: stage.phaseId,
      order: stage.order,
    })),
    conflicts: runtime.conflicts.map((pair) => ({ a: pair.a, b: pair.b })),
  };
}

export function studioConfigToRuntimePayload(
  studio: StudioIntersectionConfig,
): RuntimeConfigPayload {
  const approachById = new Map(
    studio.approaches.map((approach) => [approach.id, approach]),
  );

  const signalGroups: RuntimeConfigPayload["signalGroups"] = [];
  for (const group of studio.signalGroups) {
    const approach = group.approachId ? approachById.get(group.approachId) : undefined;
    if (!approach || !isRuntimeBearing(approach.bearing)) continue;
    signalGroups.push({
      id: group.id,
      approachBearing: approach.bearing,
      label: group.label,
    });
  }

  const detectors: RuntimeConfigPayload["detectors"] = [];
  for (const detector of studio.detectors) {
    const approach = detector.approachId
      ? approachById.get(detector.approachId)
      : undefined;
    if (!approach || !isRuntimeBearing(approach.bearing)) continue;
    detectors.push({
      id: detector.id,
      approachBearing: approach.bearing,
      label: detector.label,
    });
  }

  const validSignalGroupIds = new Set(signalGroups.map((sg) => sg.id));

  const phases = studio.phases.map((phase) => ({
    id: phase.id,
    label: phase.label,
    greenSignalGroupIds: phase.greenSignalGroupIds.filter((id) =>
      validSignalGroupIds.has(id),
    ),
    minGreenSeconds: phase.minGreenSeconds,
    yellowSeconds: phase.yellowSeconds,
    redClearanceSeconds: phase.redClearanceSeconds,
  }));

  const validPhaseIds = new Set(phases.map((p) => p.id));

  const stages = studio.stages
    .filter((stage) => validPhaseIds.has(stage.phaseId))
    .map((stage) => ({
      id: stage.id,
      phaseId: stage.phaseId,
      order: stage.order,
    }));

  const conflicts = studio.conflicts.filter(
    (pair) => validSignalGroupIds.has(pair.a) && validSignalGroupIds.has(pair.b),
  );

  return { signalGroups, detectors, phases, stages, conflicts };
}

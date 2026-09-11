import { fallbackCommandPlatformSnapshot } from "@/lib/mock-command-platform-data";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import type { IntersectionSnapshot } from "@/types/command-platform";

import {
  defaultAllowedTurnings,
  type Approach,
  type ApproachBearing,
  type ConflictPair,
  type Detector,
  type IntersectionConfig,
  type Lane,
  type Movement,
  type OperatingMode,
  type Phase,
  type SignalAspect,
  type SignalGroup,
  type Stage,
} from "./types";

const DEFAULT_BEARINGS = ["N", "E", "S", "W"] as const;

function defaultApproaches(): Approach[] {
  return DEFAULT_BEARINGS.map((bearing, index) => ({
    id: `appr-${bearing.toLowerCase()}`,
    bearing,
    label: ({
      N: "North",
      E: "East",
      S: "South",
      W: "West",
    } as const)[bearing],
    lanes: 2 + (index % 2),
    notes: undefined,
  }));
}

function defaultSignalGroups(approaches: Approach[]): SignalGroup[] {
  return approaches.map((approach) => ({
    id: `sg-${approach.bearing.toLowerCase()}`,
    label: `${approach.label} through`,
    approachId: approach.id,
    aspects: ["red", "yellow", "green"],
    notes: undefined,
  }));
}

function defaultDetectors(approaches: Approach[]): Detector[] {
  return approaches.map((approach, index) => ({
    id: `det-${(index + 1).toString().padStart(3, "0")}`,
    label: `${approach.label} stop bar`,
    approachId: approach.id,
    channel: `DI${index + 1}`,
    kind: "loop",
    notes: undefined,
  }));
}

function defaultPhases(signalGroups: SignalGroup[]): Phase[] {
  const ns = signalGroups.filter(
    (group) => group.id === "sg-n" || group.id === "sg-s",
  );
  const ew = signalGroups.filter(
    (group) => group.id === "sg-e" || group.id === "sg-w",
  );
  return [
    {
      id: "ph-1",
      label: "Phase 1 — N/S green",
      greenSignalGroupIds: ns.map((group) => group.id),
      minGreenSeconds: 12,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-2",
      label: "Phase 2 — E/W green",
      greenSignalGroupIds: ew.map((group) => group.id),
      minGreenSeconds: 12,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
  ];
}

function defaultStages(phases: Phase[]): Stage[] {
  return phases.map((phase, index) => ({
    id: `st-${index + 1}`,
    label: `Stage ${index + 1}`,
    phaseId: phase.id,
    order: index + 1,
  }));
}

function defaultConflicts(signalGroups: SignalGroup[]): ConflictPair[] {
  const conflicts: ConflictPair[] = [];
  for (let i = 0; i < signalGroups.length; i += 1) {
    for (let j = i + 1; j < signalGroups.length; j += 1) {
      const a = signalGroups[i];
      const b = signalGroups[j];
      const aBearing = a.id.split("-")[1];
      const bBearing = b.id.split("-")[1];
      const aIsNS = aBearing === "n" || aBearing === "s";
      const bIsNS = bBearing === "n" || bBearing === "s";
      if (aIsNS !== bIsNS) {
        conflicts.push({ a: a.id, b: b.id });
      }
    }
  }
  return conflicts;
}

export function buildSeedFromSnapshot(
  intersection: IntersectionSnapshot,
): IntersectionConfig {
  const approaches = defaultApproaches();
  const signalGroups = defaultSignalGroups(approaches);
  const detectors = defaultDetectors(approaches);
  const phases = defaultPhases(signalGroups);
  const stages = defaultStages(phases);
  const conflicts = defaultConflicts(signalGroups);

  return {
    id: intersection.id,
    identity: {
      name: intersection.name,
      district: intersection.district,
      address: intersection.address,
      location: {
        lat: intersection.location.lat,
        lng: intersection.location.lng,
      },
    },
    controllerId: intersection.controllerId,
    approaches,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
  };
}

function guessBearing(
  value: string | null | undefined,
  fallbackIndex: number,
): ApproachBearing {
  const text = value?.toLowerCase() ?? "";
  if (text.includes("north") || text.includes("nord")) return "N";
  if (text.includes("east") || text.includes("est")) return "E";
  if (text.includes("south") || text.includes("sud")) return "S";
  if (text.includes("west") || text.includes("ouest")) return "W";
  return DEFAULT_BEARINGS[fallbackIndex % DEFAULT_BEARINGS.length];
}

function detectorKindFromType(type: string): Detector["kind"] {
  const text = type.toLowerCase();
  if (text.includes("radar")) return "radar";
  if (text.includes("video")) return "video";
  if (text.includes("piezo")) return "piezo";
  if (text.includes("mag")) return "magnetometer";
  return "loop";
}

function signalGroupKindFromPhase(
  phaseType: string,
): NonNullable<SignalGroup["kind"]> {
  const text = phaseType.toLowerCase();
  if (text.includes("ped")) return "pedestrian";
  if (text.includes("tram")) return "tram";
  if (text.includes("bus")) return "busway";
  if (text.includes("emergency")) return "emergency";
  return "vehicle";
}

function turningFromMovementGroup(
  movementGroup: string,
): SignalGroup["turning"] | undefined {
  const text = movementGroup.toLowerCase();
  if (text.includes("left") || text.includes("gauche")) return "left";
  if (text.includes("right") || text.includes("droite")) return "right";
  if (text.includes("u-turn")) return "u-turn";
  if (text.includes("through") || text.includes("straight")) return "through";
  return undefined;
}

function buildSeedFromEngineeringIntersection(
  intersection: EngineeringIntersectionRecord,
): IntersectionConfig {
  const primaryController = intersection.controllers[0];
  const sortedPhases = [...(intersection.phases ?? [])].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber,
  );

  const approachesFromPhases = new Map<ApproachBearing, Approach>();
  sortedPhases.forEach((phase, index) => {
    const bearing = guessBearing(phase.approach, index);
    if (!approachesFromPhases.has(bearing)) {
      approachesFromPhases.set(bearing, {
        id: `appr-${bearing.toLowerCase()}`,
        bearing,
        label: phase.approach || `Approach ${bearing}`,
        lanes: 2,
      });
    }
  });
  const approaches =
    approachesFromPhases.size > 0
      ? [...approachesFromPhases.values()]
      : defaultApproaches();
  const approachByBearing = new Map(
    approaches.map((approach) => [approach.bearing, approach]),
  );

  const signalGroups = sortedPhases.map((phase, index) => {
    const bearing = guessBearing(phase.approach, index);
    const kind = signalGroupKindFromPhase(phase.phaseType);
    return {
      id: `sg-${phase.sequenceNumber}`,
      label: phase.name,
      approachId: approachByBearing.get(bearing)?.id,
      aspects:
        kind === "pedestrian"
          ? (["ped-walk", "ped-stop"] as SignalAspect[])
          : (["red", "yellow", "green"] as SignalAspect[]),
      kind,
      turning: turningFromMovementGroup(phase.movementGroup),
      notes: `${phase.approach} · ${phase.movementGroup}`,
    };
  });

  const signalGroupIdBySequence = new Map(
    sortedPhases.map((phase) => [phase.sequenceNumber, `sg-${phase.sequenceNumber}`]),
  );

  const detectors = (intersection.detectors ?? []).map((detector, index) => {
    const bearing = guessBearing(detector.laneReference, index);
    return {
      id: detector.id,
      label: detector.name || detector.code,
      approachId: approachByBearing.get(bearing)?.id,
      channel: detector.code || `DI${index + 1}`,
      kind: detectorKindFromType(detector.type),
      notes: detector.laneReference ?? undefined,
    };
  });

  const phases = sortedPhases.map((phase) => ({
    id: phase.id,
    label: `${phase.sequenceNumber}. ${phase.name}`,
    greenSignalGroupIds: [
      signalGroupIdBySequence.get(phase.sequenceNumber) ??
        `sg-${phase.sequenceNumber}`,
    ],
    minGreenSeconds: phase.minGreenSeconds,
    yellowSeconds: phase.yellowSeconds,
    redClearanceSeconds: phase.redClearanceSeconds,
    notes: `${phase.approach} · ${phase.movementGroup}`,
  }));

  const stages = sortedPhases.map((phase, index) => ({
    id: `stage-${phase.sequenceNumber}`,
    label: `Stage ${phase.sequenceNumber}`,
    phaseId: phase.id,
    order: index + 1,
  }));

  const conflictSet = new Set<string>();
  sortedPhases.forEach((phase) => {
    const current = signalGroupIdBySequence.get(phase.sequenceNumber);
    if (!current) return;
    for (const conflictingSequence of phase.conflictingPhaseSequenceNumbers ?? []) {
      const other = signalGroupIdBySequence.get(conflictingSequence);
      if (!other) continue;
      conflictSet.add([current, other].sort().join("::"));
    }
  });
  const conflicts = [...conflictSet].map((key) => {
    const [a, b] = key.split("::");
    return { a, b };
  });

  return {
    id: intersection.id,
    code: intersection.code,
    identity: {
      name: intersection.name,
      district: intersection.district,
      address: intersection.address,
      location: {
        // Backend serialises decimal columns as strings — coerce so
        // downstream consumers (map, dossier export) get real numbers.
        lat: Number(intersection.latitude),
        lng: Number(intersection.longitude),
      },
    },
    controllerId: primaryController?.id ?? "",
    approaches,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
    programmingSettings: primaryController
      ? {
          controllerModel: primaryController.controllerType,
          firmwareTarget: primaryController.firmwareVersion,
        }
      : undefined,
  };
}

export function buildInitialIntersections(
  engineeringIntersections: EngineeringIntersectionRecord[] = [],
): Record<string, IntersectionConfig> {
  const result: Record<string, IntersectionConfig> = {};
  if (engineeringIntersections.length > 0) {
    for (const intersection of engineeringIntersections) {
      result[intersection.id] = buildSeedFromEngineeringIntersection(intersection);
    }
  } else {
    for (const intersection of fallbackCommandPlatformSnapshot.intersections) {
      result[intersection.id] = buildSeedFromSnapshot(intersection);
    }
  }
  // Multi-modal showcase — tram corridor + BRT + pedestrian crossings +
  // 4 vehicle approaches + operating modes.  Not surfaced in the geo
  // tree (not backed by a dashboard snapshot) but reachable via tabs
  // once someone opens it, and good seed for testing the new tabs.
  const multimodal = buildMultiModalDemo();
  result[multimodal.id] = multimodal;
  // Test fixture: a single intersection that exercises every LaneType
  // defined in the domain — used as a visual/QA bench for the diagram,
  // the Lanes tab, and the validation rules.
  const allLanes = buildAllLaneTypesDemo();
  result[allLanes.id] = allLanes;
  return result;
}

// ──────────────────────────── Multi-modal demo
//
// "Av Mohammed V × Tramway" — a plausible Rabat-style intersection
// crossed by the tramway with a BRT-style busway on the east-west
// axis and fully signalised pedestrian crossings.  The intent is to
// give engineers a realistic sandbox for every new feature: kinds,
// movements, modes, multi-modal conflicts.

function buildMultiModalDemo(): IntersectionConfig {
  const id = "INT-RAB-TRAM-001";

  const approaches: Approach[] = [
    { id: "appr-n", bearing: "N", label: "Av Mohammed V — North", lanes: 2 },
    { id: "appr-e", bearing: "E", label: "Av Hassan II — East", lanes: 3 },
    { id: "appr-s", bearing: "S", label: "Av Mohammed V — South", lanes: 2 },
    { id: "appr-w", bearing: "W", label: "Av Hassan II — West", lanes: 3 },
  ];

  const signalGroups: SignalGroup[] = [
    { id: "sg-n", label: "North through", approachId: "appr-n", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-s", label: "South through", approachId: "appr-s", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-e", label: "East through", approachId: "appr-e", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-w", label: "West through", approachId: "appr-w", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-tram-ns", label: "Tram N/S corridor", approachId: "appr-n", kind: "tram", aspects: ["red", "yellow", "green"] },
    { id: "sg-bus-ew", label: "Busway E/W", approachId: "appr-e", kind: "busway", aspects: ["red", "yellow", "green"] },
    { id: "sg-ped-n", label: "Pedestrian — North crossing", approachId: "appr-n", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-s", label: "Pedestrian — South crossing", approachId: "appr-s", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-e", label: "Pedestrian — East crossing", approachId: "appr-e", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-w", label: "Pedestrian — West crossing", approachId: "appr-w", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-emergency", label: "Emergency preemption", approachId: "appr-e", kind: "emergency", aspects: ["red", "green"] },
  ];

  const detectors: Detector[] = [
    { id: "det-001", label: "North stop-bar", approachId: "appr-n", channel: "DI1", kind: "loop" },
    { id: "det-002", label: "East stop-bar", approachId: "appr-e", channel: "DI2", kind: "loop" },
    { id: "det-003", label: "South stop-bar", approachId: "appr-s", channel: "DI3", kind: "loop" },
    { id: "det-004", label: "West stop-bar", approachId: "appr-w", channel: "DI4", kind: "loop" },
    { id: "det-005", label: "Tram approach AVI", approachId: "appr-n", channel: "DI5", kind: "radar" },
    { id: "det-006", label: "Bus priority beacon", approachId: "appr-e", channel: "DI6", kind: "radar" },
  ];

  const phases: Phase[] = [
    {
      id: "ph-ns",
      label: "Phase 1 — Vehicles N/S + crosswalks E/W",
      greenSignalGroupIds: ["sg-n", "sg-s", "sg-ped-e", "sg-ped-w"],
      minGreenSeconds: 14,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-ew",
      label: "Phase 2 — Vehicles E/W + crosswalks N/S",
      greenSignalGroupIds: ["sg-e", "sg-w", "sg-ped-n", "sg-ped-s"],
      minGreenSeconds: 14,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-tram",
      label: "Phase 3 — Tram N/S protected",
      greenSignalGroupIds: ["sg-tram-ns"],
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 3,
    },
    {
      id: "ph-bus",
      label: "Phase 4 — Busway E/W protected",
      greenSignalGroupIds: ["sg-bus-ew"],
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-ped-all",
      label: "Phase 5 — All-pedestrian scramble",
      greenSignalGroupIds: ["sg-ped-n", "sg-ped-s", "sg-ped-e", "sg-ped-w"],
      minGreenSeconds: 16,
      yellowSeconds: 0,
      redClearanceSeconds: 3,
    },
    {
      id: "ph-emergency",
      label: "Phase 6 — Emergency preemption",
      greenSignalGroupIds: ["sg-emergency"],
      minGreenSeconds: 8,
      yellowSeconds: 3,
      redClearanceSeconds: 4,
    },
  ];

  // Lane-level model — each approach carries dedicated-turn, through,
  // and a priority lane (tram or busway) plus a crosswalk.
  //   Kerb → median ordering (index 0 = outer right-most lane):
  //     N / S: right-turn · through · left-turn · tram
  //     E / W: right-turn · through · through · busway
  const lanes: Lane[] = [
    // North approach
    { id: "lane-n-1", label: "N · right-turn bay", approachId: "appr-n", type: "right-turn", allowedTurnings: ["right"], signalGroupIds: ["sg-n"], detectorIds: ["det-001"], enabled: true },
    { id: "lane-n-2", label: "N · through", approachId: "appr-n", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-n"], enabled: true },
    { id: "lane-n-3", label: "N · left-turn bay", approachId: "appr-n", type: "left-turn", allowedTurnings: ["left"], signalGroupIds: ["sg-n"], enabled: true },
    { id: "lane-n-4", label: "N · tram track", approachId: "appr-n", type: "tram", signalGroupIds: ["sg-tram-ns"], detectorIds: ["det-005"], priority: true, widthFactor: 1.2, enabled: true },
    { id: "lane-n-x", label: "N · pedestrian crossing", approachId: "appr-n", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-n"], enabled: true },
    // South approach (mirrors N — tram track continues through)
    { id: "lane-s-1", label: "S · right-turn bay", approachId: "appr-s", type: "right-turn", allowedTurnings: ["right"], signalGroupIds: ["sg-s"], detectorIds: ["det-003"], enabled: true },
    { id: "lane-s-2", label: "S · through", approachId: "appr-s", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-s"], enabled: true },
    { id: "lane-s-3", label: "S · left-turn bay", approachId: "appr-s", type: "left-turn", allowedTurnings: ["left"], signalGroupIds: ["sg-s"], enabled: true },
    { id: "lane-s-4", label: "S · tram track", approachId: "appr-s", type: "tram", signalGroupIds: ["sg-tram-ns"], priority: true, widthFactor: 1.2, enabled: true },
    { id: "lane-s-x", label: "S · pedestrian crossing", approachId: "appr-s", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-s"], enabled: true },
    // East approach — BRT on outer side
    { id: "lane-e-1", label: "E · right-turn bay", approachId: "appr-e", type: "right-turn", allowedTurnings: ["right"], signalGroupIds: ["sg-e"], detectorIds: ["det-002"], enabled: true },
    { id: "lane-e-2", label: "E · through", approachId: "appr-e", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-e"], enabled: true },
    { id: "lane-e-3", label: "E · through", approachId: "appr-e", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-e"], enabled: true },
    { id: "lane-e-4", label: "E · busway", approachId: "appr-e", type: "busway", signalGroupIds: ["sg-bus-ew"], detectorIds: ["det-006"], priority: true, widthFactor: 1.15, enabled: true },
    { id: "lane-e-x", label: "E · pedestrian crossing", approachId: "appr-e", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-e"], enabled: true },
    // West approach — mirrors E
    { id: "lane-w-1", label: "W · right-turn bay", approachId: "appr-w", type: "right-turn", allowedTurnings: ["right"], signalGroupIds: ["sg-w"], detectorIds: ["det-004"], enabled: true },
    { id: "lane-w-2", label: "W · through", approachId: "appr-w", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-w"], enabled: true },
    { id: "lane-w-3", label: "W · through", approachId: "appr-w", type: "through", allowedTurnings: ["through"], signalGroupIds: ["sg-w"], enabled: true },
    { id: "lane-w-4", label: "W · busway", approachId: "appr-w", type: "busway", signalGroupIds: ["sg-bus-ew"], priority: true, widthFactor: 1.15, enabled: true },
    { id: "lane-w-x", label: "W · pedestrian crossing", approachId: "appr-w", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-w"], enabled: true },
  ];
  // Double-check allowedTurnings are set for every lane (runtime defensive).
  for (const lane of lanes) {
    if (!lane.allowedTurnings) {
      lane.allowedTurnings = defaultAllowedTurnings(lane.type);
    }
  }

  const stages: Stage[] = phases.map((phase, index) => ({
    id: `st-${index + 1}`,
    label: `Stage ${index + 1}`,
    phaseId: phase.id,
    order: index + 1,
  }));

  // Conflict matrix: vehicles cross, trams cross vehicles on the cross
  // axis, BRT conflicts with cross vehicles, pedestrian crossings
  // conflict with vehicle flow on the same approach.
  const conflicts: ConflictPair[] = [
    // Vehicle × vehicle (cross flows)
    { a: "sg-n", b: "sg-e" },
    { a: "sg-n", b: "sg-w" },
    { a: "sg-s", b: "sg-e" },
    { a: "sg-s", b: "sg-w" },
    // Tram × cross vehicles / busway
    { a: "sg-tram-ns", b: "sg-e" },
    { a: "sg-tram-ns", b: "sg-w" },
    { a: "sg-tram-ns", b: "sg-bus-ew" },
    // Busway × cross vehicles / tram / pedestrians at its approach
    { a: "sg-bus-ew", b: "sg-n" },
    { a: "sg-bus-ew", b: "sg-s" },
    { a: "sg-bus-ew", b: "sg-ped-e" },
    { a: "sg-bus-ew", b: "sg-ped-w" },
    // Pedestrian × vehicles on same approach
    { a: "sg-ped-n", b: "sg-n" },
    { a: "sg-ped-s", b: "sg-s" },
    { a: "sg-ped-e", b: "sg-e" },
    { a: "sg-ped-w", b: "sg-w" },
    // Tram × pedestrians on its corridor
    { a: "sg-tram-ns", b: "sg-ped-n" },
    { a: "sg-tram-ns", b: "sg-ped-s" },
    // Emergency preempts everything (all cross-flow conflicts)
    { a: "sg-emergency", b: "sg-n" },
    { a: "sg-emergency", b: "sg-s" },
    { a: "sg-emergency", b: "sg-w" },
    { a: "sg-emergency", b: "sg-tram-ns" },
    { a: "sg-emergency", b: "sg-ped-n" },
    { a: "sg-emergency", b: "sg-ped-s" },
    { a: "sg-emergency", b: "sg-ped-w" },
  ];

  const movements: Movement[] = [
    { id: "mv-veh-n", label: "North through", kind: "vehicle", fromApproachId: "appr-n", toApproachId: "appr-s", fromLaneId: "lane-n-2", toLaneId: "lane-s-2", turning: "through", signalGroupIds: ["sg-n"], enabled: true },
    { id: "mv-veh-s", label: "South through", kind: "vehicle", fromApproachId: "appr-s", toApproachId: "appr-n", fromLaneId: "lane-s-2", toLaneId: "lane-n-2", turning: "through", signalGroupIds: ["sg-s"], enabled: true },
    { id: "mv-veh-e", label: "East through", kind: "vehicle", fromApproachId: "appr-e", toApproachId: "appr-w", fromLaneId: "lane-e-2", toLaneId: "lane-w-2", turning: "through", signalGroupIds: ["sg-e"], enabled: true },
    { id: "mv-veh-w", label: "West through", kind: "vehicle", fromApproachId: "appr-w", toApproachId: "appr-e", fromLaneId: "lane-w-2", toLaneId: "lane-e-2", turning: "through", signalGroupIds: ["sg-w"], enabled: true },
    { id: "mv-tram-ns", label: "Tramway North ↔ South", kind: "tram", fromApproachId: "appr-n", toApproachId: "appr-s", fromLaneId: "lane-n-4", toLaneId: "lane-s-4", turning: "through", signalGroupIds: ["sg-tram-ns"], priority: true, enabled: true },
    { id: "mv-bus-ew", label: "BRT East ↔ West", kind: "busway", fromApproachId: "appr-e", toApproachId: "appr-w", fromLaneId: "lane-e-4", toLaneId: "lane-w-4", turning: "through", signalGroupIds: ["sg-bus-ew"], priority: true, enabled: true },
    { id: "mv-ped-n", label: "Crosswalk — North side", kind: "pedestrian", fromApproachId: "appr-n", fromLaneId: "lane-n-x", signalGroupIds: ["sg-ped-n"], enabled: true },
    { id: "mv-ped-s", label: "Crosswalk — South side", kind: "pedestrian", fromApproachId: "appr-s", fromLaneId: "lane-s-x", signalGroupIds: ["sg-ped-s"], enabled: true },
    { id: "mv-ped-e", label: "Crosswalk — East side", kind: "pedestrian", fromApproachId: "appr-e", fromLaneId: "lane-e-x", signalGroupIds: ["sg-ped-e"], enabled: true },
    { id: "mv-ped-w", label: "Crosswalk — West side", kind: "pedestrian", fromApproachId: "appr-w", fromLaneId: "lane-w-x", signalGroupIds: ["sg-ped-w"], enabled: true },
    { id: "mv-emergency", label: "Emergency preemption corridor", kind: "emergency", signalGroupIds: ["sg-emergency"], priority: true, enabled: false },
  ];

  const modes: OperatingMode[] = [
    {
      id: "mode-normal",
      label: "Normal day",
      kind: "normal",
      enabledPhaseIds: ["ph-ns", "ph-ew", "ph-tram", "ph-bus", "ph-ped-all"],
      cycleSecondsOverride: 90,
      priorityRules: { tramOnRequest: true, busOnRequest: true, emergencyPreemption: true },
    },
    {
      id: "mode-peak",
      label: "Peak hour",
      kind: "peak",
      enabledPhaseIds: ["ph-ns", "ph-ew", "ph-tram", "ph-bus"],
      cycleSecondsOverride: 120,
      priorityRules: { tramOnRequest: true, busOnRequest: false, emergencyPreemption: true },
      notes: "Drop the all-ped scramble during peak to move traffic.",
    },
    {
      id: "mode-night",
      label: "Night",
      kind: "night",
      enabledPhaseIds: ["ph-ns", "ph-ew", "ph-ped-all"],
      cycleSecondsOverride: 60,
      priorityRules: { tramOnRequest: false, busOnRequest: false, emergencyPreemption: true },
    },
  ];

  return {
    id,
    identity: {
      name: "Av Mohammed V × Tramway Rabat",
      district: "Rabat-Salé-Kénitra",
      address: "Av Mohammed V × Av Hassan II, Rabat",
      location: { lat: 34.0209, lng: -6.8416 },
    },
    controllerId: "CTRL-RAB-401",
    approaches,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
    movements,
    lanes,
    modes,
  };
}

// ──────────────────────────── All-lane-types test intersection
//
// Synthetic fixture whose purpose is to cover every value of the
// `LaneType` union in a single intersection: general, through,
// left-turn, right-turn, shared-left-through, shared-through-right,
// tram, busway, taxi, bike, pedestrian-crossing, emergency.  Useful
// as a QA bench for the diagram, the Lanes tab, and the lane-aware
// validation rules — not intended to represent a real place.

function buildAllLaneTypesDemo(): IntersectionConfig {
  const id = "INT-TEST-LANES-001";

  const approaches: Approach[] = [
    { id: "appr-n", bearing: "N", label: "North (tram + bike)", lanes: 5 },
    { id: "appr-e", bearing: "E", label: "East (BRT + taxi)", lanes: 5 },
    { id: "appr-s", bearing: "S", label: "South (emergency)", lanes: 5 },
    { id: "appr-w", bearing: "W", label: "West (plain vehicles)", lanes: 4 },
  ];

  const signalGroups: SignalGroup[] = [
    { id: "sg-veh-n", label: "North vehicles", approachId: "appr-n", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-veh-e", label: "East vehicles", approachId: "appr-e", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-veh-s", label: "South vehicles", approachId: "appr-s", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-veh-w", label: "West vehicles", approachId: "appr-w", kind: "vehicle", aspects: ["red", "yellow", "green"] },
    { id: "sg-tram-ns", label: "Tram N/S", approachId: "appr-n", kind: "tram", aspects: ["red", "yellow", "green"] },
    { id: "sg-bus-ew", label: "Busway E/W", approachId: "appr-e", kind: "busway", aspects: ["red", "yellow", "green"] },
    { id: "sg-emg-s", label: "Emergency South", approachId: "appr-s", kind: "emergency", aspects: ["red", "green"] },
    { id: "sg-ped-n", label: "Ped — North crossing", approachId: "appr-n", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-e", label: "Ped — East crossing", approachId: "appr-e", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-s", label: "Ped — South crossing", approachId: "appr-s", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
    { id: "sg-ped-w", label: "Ped — West crossing", approachId: "appr-w", kind: "pedestrian", aspects: ["ped-walk", "ped-stop"] },
  ];

  const detectors: Detector[] = [
    { id: "det-n-stop", label: "N stop-bar", approachId: "appr-n", channel: "DI1", kind: "loop" },
    { id: "det-n-tram", label: "N tram AVI", approachId: "appr-n", channel: "DI2", kind: "radar" },
    { id: "det-n-bike", label: "N bike loop", approachId: "appr-n", channel: "DI3", kind: "loop" },
    { id: "det-e-stop", label: "E stop-bar", approachId: "appr-e", channel: "DI4", kind: "loop" },
    { id: "det-e-bus", label: "E bus beacon", approachId: "appr-e", channel: "DI5", kind: "radar" },
    { id: "det-e-taxi", label: "E taxi bay", approachId: "appr-e", channel: "DI6", kind: "loop" },
    { id: "det-s-stop", label: "S stop-bar", approachId: "appr-s", channel: "DI7", kind: "loop" },
    { id: "det-s-emg", label: "S emergency beacon", approachId: "appr-s", channel: "DI8", kind: "radar" },
    { id: "det-w-stop", label: "W stop-bar", approachId: "appr-w", channel: "DI9", kind: "loop" },
  ];

  // Lanes kerb → median.  Pedestrian-crossing lanes are bookkeeping only;
  // they render as the crosswalk zebra, not as road strips.
  //
  //   N: bike · right-turn · through · left-turn · tram        + ped-X
  //   E: taxi · shared-left-through · through · right-turn · busway + ped-X
  //   S: general · shared-through-right · through · left-turn · emergency + ped-X
  //   W: right-turn · through · through · left-turn           + ped-X
  const lanes: Lane[] = [
    // North — covers: bike, right-turn, through, left-turn, tram, pedestrian-crossing
    { id: "lane-n-bike", label: "N · bike", approachId: "appr-n", type: "bike", signalGroupIds: ["sg-veh-n"], detectorIds: ["det-n-bike"], widthFactor: 0.7, enabled: true },
    { id: "lane-n-right", label: "N · right-turn", approachId: "appr-n", type: "right-turn", signalGroupIds: ["sg-veh-n"], detectorIds: ["det-n-stop"], enabled: true },
    { id: "lane-n-through", label: "N · through", approachId: "appr-n", type: "through", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "lane-n-left", label: "N · left-turn", approachId: "appr-n", type: "left-turn", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "lane-n-tram", label: "N · tram track", approachId: "appr-n", type: "tram", signalGroupIds: ["sg-tram-ns"], detectorIds: ["det-n-tram"], priority: true, widthFactor: 1.2, enabled: true },
    { id: "lane-n-ped", label: "N · pedestrian crossing", approachId: "appr-n", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-n"], enabled: true },
    // East — covers: taxi, shared-left-through, through, right-turn, busway
    { id: "lane-e-taxi", label: "E · taxi", approachId: "appr-e", type: "taxi", signalGroupIds: ["sg-veh-e"], detectorIds: ["det-e-taxi"], widthFactor: 0.95, enabled: true },
    { id: "lane-e-slt", label: "E · shared left+through", approachId: "appr-e", type: "shared-left-through", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "lane-e-through", label: "E · through", approachId: "appr-e", type: "through", signalGroupIds: ["sg-veh-e"], detectorIds: ["det-e-stop"], enabled: true },
    { id: "lane-e-right", label: "E · right-turn", approachId: "appr-e", type: "right-turn", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "lane-e-bus", label: "E · busway", approachId: "appr-e", type: "busway", signalGroupIds: ["sg-bus-ew"], detectorIds: ["det-e-bus"], priority: true, widthFactor: 1.15, enabled: true },
    { id: "lane-e-ped", label: "E · pedestrian crossing", approachId: "appr-e", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-e"], enabled: true },
    // South — covers: general, shared-through-right, through, left-turn, emergency
    { id: "lane-s-general", label: "S · general", approachId: "appr-s", type: "general", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "lane-s-str", label: "S · shared through+right", approachId: "appr-s", type: "shared-through-right", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "lane-s-through", label: "S · through", approachId: "appr-s", type: "through", signalGroupIds: ["sg-veh-s"], detectorIds: ["det-s-stop"], enabled: true },
    { id: "lane-s-left", label: "S · left-turn", approachId: "appr-s", type: "left-turn", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "lane-s-emg", label: "S · emergency", approachId: "appr-s", type: "emergency", signalGroupIds: ["sg-emg-s"], detectorIds: ["det-s-emg"], priority: true, widthFactor: 1.1, enabled: true },
    { id: "lane-s-ped", label: "S · pedestrian crossing", approachId: "appr-s", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-s"], enabled: true },
    // West — plain vehicle approach (right-turn, through, through, left-turn)
    { id: "lane-w-right", label: "W · right-turn", approachId: "appr-w", type: "right-turn", signalGroupIds: ["sg-veh-w"], detectorIds: ["det-w-stop"], enabled: true },
    { id: "lane-w-through-1", label: "W · through", approachId: "appr-w", type: "through", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "lane-w-through-2", label: "W · through", approachId: "appr-w", type: "through", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "lane-w-left", label: "W · left-turn", approachId: "appr-w", type: "left-turn", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "lane-w-ped", label: "W · pedestrian crossing", approachId: "appr-w", type: "pedestrian-crossing", signalGroupIds: ["sg-ped-w"], enabled: true },
  ];
  for (const lane of lanes) {
    if (!lane.allowedTurnings) {
      lane.allowedTurnings = defaultAllowedTurnings(lane.type);
    }
  }

  const phases: Phase[] = [
    {
      id: "ph-ns",
      label: "Phase 1 — Vehicles N/S + crosswalks E/W",
      greenSignalGroupIds: ["sg-veh-n", "sg-veh-s", "sg-ped-e", "sg-ped-w"],
      minGreenSeconds: 14,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-ew",
      label: "Phase 2 — Vehicles E/W + crosswalks N/S",
      greenSignalGroupIds: ["sg-veh-e", "sg-veh-w", "sg-ped-n", "sg-ped-s"],
      minGreenSeconds: 14,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-tram",
      label: "Phase 3 — Tram N/S protected",
      greenSignalGroupIds: ["sg-tram-ns"],
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 3,
    },
    {
      id: "ph-bus",
      label: "Phase 4 — Busway E/W protected",
      greenSignalGroupIds: ["sg-bus-ew"],
      minGreenSeconds: 10,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: "ph-emg",
      label: "Phase 5 — Emergency preemption (S)",
      greenSignalGroupIds: ["sg-emg-s"],
      minGreenSeconds: 8,
      yellowSeconds: 3,
      redClearanceSeconds: 4,
    },
    {
      id: "ph-ped-all",
      label: "Phase 6 — All-pedestrian scramble",
      greenSignalGroupIds: ["sg-ped-n", "sg-ped-e", "sg-ped-s", "sg-ped-w"],
      minGreenSeconds: 16,
      yellowSeconds: 0,
      redClearanceSeconds: 3,
    },
  ];

  const stages: Stage[] = phases.map((phase, index) => ({
    id: `st-${index + 1}`,
    label: `Stage ${index + 1}`,
    phaseId: phase.id,
    order: index + 1,
  }));

  const conflicts: ConflictPair[] = [
    // Vehicle cross-flows
    { a: "sg-veh-n", b: "sg-veh-e" },
    { a: "sg-veh-n", b: "sg-veh-w" },
    { a: "sg-veh-s", b: "sg-veh-e" },
    { a: "sg-veh-s", b: "sg-veh-w" },
    // Tram crosses E/W vehicles + busway
    { a: "sg-tram-ns", b: "sg-veh-e" },
    { a: "sg-tram-ns", b: "sg-veh-w" },
    { a: "sg-tram-ns", b: "sg-bus-ew" },
    // Busway crosses N/S vehicles + tram
    { a: "sg-bus-ew", b: "sg-veh-n" },
    { a: "sg-bus-ew", b: "sg-veh-s" },
    // Pedestrian crosses the vehicle flow on its own approach
    { a: "sg-ped-n", b: "sg-veh-n" },
    { a: "sg-ped-e", b: "sg-veh-e" },
    { a: "sg-ped-s", b: "sg-veh-s" },
    { a: "sg-ped-w", b: "sg-veh-w" },
    // Tram × N/S pedestrian
    { a: "sg-tram-ns", b: "sg-ped-n" },
    { a: "sg-tram-ns", b: "sg-ped-s" },
    // Busway × E/W pedestrian
    { a: "sg-bus-ew", b: "sg-ped-e" },
    { a: "sg-bus-ew", b: "sg-ped-w" },
    // Emergency preempts everything that crosses its corridor
    { a: "sg-emg-s", b: "sg-veh-n" },
    { a: "sg-emg-s", b: "sg-veh-e" },
    { a: "sg-emg-s", b: "sg-veh-w" },
    { a: "sg-emg-s", b: "sg-tram-ns" },
    { a: "sg-emg-s", b: "sg-bus-ew" },
    { a: "sg-emg-s", b: "sg-ped-n" },
    { a: "sg-emg-s", b: "sg-ped-e" },
    { a: "sg-emg-s", b: "sg-ped-w" },
  ];

  const movements: Movement[] = [
    { id: "mv-n-through", label: "N through", kind: "vehicle", fromApproachId: "appr-n", toApproachId: "appr-s", fromLaneId: "lane-n-through", toLaneId: "lane-s-through", turning: "through", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "mv-s-through", label: "S through", kind: "vehicle", fromApproachId: "appr-s", toApproachId: "appr-n", fromLaneId: "lane-s-through", toLaneId: "lane-n-through", turning: "through", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "mv-e-through", label: "E through", kind: "vehicle", fromApproachId: "appr-e", toApproachId: "appr-w", fromLaneId: "lane-e-through", toLaneId: "lane-w-through-1", turning: "through", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "mv-w-through", label: "W through", kind: "vehicle", fromApproachId: "appr-w", toApproachId: "appr-e", fromLaneId: "lane-w-through-1", toLaneId: "lane-e-through", turning: "through", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "mv-n-left", label: "N left", kind: "vehicle", fromApproachId: "appr-n", toApproachId: "appr-e", fromLaneId: "lane-n-left", turning: "left", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "mv-s-left", label: "S left", kind: "vehicle", fromApproachId: "appr-s", toApproachId: "appr-w", fromLaneId: "lane-s-left", turning: "left", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "mv-w-left", label: "W left", kind: "vehicle", fromApproachId: "appr-w", toApproachId: "appr-n", fromLaneId: "lane-w-left", turning: "left", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "mv-n-right", label: "N right", kind: "vehicle", fromApproachId: "appr-n", toApproachId: "appr-w", fromLaneId: "lane-n-right", turning: "right", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "mv-e-right", label: "E right", kind: "vehicle", fromApproachId: "appr-e", toApproachId: "appr-n", fromLaneId: "lane-e-right", turning: "right", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "mv-w-right", label: "W right", kind: "vehicle", fromApproachId: "appr-w", toApproachId: "appr-s", fromLaneId: "lane-w-right", turning: "right", signalGroupIds: ["sg-veh-w"], enabled: true },
    { id: "mv-n-bike", label: "N bike lane flow", kind: "vehicle", fromApproachId: "appr-n", fromLaneId: "lane-n-bike", turning: "through", signalGroupIds: ["sg-veh-n"], enabled: true },
    { id: "mv-e-taxi", label: "E taxi bay", kind: "vehicle", fromApproachId: "appr-e", fromLaneId: "lane-e-taxi", turning: "through", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "mv-e-slt", label: "E shared L+T", kind: "vehicle", fromApproachId: "appr-e", fromLaneId: "lane-e-slt", turning: "through", signalGroupIds: ["sg-veh-e"], enabled: true },
    { id: "mv-s-general", label: "S general", kind: "vehicle", fromApproachId: "appr-s", fromLaneId: "lane-s-general", turning: "through", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "mv-s-str", label: "S shared T+R", kind: "vehicle", fromApproachId: "appr-s", fromLaneId: "lane-s-str", turning: "through", signalGroupIds: ["sg-veh-s"], enabled: true },
    { id: "mv-tram-ns", label: "Tram N ↔ S", kind: "tram", fromApproachId: "appr-n", toApproachId: "appr-s", fromLaneId: "lane-n-tram", toLaneId: "lane-s-emg", turning: "through", signalGroupIds: ["sg-tram-ns"], priority: true, enabled: true },
    { id: "mv-bus-ew", label: "BRT E ↔ W", kind: "busway", fromApproachId: "appr-e", toApproachId: "appr-w", fromLaneId: "lane-e-bus", turning: "through", signalGroupIds: ["sg-bus-ew"], priority: true, enabled: true },
    { id: "mv-emg-s", label: "Emergency corridor (S)", kind: "emergency", fromApproachId: "appr-s", fromLaneId: "lane-s-emg", signalGroupIds: ["sg-emg-s"], priority: true, enabled: true },
    { id: "mv-ped-n", label: "Crosswalk N", kind: "pedestrian", fromApproachId: "appr-n", fromLaneId: "lane-n-ped", signalGroupIds: ["sg-ped-n"], enabled: true },
    { id: "mv-ped-e", label: "Crosswalk E", kind: "pedestrian", fromApproachId: "appr-e", fromLaneId: "lane-e-ped", signalGroupIds: ["sg-ped-e"], enabled: true },
    { id: "mv-ped-s", label: "Crosswalk S", kind: "pedestrian", fromApproachId: "appr-s", fromLaneId: "lane-s-ped", signalGroupIds: ["sg-ped-s"], enabled: true },
    { id: "mv-ped-w", label: "Crosswalk W", kind: "pedestrian", fromApproachId: "appr-w", fromLaneId: "lane-w-ped", signalGroupIds: ["sg-ped-w"], enabled: true },
  ];

  const modes: OperatingMode[] = [
    {
      id: "mode-normal",
      label: "Normal",
      kind: "normal",
      enabledPhaseIds: ["ph-ns", "ph-ew", "ph-tram", "ph-bus", "ph-ped-all"],
      cycleSecondsOverride: 100,
      priorityRules: { tramOnRequest: true, busOnRequest: true, emergencyPreemption: true },
    },
    {
      id: "mode-night",
      label: "Night",
      kind: "night",
      enabledPhaseIds: ["ph-ns", "ph-ew", "ph-ped-all"],
      cycleSecondsOverride: 60,
      priorityRules: { tramOnRequest: false, busOnRequest: false, emergencyPreemption: true },
    },
  ];

  return {
    id,
    identity: {
      name: "Test — all lane types",
      district: "QA Fixtures",
      address: "Synthetic intersection for lane-type coverage",
      location: { lat: 33.97, lng: -6.85 },
    },
    controllerId: "CTRL-TEST-LANES",
    approaches,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
    movements,
    lanes,
    modes,
  };
}

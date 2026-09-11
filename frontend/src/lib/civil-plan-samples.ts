/**
 * Sample civil-plan geometry — modelled after a real Casablanca
 * Plan d'aménagement (Carrefour 41 / Av Mohamed Es Laoui pattern).
 *
 * `buildSampleCivilPlan` deterministically varies per intersection so
 * each carrefour shows a distinct plan: skew angle, lane mix per arm,
 * presence of a tramway / BHNS corridor in the median, presence of an
 * exclusive bus lane on the secondary axis, cabinet quadrant, and 3-arm
 * vs 4-arm topology are all driven by a stable hash of the carrefour
 * code.  Street names come from the intersection name when the backend
 * provides one (`*`-separated list); otherwise a Moroccan street pool
 * fills in.
 *
 * All coordinates are in METRES on a local plan frame (origin at the
 * node centre, +X east, +Y north).
 */

import type {
  CableChamber,
  CableRun,
  CivilPlan,
  ControllerCabinet,
  Crosswalk,
  DetectorLoop,
  Lane,
  LaneKind,
  PlanBounds,
  PlanPoint,
  RefugeIsland,
  RoadArm,
  SignalSupport,
  StopLine,
} from "@/types/civil-plan";

type Cardinal = "N" | "E" | "S" | "W";

function dirVec(bearingRad: number): PlanPoint {
  return { x: Math.cos(bearingRad), y: Math.sin(bearingRad) };
}

function perpVec(v: PlanPoint): PlanPoint {
  return { x: -v.y, y: v.x };
}

function addP(a: PlanPoint, b: PlanPoint, scale = 1): PlanPoint {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale };
}

function distance(a: PlanPoint, b: PlanPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pathLength(points: PlanPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────
// Stable per-carrefour hash → variation knobs.  The hash is FNV-1a on
// the carrefour code; we slice consecutive 4-bit chunks to drive each
// independent knob, so two adjacent codes produce visibly different
// plans.
// ─────────────────────────────────────────────────────────────────────────

function hashCode(code: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i += 1) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function bits(seed: number, shift: number, mask: number): number {
  return (seed >>> shift) & mask;
}

interface Variation {
  /** Skew angle of the primary axis off compass north, in radians. */
  skewRad: number;
  /** "small" = 2 inbound, "medium" = 3, "large" = 4. */
  primarySize: "small" | "medium" | "large";
  secondarySize: "small" | "medium" | "large";
  /** Tramway / BHNS in the primary-axis median. */
  bhns: boolean;
  /** Reserved bus lane on the secondary axis. */
  busLane: boolean;
  /** Number of arms — 3 = T-junction, 4 = full cross. */
  armCount: 3 | 4;
  /** Which arm to drop when armCount === 3. */
  drop: Cardinal;
  /** Cabinet quadrant. */
  cabinetQuadrant: "NW" | "NE" | "SW" | "SE";
  /** Carrefour-tag prefix used for cable labels (e.g. "C1"). */
  carrefourTag: string;
}

function pickVariation(code: string): Variation {
  const seed = hashCode(code);
  const skewBits = bits(seed, 0, 31); // 0..31 → -15..+15
  const skewRad = ((skewBits - 16) * Math.PI) / 180;
  const sizeMap = ["small", "medium", "medium", "large"] as const;
  const primarySize = sizeMap[bits(seed, 5, 3)];
  const secondarySize = sizeMap[bits(seed, 7, 3)];
  // BHNS in ~30% of carrefours.
  const bhns = bits(seed, 10, 7) < 38;
  // Bus lane in ~25% of carrefours, exclusive of BHNS.
  const busLane = !bhns && bits(seed, 13, 7) < 32;
  // 4-arm 80% of the time.
  const armCount: 3 | 4 = bits(seed, 16, 7) < 26 ? 3 : 4;
  const dropOpts: Cardinal[] = ["N", "E", "S", "W"];
  const drop = dropOpts[bits(seed, 19, 3) % 4];
  const cabOpts = ["NW", "NE", "SW", "SE"] as const;
  const cabinetQuadrant = cabOpts[bits(seed, 22, 3) % 4];
  // Carrefour tag: digits stripped from code, with "C" prefix.
  const digits = code.match(/\d+/g)?.join("") ?? "";
  const carrefourTag = digits ? `C${parseInt(digits, 10)}` : "C0";
  return {
    skewRad,
    primarySize,
    secondarySize,
    bhns,
    busLane,
    armCount,
    drop,
    cabinetQuadrant,
    carrefourTag,
  };
}

function lanesForSize(size: "small" | "medium" | "large"): {
  inbound: LaneKind[];
  outbound: LaneKind[];
  halfWidth: number;
} {
  if (size === "small") {
    return {
      inbound: ["through", "through-right"],
      outbound: ["through", "through"],
      halfWidth: 9,
    };
  }
  if (size === "medium") {
    return {
      inbound: ["left", "through", "through-right"],
      outbound: ["through", "through", "through"],
      halfWidth: 11,
    };
  }
  return {
    inbound: ["left", "through", "through", "right"],
    outbound: ["through", "through", "through", "through"],
    halfWidth: 13,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Street-name inference
//
// The backend stores intersection names like "Av X * Av Y" or
// "Av X * Av Y * Rue Z" — separated by `*` (or sometimes `×` / `/`).
// We split + trim to get up to 4 names; if fewer than 4, repeat names
// across paired arms (N+S share, E+W share).
// ─────────────────────────────────────────────────────────────────────────

const FALLBACK_STREETS = [
  "Av Mohammed VI",
  "Av Hassan II",
  "Av des FAR",
  "Bd Zerktouni",
  "Av Mohamed Es Laoui",
  "Av Abdellah Chefhaoui",
  "Rue Abdelaziz Boutaleb",
  "Bd Mohammed V",
];

function parseStreetNames(name: string | undefined, seed: number): string[] {
  const parsed = (name ?? "")
    .split(/[*×/·]|(?:\s-\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parsed.length >= 1) return parsed;
  // Deterministically pick 4 from the fallback pool.
  const picks: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    picks.push(FALLBACK_STREETS[(bits(seed, 24 + i * 2, 7)) % FALLBACK_STREETS.length]);
  }
  return picks;
}

function streetForArm(
  cardinal: Cardinal,
  parsed: string[],
): string {
  // 4 names → one per arm.  3 names → primary axis shares first name,
  // E and W get names 2/3.  2 names → primary axis shares first, secondary
  // axis shares second.  1 name → all arms share it.
  if (parsed.length >= 4) {
    return cardinal === "N"
      ? parsed[0]
      : cardinal === "E"
        ? parsed[1]
        : cardinal === "S"
          ? parsed[2]
          : parsed[3];
  }
  if (parsed.length === 3) {
    if (cardinal === "N" || cardinal === "S") return parsed[0];
    return cardinal === "E" ? parsed[1] : parsed[2];
  }
  if (parsed.length === 2) {
    return cardinal === "N" || cardinal === "S" ? parsed[0] : parsed[1];
  }
  return parsed[0] ?? "Rue sans nom";
}

// ─────────────────────────────────────────────────────────────────────────
// Arm builder
// ─────────────────────────────────────────────────────────────────────────

interface ArmSpec {
  id: string;
  bearingRad: number;
  cardinal: Cardinal;
  streetName: string;
  label: string;
  halfWidth: number;
  medianWidth: number;
  inbound: LaneKind[];
  outbound: LaneKind[];
  bhns?: boolean;
  busLane?: boolean;
}

const LANE_W = 3;
const ARM_LENGTH = 60;
const NODE_PAD = 1.0;

function buildArm(spec: ArmSpec): RoadArm {
  const lanes: Lane[] = [];

  let inboundOffset = spec.medianWidth / 2 + LANE_W / 2;
  spec.inbound.forEach((kind, i) => {
    lanes.push({
      id: `${spec.id}-IN-${i + 1}`,
      armId: spec.id,
      offset: inboundOffset,
      width: LANE_W,
      direction: "in",
      kind,
    });
    inboundOffset += LANE_W;
  });

  let outboundOffset = -(spec.medianWidth / 2 + LANE_W / 2);
  spec.outbound.forEach((kind, i) => {
    lanes.push({
      id: `${spec.id}-OUT-${i + 1}`,
      armId: spec.id,
      offset: outboundOffset,
      width: LANE_W,
      direction: "out",
      kind,
    });
    outboundOffset -= LANE_W;
  });

  const outward = dirVec(spec.bearingRad);
  return {
    id: spec.id,
    label: spec.label,
    bearing: spec.cardinal,
    streetName: spec.streetName,
    axis: {
      from: addP({ x: 0, y: 0 }, outward, NODE_PAD),
      to: addP({ x: 0, y: 0 }, outward, ARM_LENGTH),
    },
    halfWidth: spec.halfWidth,
    medianWidth: spec.medianWidth,
    bhns: spec.bhns,
    busLane: spec.busLane,
    lanes,
  };
}

const QUADRANT_LETTERS: Record<Cardinal, [string, string, string, string]> = {
  N: ["A", "B", "C", "D"],
  E: ["E", "F", "G", "H"],
  S: ["I", "J", "K", "L"],
  W: ["M", "N", "O", "P"],
};

const SIGNAL_GROUP: Record<Cardinal, string> = {
  N: "SG1",
  E: "SG3",
  S: "SG5",
  W: "SG7",
};
const PED_GROUP: Record<Cardinal, string> = {
  N: "SG2",
  E: "SG4",
  S: "SG6",
  W: "SG8",
};

const CABINET_OFFSETS: Record<Variation["cabinetQuadrant"], PlanPoint> = {
  NW: { x: -22, y: 16 },
  NE: { x: 22, y: 16 },
  SW: { x: -22, y: -16 },
  SE: { x: 22, y: -16 },
};

// Public input shape — extra fields are optional so existing callers
// keep compiling, but the autocad layout passes the full intersection.
export interface CivilPlanSeedInput {
  code: string;
  name: string;
  /** Pre-parsed street names (overrides parsing of `name`). */
  streetNames?: string[];
}

function normaliseInput(
  codeOrInput: string | CivilPlanSeedInput,
  maybeName?: string,
): CivilPlanSeedInput {
  if (typeof codeOrInput === "string") {
    return { code: codeOrInput, name: maybeName ?? codeOrInput };
  }
  return codeOrInput;
}

/**
 * Build a Casa-style sample plan that varies per intersection.
 *
 * Backwards-compatible: existing call sites that pass `(code, name)`
 * still work; new call sites can pass the full input shape.
 */
export function buildSampleCivilPlan(
  codeOrInput: string | CivilPlanSeedInput,
  maybeName?: string,
): CivilPlan {
  const input = normaliseInput(codeOrInput, maybeName);
  const variation = pickVariation(input.code);
  const seed = hashCode(input.code);
  const parsedStreets = input.streetNames?.length
    ? input.streetNames
    : parseStreetNames(input.name, seed);

  // ─── Resolve per-axis specs from variation ─────────────────────
  const primary = lanesForSize(variation.primarySize);
  const secondary = lanesForSize(variation.secondarySize);
  const primaryMedian = variation.bhns ? 4 : 2;
  const secondaryMedian = 1.5;

  const baseSpecs: Array<Omit<ArmSpec, "streetName" | "label">> = [
    {
      id: "arm-N",
      cardinal: "N",
      bearingRad: Math.PI / 2 + variation.skewRad,
      halfWidth: primary.halfWidth + (variation.bhns ? 2 : 0),
      medianWidth: primaryMedian,
      inbound: primary.inbound,
      outbound: primary.outbound,
      bhns: variation.bhns,
    },
    {
      id: "arm-S",
      cardinal: "S",
      bearingRad: -Math.PI / 2 + variation.skewRad,
      halfWidth: primary.halfWidth + (variation.bhns ? 2 : 0),
      medianWidth: primaryMedian,
      inbound: primary.inbound,
      outbound: primary.outbound,
      bhns: variation.bhns,
    },
    {
      id: "arm-E",
      cardinal: "E",
      bearingRad: -variation.skewRad,
      halfWidth: secondary.halfWidth,
      medianWidth: secondaryMedian,
      inbound: secondary.inbound,
      outbound: secondary.outbound,
      busLane: variation.busLane,
    },
    {
      id: "arm-W",
      cardinal: "W",
      bearingRad: Math.PI - variation.skewRad,
      halfWidth: secondary.halfWidth,
      medianWidth: secondaryMedian,
      inbound: secondary.inbound,
      outbound: secondary.outbound,
      busLane: variation.busLane,
    },
  ];

  // Drop one arm if T-junction.
  const armSpecs: ArmSpec[] = baseSpecs
    .filter((s) => variation.armCount === 4 || s.cardinal !== variation.drop)
    .map((s) => {
      const street = streetForArm(s.cardinal, parsedStreets);
      const labelDir =
        s.cardinal === "N"
          ? "Nord"
          : s.cardinal === "S"
            ? "Sud"
            : s.cardinal === "E"
              ? "Est"
              : "Ouest";
      return {
        ...s,
        streetName: street,
        label: `V${s.cardinal} — ${street} (${labelDir})`,
      };
    });

  const arms = armSpecs.map(buildArm);

  // ─── Stop lines ─────────────────────────────────────────────────
  const stopLines: StopLine[] = [];
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const outward = dirVec(spec.bearingRad);
    const p = perpVec(outward);
    const inboundCount = arm.lanes.filter((l) => l.direction === "in").length;
    const inboundSpan = inboundCount * LANE_W;
    const innerEdge = (arm.medianWidth ?? 0) / 2;
    const centreOffset = innerEdge + inboundSpan / 2;
    const stopDist = NODE_PAD + 8;
    const lineCentre = addP(
      addP({ x: 0, y: 0 }, outward, stopDist),
      p,
      centreOffset,
    );
    stopLines.push({
      id: `sl-${spec.cardinal}`,
      armId: arm.id,
      centre: lineCentre,
      length: inboundSpan,
      angle: Math.atan2(outward.y, outward.x) + Math.PI / 2,
    });
  }

  // ─── Crosswalks ─────────────────────────────────────────────────
  const crosswalks: Crosswalk[] = [];
  let pIndex = 1;
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const outward = dirVec(spec.bearingRad);
    const p = perpVec(outward);
    const cwDist = NODE_PAD + 12;
    const cwCentre = addP({ x: 0, y: 0 }, outward, cwDist);
    crosswalks.push({
      id: `cw-${spec.cardinal}-curb-L`,
      label: `P${pIndex}`,
      armId: arm.id,
      centre: addP(cwCentre, p, arm.halfWidth - 2),
      length: 4,
      width: 3.0,
      angle: Math.atan2(outward.y, outward.x) + Math.PI / 2,
    });
    pIndex += 1;
    crosswalks.push({
      id: `cw-${spec.cardinal}-curb-R`,
      label: `P${pIndex}`,
      armId: arm.id,
      centre: addP(cwCentre, p, -(arm.halfWidth - 2)),
      length: 4,
      width: 3.0,
      angle: Math.atan2(outward.y, outward.x) + Math.PI / 2,
    });
    pIndex += 1;
  }

  // ─── Refuge islands ─────────────────────────────────────────────
  const refugeIslands: RefugeIsland[] = [];
  let rIndex = 1;
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const outward = dirVec(spec.bearingRad);
    const islandCentre = addP({ x: 0, y: 0 }, outward, NODE_PAD + 13);
    refugeIslands.push({
      id: `island-${spec.cardinal}`,
      label: `P${rIndex}`,
      centre: islandCentre,
      shape: "pill",
      length: arm.halfWidth * 2 - 6,
      width: variation.bhns && (spec.cardinal === "N" || spec.cardinal === "S") ? 4.6 : 3.6,
      angle: Math.atan2(outward.y, outward.x) + Math.PI / 2,
    });
    rIndex += 1;
  }
  // Central refuge island.
  refugeIslands.push({
    id: "island-CTR",
    label: `P${rIndex}`,
    centre: { x: 0, y: 0 },
    shape: variation.bhns ? "pill" : "oval",
    length: variation.bhns ? 8 : 6,
    width: variation.bhns ? 4 : 4,
    angle: variation.bhns ? Math.PI / 2 + variation.skewRad : 0,
  });
  rIndex += 1;

  // ─── Supports ───────────────────────────────────────────────────
  const supports: SignalSupport[] = [];
  const supportPositions: Record<string, PlanPoint> = {};
  const hardwareFor = (kind: SignalSupport["kind"]) => {
    if (kind === "potence") return "R14dtd + R12";
    if (kind === "poteau") return "R11v + R12";
    return "R12";
  };

  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const cardinal = spec.cardinal;
    const d = dirVec(spec.bearingRad);
    const p = perpVec(d);
    const [l1, l2, l3, l4] = QUADRANT_LETTERS[cardinal];
    const sg = SIGNAL_GROUP[cardinal];
    const sgPed = PED_GROUP[cardinal];

    const inboundCurb = arm.halfWidth + 1.6;
    const refuge = (arm.medianWidth ?? 0) / 2 + 1.0;

    const aPos = addP(addP({ x: 0, y: 0 }, d, NODE_PAD + 8), p, inboundCurb);
    supports.push({
      id: l1,
      kind: "potence",
      hardwareLabel: hardwareFor("potence"),
      position: aPos,
      signalHeads: [
        { id: `${l1}-veh`, type: "R14dtd", signalGroupId: sg, orientation: Math.atan2(-d.y, -d.x) },
        { id: `${l1}-rep`, type: "R12", signalGroupId: sgPed, orientation: Math.atan2(-d.y, -d.x) },
      ],
    });
    supportPositions[l1] = aPos;

    const bPos = addP(addP({ x: 0, y: 0 }, d, NODE_PAD + 8), p, refuge);
    supports.push({
      id: l2,
      kind: "poteau",
      hardwareLabel: hardwareFor("poteau"),
      position: bPos,
      signalHeads: [
        { id: `${l2}-veh`, type: "R11v", signalGroupId: sg, orientation: Math.atan2(-d.y, -d.x) },
      ],
    });
    supportPositions[l2] = bPos;

    const cPos = addP(addP({ x: 0, y: 0 }, d, NODE_PAD + 17), p, inboundCurb);
    supports.push({
      id: l3,
      kind: "potelet",
      hardwareLabel: hardwareFor("potelet"),
      position: cPos,
      signalHeads: [
        { id: `${l3}-ped`, type: "R12", signalGroupId: sgPed, orientation: Math.atan2(p.y, p.x) },
      ],
    });
    supportPositions[l3] = cPos;

    const dPos = addP(addP({ x: 0, y: 0 }, d, NODE_PAD + 17), p, -inboundCurb);
    supports.push({
      id: l4,
      kind: "potelet",
      hardwareLabel: hardwareFor("potelet"),
      position: dPos,
      signalHeads: [
        { id: `${l4}-ped`, type: "R12", signalGroupId: sgPed, orientation: Math.atan2(-p.y, -p.x) },
      ],
    });
    supportPositions[l4] = dPos;
  }

  // ─── Detector loops V1..VN ──────────────────────────────────────
  const loops: DetectorLoop[] = [];
  let vIndex = 1;
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const cardinal = spec.cardinal;
    const d = dirVec(spec.bearingRad);
    const p = perpVec(d);
    const angleAlong = Math.atan2(d.y, d.x);
    const stopDist = NODE_PAD + 8;
    const inboundLanes = arm.lanes
      .filter((l) => l.direction === "in")
      .sort((a, b) => a.offset - b.offset);
    inboundLanes.forEach((lane) => {
      const presenceCentre = addP(
        addP({ x: 0, y: 0 }, d, stopDist + 4.0),
        p,
        lane.offset,
      );
      loops.push({
        id: `Bcl-V${vIndex}`,
        label: `V${vIndex}`,
        centre: presenceCentre,
        width: 2.0,
        length: 2.0,
        angle: angleAlong,
        assignedLaneId: lane.id,
      });
      vIndex += 1;
      // Advance loop only on heavy approaches (primary axis through lanes).
      if (
        (cardinal === "N" || cardinal === "S") &&
        (lane.kind === "through" || lane.kind === "through-right")
      ) {
        const advanceCentre = addP(
          addP({ x: 0, y: 0 }, d, stopDist + 22),
          p,
          lane.offset,
        );
        loops.push({
          id: `Bcl-V${vIndex}`,
          label: `V${vIndex}`,
          centre: advanceCentre,
          width: 2.0,
          length: 2.4,
          angle: angleAlong,
          assignedLaneId: lane.id,
        });
        vIndex += 1;
      }
    });
  }

  // ─── Cabinet ────────────────────────────────────────────────────
  const cabinetPos = CABINET_OFFSETS[variation.cabinetQuadrant];
  const cabinet: ControllerCabinet = {
    id: variation.carrefourTag,
    label: variation.carrefourTag,
    position: cabinetPos,
    footprint: 2.0,
  };

  // ─── Chambers ───────────────────────────────────────────────────
  const sltChambers: CableChamber[] = [
    { id: "1", label: "1", position: addP(cabinetPos, { x: 1, y: 1 }, 2.5), size: 1.0, kind: "slt" },
    { id: "2", label: "2", position: { x: -18, y: 6 }, size: 1.2, kind: "slt" },
    { id: "3", label: "3", position: { x: -8, y: 20 }, size: 1.2, kind: "slt" },
    { id: "4", label: "4", position: { x: 10, y: 20 }, size: 1.2, kind: "slt" },
    { id: "5", label: "5", position: { x: 20, y: 8 }, size: 1.2, kind: "slt" },
    { id: "6", label: "6", position: { x: 22, y: -6 }, size: 1.2, kind: "slt" },
    { id: "7", label: "7", position: { x: 14, y: -20 }, size: 1.2, kind: "slt" },
    { id: "8", label: "8", position: { x: -4, y: -22 }, size: 1.2, kind: "slt" },
  ];
  const boucleChambers: CableChamber[] = [
    { id: "B1", label: "B1", position: { x: -3, y: 14 }, size: 0.7, kind: "boucle" },
    { id: "B2", label: "B2", position: { x: 6, y: 14 }, size: 0.7, kind: "boucle" },
    { id: "B3", label: "B3", position: { x: 14, y: -2 }, size: 0.7, kind: "boucle" },
    { id: "B4", label: "B4", position: { x: 6, y: -14 }, size: 0.7, kind: "boucle" },
    { id: "B5", label: "B5", position: { x: -6, y: -14 }, size: 0.7, kind: "boucle" },
    { id: "B6", label: "B6", position: { x: -14, y: -2 }, size: 0.7, kind: "boucle" },
  ];
  const chambers = [...sltChambers, ...boucleChambers];

  // ─── Cable runs ─────────────────────────────────────────────────
  const chamberPos = new Map(chambers.map((c) => [c.id, c.position] as const));
  const runThrough = (chamberIds: string[], endPos: PlanPoint): PlanPoint[] => {
    const path = [cabinet.position];
    for (const cid of chamberIds) {
      const pos = chamberPos.get(cid);
      if (pos) path.push(pos);
    }
    path.push(endPos);
    return path;
  };

  const cableRuns: CableRun[] = [];

  // 1) Ceinturage ring through every SLT chamber.
  const ringPath: PlanPoint[] = [
    cabinet.position,
    ...sltChambers.map((c) => c.position),
    cabinet.position,
  ];
  cableRuns.push({
    id: `${variation.carrefourTag}-RING`,
    kind: "ring",
    path: ringPath,
    spec: "Ceinturage chambres",
    from: variation.carrefourTag,
    to: "RING",
    length: Math.round(pathLength(ringPath)),
    label: `${variation.carrefourTag}-CEINT`,
  });

  // 2) Per-support feeders.  Routes are derived from the support's
  //    quadrant so the chamber path stays valid even when armCount = 3.
  const SUPPORT_ROUTE_BY_QUADRANT: Record<Cardinal, string[]> = {
    N: ["1", "2", "3"],
    E: ["1", "2", "3", "4", "5"],
    S: ["1", "8", "7"],
    W: ["1"],
  };
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const route = SUPPORT_ROUTE_BY_QUADRANT[spec.cardinal];
    const letters = QUADRANT_LETTERS[spec.cardinal];
    letters.forEach((letter, i) => {
      const endPos = supportPositions[letter];
      if (!endPos) return;
      const path = runThrough(route, endPos);
      const sectionSpec = i === 0 ? "12 G 1.5" : "5 G 1.5";
      cableRuns.push({
        id: `${variation.carrefourTag}-${letter}`,
        kind: "signal",
        path,
        spec: sectionSpec,
        from: variation.carrefourTag,
        to: letter,
        length: Math.round(pathLength(path) * 1.05 + 2),
        label: `${variation.carrefourTag}-${letter}-${sectionSpec.replace(/\s+/g, "")}`,
      });
    });
  }

  // 3) Loop feeders.
  const LOOP_BUNDLE: Record<Cardinal, string[]> = {
    N: ["1", "2", "B1"],
    E: ["1", "2", "B3"],
    S: ["1", "8", "B4"],
    W: ["1", "B6"],
  };
  for (const arm of arms) {
    const spec = armSpecs.find((s) => s.id === arm.id)!;
    const route = LOOP_BUNDLE[spec.cardinal];
    const armLoops = loops.filter((l) =>
      arm.lanes.some((lane) => lane.id === l.assignedLaneId),
    );
    for (const loop of armLoops) {
      const path = runThrough(route, loop.centre);
      cableRuns.push({
        id: `${variation.carrefourTag}-${loop.id}`,
        kind: "loop",
        path,
        spec: "LIYCY 2 x 1.5",
        from: variation.carrefourTag,
        to: loop.id,
        length: Math.round(pathLength(path) * 1.05 + 2),
        label: `${variation.carrefourTag}-${loop.label}-2x1.5`,
      });
    }
  }

  // 4) Fibre trunk run.
  const fiberPath = runThrough(["1", "2", "3"], { x: -10, y: 28 });
  cableRuns.push({
    id: `${variation.carrefourTag}-FO`,
    kind: "fiber",
    path: fiberPath,
    spec: "FO 12 SM",
    from: variation.carrefourTag,
    to: "FO-RING",
    length: Math.round(pathLength(fiberPath) * 1.05 + 4),
    label: `${variation.carrefourTag}-FO-12SM`,
  });

  const bounds: PlanBounds = { minX: -38, minY: -32, maxX: 36, maxY: 32 };

  return {
    intersectionCode: input.code,
    intersectionName: input.name,
    streetNames: Array.from(new Set(arms.map((a) => a.streetName))),
    rotation: 0,
    bounds,
    arms,
    crosswalks,
    refugeIslands,
    stopLines,
    supports,
    loops,
    chambers,
    cableRuns,
    cabinet,
    defaultScale: 200,
  };
}

export interface ReferencePlanSeedInput {
  code: string;
  name: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  streetNames?: string[];
}

/**
 * Editable reference-style seed used when a new AI étude / proposal
 * needs an immediate AutoCAD surface.
 */
export function buildReferenceSeedCivilPlan(
  input: ReferencePlanSeedInput,
): CivilPlan {
  const plan = buildSampleCivilPlan({
    code: input.code,
    name: input.name,
    streetNames: input.streetNames,
  });
  plan.basePlan = {
    source: "template",
    mapCenter: {
      lat: input.latitude ?? 0,
      lng: input.longitude ?? 0,
    },
    importedAt: new Date().toISOString(),
    note: "Reference-style editable seed inspired by Plan RS / Dossier conventions.",
  };
  return plan;
}

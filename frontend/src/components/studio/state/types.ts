import type { CivilPlan } from "@/types/civil-plan";

export type ApproachBearing = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

// ────────────────────────── Workflow
//
// The six-stage pipeline that the Studio shell surfaces: Plan →
// Régulation → Câblage → Programme. Status is carried on the config
// so the AutoCAD page, the dossier preview and the Programmer can
// decide what to gate vs. what to show. All transitions are
// explicit; promotion is always human-triggered.
export type WorkflowStatus =
  | "draft_plan"
  | "validated_plan"
  | "regulation_ready"
  | "cablage_ready"
  | "programming_ready"
  | "approved";

export const WORKFLOW_ORDER: WorkflowStatus[] = [
  "draft_plan",
  "validated_plan",
  "regulation_ready",
  "cablage_ready",
  "programming_ready",
  "approved",
];

export interface RegulationSettings {
  /** Free-form description du fonctionnement linéaire (section 4.5) */
  linearDescription?: string;
  /** Matrice des distances dégagement-engagement (JSON string). */
  clearanceDistancesJson?: string;
  /** Matrice des temps de dégagement (JSON string). */
  clearanceTimesJson?: string;
  /** Observations / hypothèses — appears in the dossier cover. */
  observations?: string;
}

export interface CablageSettings {
  /** Manual override of the total cable quantities in the Quantitatif
   *  section, when the operator has a better ground-truth than what
   *  the renderer can compute. Optional — renderer falls back to the
   *  plan-derived totals when absent. */
  u1000r2v5gOverrideMetres?: number;
  u1000r2v7gOverrideMetres?: number;
  u1000r2v12gOverrideMetres?: number;
  liycyOverrideMetres?: number;
  fibreOverrideMetres?: number;
  notes?: string;
}

export interface ProgrammingSettings {
  /** Controller brand / model shown on the Programmer screen. */
  controllerModel?: string;
  /** Firmware targeted for the generated program. */
  firmwareTarget?: string;
  /** Operator-facing notes to the programmer. */
  notes?: string;
}

export type SignalAspect =
  | "red"
  | "yellow"
  | "green"
  | "arrow-left"
  | "arrow-right"
  | "arrow-straight"
  | "ped-walk"
  | "ped-stop";

export type DetectorKind =
  | "loop"
  | "radar"
  | "video"
  | "piezo"
  | "magnetometer";

// ────────────────────────── Multi-modal extensions
//
// The intersection model supports more than "general vehicle" traffic.
// Each signal group carries a `kind`, movements are modelled as first-
// class paths from one approach to another, and operating modes let the
// same intersection behave differently across the day (peak, tram
// priority, night, etc.).  All new fields are *optional* on the wire so
// intersections seeded before this upgrade continue to load cleanly —
// the store normaliser fills defaults at hydrate / seed time.

export type SignalGroupKind =
  | "vehicle" // general private-vehicle movements (default)
  | "tram" // light-rail / tramway
  | "busway" // BRT / dedicated bus lane
  | "pedestrian" // foot crossings
  | "emergency"; // emergency-vehicle preemption

export type Turning = "through" | "left" | "right" | "u-turn";

export interface Approach {
  id: string;
  bearing: ApproachBearing;
  label: string;
  lanes: number;
  notes?: string;
}

export interface SignalGroup {
  id: string;
  label: string;
  approachId?: string;
  aspects: SignalAspect[];
  /** Transport mode this signal group controls.  Defaults to
   *  `"vehicle"` when absent for backward-compat with pre-multimodal
   *  intersections. */
  kind?: SignalGroupKind;
  /** Optional explicit turning direction — overrides the heuristic
   *  that guesses from `label` (Left/Gauche/(L)/-L etc.). */
  turning?: Turning;
  notes?: string;
}

export interface Detector {
  id: string;
  label: string;
  approachId?: string;
  channel: string;
  kind: DetectorKind;
  notes?: string;
}

export interface Phase {
  id: string;
  label: string;
  greenSignalGroupIds: string[];
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  notes?: string;
}

export interface Stage {
  id: string;
  label: string;
  phaseId: string;
  order: number;
}

export interface ConflictPair {
  a: string;
  b: string;
}

// ────────────────────────── Lanes
//
// Real intersections have multiple lanes per approach, each with its
// own usage: dedicated left-turn, shared through-right, tram track,
// busway, bike lane, pedestrian crossing, etc.  Lanes are optional —
// intersections can still be modelled at approach-level only (the way
// the first version of Studio worked), in which case `config.lanes`
// is empty and the diagram falls back to the old evenly-distributed
// layout.

export type LaneType =
  | "general" // mixed-use vehicle lane
  | "through" // through-only vehicle lane
  | "left-turn"
  | "right-turn"
  | "shared-left-through"
  | "shared-through-right"
  | "tram"
  | "busway"
  | "taxi"
  | "bike"
  | "pedestrian-crossing"
  | "emergency";

/** Which kinds of movement a lane is physically configured for.  Mostly
 *  derivable from `type`, but an explicit list supports odd cases
 *  (e.g., a "through" lane that also permits right-turn by signage). */
export interface Lane {
  id: string;
  label: string;
  approachId: string;
  type: LaneType;
  /** Turnings permitted out of this lane.  When absent, derived
   *  heuristically from `type`. */
  allowedTurnings?: Turning[];
  /** Relative visual width hint (1.0 = standard).  Tram / busway
   *  lanes are typically drawn slightly wider. */
  widthFactor?: number;
  /** Tram / busway / emergency lanes carry priority. */
  priority?: boolean;
  /** Disabled lanes are drawn dimmed and excluded from the
   *  conflict / movement derivations. */
  enabled?: boolean;
  /** Signal groups that drive this lane.  A lane can have multiple
   *  (protected-then-permissive for the same turn) — most will have
   *  exactly one. */
  signalGroupIds?: string[];
  /** Stop-bar / advance detectors placed on this lane. */
  detectorIds?: string[];
  notes?: string;
}

// ────────────────────────── Movements
//
// A Movement represents a semantic *path* through the intersection
// (e.g. "left turn from North into East"), decoupled from the signal
// groups that physically drive it.  One movement can be controlled by
// several signal groups (protected-then-permissive greens) and one
// signal group can drive several movements (e.g., a through-and-right
// shared head).  Lane-level references (from/to-lane) are optional —
// when present they let the diagram anchor the movement on a specific
// lane centreline instead of inferring from the approach.

export interface Movement {
  id: string;
  label: string;
  kind: SignalGroupKind;
  /** Approach the movement originates from.  Omitted for crossings
   *  that don't have a clean "from" (e.g., a crosswalk that belongs
   *  to two approaches). */
  fromApproachId?: string;
  toApproachId?: string;
  /** Lane-level references.  When both are set, they take precedence
   *  over the approach-level refs for rendering and conflict checks. */
  fromLaneId?: string;
  toLaneId?: string;
  turning?: Turning;
  /** Public-transport priority flag — when true, priority requests
   *  from detectors of this movement can preempt the cycle. */
  priority?: boolean;
  /** Disabled movements are drawn dimmed on the diagram and
   *  excluded from the conflict-pre-flight checks. */
  enabled?: boolean;
  /** Signal groups that control this movement.  At least one when
   *  `enabled` is true.  Can be empty during design. */
  signalGroupIds: string[];
  notes?: string;
}

// ────────────────────────── Operating modes
//
// An OperatingMode is a "time-of-day" profile that restricts which
// phases the controller may run and, optionally, overrides cycle
// length or priority-request behaviour.  Modes are additive — an
// intersection with zero modes still runs exactly like before.

export type OperatingModeKind =
  | "normal"
  | "peak"
  | "tram-priority"
  | "bus-priority"
  | "night"
  | "flash"
  | "emergency"
  | "degraded";

export interface OperatingModePriorityRules {
  tramOnRequest?: boolean;
  busOnRequest?: boolean;
  emergencyPreemption?: boolean;
}

export interface OperatingMode {
  id: string;
  label: string;
  kind: OperatingModeKind;
  /** Phase ids that are allowed to run when this mode is active.  A
   *  phase not in this list is silently skipped by the cycle. */
  enabledPhaseIds: string[];
  /** Optional override for the total cycle length in seconds — useful
   *  for night or peak profiles. */
  cycleSecondsOverride?: number;
  priorityRules?: OperatingModePriorityRules;
  notes?: string;
}

export interface IntersectionConfig {
  id: string;
  /** Human-facing carrefour code (e.g. "CAR-0137"). Distinct from `id`,
   *  which for backend intersections is an opaque UUID. Optional for
   *  configs that predate this field — consumers fall back to `id`. */
  code?: string;
  identity: {
    name: string;
    district: string;
    address: string;
    location: { lat: number; lng: number };
  };
  controllerId: string;
  approaches: Approach[];
  signalGroups: SignalGroup[];
  detectors: Detector[];
  phases: Phase[];
  stages: Stage[];
  conflicts: ConflictPair[];
  /** Semantic movement layer — optional for backward compat. */
  movements?: Movement[];
  /** Lane-level model — optional for backward compat.  When empty,
   *  the diagram falls back to the approach-level layout. */
  lanes?: Lane[];
  /** Time-of-day / incident profiles — optional for backward compat. */
  modes?: OperatingMode[];
  /** Editable civil / topographic plan — single source of truth for
   *  the AutoCAD page, Régulation "Plan d'aménagement" section and
   *  Câblage "Plans tirage câbles" / "Carnet de câblage" sections. */
  civilPlan?: CivilPlan;
  /** Per-intersection Régulation dossier settings. */
  regulationSettings?: RegulationSettings;
  /** Per-intersection Câblage dossier settings. */
  cablageSettings?: CablageSettings;
  /** Per-intersection Programme settings. */
  programmingSettings?: ProgrammingSettings;
  /** Workflow state machine — drives Plan → Régulation → Câblage →
   *  Programme gating. Defaults to "draft_plan". */
  workflowStatus?: WorkflowStatus;
  /** Document revision shown on dossier covers. */
  revision?: string;
}

/**
 * Fully-populated view of an IntersectionConfig with all optional
 * multi-modal fields filled in (no undefined).  Use this when you
 * want to iterate over `movements`, `lanes` or `modes` without
 * null-checks.
 */
export interface NormalisedIntersectionConfig extends IntersectionConfig {
  movements: Movement[];
  lanes: Lane[];
  modes: OperatingMode[];
  regulationSettings: RegulationSettings;
  cablageSettings: CablageSettings;
  programmingSettings: ProgrammingSettings;
  workflowStatus: WorkflowStatus;
  revision: string;
}

/** Fill defaults for optional multi-modal fields.  Idempotent. */
export function normaliseIntersectionConfig(
  config: IntersectionConfig,
): NormalisedIntersectionConfig {
  return {
    ...config,
    signalGroups: config.signalGroups.map((sg) => ({
      ...sg,
      kind: sg.kind ?? "vehicle",
    })),
    movements: config.movements ?? [],
    lanes: config.lanes ?? [],
    modes: config.modes ?? [],
    regulationSettings: config.regulationSettings ?? {},
    cablageSettings: config.cablageSettings ?? {},
    programmingSettings: config.programmingSettings ?? {},
    workflowStatus: config.workflowStatus ?? "draft_plan",
    revision: config.revision ?? "A",
  };
}

export function canPromoteWorkflow(
  current: WorkflowStatus,
  target: WorkflowStatus,
): boolean {
  const currentIndex = WORKFLOW_ORDER.indexOf(current);
  const targetIndex = WORKFLOW_ORDER.indexOf(target);
  if (currentIndex < 0 || targetIndex < 0) return false;
  // Allow moving forward one step at a time, or backward to any earlier
  // stage (a human can always roll back to fix a mistake).
  return targetIndex <= currentIndex + 1;
}

// ────────────────────────── Lane helpers
//
// Kept in the types file because they're pure logic derived from the
// types themselves and are reused by the diagram + validator.

export function defaultAllowedTurnings(type: LaneType): Turning[] {
  switch (type) {
    case "left-turn":
      return ["left"];
    case "right-turn":
      return ["right"];
    case "through":
      return ["through"];
    case "shared-left-through":
      return ["left", "through"];
    case "shared-through-right":
      return ["through", "right"];
    case "tram":
    case "busway":
    case "taxi":
    case "bike":
    case "emergency":
    case "general":
      return ["through", "left", "right"];
    case "pedestrian-crossing":
      return [];
  }
}

export function laneKind(type: LaneType): SignalGroupKind {
  switch (type) {
    case "tram":
      return "tram";
    case "busway":
      return "busway";
    case "pedestrian-crossing":
      return "pedestrian";
    case "emergency":
      return "emergency";
    default:
      return "vehicle";
  }
}

export interface StudioPersistedState {
  version: 1;
  intersections: Record<string, IntersectionConfig>;
}

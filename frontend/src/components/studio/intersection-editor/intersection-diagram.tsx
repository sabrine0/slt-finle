"use client";

import { useMemo } from "react";

import type {
  Approach,
  ApproachBearing,
  ConflictPair,
  IntersectionConfig,
  Lane,
  LaneType,
  Phase,
  SignalGroup,
  SignalGroupKind,
} from "@/components/studio/state/types";

const VIEW = 800;
const CENTER = VIEW / 2;
const LANE_WIDTH = 18;
const LEG_LENGTH = 320;
const STOP_BAR_OFFSET = 60;
const ARROW_TAIL_BACKOFF = 56;

const BEARING_ANGLES: Record<ApproachBearing, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

const ALL_BEARINGS: ApproachBearing[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

type Turning = "through" | "left" | "right";

interface MovementArrow {
  signalGroup: SignalGroup;
  bearing: ApproachBearing;
  movementLabel: string;
  turning: Turning;
  laneIndex: number;
  laneTotal: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  control?: { x: number; y: number };
  midpoint: { x: number; y: number };
  labelPosition: { x: number; y: number };
}

interface LaneStrip {
  id: string;
  type: LaneType;
  widthFactor: number;
}

interface ApproachLayout {
  approach: Approach;
  bearing: ApproachBearing;
  signalGroups: SignalGroup[];
  forward: { x: number; y: number };
  perp: { x: number; y: number };
  laneCount: number;
  roadWidth: number;
  stopBarCenter: { x: number; y: number };
  outerEnd: { x: number; y: number };
  arrows: MovementArrow[];
  /** Lane strips to render along this approach, ordered kerb → median.
   *  Pedestrian-crossing lanes are filtered out — they're rendered as
   *  crosswalk zebra stripes by the `Crosswalk` component, not as part
   *  of the road surface.  Empty array = approach-level fallback. */
  laneStrips: LaneStrip[];
}

interface IntersectionDiagramProps {
  config: IntersectionConfig;
  highlightedPhaseId: string | null;
  hoveredSignalGroupId: string | null;
  onHoverSignalGroup: (id: string | null) => void;
  showAllConflicts: boolean;
  /**
   * Optional live-aspect lookup keyed by signal-group id.  When present,
   * arrows are coloured from the real runtime state (red/yellow/green) so
   * operators see what the controller is actually outputting — including
   * the yellow and red-clearance transitions.  Falls back to
   * phase-membership colouring when absent (used by the Engineering diagram).
   */
  liveAspects?: Map<string, "red" | "yellow" | "green">;
  /**
   * Live phase state (green / yellow / red-clearance / idle).  Tints the
   * centre plate so operators can tell at a glance which transition the
   * controller is in.  Optional — omitted by the Engineering diagram.
   */
  activePhaseState?: "green" | "yellow" | "red-clearance" | "idle" | null;
  /**
   * Signal-group ids that the operator-declared emergency route would
   * activate.  Movements with these ids get an extra accent halo so
   * operators can see the priority corridor at a glance.
   */
  emergencyRouteSgIds?: string[];
  /**
   * When true, paint a moving stroke-dash on green-aspect arrows to
   * indicate live flow.  Off by default so the Engineering diagram
   * stays static.
   */
  animateActiveFlow?: boolean;
  /**
   * Optional runtime detector activations.  Each entry is placed
   * along its approach's centerline (upstream of the stop bar) and
   * pulses when `active` is true.  Used by the Live tab to surface
   * loop / pedestrian-button events on top of the engineering
   * geometry.  Omitted by the Engineering diagram.
   */
  liveDetectors?: Array<{
    id: string;
    approachBearing: ApproachBearing;
    active: boolean;
    label?: string;
  }>;
}

function turningFromLabel(label: string | undefined): Turning {
  if (!label) return "through";
  const normalised = label.toLowerCase();
  if (
    /\bleft\b/.test(normalised) ||
    /\bgauche\b/.test(normalised) ||
    /\(l\)/.test(normalised) ||
    /-l\b/.test(normalised)
  ) {
    return "left";
  }
  if (
    /\bright\b/.test(normalised) ||
    /\bdroite\b/.test(normalised) ||
    /\(r\)/.test(normalised) ||
    /-r\b/.test(normalised)
  ) {
    return "right";
  }
  return "through";
}

function aspectColor(aspect: "red" | "yellow" | "green") {
  // Resolve through CSS variables so signal colors track the active theme.
  if (aspect === "green") return "var(--stls-sig-green)";
  if (aspect === "yellow") return "var(--stls-sig-yellow)";
  return "var(--stls-sig-red)";
}

function aspectForGroup(
  groupId: string,
  highlightedPhase: Phase | null,
): "red" | "yellow" | "green" {
  if (!highlightedPhase) return "red";
  return highlightedPhase.greenSignalGroupIds.includes(groupId) ? "green" : "red";
}

function unitVectors(bearing: ApproachBearing) {
  const rad = (BEARING_ANGLES[bearing] * Math.PI) / 180;
  // forward = direction from intersection center outward to the leg's far end
  const forward = { x: Math.sin(rad), y: -Math.cos(rad) };
  // perp = 90° clockwise from forward (used as "right of approach" direction)
  const perp = { x: -forward.y, y: forward.x };
  return { forward, perp };
}

function buildLayouts(config: IntersectionConfig): ApproachLayout[] {
  const approachByBearing = new Map<ApproachBearing, Approach>();
  for (const approach of config.approaches) {
    if (ALL_BEARINGS.includes(approach.bearing)) {
      // If two approaches share a bearing, take the first.
      if (!approachByBearing.has(approach.bearing)) {
        approachByBearing.set(approach.bearing, approach);
      }
    }
  }

  const groupsByApproachId = new Map<string, SignalGroup[]>();
  for (const group of config.signalGroups) {
    if (!group.approachId) continue;
    const list = groupsByApproachId.get(group.approachId) ?? [];
    list.push(group);
    groupsByApproachId.set(group.approachId, list);
  }

  // Bucket lanes by approach; keep only enabled + non-pedestrian-crossing
  // lanes in the road strips (pedestrian crossings still render as the
  // existing zebra component).  Preserve the input order kerb → median.
  const roadLanesByApproach = new Map<string, Lane[]>();
  for (const lane of config.lanes ?? []) {
    if (lane.enabled === false) continue;
    if (lane.type === "pedestrian-crossing") continue;
    const list = roadLanesByApproach.get(lane.approachId) ?? [];
    list.push(lane);
    roadLanesByApproach.set(lane.approachId, list);
  }

  const layouts: ApproachLayout[] = [];
  let movementCounter = 1;

  for (const bearing of ALL_BEARINGS) {
    const approach = approachByBearing.get(bearing);
    if (!approach) continue;

    const signalGroups = groupsByApproachId.get(approach.id) ?? [];
    const { forward, perp } = unitVectors(bearing);

    // Lane sizing: prefer lane-level model when present, fall back to
    // approach.lanes count.  Each lane's widthFactor scales LANE_WIDTH.
    const roadLanes = roadLanesByApproach.get(approach.id) ?? [];
    const laneStrips: LaneStrip[] = roadLanes.map((lane) => ({
      id: lane.id,
      type: lane.type,
      widthFactor: lane.widthFactor ?? 1,
    }));
    const laneCount = laneStrips.length > 0
      ? laneStrips.length
      : Math.max(1, Math.min(8, approach.lanes));
    const roadWidth = laneStrips.length > 0
      ? laneStrips.reduce((sum, s) => sum + s.widthFactor * LANE_WIDTH, 0)
      : laneCount * LANE_WIDTH;

    const stopBarCenter = {
      x: CENTER + forward.x * STOP_BAR_OFFSET,
      y: CENTER + forward.y * STOP_BAR_OFFSET,
    };
    const outerEnd = {
      x: CENTER + forward.x * LEG_LENGTH,
      y: CENTER + forward.y * LEG_LENGTH,
    };

    // Distribute SGs across lanes. If an approach has more SGs than lanes,
    // we still render each SG (they just stack on the same lane visually).
    const orderedSGs = [...signalGroups].sort((a, b) => {
      // sort: lefts first, throughs middle, rights last (visual lane mapping
      // mirrors right-hand-drive intuition: lefts on the inner side)
      const order: Record<Turning, number> = { left: 0, through: 1, right: 2 };
      return order[turningFromLabel(a.label)] - order[turningFromLabel(b.label)];
    });

    const arrows: MovementArrow[] = orderedSGs.map((sg, index) => {
      const turning = turningFromLabel(sg.label);
      const laneIndex = Math.min(index, laneCount - 1);
      const laneOffset =
        (laneIndex - (laneCount - 1) / 2) * LANE_WIDTH;

      const tail = {
        x: CENTER + forward.x * (LEG_LENGTH - ARROW_TAIL_BACKOFF) + perp.x * laneOffset,
        y: CENTER + forward.y * (LEG_LENGTH - ARROW_TAIL_BACKOFF) + perp.y * laneOffset,
      };

      const inwardLanePoint = {
        x: stopBarCenter.x + perp.x * laneOffset,
        y: stopBarCenter.y + perp.y * laneOffset,
      };

      let end: { x: number; y: number };
      let control: { x: number; y: number } | undefined;

      if (turning === "through") {
        end = {
          x: CENTER - forward.x * STOP_BAR_OFFSET + perp.x * laneOffset,
          y: CENTER - forward.y * STOP_BAR_OFFSET + perp.y * laneOffset,
        };
      } else {
        // For left/right turns, curve through the intersection center.
        // Exit direction is the bearing rotated -90° (left) or +90° (right).
        const exitBearing = rotateBearing(bearing, turning === "left" ? -90 : 90);
        const exit = unitVectors(exitBearing);
        end = {
          x: CENTER + exit.forward.x * STOP_BAR_OFFSET + exit.perp.x * (laneOffset / 2),
          y: CENTER + exit.forward.y * STOP_BAR_OFFSET + exit.perp.y * (laneOffset / 2),
        };
        control = {
          x: CENTER + perp.x * laneOffset * 0.4 + exit.perp.x * laneOffset * 0.4,
          y: CENTER + perp.y * laneOffset * 0.4 + exit.perp.y * laneOffset * 0.4,
        };
      }

      const midpoint = control
        ? quadraticMid(tail, control, end)
        : {
            x: (tail.x + end.x) / 2,
            y: (tail.y + end.y) / 2,
          };

      const labelPosition = {
        x: tail.x + forward.x * 24,
        y: tail.y + forward.y * 24,
      };

      const arrow: MovementArrow = {
        signalGroup: sg,
        bearing,
        movementLabel: `V${movementCounter}`,
        turning,
        laneIndex,
        laneTotal: laneCount,
        start: tail,
        end,
        control,
        midpoint,
        labelPosition,
      };
      movementCounter += 1;
      return arrow;
      // (laneIndex deliberately unused after construction; SVG positions encode it)
      void inwardLanePoint;
    });

    layouts.push({
      approach,
      bearing,
      signalGroups,
      forward,
      perp,
      laneCount,
      roadWidth,
      stopBarCenter,
      outerEnd,
      arrows,
      laneStrips,
    });
  }

  return layouts;
}

function rotateBearing(
  bearing: ApproachBearing,
  deltaDegrees: number,
): ApproachBearing {
  const current = BEARING_ANGLES[bearing];
  const target = ((current + deltaDegrees) % 360 + 360) % 360;
  let closest: ApproachBearing = bearing;
  let bestDist = Infinity;
  for (const candidate of ALL_BEARINGS) {
    const angle = BEARING_ANGLES[candidate];
    let dist = Math.abs(angle - target);
    if (dist > 180) dist = 360 - dist;
    if (dist < bestDist) {
      bestDist = dist;
      closest = candidate;
    }
  }
  return closest;
}

function quadraticMid(
  a: { x: number; y: number },
  c: { x: number; y: number },
  b: { x: number; y: number },
) {
  // Midpoint of a quadratic bezier at t=0.5
  return {
    x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x,
    y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y,
  };
}

export function IntersectionDiagram({
  config,
  highlightedPhaseId,
  hoveredSignalGroupId,
  onHoverSignalGroup,
  showAllConflicts,
  liveAspects,
  activePhaseState,
  emergencyRouteSgIds,
  animateActiveFlow = false,
  liveDetectors,
}: IntersectionDiagramProps) {
  const emergencyRouteSet = useMemo(
    () => new Set(emergencyRouteSgIds ?? []),
    [emergencyRouteSgIds],
  );
  const layouts = useMemo(() => buildLayouts(config), [config]);
  const highlightedPhase = useMemo<Phase | null>(() => {
    if (!highlightedPhaseId) return null;
    return config.phases.find((p) => p.id === highlightedPhaseId) ?? null;
  }, [config.phases, highlightedPhaseId]);

  const allArrows = useMemo(
    () => layouts.flatMap((layout) => layout.arrows),
    [layouts],
  );
  const arrowByGroupId = useMemo(() => {
    const map = new Map<string, MovementArrow>();
    for (const arrow of allArrows) map.set(arrow.signalGroup.id, arrow);
    return map;
  }, [allArrows]);

  const visibleConflicts = useMemo<ConflictPair[]>(() => {
    if (showAllConflicts) {
      return config.conflicts.filter(
        (pair) => arrowByGroupId.has(pair.a) && arrowByGroupId.has(pair.b),
      );
    }
    if (!hoveredSignalGroupId) return [];
    return config.conflicts.filter(
      (pair) =>
        (pair.a === hoveredSignalGroupId || pair.b === hoveredSignalGroupId) &&
        arrowByGroupId.has(pair.a) &&
        arrowByGroupId.has(pair.b),
    );
  }, [config.conflicts, hoveredSignalGroupId, showAllConflicts, arrowByGroupId]);

  if (layouts.length === 0) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div className="max-w-md">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-ink-3">
            Diagram
          </p>
          <p className="mt-3 text-[0.92rem] text-ink-1">
            No approaches with cardinal bearings configured. Add approaches in
            the <span className="text-accent-ink">Approaches</span> section to
            render the diagram.
          </p>
        </div>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label="Intersection engineering diagram"
      className="h-full w-full"
    >
      <defs>
        <radialGradient id="diagram-asphalt" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="var(--stls-asphalt-0)" />
          <stop offset="100%" stopColor="var(--stls-asphalt-1)" />
        </radialGradient>
        <linearGradient id="diagram-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--stls-road-0)" />
          <stop offset="100%" stopColor="var(--stls-road-1)" />
        </linearGradient>
        <marker
          id="diagram-arrow-red"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L12,6 L0,12 Z" fill="var(--stls-sig-red)" />
        </marker>
        <marker
          id="diagram-arrow-green"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L12,6 L0,12 Z" fill="var(--stls-sig-green)" />
        </marker>
        <marker
          id="diagram-arrow-yellow"
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L12,6 L0,12 Z" fill="var(--stls-sig-yellow)" />
        </marker>
      </defs>

      <rect x={0} y={0} width={VIEW} height={VIEW} fill="url(#diagram-asphalt)" />

      <CenterPad />
      {layouts.map((layout) => (
        <ApproachRoad key={`road-${layout.bearing}`} layout={layout} />
      ))}
      {layouts.map((layout) => (
        <Crosswalk key={`cw-${layout.bearing}`} layout={layout} />
      ))}
      {layouts.map((layout) => (
        <StopBar key={`sb-${layout.bearing}`} layout={layout} />
      ))}
      {layouts.map((layout) => (
        <ApproachTag key={`tag-${layout.bearing}`} layout={layout} />
      ))}

      {/* Detector overlays (when running in live mode) */}
      {liveDetectors && liveDetectors.length > 0 ? (
        <DetectorOverlay layouts={layouts} liveDetectors={liveDetectors} />
      ) : null}

      {/* Conflict arcs (under arrows) */}
      {visibleConflicts.map((pair) => {
        const a = arrowByGroupId.get(pair.a);
        const b = arrowByGroupId.get(pair.b);
        if (!a || !b) return null;
        const isHovered =
          hoveredSignalGroupId !== null &&
          (pair.a === hoveredSignalGroupId || pair.b === hoveredSignalGroupId);
        return (
          <ConflictArc
            key={`conflict-${pair.a}-${pair.b}`}
            from={a.midpoint}
            to={b.midpoint}
            emphasized={isHovered}
          />
        );
      })}

      {/* Movement arrows */}
      {allArrows.map((arrow) => {
        const aspect =
          liveAspects?.get(arrow.signalGroup.id) ??
          aspectForGroup(arrow.signalGroup.id, highlightedPhase);
        const color = aspectColor(aspect);
        const markerId =
          aspect === "green"
            ? "diagram-arrow-green"
            : aspect === "yellow"
              ? "diagram-arrow-yellow"
              : "diagram-arrow-red";
        const hovered = arrow.signalGroup.id === hoveredSignalGroupId;

        // A movement is "active" if its signal group belongs to the
        // currently-highlighted phase — even if its live aspect is red
        // (during a red-clearance window).  Idle reds recede; active
        // reds stay readable as "the phase that is finishing".
        const inActivePhase =
          highlightedPhase?.greenSignalGroupIds.includes(
            arrow.signalGroup.id,
          ) ?? false;

        let strokeWidth: number;
        let opacity: number;
        if (aspect === "green") {
          strokeWidth = hovered ? 6 : 5.2;
          opacity = 1;
        } else if (aspect === "yellow") {
          strokeWidth = hovered ? 5.5 : 4.6;
          opacity = 1;
        } else if (inActivePhase) {
          // Active-phase red = currently clearing.  Keep it readable.
          strokeWidth = hovered ? 5 : 4.2;
          opacity = 0.9;
        } else {
          // Idle red — recede so the eye immediately finds the active set.
          strokeWidth = hovered ? 3.8 : 2.6;
          opacity = hovered ? 0.85 : 0.45;
        }

        const path = arrow.control
          ? `M ${arrow.start.x} ${arrow.start.y} Q ${arrow.control.x} ${arrow.control.y} ${arrow.end.x} ${arrow.end.y}`
          : `M ${arrow.start.x} ${arrow.start.y} L ${arrow.end.x} ${arrow.end.y}`;

        const onEmergencyRoute = emergencyRouteSet.has(arrow.signalGroup.id);

        // ───── Kind-based visual overlay
        //
        // Default (vehicle): existing solid stroke.
        // Tram: long-short dash pattern — reads as light-rail track.
        // Busway: medium dash — BRT-style broken line.
        // Pedestrian: dotted short-short — crosswalk feel.
        // Emergency: solid with a soft danger halo.
        const kind = arrow.signalGroup.kind ?? "vehicle";
        const dashArray =
          kind === "tram"
            ? "16 5"
            : kind === "busway"
              ? "11 6"
              : kind === "pedestrian"
                ? "3 4"
                : kind === "emergency"
                  ? "22 4 4 4"
                  : undefined;
        // Tram rides a wider "track bed"; we render a thin underlay
        // behind the main stroke to suggest two parallel rails.
        const tramTrack = kind === "tram";
        const showEmergencyHalo = kind === "emergency";

        return (
          <g
            key={`arrow-${arrow.signalGroup.id}`}
            onMouseEnter={() => onHoverSignalGroup(arrow.signalGroup.id)}
            onMouseLeave={() => onHoverSignalGroup(null)}
            style={{ cursor: "pointer" }}
          >
            {/* Emergency-route halo: a soft amber glow under any movement
                that serves the operator-declared priority direction. */}
            {onEmergencyRoute ? (
              <path
                d={path}
                fill="none"
                stroke="var(--stls-accent)"
                strokeOpacity={0.32}
                strokeWidth={hovered ? 24 : 18}
                strokeLinecap="round"
              />
            ) : null}
            {/* Emergency-kind halo — always visible, distinct from the
                operator-declared route halo above. */}
            {showEmergencyHalo ? (
              <path
                d={path}
                fill="none"
                stroke="var(--stls-sig-red)"
                strokeOpacity={0.28}
                strokeWidth={hovered ? 22 : 16}
                strokeLinecap="round"
              />
            ) : null}
            {/* Tram track-bed underlay — a wide faint stroke below the
                main line gives the "two parallel rails" reading. */}
            {tramTrack ? (
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeOpacity={0.22}
                strokeWidth={strokeWidth + 4}
                strokeLinecap="round"
              />
            ) : null}
            {hovered ? (
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeOpacity={0.18}
                strokeWidth={20}
                strokeLinecap="round"
              />
            ) : null}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap={kind === "pedestrian" ? "butt" : "round"}
              strokeDasharray={dashArray}
              markerEnd={`url(#${markerId})`}
              opacity={opacity}
            />
            {/* Live-flow animation on green arrows in Control Mode. */}
            {animateActiveFlow && aspect === "green" ? (
              <path
                d={path}
                fill="none"
                stroke="var(--stls-stop-bar)"
                strokeWidth={Math.max(1.5, strokeWidth * 0.35)}
                strokeOpacity={0.85}
                strokeLinecap="round"
                className="stls-flow-dash pointer-events-none"
              />
            ) : null}
            {/* Blocked indicator: idle reds that sit in the conflict
                matrix against any currently-green SG.  Drawn as a small
                red bar across the midpoint of the arrow. */}
            {aspect === "red" && !inActivePhase ? (
              <line
                x1={arrow.midpoint.x - 5}
                y1={arrow.midpoint.y - 5}
                x2={arrow.midpoint.x + 5}
                y2={arrow.midpoint.y + 5}
                stroke="var(--stls-sig-red)"
                strokeWidth={1.6}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
            ) : null}
            <MovementBadge
              x={arrow.labelPosition.x}
              y={arrow.labelPosition.y}
              label={arrow.movementLabel}
              sgId={arrow.signalGroup.id}
              turning={arrow.turning}
              color={color}
              hovered={hovered}
              active={inActivePhase || aspect !== "red"}
              kind={kind}
            />
          </g>
        );
      })}

      <CenterPlate phase={highlightedPhase} activeState={activePhaseState} />
    </svg>
  );
}

function CenterPad() {
  return (
    <circle
      cx={CENTER}
      cy={CENTER}
      r={STOP_BAR_OFFSET + 14}
      className="fill-island"
      opacity={0.9}
    />
  );
}

/**
 * Per-type visual treatment for a lane strip.  `fill` paints the whole
 * lane rectangle; `label` is the short code drawn near the outer end of
 * the lane (only shown for non-generic lanes — plain vehicle lanes stay
 * unlabeled to avoid visual noise).  Colours mirror the badge tones used
 * throughout the Studio so operators learn one palette, not two.
 */
function laneStripStyle(type: LaneType): {
  fill: string;
  label: string | null;
  labelColor: string;
} {
  switch (type) {
    case "tram":
      return { fill: "#2a0f18", label: "TRAM", labelColor: "#ff9ab8" };
    case "busway":
      return { fill: "#2a1908", label: "BUS", labelColor: "#ffb87a" };
    case "bike":
      return { fill: "#0d1e14", label: "BIKE", labelColor: "#6bd49a" };
    case "taxi":
      return { fill: "#1f1a08", label: "TAXI", labelColor: "#f0c860" };
    case "emergency":
      return { fill: "#1f0a0a", label: "EMG", labelColor: "#ff8a8a" };
    case "left-turn":
      return { fill: "url(#diagram-road)", label: "L", labelColor: "#a9b4cc" };
    case "right-turn":
      return { fill: "url(#diagram-road)", label: "R", labelColor: "#a9b4cc" };
    case "shared-left-through":
      return { fill: "url(#diagram-road)", label: "L/T", labelColor: "#a9b4cc" };
    case "shared-through-right":
      return { fill: "url(#diagram-road)", label: "T/R", labelColor: "#a9b4cc" };
    case "through":
      return { fill: "url(#diagram-road)", label: null, labelColor: "#a9b4cc" };
    case "general":
    default:
      return { fill: "url(#diagram-road)", label: null, labelColor: "#a9b4cc" };
  }
}

function ApproachRoad({ layout }: { layout: ApproachLayout }) {
  const angleDeg = BEARING_ANGLES[layout.bearing];
  const roadY = -LEG_LENGTH;
  const roadH = LEG_LENGTH - 18;

  // Fallback path: no lane-level model — draw a single asphalt rectangle
  // plus evenly-spaced dashed dividers (legacy approach-level view).
  if (layout.laneStrips.length === 0) {
    return (
      <g transform={`translate(${CENTER} ${CENTER}) rotate(${angleDeg})`}>
        <rect
          x={-layout.roadWidth / 2}
          y={roadY}
          width={layout.roadWidth}
          height={roadH}
          fill="url(#diagram-road)"
        />
        {Array.from({ length: layout.laneCount - 1 }).map((_, i) => {
          const offset = (i + 1) * LANE_WIDTH - layout.roadWidth / 2;
          return (
            <line
              key={`ln-${i}`}
              x1={offset}
              y1={-LEG_LENGTH + 12}
              x2={offset}
              y2={-STOP_BAR_OFFSET - 12}
              className="stroke-lane-divider"
              strokeWidth={1.5}
              strokeDasharray="9 9"
            />
          );
        })}
      </g>
    );
  }

  // Lane-level path.  Strips are iterated kerb → median, so we lay them
  // out from +roadWidth/2 down to -roadWidth/2 along the rotated x axis.
  // Each strip owns [xLeft, xLeft + w]; divider lines sit at the left
  // edge of every non-kerb strip.  Positions are computed via a pure
  // reduce to satisfy the react-hooks/immutability rule.
  const stripCells = layout.laneStrips.reduce<
    Array<{ xLeft: number; w: number; strip: LaneStrip }>
  >((acc, strip) => {
    const w = strip.widthFactor * LANE_WIDTH;
    const prevLeft =
      acc.length === 0 ? layout.roadWidth / 2 : acc[acc.length - 1].xLeft;
    acc.push({ xLeft: prevLeft - w, w, strip });
    return acc;
  }, []);

  return (
    <g transform={`translate(${CENTER} ${CENTER}) rotate(${angleDeg})`}>
      {/* Base asphalt — covers any rounding gaps between strips. */}
      <rect
        x={-layout.roadWidth / 2}
        y={roadY}
        width={layout.roadWidth}
        height={roadH}
        fill="url(#diagram-road)"
      />
      {/* Per-type tinted strips */}
      {stripCells.map(({ xLeft, w, strip }) => {
        const style = laneStripStyle(strip.type);
        return (
          <rect
            key={`strip-fill-${strip.id}`}
            x={xLeft}
            y={roadY}
            width={w}
            height={roadH}
            fill={style.fill}
          />
        );
      })}
      {/* Kerb-side road edge lines — solid on the two outer boundaries. */}
      <line
        x1={-layout.roadWidth / 2}
        y1={-LEG_LENGTH + 12}
        x2={-layout.roadWidth / 2}
        y2={-STOP_BAR_OFFSET - 12}
        className="stroke-lane-divider"
        strokeWidth={1.8}
        strokeOpacity={0.7}
      />
      <line
        x1={layout.roadWidth / 2}
        y1={-LEG_LENGTH + 12}
        x2={layout.roadWidth / 2}
        y2={-STOP_BAR_OFFSET - 12}
        className="stroke-lane-divider"
        strokeWidth={1.8}
        strokeOpacity={0.7}
      />
      {/* Inter-lane dividers.  Tram/busway edges get solid lines (rail /
          BRT kerb); shared vehicle lanes get dashed white. */}
      {stripCells.slice(0, -1).map(({ xLeft, strip }, i) => {
        const next = stripCells[i + 1].strip;
        const solidEdge =
          strip.type === "tram" ||
          strip.type === "busway" ||
          strip.type === "emergency" ||
          strip.type === "bike" ||
          next.type === "tram" ||
          next.type === "busway" ||
          next.type === "emergency" ||
          next.type === "bike";
        return (
          <line
            key={`div-${strip.id}`}
            x1={xLeft}
            y1={-LEG_LENGTH + 12}
            x2={xLeft}
            y2={-STOP_BAR_OFFSET - 12}
            className="stroke-lane-divider"
            strokeWidth={solidEdge ? 1.8 : 1.4}
            strokeDasharray={solidEdge ? undefined : "9 9"}
            strokeOpacity={solidEdge ? 0.85 : 0.7}
          />
        );
      })}
      {/* Lane-type labels near the outer end — only for non-generic lanes. */}
      {stripCells.map(({ xLeft, w, strip }) => {
        const style = laneStripStyle(strip.type);
        if (!style.label) return null;
        return (
          <text
            key={`strip-lbl-${strip.id}`}
            x={xLeft + w / 2}
            y={roadY + 18}
            textAnchor="middle"
            fontSize={7.5}
            fontFamily="var(--font-geist-mono, monospace)"
            fontWeight={700}
            fill={style.labelColor}
            letterSpacing="0.12em"
            transform={`rotate(${-angleDeg} ${xLeft + w / 2} ${roadY + 18})`}
          >
            {style.label}
          </text>
        );
      })}
    </g>
  );
}

function Crosswalk({ layout }: { layout: ApproachLayout }) {
  const angleDeg = BEARING_ANGLES[layout.bearing];
  const stripes = 6;
  return (
    <g
      transform={`translate(${CENTER} ${CENTER}) rotate(${angleDeg})`}
      opacity={0.55}
    >
      {Array.from({ length: stripes }).map((_, i) => {
        const stripeWidth = layout.roadWidth / (stripes * 2);
        const x =
          -layout.roadWidth / 2 + i * stripeWidth * 2 + stripeWidth / 2;
        return (
          <rect
            key={`cw-${i}`}
            x={x}
            y={-(STOP_BAR_OFFSET - 6)}
            width={stripeWidth}
            height={14}
            className="fill-crosswalk"
            opacity={0.7}
          />
        );
      })}
    </g>
  );
}

function StopBar({ layout }: { layout: ApproachLayout }) {
  const angleDeg = BEARING_ANGLES[layout.bearing];
  return (
    <g transform={`translate(${CENTER} ${CENTER}) rotate(${angleDeg})`}>
      <line
        x1={-layout.roadWidth / 2}
        y1={-(STOP_BAR_OFFSET + 4)}
        x2={layout.roadWidth / 2}
        y2={-(STOP_BAR_OFFSET + 4)}
        className="stroke-stop-bar"
        strokeWidth={4}
      />
    </g>
  );
}

function ApproachTag({ layout }: { layout: ApproachLayout }) {
  const tagDistance = LEG_LENGTH + 18;
  const x = CENTER + layout.forward.x * tagDistance;
  const y = CENTER + layout.forward.y * tagDistance;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-22}
        y={-12}
        width={44}
        height={24}
        rx={4}
        className="fill-badge-fill stroke-badge-stroke"
        strokeWidth={1}
      />
      <text
        x={0}
        y={-1}
        textAnchor="middle"
        fontSize={9}
        fontFamily="var(--font-geist-mono, monospace)"
        className="fill-ink-3"
        letterSpacing="0.2em"
      >
        {layout.bearing}
      </text>
      <text
        x={0}
        y={9}
        textAnchor="middle"
        fontSize={8}
        fontFamily="var(--font-geist-mono, monospace)"
        className="fill-ink-1"
      >
        {layout.laneCount}L
      </text>
    </g>
  );
}

function MovementBadge({
  x,
  y,
  label,
  sgId,
  turning,
  color,
  hovered,
  active = true,
  kind = "vehicle",
}: {
  x: number;
  y: number;
  label: string;
  sgId: string;
  turning: Turning;
  color: string;
  hovered: boolean;
  active?: boolean;
  kind?: SignalGroupKind;
}) {
  // Bold one-letter turning indicator: L / S / R.  Easier to read at a
  // glance than the subtle ↖↑↗ glyphs, and still visually reinforced by
  // the curvature of the actual arrow line.
  const turningLetter =
    turning === "left" ? "L" : turning === "right" ? "R" : "S";
  // Kind glyph — one character marker shown in the top-right corner of
  // the badge when the movement is not a plain vehicle.  T=Tram,
  // B=Busway, P=Pedestrian, E=Emergency.
  const kindGlyph =
    kind === "tram"
      ? "T"
      : kind === "busway"
        ? "B"
        : kind === "pedestrian"
          ? "P"
          : kind === "emergency"
            ? "E"
            : null;
  return (
    <g transform={`translate(${x} ${y})`} opacity={hovered || active ? 1 : 0.55}>
      <rect
        x={-34}
        y={-13}
        width={68}
        height={26}
        rx={5}
        className="fill-badge-fill"
        stroke={hovered ? color : "var(--stls-badge-stroke)"}
        strokeWidth={hovered ? 1.5 : 1}
      />
      <text
        x={-24}
        y={3}
        textAnchor="middle"
        fontSize={11}
        fontFamily="var(--font-geist-mono, monospace)"
        fontWeight={700}
        fill={color}
      >
        {label}
      </text>
      <text
        x={-9}
        y={3.5}
        textAnchor="middle"
        fontSize={13}
        fontFamily="var(--font-geist-mono, monospace)"
        fontWeight={700}
        fill={color}
        letterSpacing="0.04em"
      >
        {turningLetter}
      </text>
      <text
        x={14}
        y={3}
        textAnchor="middle"
        fontSize={9}
        fontFamily="var(--font-geist-mono, monospace)"
        className="fill-ink-2"
        letterSpacing="0.04em"
      >
        {sgId.length > 8 ? sgId.slice(0, 7) + "…" : sgId}
      </text>
      {kindGlyph ? (
        <g transform="translate(28 -9)">
          <rect
            x={-5}
            y={-5}
            width={10}
            height={10}
            rx={2}
            fill={color}
            fillOpacity={0.18}
            stroke={color}
            strokeOpacity={0.7}
            strokeWidth={0.6}
          />
          <text
            x={0}
            y={2.5}
            textAnchor="middle"
            fontSize={8}
            fontFamily="var(--font-geist-mono, monospace)"
            fontWeight={700}
            fill={color}
          >
            {kindGlyph}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function CenterPlate({
  phase,
  activeState,
}: {
  phase: Phase | null;
  activeState?: "green" | "yellow" | "red-clearance" | "idle" | null;
}) {
  if (!phase) {
    return (
      <g>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={36}
          className="fill-badge-fill stroke-badge-stroke"
          strokeWidth={1}
        />
        <text
          x={CENTER}
          y={CENTER + 4}
          textAnchor="middle"
          fontSize={9}
          fontFamily="var(--font-geist-mono, monospace)"
          className="fill-ink-3"
          letterSpacing="0.18em"
        >
          NO PHASE
        </text>
      </g>
    );
  }
  const cycle =
    phase.minGreenSeconds + phase.yellowSeconds + phase.redClearanceSeconds;

  // Outer halo color tracks the live phase state.  Falls back to the
  // amber accent ring when no live state is provided (Engineering view).
  const haloStroke =
    activeState === "green"
      ? "var(--stls-sig-green)"
      : activeState === "yellow"
        ? "var(--stls-sig-yellow)"
        : activeState === "red-clearance"
          ? "var(--stls-sig-red)"
          : "var(--stls-accent-stroke)";
  const haloOpacity = activeState && activeState !== "idle" ? 0.55 : 0;

  return (
    <g>
      {/* Soft outer halo — only visible when we know the live state. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={52}
        fill="none"
        stroke={haloStroke}
        strokeWidth={5}
        opacity={haloOpacity}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={42}
        className="fill-badge-fill"
        stroke={
          activeState && activeState !== "idle"
            ? haloStroke
            : "var(--stls-accent-stroke)"
        }
        strokeWidth={1.5}
      />
      <text
        x={CENTER}
        y={CENTER - 8}
        textAnchor="middle"
        fontSize={9}
        fontFamily="var(--font-geist-mono, monospace)"
        className="fill-ink-3"
        letterSpacing="0.18em"
      >
        PHASE
      </text>
      <text
        x={CENTER}
        y={CENTER + 6}
        textAnchor="middle"
        fontSize={13}
        fontFamily="var(--font-geist-mono, monospace)"
        fontWeight={700}
        fill={
          activeState && activeState !== "idle"
            ? haloStroke
            : "var(--stls-accent-ink)"
        }
      >
        {phase.id}
      </text>
      <text
        x={CENTER}
        y={CENTER + 22}
        textAnchor="middle"
        fontSize={9}
        fontFamily="var(--font-geist-mono, monospace)"
        className="fill-ink-2"
      >
        {cycle}s
      </text>
    </g>
  );
}

function ConflictArc({
  from,
  to,
  emphasized,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  emphasized: boolean;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const bulge = Math.min(60, length * 0.22);
  const cx = mx + nx * bulge;
  const cy = my + ny * bulge;

  return (
    <g
      style={{
        opacity: emphasized ? 1 : 0.55,
        transition: "opacity 0.15s ease-out",
      }}
    >
      <path
        d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
        fill="none"
        stroke="var(--stls-danger)"
        strokeWidth={emphasized ? 2.4 : 1.6}
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      {emphasized ? (
        <circle cx={cx} cy={cy} r={3} fill="var(--stls-danger)" opacity={0.9} />
      ) : null}
    </g>
  );
}

export type { MovementArrow };

function DetectorOverlay({
  layouts,
  liveDetectors,
}: {
  layouts: ApproachLayout[];
  liveDetectors: NonNullable<IntersectionDiagramProps["liveDetectors"]>;
}) {
  // Bucket detectors by approach bearing so we can stack them upstream
  // of the stop bar along each approach's centerline.
  const byBearing = new Map<
    ApproachBearing,
    NonNullable<IntersectionDiagramProps["liveDetectors"]>
  >();
  for (const detector of liveDetectors) {
    const list = byBearing.get(detector.approachBearing) ?? [];
    list.push(detector);
    byBearing.set(detector.approachBearing, list);
  }

  return (
    <g>
      {layouts.map((layout) => {
        const detectors = byBearing.get(layout.bearing) ?? [];
        if (detectors.length === 0) return null;
        return detectors.map((detector, index) => {
          const distance = 64 + index * 36;
          const cx = layout.stopBarCenter.x + layout.forward.x * distance;
          const cy = layout.stopBarCenter.y + layout.forward.y * distance;
          const rotationDeg =
            (Math.atan2(layout.forward.y, layout.forward.x) * 180) / Math.PI;
          const activeFill = "var(--stls-sig-green)";
          const idleFill = "var(--stls-stroke-2)";
          return (
            <g
              key={`det-${layout.bearing}-${detector.id}`}
              transform={`translate(${cx} ${cy}) rotate(${rotationDeg})`}
            >
              <rect
                x={-20}
                y={-7}
                width={40}
                height={14}
                rx={2}
                fill="var(--stls-badge-fill)"
                stroke="var(--stls-badge-stroke)"
                strokeWidth={1}
              />
              <rect
                x={-16}
                y={-4}
                width={32}
                height={8}
                rx={1.5}
                fill={detector.active ? activeFill : idleFill}
                opacity={detector.active ? 0.95 : 0.55}
              >
                {detector.active ? (
                  <animate
                    attributeName="opacity"
                    values="0.6;1;0.6"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                ) : null}
              </rect>
              <text
                x={0}
                y={-11}
                textAnchor="middle"
                fontSize={9}
                fontFamily="var(--font-geist-mono, monospace)"
                fill="var(--stls-ink-2)"
              >
                {detector.label ?? detector.id}
              </text>
            </g>
          );
        });
      })}
    </g>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BackdropImage,
  BaseLayerFeature,
  BaseLayerKind,
  CableChamber,
  CableRun,
  CivilPlan,
  CivilPlanLayer,
  Crosswalk,
  DetectorLoop,
  Lane,
  PlanBounds,
  PlanPoint,
  RefugeIsland,
  RoadArm,
  SignalSupport,
  StopLine,
} from "@/types/civil-plan";

export interface CivilPlanThemeColors {
  background: string;
  pavement: string;
  asphalt: string;
  curb: string;
  /** Red kerb outline drawn around the road perimeter. */
  curbAccent: string;
  laneMark: string;
  crosswalk: string;
  stopLine: string;
  arrow: string;
  /** Curved per-movement arrow colour (blue in real plans). */
  movementArrow: string;
  label: string;
  labelSoft: string;
  supportPotence: string;
  supportPoteau: string;
  supportPotelet: string;
  supportRing: string;
  loop: string;
  /** Yellow loop-detector body fill. */
  loopBox: string;
  /** Grey hatched cap on each end of the loop body. */
  loopCap: string;
  chamber: string;
  chamberFill: string;
  /** Loop junction box (small dark square). */
  chamberBoucleStroke: string;
  chamberBoucleFill: string;
  /** Refuge-island fills + stroke + zebra hatch. */
  islandFill: string;
  islandStroke: string;
  islandHatch: string;
  islandLabel: string;
  cable: string;
  /** Per-cable colours, matching real-plan legend. */
  cableSignal: string;
  cableLoop: string;
  cableFiber: string;
  cableRing: string;
  cabinet: string;
  cabinetStroke: string;
  /** BHNS / tramway corridor colours (used when arm.bhns is true). */
  tramBed: string;
  tramRail: string;
  tramTie: string;
  /** Bus-lane tint on the curb-side outbound lane (when arm.busLane). */
  busLane: string;
  gridMinor: string;
  gridMajor: string;
  scaleBar: string;
  northArrow: string;
  legendBg: string;
  legendStroke: string;
  basePlanStroke: string;
  basePlanStrokeSoft: string;
  basePlanFill: string;
  /** Optional CAD-overlay colours. Falls back to gridMajor / label when
   *  unset, so old themes still render. */
  crosshair?: string;
  selection?: string;
  grip?: string;
  marquee?: string;
  marqueeFill?: string;
  snapMarker?: string;
}

export const darkPlanTheme: CivilPlanThemeColors = {
  background: "#0a1012",
  pavement: "#0f1619",
  asphalt: "#1a242a",
  curb: "#e6c178",
  curbAccent: "#ef4444",
  laneMark: "#f0f4e8",
  crosswalk: "#e8ecea",
  stopLine: "#f3f7f1",
  arrow: "#d8dedb",
  movementArrow: "#60a5fa",
  label: "#edf3ee",
  labelSoft: "#8fa39a",
  supportPotence: "#f59e0b",
  supportPoteau: "#3b82f6",
  supportPotelet: "#10b981",
  supportRing: "#05070a",
  loop: "#fde047",
  loopBox: "#fde047",
  loopCap: "#94a3b8",
  chamber: "#f9a8d4",
  chamberFill: "#3b1d2c",
  chamberBoucleStroke: "#525252",
  chamberBoucleFill: "#1f1f1f",
  islandFill: "#1e3a8a",
  islandStroke: "#3b82f6",
  islandHatch: "#60a5fa",
  islandLabel: "#f8fafc",
  cable: "#a855f7",
  cableSignal: "#22c55e",
  cableLoop: "#fb923c",
  cableFiber: "#3b82f6",
  cableRing: "#d946ef",
  cabinet: "#14100a",
  cabinetStroke: "#ffb547",
  tramBed: "#1d3b2a",
  tramRail: "#cbd5e1",
  tramTie: "#94a3b8",
  busLane: "rgba(56,189,248,0.18)",
  gridMinor: "rgba(255,255,255,0.04)",
  gridMajor: "rgba(255,255,255,0.07)",
  scaleBar: "#edf3ee",
  northArrow: "#edf3ee",
  legendBg: "rgba(10,16,18,0.92)",
  legendStroke: "rgba(255,255,255,0.18)",
  basePlanStroke: "#8ed2ef",
  basePlanStrokeSoft: "rgba(142,210,239,0.35)",
  basePlanFill: "rgba(142,210,239,0.05)",
  crosshair: "rgba(255,255,255,0.22)",
  selection: "#38bdf8",
  grip: "#38bdf8",
  marquee: "#38bdf8",
  marqueeFill: "rgba(56,189,248,0.10)",
  snapMarker: "#fde047",
};

export const lightPlanTheme: CivilPlanThemeColors = {
  background: "#ffffff",
  pavement: "#f4f1e8",
  asphalt: "#dcd6c0",
  curb: "#9a7f3c",
  curbAccent: "#dc2626",
  laneMark: "#2a3440",
  crosswalk: "#3a4450",
  stopLine: "#2a3440",
  arrow: "#1b2322",
  movementArrow: "#2563eb",
  label: "#1b2322",
  labelSoft: "#56605b",
  supportPotence: "#c2410c",
  supportPoteau: "#1d4ed8",
  supportPotelet: "#047857",
  supportRing: "#ffffff",
  loop: "#ca8a04",
  loopBox: "#fde68a",
  loopCap: "#737373",
  chamber: "#be185d",
  chamberFill: "#fce7f3",
  chamberBoucleStroke: "#404040",
  chamberBoucleFill: "#1f1f1f",
  islandFill: "#bfdbfe",
  islandStroke: "#1d4ed8",
  islandHatch: "#3b82f6",
  islandLabel: "#1e3a8a",
  cable: "#7c3aed",
  cableSignal: "#15803d",
  cableLoop: "#c2410c",
  cableFiber: "#1d4ed8",
  cableRing: "#a21caf",
  cabinet: "#fff4db",
  cabinetStroke: "#b45309",
  tramBed: "#bbf7d0",
  tramRail: "#475569",
  tramTie: "#94a3b8",
  busLane: "rgba(14,116,144,0.16)",
  gridMinor: "rgba(13,24,36,0.05)",
  gridMajor: "rgba(13,24,36,0.08)",
  scaleBar: "#1b2322",
  northArrow: "#1b2322",
  legendBg: "rgba(255,255,255,0.92)",
  legendStroke: "rgba(13,24,36,0.18)",
  basePlanStroke: "#1d4ed8",
  basePlanStrokeSoft: "rgba(29,78,216,0.45)",
  basePlanFill: "rgba(29,78,216,0.05)",
  crosshair: "rgba(13,24,36,0.22)",
  selection: "#0284c7",
  grip: "#0284c7",
  marquee: "#0284c7",
  marqueeFill: "rgba(2,132,199,0.10)",
  snapMarker: "#ca8a04",
};

/** Element kinds the renderer knows how to drag in edit mode. */
export type DraggableKind = "support" | "loop" | "chamber" | "cabinet";

// Coordinates derived from Math.cos / Math.sin can differ between the
// Node SSR pass and the V8-on-Chromium hydration pass in the last
// digit of their float representation, which makes React warn about
// attribute hydration mismatches.  Rounding to four decimals (0.1 mm
// for a metres-scale plan) is far finer than any real engineering
// tolerance and makes both engines stringify the value identically.
const COORD_PRECISION = 10000;
function r(n: number): number {
  return Math.round(n * COORD_PRECISION) / COORD_PRECISION;
}

/** Shared editing props passed down to every draggable layer. */
interface EditableLayerProps {
  editable?: boolean;
  startDrag?: (
    kind: DraggableKind,
    id: string,
    anchor: PlanPoint,
  ) => (event: React.PointerEvent<SVGElement>) => void;
  livePos?: (
    kind: DraggableKind,
    id: string,
    dataPos: PlanPoint,
  ) => PlanPoint;
  /** Set of selected entity keys ("kind:id"). Selected entities draw a
   *  highlight ring + corner grip handles. */
  selectedKeys?: ReadonlySet<string>;
}

/** Viewport state — overrides the computed viewBox for pan/zoom. */
export interface CadViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Snap configuration applied to drag end-points. */
export interface CadSnap {
  /** When true, drag positions snap to a grid of `gridStep` metres. */
  grid: boolean;
  gridStep: number;
  /** When true, drag positions snap to other entity anchors within
   *  `osnapRadius` metres. */
  osnap: boolean;
  osnapRadius: number;
  /** When true, drag is constrained to the dominant axis (H or V) from
   *  the drag origin. */
  ortho: boolean;
}

export const defaultCadSnap: CadSnap = {
  grid: true,
  gridStep: 1,
  osnap: true,
  osnapRadius: 1.5,
  ortho: false,
};

interface CivilPlanRendererProps {
  plan: CivilPlan;
  layers: Record<CivilPlanLayer, boolean>;
  theme?: CivilPlanThemeColors;
  /** Optional extra padding in metres around the plan bounds. */
  padding?: number;
  /** When true, the SVG renders without any interactive affordances —
   * used by the PDF exporter. */
  forExport?: boolean;
  /** When true, supports / loops / chambers / cabinet become draggable
   *  via mouse.  Drag-end fires `onMutate`. */
  editable?: boolean;
  /** Fired on drag-end with the new plan-frame position in metres. */
  onMutate?: (
    kind: DraggableKind,
    id: string,
    position: PlanPoint,
  ) => void;
  /** Optional viewport override — when set, replaces the computed
   *  viewBox so the parent owns pan/zoom state. */
  viewport?: CadViewport | null;
  /** Fired whenever the viewport changes (wheel zoom or middle-button
   *  pan). Parent should store the new viewport and pass it back. */
  onViewportChange?: (next: CadViewport) => void;
  /** Fired whenever the cursor moves over the canvas (in plan-frame
   *  metres). Used by parent for an X/Y status bar. */
  onCursorChange?: (point: PlanPoint | null) => void;
  /** Set of selected entity keys ("kind:id"). */
  selection?: ReadonlySet<string>;
  /** Fired when the user clicks an entity (or empty area) to change
   *  selection. The parent owns selection state. */
  onSelectionChange?: (next: Set<string>) => void;
  /** Snap configuration. When undefined, no snapping is applied (raw
   *  pointer position). */
  snap?: CadSnap;
  /** Fired with a batch of entity moves — used when the user drags one
   *  member of a multi-selection so all selected entities are moved as
   *  a group in a single undoable step. */
  onBatchMove?: (
    moves: Array<{
      kind: DraggableKind;
      id: string;
      position: PlanPoint;
    }>,
  ) => void;
  /** When set, the renderer is in command mode (M / CO / RO).  It
   *  intercepts left-clicks to feed points to the parent state machine
   *  and shows a rubber-band line from `basePoint` to the cursor. */
  command?: CadCommand | null;
  /** Fired with the snapped plan-frame point under the cursor when the
   *  user left-clicks during a command. */
  onCommandPoint?: (point: PlanPoint) => void;
}

/** Command-mode state. Non-null means the renderer should treat the
 *  next left-click as a command point rather than starting a marquee. */
export interface CadCommand {
  kind: "move" | "copy" | "rotate";
  /** What the next click is supplying. */
  phase: "base" | "dest" | "angle";
  /** First click location; only present after the user has picked it. */
  basePoint?: PlanPoint;
  /** Second click for rotate (reference angle). */
  refPoint?: PlanPoint;
  /** Short prompt rendered by the parent in the status bar. */
  prompt: string;
}

/**
 * Renders the civil plan as a single SVG with a local metres→pixel
 * transform.  When `editable=true`, supports / loops / chambers /
 * cabinet become draggable: mousedown captures the drag, mousemove
 * updates a transient overlay, and mouseup commits to `onMutate`.
 */
export function CivilPlanRenderer({
  plan,
  layers,
  theme = darkPlanTheme,
  padding = 4,
  forExport = false,
  editable = false,
  onMutate,
  viewport,
  onViewportChange,
  onCursorChange,
  selection,
  onSelectionChange,
  snap,
  onBatchMove,
  command,
  onCommandPoint,
}: CivilPlanRendererProps) {
  const view = useMemo(() => computeViewBox(plan.bounds, padding), [plan.bounds, padding]);
  const planGroupRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Effective viewBox used for rendering. When the parent supplies a
  // `viewport` we use it (pan/zoom mode); otherwise we fall back to the
  // computed one. We keep both numeric form (for math) and the string
  // form (for the SVG attribute).
  const effectiveBox = viewport ?? view.box;
  const effectiveViewBox = viewport
    ? `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`
    : view.viewBox;

  // Live drag state — { kind, id, position } while dragging, null when
  // idle.  Drives a transparent overlay that follows the cursor.
  // `group`, when present, lists the OTHER selected entities (by key)
  // that should follow this drag with the same delta — so multi-select
  // moves work as a single coherent transformation.
  const [drag, setDrag] = useState<
    | null
    | {
        kind: DraggableKind;
        id: string;
        position: PlanPoint;
        group?: { siblings: Set<string>; delta: PlanPoint };
      }
  >(null);

  // The snap marker shown at the snapped point during a drag.  Resets
  // to null when not dragging.
  const [snapMarker, setSnapMarker] = useState<
    null | { kind: "osnap" | "grid" | "ortho"; at: PlanPoint }
  >(null);

  // Live marquee (rubber-band selection rectangle) state.  Stored in
  // plan-frame coords so the rect is correct under any pan/zoom.
  // `additive` = shift was held at start, so the marquee adds to the
  // existing selection instead of replacing it.
  const [marquee, setMarquee] = useState<
    null | { startPlan: PlanPoint; currentPlan: PlanPoint; additive: boolean }
  >(null);

  // Live cursor in plan-frame metres (Y up). Drives the crosshair and
  // bubbles up via onCursorChange so the parent can render an X/Y
  // status bar.
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  const cursorBubble = useCallback(
    (next: PlanPoint | null) => {
      setCursor(next);
      if (onCursorChange) onCursorChange(next);
    },
    [onCursorChange],
  );

  // Live pan state — captured on middle-button (or alt+left) pointer
  // down, cleared on pointer up. We store the starting screen point and
  // the starting viewBox so the move math stays simple.
  const [panState, setPanState] = useState<
    null | {
      startSx: number;
      startSy: number;
      startBox: CadViewport;
      pointerId: number;
    }
  >(null);

  const screenToPlan = useCallback((clientX: number, clientY: number): PlanPoint | null => {
    const node = planGroupRef.current;
    const svg = node?.ownerSVGElement;
    if (!node || !svg) return null;
    const ctm = node.getScreenCTM();
    if (!ctm) return null;
    const inverse = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(inverse);
    return { x: local.x, y: local.y };
  }, []);

  // ─── Pan / Zoom (wheel + middle-button drag) ──────────────────────
  // Wheel zooms around the cursor: the world point under the cursor
  // stays put while the viewBox shrinks (zoom in) or grows (zoom out).
  // No-op when forExport so PDFs render with the canonical view.
  //
  // We attach the wheel listener via useEffect with {passive:false} so
  // preventDefault() actually stops the page from scrolling. React's
  // synthetic onWheel is registered as passive in modern React, which
  // would silently ignore preventDefault and let the page scroll under
  // us during zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || forExport || !onViewportChange) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const box = effectiveBox;
      const wx = box.x + (sx / rect.width) * box.w;
      const wy = box.y + (sy / rect.height) * box.h;
      const factor = event.deltaY < 0
        ? (event.shiftKey ? 1.05 : 1.15)
        : 1 / (event.shiftKey ? 1.05 : 1.15);
      const newW = box.w / factor;
      const newH = box.h / factor;
      const newX = wx - (sx / rect.width) * newW;
      const newY = wy - (sy / rect.height) * newH;
      onViewportChange({ x: newX, y: newY, w: newW, h: newH });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [effectiveBox, forExport, onViewportChange]);

  // Convert canvas pixel coords (within the SVG element bounds) to
  // plan-frame metres.  Used by the SVG-level handlers for marquee +
  // cursor tracking; entity-level handlers use the SVG CTM helper
  // (screenToPlan) which works in client coords.
  const pixelToPlan = useCallback(
    (sx: number, sy: number, rect: DOMRect): PlanPoint => {
      const box = effectiveBox;
      const wx = box.x + (sx / rect.width) * box.w;
      const wy = box.y + (sy / rect.height) * box.h;
      return { x: wx, y: -wy };
    },
    [effectiveBox],
  );

  // Pointer down at the SVG level. Order of intent (entity handlers
  // stop propagation, so they pre-empt this entirely):
  //   1. Middle-button OR alt+left → start pan
  //   2. Left button in edit mode  → start marquee selection (rubber-
  //      band rectangle).  If the user then doesn't move > threshold,
  //      pointerup treats it as a click on empty area and clears the
  //      selection.
  const handleSvgPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (forExport) return;
      const wantsPan =
        event.button === 1 || (event.button === 0 && event.altKey);
      if (wantsPan) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        setPanState({
          startSx: event.clientX - rect.left,
          startSy: event.clientY - rect.top,
          startBox: { ...effectiveBox },
          pointerId: event.pointerId,
        });
        return;
      }
      if (editable && event.button === 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        const planP = pixelToPlan(
          event.clientX - rect.left,
          event.clientY - rect.top,
          rect,
        );
        // Command mode (M / CO / RO) — left-click feeds the next point
        // to the parent state machine.  Snap is applied so the picked
        // point lands on grid / object / ortho.
        if (command && onCommandPoint) {
          event.preventDefault();
          let snapped = planP;
          if (snap) {
            const targets = snap.osnap ? collectAllAnchors(plan) : [];
            const origin = command.basePoint ?? planP;
            const result = applySnap(planP, snap, targets, origin, event.shiftKey);
            snapped = result.snapped;
          }
          onCommandPoint(snapped);
          return;
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        setMarquee({
          startPlan: planP,
          currentPlan: planP,
          additive: event.shiftKey,
        });
      }
    },
    [command, editable, effectiveBox, forExport, onCommandPoint, pixelToPlan, plan, snap],
  );

  const handleSvgPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (forExport) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const planP = pixelToPlan(sx, sy, rect);
      cursorBubble(planP);

      if (panState && onViewportChange) {
        const dwx = ((sx - panState.startSx) / rect.width) * panState.startBox.w;
        const dwy = ((sy - panState.startSy) / rect.height) * panState.startBox.h;
        onViewportChange({
          x: panState.startBox.x - dwx,
          y: panState.startBox.y - dwy,
          w: panState.startBox.w,
          h: panState.startBox.h,
        });
      }
      if (marquee) {
        setMarquee({ ...marquee, currentPlan: planP });
      }
    },
    [cursorBubble, forExport, marquee, onViewportChange, panState, pixelToPlan],
  );

  const handleSvgPointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (panState && panState.pointerId === event.pointerId) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        setPanState(null);
        return;
      }
      if (marquee) {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        const dx = marquee.currentPlan.x - marquee.startPlan.x;
        const dy = marquee.currentPlan.y - marquee.startPlan.y;
        const dragged = Math.hypot(dx, dy) > 0.3; // 0.3 m threshold
        if (dragged) {
          // Marquee selection — every entity whose anchor is inside the rect.
          const minX = Math.min(marquee.startPlan.x, marquee.currentPlan.x);
          const maxX = Math.max(marquee.startPlan.x, marquee.currentPlan.x);
          const minY = Math.min(marquee.startPlan.y, marquee.currentPlan.y);
          const maxY = Math.max(marquee.startPlan.y, marquee.currentPlan.y);
          const inside = collectEntitiesInRect(plan, {
            minX,
            minY,
            maxX,
            maxY,
          });
          if (onSelectionChange) {
            const next = marquee.additive
              ? new Set(selection ?? [])
              : new Set<string>();
            for (const k of inside) next.add(k);
            onSelectionChange(next);
          }
        } else if (onSelectionChange && !marquee.additive) {
          // Click on empty area → clear selection (unless shift-click).
          onSelectionChange(new Set());
        }
        setMarquee(null);
      }
    },
    [marquee, onSelectionChange, panState, plan, selection],
  );

  const handleSvgPointerLeave = useCallback(() => {
    cursorBubble(null);
  }, [cursorBubble]);

  // Pointer-down on an entity in edit mode. We can't yet tell whether
  // this will be a click (select) or a drag (move) — distinguish by
  // pixel threshold on the first pointer-move:
  //   • cursor moves > 3 px from start → drag (move on commit)
  //   • cursor stays put through pointer-up → click (update selection)
  // Shift held during click toggles the entity in/out of selection;
  // plain click replaces selection. Shift held during drag activates
  // ortho lock (constrains motion to H or V).
  const DRAG_THRESHOLD_PX = 3;
  const startDrag = useCallback(
    (kind: DraggableKind, id: string, anchor: PlanPoint) => (
      event: React.PointerEvent<SVGElement>,
    ) => {
      if (!editable) return;
      event.stopPropagation();
      event.preventDefault();
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      const startPlan = screenToPlan(event.clientX, event.clientY);
      const offset = startPlan
        ? { x: anchor.x - startPlan.x, y: anchor.y - startPlan.y }
        : { x: 0, y: 0 };
      const startClient = { x: event.clientX, y: event.clientY };
      const wasShift = event.shiftKey;
      const key = `${kind}:${id}`;
      const wasSelected = selection?.has(key) ?? false;
      // Snap targets — every other entity's anchor point. Computed once
      // per drag (the plan doesn't change mid-drag).
      const snapTargets = snap?.osnap
        ? collectSnapTargets(plan, kind, id)
        : [];
      // Group drag — when dragging an entity that is part of a multi-
      // selection, slide every other selected entity by the same delta
      // and commit as one batch.  Capture sibling keys at start so the
      // set is stable through the drag even if selection mutates.
      const groupSiblings: Set<string> | null =
        wasSelected && selection && selection.size > 1 && onBatchMove
          ? new Set(Array.from(selection).filter((k) => k !== key))
          : null;
      let hasDragged = false;

      const onMove = (ev: PointerEvent) => {
        if (!hasDragged) {
          const dx = ev.clientX - startClient.x;
          const dy = ev.clientY - startClient.y;
          if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
          hasDragged = true;
          if (!wasSelected && onSelectionChange) {
            onSelectionChange(new Set([key]));
          }
        }
        const p = screenToPlan(ev.clientX, ev.clientY);
        if (!p) return;
        const raw = { x: p.x + offset.x, y: p.y + offset.y };
        const result = snap
          ? applySnap(raw, snap, snapTargets, anchor, ev.shiftKey)
          : { snapped: raw, marker: undefined };
        const delta = {
          x: result.snapped.x - anchor.x,
          y: result.snapped.y - anchor.y,
        };
        setDrag({
          kind,
          id,
          position: result.snapped,
          ...(groupSiblings && groupSiblings.size > 0
            ? { group: { siblings: groupSiblings, delta } }
            : {}),
        });
        setSnapMarker(result.marker ?? null);
      };
      const onUp = (ev: PointerEvent) => {
        try {
          target.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);

        if (!hasDragged) {
          // CLICK — update selection only.
          if (onSelectionChange) {
            const next = new Set(selection ?? []);
            if (wasShift) {
              if (next.has(key)) next.delete(key);
              else next.add(key);
            } else {
              next.clear();
              next.add(key);
            }
            onSelectionChange(next);
          }
          return;
        }

        // DRAG — commit move.  For a group drag, build the full batch
        // (primary entity + all siblings shifted by delta) and emit
        // a single onBatchMove so undo treats it as one step.
        const p = screenToPlan(ev.clientX, ev.clientY);
        const raw = p ? { x: p.x + offset.x, y: p.y + offset.y } : anchor;
        const result = snap
          ? applySnap(raw, snap, snapTargets, anchor, ev.shiftKey)
          : { snapped: raw };
        setDrag(null);
        setSnapMarker(null);
        if (groupSiblings && groupSiblings.size > 0 && onBatchMove) {
          const delta = {
            x: result.snapped.x - anchor.x,
            y: result.snapped.y - anchor.y,
          };
          const moves: Array<{
            kind: DraggableKind;
            id: string;
            position: PlanPoint;
          }> = [{ kind, id, position: result.snapped }];
          for (const k of groupSiblings) {
            const [sk, sid] = k.split(":") as [DraggableKind, string];
            const orig = lookupAnchor(plan, sk, sid);
            if (!orig) continue;
            moves.push({
              kind: sk,
              id: sid,
              position: { x: orig.x + delta.x, y: orig.y + delta.y },
            });
          }
          onBatchMove(moves);
        } else if (onMutate) {
          onMutate(kind, id, result.snapped);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editable, onBatchMove, onMutate, onSelectionChange, plan, screenToPlan, selection, snap],
  );

  // Helper for layers: returns the LIVE position of an element during
  // drag, falling back to the data position otherwise.  When the drag
  // is a group drag, every sibling moves by the same delta as the
  // primary entity, so the whole selection slides as one.
  const livePos = useCallback(
    (kind: DraggableKind, id: string, dataPos: PlanPoint): PlanPoint => {
      if (!drag) return dataPos;
      if (drag.kind === kind && drag.id === id) return drag.position;
      if (drag.group && drag.group.siblings.has(`${kind}:${id}`)) {
        return {
          x: dataPos.x + drag.group.delta.x,
          y: dataPos.y + drag.group.delta.y,
        };
      }
      return dataPos;
    },
    [drag],
  );

  // Cursor style. Pan-while-pressed shows grabbing; edit mode shows
  // crosshair so the user knows clicking selects.
  const svgCursor = forExport
    ? undefined
    : panState
      ? "grabbing"
      : editable
        ? "crosshair"
        : "default";

  return (
    <svg
      ref={svgRef}
      viewBox={effectiveViewBox}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      style={{
        backgroundColor: theme.background,
        display: "block",
        cursor: svgCursor,
        touchAction: "none",
      }}
      onPointerDown={forExport ? undefined : handleSvgPointerDown}
      onPointerMove={forExport ? undefined : handleSvgPointerMove}
      onPointerUp={forExport ? undefined : handleSvgPointerUp}
      onPointerCancel={forExport ? undefined : handleSvgPointerUp}
      onPointerLeave={forExport ? undefined : handleSvgPointerLeave}
      role={forExport ? undefined : "img"}
      aria-label={`Plan d'aménagement — ${plan.intersectionName}`}
    >
      {/* Plan frame: +X east, +Y north. SVG Y grows downward, so we
          flip with scale(1,-1) and translate so (0,0) sits sensibly. */}
      <g transform={view.planTransform} ref={planGroupRef}>
        {layers.roads ? <GridLayer bounds={plan.bounds} theme={theme} /> : null}
        {layers.backdrop && plan.backdropImage ? (
          <BackdropImageLayer image={plan.backdropImage} />
        ) : null}
        {plan.baseLayers && plan.baseLayers.length > 0 ? (
          <BaseLayersGroup features={plan.baseLayers} theme={theme} />
        ) : null}
        {layers.roads ? <RoadsLayer arms={plan.arms} theme={theme} /> : null}
        {layers.lanes ? (
          <LanesLayer
            arms={plan.arms}
            theme={theme}
            showStencils={!layers.movements}
          />
        ) : null}
        {layers.roads ? (
          <CurbStrokeLayer arms={plan.arms} theme={theme} />
        ) : null}
        {layers.crosswalks ? (
          <CrosswalksLayer
            crosswalks={plan.crosswalks}
            stopLines={plan.stopLines}
            theme={theme}
            showLabels={layers.labels}
          />
        ) : null}
        {layers.islands && plan.refugeIslands && plan.refugeIslands.length > 0 ? (
          <RefugeIslandsLayer
            islands={plan.refugeIslands}
            theme={theme}
            showLabels={layers.labels}
          />
        ) : null}
        {layers.movements ? (
          <MovementArrowsLayer arms={plan.arms} theme={theme} />
        ) : null}
        {layers.cables ? (
          <CablesLayer
            runs={plan.cableRuns}
            theme={theme}
            showLabels={layers.labels}
          />
        ) : null}
        {layers.loops ? (
          <LoopsLayer
            loops={plan.loops}
            theme={theme}
            showLabels={layers.labels}
            editable={editable}
            startDrag={startDrag}
            livePos={livePos}
            selectedKeys={selection}
          />
        ) : null}
        {layers.chambers ? (
          <ChambersLayer
            chambers={plan.chambers}
            theme={theme}
            showLabels={layers.labels}
            editable={editable}
            startDrag={startDrag}
            livePos={livePos}
            selectedKeys={selection}
          />
        ) : null}
        {layers.supports ? (
          <SupportsLayer
            supports={plan.supports}
            theme={theme}
            showLabels={layers.labels}
            editable={editable}
            startDrag={startDrag}
            livePos={livePos}
            selectedKeys={selection}
          />
        ) : null}
        <CabinetLayer
          cabinet={plan.cabinet}
          theme={theme}
          showLabel={layers.labels}
          editable={editable}
          startDrag={startDrag}
          livePos={livePos}
          selectedKeys={selection}
        />
        {layers.labels ? (
          <ApproachLabelsLayer arms={plan.arms} theme={theme} />
        ) : null}
        {layers.legend ? (
          <LegendBox bounds={plan.bounds} theme={theme} />
        ) : null}
        {!forExport && snapMarker && drag ? (
          <SnapMarkerOverlay marker={snapMarker} theme={theme} />
        ) : null}
        {!forExport && marquee ? (
          <MarqueeOverlay
            start={marquee.startPlan}
            current={marquee.currentPlan}
            theme={theme}
          />
        ) : null}
        {!forExport && command && command.basePoint && cursor ? (
          <CommandRubberBand
            kind={command.kind}
            base={command.basePoint}
            refPoint={command.refPoint}
            cursor={cursor}
            theme={theme}
          />
        ) : null}
      </g>

      {/* CAD chrome — crosshair + selection rings drawn outside the
          planTransform (screen space), so they stay aligned with cursor
          regardless of pan/zoom. Suppressed for PDF export. */}
      {!forExport && cursor && editable ? (
        <CrosshairOverlay cursor={cursor} box={effectiveBox} theme={theme} />
      ) : null}

      {/* Chrome — north arrow + scale bar in screen space so they
          don't flip with the metres transform. */}
      <NorthArrow theme={theme} />
      <ScaleBar theme={theme} metresPerUnit={view.metresPerUnit} />
      {drag ? <DragReadout drag={drag} theme={theme} /> : null}
    </svg>
  );
}

function DragReadout({
  drag,
  theme,
}: {
  drag: { kind: DraggableKind; id: string; position: PlanPoint };
  theme: CivilPlanThemeColors;
}) {
  // Top-right of the viewBox, in screen space (no flip).
  return (
    <g transform="translate(22 -8)">
      <rect
        x={-13}
        y={-2.4}
        width={20}
        height={3}
        rx={0.4}
        fill={theme.legendBg}
        stroke={theme.legendStroke}
        strokeWidth={0.18}
      />
      <text
        x={-3}
        y={0}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={1.0}
        fontWeight={700}
        fill={theme.label}
      >
        {drag.kind} {drag.id} → x={drag.position.x.toFixed(1)} y=
        {drag.position.y.toFixed(1)} m
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function computeViewBox(bounds: PlanBounds, padding: number) {
  const width = bounds.maxX - bounds.minX + padding * 2;
  const height = bounds.maxY - bounds.minY + padding * 2;
  // We want a viewBox in SVG units where 1 unit = 1 metre (after the
  // scale(1,-1) flip). Origin top-left of the viewBox is placed so
  // (minX-padding, maxY+padding) is the top-left, matching the
  // mathematical convention of +Y up.
  const vbX = bounds.minX - padding;
  const vbY = -(bounds.maxY + padding);
  return {
    viewBox: `${vbX} ${vbY} ${width} ${height}`,
    box: { x: vbX, y: vbY, w: width, h: height },
    planTransform: "scale(1,-1)",
    metresPerUnit: 1,
  };
}

/**
 * Returns the canonical (un-panned, un-zoomed) viewBox for a plan,
 * exposed so the parent's "Reset View" button can clear the override.
 */
export function computePlanViewport(
  plan: CivilPlan,
  padding = 4,
): CadViewport {
  return computeViewBox(plan.bounds, padding).box;
}

// ─── Snap engine ────────────────────────────────────────────────────
// Order of preference, mirroring AutoCAD:
//   1. OSnap   — if cursor is within osnapRadius of any other entity's
//                anchor, snap exactly there (yellow diamond marker).
//   2. Ortho   — when active, lock motion to the cursor's dominant axis
//                from the drag origin (no marker).
//   3. Grid    — round to the nearest gridStep (small dot marker).
function applySnap(
  cursor: PlanPoint,
  snap: CadSnap,
  others: PlanPoint[],
  dragOrigin: PlanPoint,
  shiftHeld: boolean,
): {
  snapped: PlanPoint;
  marker?: { kind: "osnap" | "grid" | "ortho"; at: PlanPoint };
} {
  // 1. OSnap — pick the nearest other-entity anchor within radius.
  if (snap.osnap) {
    let nearest: { p: PlanPoint; d: number } | null = null;
    for (const o of others) {
      const d = Math.hypot(o.x - cursor.x, o.y - cursor.y);
      if (d < snap.osnapRadius && (!nearest || d < nearest.d)) {
        nearest = { p: o, d };
      }
    }
    if (nearest) {
      return { snapped: nearest.p, marker: { kind: "osnap", at: nearest.p } };
    }
  }

  let p = cursor;

  // 2. Ortho — F8 or Shift held during drag.
  const orthoActive = snap.ortho || shiftHeld;
  if (orthoActive) {
    const dx = p.x - dragOrigin.x;
    const dy = p.y - dragOrigin.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      p = { x: p.x, y: dragOrigin.y };
    } else {
      p = { x: dragOrigin.x, y: p.y };
    }
  }

  // 3. Grid — round both axes to the configured step.
  if (snap.grid && snap.gridStep > 0) {
    p = {
      x: Math.round(p.x / snap.gridStep) * snap.gridStep,
      y: Math.round(p.y / snap.gridStep) * snap.gridStep,
    };
    return { snapped: p, marker: { kind: "grid", at: p } };
  }

  if (orthoActive) {
    return { snapped: p, marker: { kind: "ortho", at: p } };
  }
  return { snapped: p };
}

// Returns the set of entity keys whose anchor sits inside the given
// plan-frame rectangle.  Used by marquee selection — AutoCAD's "window
// selection" semantics (only entities entirely inside the box; here
// approximated by anchor-inside).
function collectEntitiesInRect(
  plan: CivilPlan,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): string[] {
  const inside = (p: PlanPoint) =>
    p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY;
  const out: string[] = [];
  for (const s of plan.supports) if (inside(s.position)) out.push(`support:${s.id}`);
  for (const l of plan.loops) if (inside(l.centre)) out.push(`loop:${l.id}`);
  for (const c of plan.chambers) if (inside(c.position)) out.push(`chamber:${c.id}`);
  if (inside(plan.cabinet.position)) out.push(`cabinet:${plan.cabinet.id}`);
  return out;
}

// Rubber-band — preview line/arc from the picked base point to the
// cursor while the user is supplying the second click of M / CO / RO.
function CommandRubberBand({
  kind,
  base,
  refPoint,
  cursor,
  theme,
}: {
  kind: "move" | "copy" | "rotate";
  base: PlanPoint;
  refPoint?: PlanPoint;
  cursor: PlanPoint;
  theme: CivilPlanThemeColors;
}) {
  const stroke = theme.selection ?? "#38bdf8";
  if (kind === "rotate") {
    // Two phases: first click picks pivot (base), second picks reference
    // angle (refPoint), third picks new angle.  Show pivot dot + line
    // to either refPoint (if present) or to cursor.
    const tip = refPoint ?? cursor;
    const dx = cursor.x - base.x;
    const dy = cursor.y - base.y;
    return (
      <g pointerEvents="none">
        <circle cx={base.x} cy={base.y} r={0.4} fill={stroke} />
        <line
          x1={base.x}
          y1={base.y}
          x2={tip.x}
          y2={tip.y}
          stroke={stroke}
          strokeWidth={0.15}
          strokeDasharray="0.5 0.3"
        />
        {refPoint ? (
          <line
            x1={base.x}
            y1={base.y}
            x2={cursor.x}
            y2={cursor.y}
            stroke={stroke}
            strokeWidth={0.18}
          />
        ) : null}
        <circle
          cx={cursor.x}
          cy={cursor.y}
          r={Math.max(0.2, Math.hypot(dx, dy) * 0.04)}
          fill="none"
          stroke={stroke}
          strokeWidth={0.12}
          opacity={0.5}
        />
      </g>
    );
  }
  // Move / Copy — straight rubber-band from base to cursor.
  return (
    <g pointerEvents="none">
      <circle cx={base.x} cy={base.y} r={0.4} fill={stroke} />
      <line
        x1={base.x}
        y1={base.y}
        x2={cursor.x}
        y2={cursor.y}
        stroke={stroke}
        strokeWidth={0.18}
        strokeDasharray={kind === "copy" ? "0.6 0.3" : undefined}
      />
      <circle
        cx={cursor.x}
        cy={cursor.y}
        r={0.3}
        fill="none"
        stroke={stroke}
        strokeWidth={0.12}
      />
    </g>
  );
}

// Marquee rectangle — drawn during a rubber-band selection.
function MarqueeOverlay({
  start,
  current,
  theme,
}: {
  start: PlanPoint;
  current: PlanPoint;
  theme: CivilPlanThemeColors;
}) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  const stroke = theme.marquee ?? "#38bdf8";
  const fill = theme.marqueeFill ?? "rgba(56,189,248,0.10)";
  return (
    <g pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        stroke={stroke}
        strokeWidth={Math.max(0.05, Math.min(w, h) * 0.01)}
        strokeDasharray="0.5 0.3"
      />
    </g>
  );
}

// Returns the canonical anchor for any draggable entity, or null when
// the id can't be found (e.g. just deleted).
function lookupAnchor(
  plan: CivilPlan,
  kind: DraggableKind,
  id: string,
): PlanPoint | null {
  if (kind === "support") {
    return plan.supports.find((s) => s.id === id)?.position ?? null;
  }
  if (kind === "loop") {
    return plan.loops.find((l) => l.id === id)?.centre ?? null;
  }
  if (kind === "chamber") {
    return plan.chambers.find((c) => c.id === id)?.position ?? null;
  }
  if (kind === "cabinet") {
    return plan.cabinet.position;
  }
  return null;
}

// Returns every entity anchor in the plan — used as the OSnap target
// set during command-mode point-picking (where there's no "dragged"
// entity to exclude).
function collectAllAnchors(plan: CivilPlan): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (const s of plan.supports) out.push(s.position);
  for (const l of plan.loops) out.push(l.centre);
  for (const c of plan.chambers) out.push(c.position);
  out.push(plan.cabinet.position);
  return out;
}

// Returns every entity anchor in the plan EXCEPT the one being dragged.
// Used as the candidate set for object-snap.
function collectSnapTargets(
  plan: CivilPlan,
  draggedKind: DraggableKind,
  draggedId: string,
): PlanPoint[] {
  const out: PlanPoint[] = [];
  for (const s of plan.supports) {
    if (!(draggedKind === "support" && s.id === draggedId)) {
      out.push(s.position);
    }
  }
  for (const l of plan.loops) {
    if (!(draggedKind === "loop" && l.id === draggedId)) {
      out.push(l.centre);
    }
  }
  for (const c of plan.chambers) {
    if (!(draggedKind === "chamber" && c.id === draggedId)) {
      out.push(c.position);
    }
  }
  if (!(draggedKind === "cabinet")) {
    out.push(plan.cabinet.position);
  }
  return out;
}

// Snap marker — small glyph at the snapped point. Drawn during drag
// inside the planTransform (plan coords).
function SnapMarkerOverlay({
  marker,
  theme,
}: {
  marker: { kind: "osnap" | "grid" | "ortho"; at: PlanPoint };
  theme: CivilPlanThemeColors;
}) {
  const color = theme.snapMarker ?? "#fde047";
  const at = marker.at;
  if (marker.kind === "osnap") {
    // Diamond around the snap target.
    const r = 0.7;
    return (
      <g pointerEvents="none">
        <polygon
          points={`${at.x},${at.y - r} ${at.x + r},${at.y} ${at.x},${at.y + r} ${at.x - r},${at.y}`}
          fill="none"
          stroke={color}
          strokeWidth={0.18}
        />
      </g>
    );
  }
  if (marker.kind === "grid") {
    // Small filled square at the grid intersection.
    const r = 0.3;
    return (
      <g pointerEvents="none">
        <rect
          x={at.x - r}
          y={at.y - r}
          width={r * 2}
          height={r * 2}
          fill={color}
          opacity={0.85}
        />
      </g>
    );
  }
  // ortho — small cross
  const r = 0.4;
  return (
    <g pointerEvents="none" stroke={color} strokeWidth={0.16}>
      <line x1={at.x - r} y1={at.y} x2={at.x + r} y2={at.y} />
      <line x1={at.x} y1={at.y - r} x2={at.x} y2={at.y + r} />
    </g>
  );
}

// ─── Selection ring + grips ─────────────────────────────────────────
// Drawn on top of an entity glyph when the entity is in the selection
// set. Cyan dashed circle + four square corner grips, sized to the
// entity's bounding radius.  Pointer-events are off so the ring/grips
// never block clicks on neighbouring entities.
function SelectionRing({
  center,
  radius,
  theme,
}: {
  center: PlanPoint;
  radius: number;
  theme: CivilPlanThemeColors;
}) {
  const ringColor = theme.selection ?? "#38bdf8";
  const gripColor = theme.grip ?? ringColor;
  const strokeWidth = Math.max(0.08, radius * 0.05);
  const dash = `${radius * 0.18} ${radius * 0.14}`;
  const gripSize = Math.max(0.4, radius * 0.22);
  const corners: Array<[number, number]> = [
    [-radius, -radius],
    [radius, -radius],
    [radius, radius],
    [-radius, radius],
  ];
  return (
    <g pointerEvents="none">
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
      {corners.map(([dx, dy], i) => (
        <rect
          key={i}
          x={center.x + dx - gripSize / 2}
          y={center.y + dy - gripSize / 2}
          width={gripSize}
          height={gripSize}
          fill={gripColor}
          stroke={theme.background}
          strokeWidth={Math.max(0.04, gripSize * 0.12)}
        />
      ))}
    </g>
  );
}

// ─── Crosshair ────────────────────────────────────────────────────────
// CAD-style: two thin dashed lines through the cursor, spanning the
// full viewBox.  Drawn in screen space (outside the planTransform
// flip), so we receive cursor in plan coords (Y up) and convert to
// SVG-Y by negating.
function CrosshairOverlay({
  cursor,
  box,
  theme,
}: {
  cursor: PlanPoint;
  box: CadViewport;
  theme: CivilPlanThemeColors;
}) {
  const cy = -cursor.y;
  const dash = `${box.w * 0.006} ${box.w * 0.006}`;
  const stroke = box.w * 0.0015;
  return (
    <g pointerEvents="none">
      <line
        x1={box.x}
        y1={cy}
        x2={box.x + box.w}
        y2={cy}
        stroke={theme.crosshair ?? theme.gridMajor}
        strokeWidth={stroke}
        strokeDasharray={dash}
      />
      <line
        x1={cursor.x}
        y1={box.y}
        x2={cursor.x}
        y2={box.y + box.h}
        stroke={theme.crosshair ?? theme.gridMajor}
        strokeWidth={stroke}
        strokeDasharray={dash}
      />
    </g>
  );
}

function GridLayer({ bounds, theme }: { bounds: PlanBounds; theme: CivilPlanThemeColors }) {
  const minX = Math.floor(bounds.minX / 5) * 5 - 5;
  const maxX = Math.ceil(bounds.maxX / 5) * 5 + 5;
  const minY = Math.floor(bounds.minY / 5) * 5 - 5;
  const maxY = Math.ceil(bounds.maxY / 5) * 5 + 5;
  const lines: React.ReactElement[] = [];
  for (let x = minX; x <= maxX; x += 1) {
    const major = x % 5 === 0;
    lines.push(
      <line
        key={`gx${x}`}
        x1={x}
        x2={x}
        y1={minY}
        y2={maxY}
        stroke={major ? theme.gridMajor : theme.gridMinor}
        strokeWidth={major ? 0.08 : 0.04}
      />,
    );
  }
  for (let y = minY; y <= maxY; y += 1) {
    const major = y % 5 === 0;
    lines.push(
      <line
        key={`gy${y}`}
        x1={minX}
        x2={maxX}
        y1={y}
        y2={y}
        stroke={major ? theme.gridMajor : theme.gridMinor}
        strokeWidth={major ? 0.08 : 0.04}
      />,
    );
  }
  return <g>{lines}</g>;
}

function armPolygon(arm: RoadArm): string {
  // Roadway as a rectangle along the arm axis, plus a generous
  // overlap into the node so arms blend into the central pavement.
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return "";
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const startX = from.x - ux * arm.halfWidth * 0.4; // push into node
  const startY = from.y - uy * arm.halfWidth * 0.4;
  const endX = to.x;
  const endY = to.y;
  const p1 = `${startX + nx * arm.halfWidth},${startY + ny * arm.halfWidth}`;
  const p2 = `${endX + nx * arm.halfWidth},${endY + ny * arm.halfWidth}`;
  const p3 = `${endX - nx * arm.halfWidth},${endY - ny * arm.halfWidth}`;
  const p4 = `${startX - nx * arm.halfWidth},${startY - ny * arm.halfWidth}`;
  return `${p1} ${p2} ${p3} ${p4}`;
}

function RoadsLayer({ arms, theme }: { arms: RoadArm[]; theme: CivilPlanThemeColors }) {
  // Node pavement: central octagon that soaks up the arm ends.
  const halfW = arms[0]?.halfWidth ?? 7.5;
  const pad = halfW * 1.2;
  const nodeRect = [
    [-pad, -pad],
    [pad, -pad],
    [pad, pad],
    [-pad, pad],
  ]
    .map((p) => p.join(","))
    .join(" ");
  return (
    <g>
      <polygon points={nodeRect} fill={theme.asphalt} />
      {arms.map((arm) => (
        <g key={`arm-${arm.id}`}>
          <polygon points={armPolygon(arm)} fill={theme.asphalt} />
          <ArmCurbs arm={arm} theme={theme} />
        </g>
      ))}
    </g>
  );
}

function ArmCurbs({ arm, theme }: { arm: RoadArm; theme: CivilPlanThemeColors }) {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const startOffset = arm.halfWidth * 0.5;
  const sx = from.x + ux * startOffset;
  const sy = from.y + uy * startOffset;
  return (
    <g stroke={theme.curb} strokeWidth={0.25} fill="none">
      <line
        x1={sx + nx * arm.halfWidth}
        y1={sy + ny * arm.halfWidth}
        x2={to.x + nx * arm.halfWidth}
        y2={to.y + ny * arm.halfWidth}
      />
      <line
        x1={sx - nx * arm.halfWidth}
        y1={sy - ny * arm.halfWidth}
        x2={to.x - nx * arm.halfWidth}
        y2={to.y - ny * arm.halfWidth}
      />
    </g>
  );
}

function LanesLayer({
  arms,
  theme,
  showStencils,
}: {
  arms: RoadArm[];
  theme: CivilPlanThemeColors;
  showStencils: boolean;
}) {
  return (
    <g>
      {arms.map((arm) => (
        <g key={`lanes-${arm.id}`}>
          {arm.medianWidth && arm.medianWidth > 0 ? (
            <ArmMedian arm={arm} theme={theme} />
          ) : (
            <ArmAxis arm={arm} theme={theme} />
          )}
          {arm.busLane ? <BusLanePaint arm={arm} theme={theme} /> : null}
          {arm.lanes.map((lane) => (
            <LaneDivider key={lane.id} arm={arm} lane={lane} theme={theme} />
          ))}
          {showStencils ? <ArmLaneArrows arm={arm} theme={theme} /> : null}
        </g>
      ))}
    </g>
  );
}

/**
 * Bus-lane paint — tints the rightmost outbound lane with a coloured
 * fill and stamps a "BUS" stencil at mid-arm.
 */
function BusLanePaint({ arm, theme }: { arm: RoadArm; theme: CivilPlanThemeColors }) {
  const outbound = arm.lanes.filter((l) => l.direction === "out");
  if (outbound.length === 0) return null;
  // The "rightmost outbound" lane is the one with the most negative
  // offset (furthest from the median).
  const rightmost = outbound.reduce((acc, l) => (l.offset < acc.offset ? l : acc));
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const w = rightmost.width / 2;
  const cx = rightmost.offset;
  const p1 = `${from.x + nx * (cx + w)},${from.y + ny * (cx + w)}`;
  const p2 = `${to.x + nx * (cx + w)},${to.y + ny * (cx + w)}`;
  const p3 = `${to.x + nx * (cx - w)},${to.y + ny * (cx - w)}`;
  const p4 = `${from.x + nx * (cx - w)},${from.y + ny * (cx - w)}`;
  // "BUS" stencil at ~60% along the arm.
  const t = 0.55;
  const labelPos = {
    x: from.x + ux * len * t + nx * cx,
    y: from.y + uy * len * t + ny * cx,
  };
  let labelRot = Math.atan2(dy, dx);
  if (labelRot > Math.PI / 2) labelRot -= Math.PI;
  if (labelRot < -Math.PI / 2) labelRot += Math.PI;
  return (
    <g>
      <polygon points={`${p1} ${p2} ${p3} ${p4}`} fill={theme.busLane} />
      <PlanLabel
        at={labelPos}
        text="BUS"
        fontSize={1.4}
        color={theme.label}
        bold
        rotationRad={labelRot}
      />
    </g>
  );
}

function ArmAxis({ arm, theme }: { arm: RoadArm; theme: CivilPlanThemeColors }) {
  return (
    <line
      x1={arm.axis.from.x}
      y1={arm.axis.from.y}
      x2={arm.axis.to.x}
      y2={arm.axis.to.y}
      stroke={theme.laneMark}
      strokeWidth={0.25}
      strokeDasharray="1.8 1.2"
      opacity={0.45}
    />
  );
}

/**
 * Painted/planted central median: a filled strip plus two solid lane
 * marks at +medianWidth/2 and -medianWidth/2 from the arm axis.
 */
function ArmMedian({ arm, theme }: { arm: RoadArm; theme: CivilPlanThemeColors }) {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || !arm.medianWidth) return null;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const half = arm.medianWidth / 2;
  const p1 = `${from.x + nx * half},${from.y + ny * half}`;
  const p2 = `${to.x + nx * half},${to.y + ny * half}`;
  const p3 = `${to.x - nx * half},${to.y - ny * half}`;
  const p4 = `${from.x - nx * half},${from.y - ny * half}`;

  // BHNS / tramway corridor — paired rails + sleeper ties.
  if (arm.bhns) {
    // Sleeper ties every 3.2 m perpendicular to the rails.
    const ties: React.ReactElement[] = [];
    const tieSpacing = 3.2;
    const tieHalf = (arm.medianWidth ?? 2) / 2 - 0.15;
    const segCount = Math.max(0, Math.floor(len / tieSpacing));
    for (let i = 1; i < segCount; i += 1) {
      const t = (i * tieSpacing) / len;
      const cx = from.x + dx * t;
      const cy = from.y + dy * t;
      ties.push(
        <line
          key={`tie-${arm.id}-${i}`}
          x1={cx + nx * tieHalf}
          y1={cy + ny * tieHalf}
          x2={cx - nx * tieHalf}
          y2={cy - ny * tieHalf}
          stroke={theme.tramTie}
          strokeWidth={0.16}
          opacity={0.55}
        />,
      );
    }
    const railOffset = Math.min(0.7, half * 0.55);
    return (
      <g>
        <polygon
          points={`${p1} ${p2} ${p3} ${p4}`}
          fill={theme.tramBed}
          opacity={0.85}
        />
        {ties}
        {/* Rails — two parallel solid lines down the centre. */}
        <line
          x1={from.x + nx * railOffset}
          y1={from.y + ny * railOffset}
          x2={to.x + nx * railOffset}
          y2={to.y + ny * railOffset}
          stroke={theme.tramRail}
          strokeWidth={0.22}
        />
        <line
          x1={from.x - nx * railOffset}
          y1={from.y - ny * railOffset}
          x2={to.x - nx * railOffset}
          y2={to.y - ny * railOffset}
          stroke={theme.tramRail}
          strokeWidth={0.22}
        />
        {/* Outer median kerbs */}
        <line
          x1={from.x + nx * half}
          y1={from.y + ny * half}
          x2={to.x + nx * half}
          y2={to.y + ny * half}
          stroke={theme.curb}
          strokeWidth={0.18}
          opacity={0.85}
        />
        <line
          x1={from.x - nx * half}
          y1={from.y - ny * half}
          x2={to.x - nx * half}
          y2={to.y - ny * half}
          stroke={theme.curb}
          strokeWidth={0.18}
          opacity={0.85}
        />
      </g>
    );
  }

  return (
    <g>
      <polygon
        points={`${p1} ${p2} ${p3} ${p4}`}
        fill={theme.curb}
        opacity={0.18}
      />
      <line
        x1={from.x + nx * half}
        y1={from.y + ny * half}
        x2={to.x + nx * half}
        y2={to.y + ny * half}
        stroke={theme.curb}
        strokeWidth={0.18}
        opacity={0.85}
      />
      <line
        x1={from.x - nx * half}
        y1={from.y - ny * half}
        x2={to.x - nx * half}
        y2={to.y - ny * half}
        stroke={theme.curb}
        strokeWidth={0.18}
        opacity={0.85}
      />
    </g>
  );
}

function LaneDivider({
  arm,
  lane,
  theme,
}: {
  arm: RoadArm;
  lane: { offset: number };
  theme: CivilPlanThemeColors;
}) {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const off = lane.offset;
  return (
    <line
      x1={from.x + nx * off}
      y1={from.y + ny * off}
      x2={to.x + nx * off}
      y2={to.y + ny * off}
      stroke={theme.laneMark}
      strokeWidth={0.16}
      strokeDasharray="1.2 1.2"
      opacity={0.3}
    />
  );
}

/**
 * Per-lane stencil arrows derived from `Lane.kind`.
 *
 * - Inbound lanes get a stencil placed ~6 m back from the stop-line,
 *   pointing toward the node, with shape determined by lane kind:
 *     · through         → straight shaft + arrowhead
 *     · left            → straight shaft + 90° left hook + arrowhead
 *     · right           → straight shaft + 90° right hook + arrowhead
 *     · through-left    → straight arrow + diagonal left branch
 *     · through-right   → straight arrow + diagonal right branch
 *
 * - Outbound lanes get a single straight stencil pointing away from
 *   the node.
 *
 * Geometry is computed in plan-frame metres so the stencils scale
 * correctly with the metres→pixel viewBox transform.
 */
function ArmLaneArrows({
  arm,
  theme,
}: {
  arm: RoadArm;
  theme: CivilPlanThemeColors;
}) {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  // n = 90° CCW of (ux,uy) → matches Lane.offset > 0 = left of outward.
  const nx = -uy;
  const ny = ux;

  // Inbound stencil sits ~6 m past the node-side end of the arm axis.
  const inboundDist = 6.0;
  const inboundCentre = {
    x: from.x + ux * inboundDist,
    y: from.y + uy * inboundDist,
  };
  // Outbound stencil sits further down the arm so it doesn't collide
  // with the inbound one.  ~16 m past the node-side end.
  const outboundDist = 16.0;
  const outboundCentre = {
    x: from.x + ux * outboundDist,
    y: from.y + uy * outboundDist,
  };

  return (
    <g>
      {arm.lanes.map((lane) => {
        const centre =
          lane.direction === "in"
            ? {
                x: inboundCentre.x + nx * lane.offset,
                y: inboundCentre.y + ny * lane.offset,
              }
            : {
                x: outboundCentre.x + nx * lane.offset,
                y: outboundCentre.y + ny * lane.offset,
              };
        return (
          <LaneArrowStencil
            key={`arrow-${lane.id}`}
            lane={lane}
            centre={centre}
            ux={ux}
            uy={uy}
            nx={nx}
            ny={ny}
            theme={theme}
          />
        );
      })}
    </g>
  );
}

function LaneArrowStencil({
  lane,
  centre,
  ux,
  uy,
  nx,
  ny,
  theme,
}: {
  lane: Lane;
  centre: PlanPoint;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  theme: CivilPlanThemeColors;
}) {
  // For inbound lanes the arrow points TOWARD the node (i.e. -outward).
  // For outbound lanes it points AWAY (i.e. +outward).
  const pointing = lane.direction === "in" ? -1 : 1;
  const fx = ux * pointing;
  const fy = uy * pointing;
  const shaft = 3.6;
  const head = 1.1;
  // Left/right relative to forward direction (turn-side).
  // For inbound (pointing = -1) "left of forward" flips perp sign.
  const lx = -ny * pointing;
  const ly = nx * pointing;

  const baseX = centre.x - fx * (shaft / 2);
  const baseY = centre.y - fy * (shaft / 2);
  const tipX = centre.x + fx * (shaft / 2);
  const tipY = centre.y + fy * (shaft / 2);

  // Standard straight arrow head (tip → two barbs at ~30°).
  const headLeftX = tipX - fx * head * 0.85 + lx * head * 0.55;
  const headLeftY = tipY - fy * head * 0.85 + ly * head * 0.55;
  const headRightX = tipX - fx * head * 0.85 - lx * head * 0.55;
  const headRightY = tipY - fy * head * 0.85 - ly * head * 0.55;

  // Outbound stencils are always plain straight arrows.
  if (lane.direction === "out") {
    return (
      <g
        stroke={theme.arrow}
        strokeWidth={0.32}
        strokeLinecap="round"
        fill="none"
        opacity={0.85}
      >
        <line x1={baseX} y1={baseY} x2={tipX} y2={tipY} />
        <line x1={tipX} y1={tipY} x2={headLeftX} y2={headLeftY} />
        <line x1={tipX} y1={tipY} x2={headRightX} y2={headRightY} />
      </g>
    );
  }

  // Inbound stencils — branch shape depends on kind.
  const kind = lane.kind;
  const elements: React.ReactElement[] = [];

  if (kind === "left" || kind === "right") {
    // Pure turn arrow: short straight shaft, then 90° hook with
    // arrowhead.  Bend point sits ~halfway along the shaft.
    const dirSign = kind === "left" ? 1 : -1; // left = +lx, right = -lx
    const bendX = baseX + fx * (shaft * 0.55);
    const bendY = baseY + fy * (shaft * 0.55);
    const hookEndX = bendX + lx * dirSign * (shaft * 0.7);
    const hookEndY = bendY + ly * dirSign * (shaft * 0.7);
    // Hook arrowhead points along the hook direction.
    const hx = lx * dirSign;
    const hy = ly * dirSign;
    const ahLeftX = hookEndX - hx * head * 0.85 - fx * head * 0.55;
    const ahLeftY = hookEndY - hy * head * 0.85 - fy * head * 0.55;
    const ahRightX = hookEndX - hx * head * 0.85 + fx * head * 0.55;
    const ahRightY = hookEndY - hy * head * 0.85 + fy * head * 0.55;
    elements.push(
      <line key="shaft" x1={baseX} y1={baseY} x2={bendX} y2={bendY} />,
      <line key="hook" x1={bendX} y1={bendY} x2={hookEndX} y2={hookEndY} />,
      <line key="ahL" x1={hookEndX} y1={hookEndY} x2={ahLeftX} y2={ahLeftY} />,
      <line key="ahR" x1={hookEndX} y1={hookEndY} x2={ahRightX} y2={ahRightY} />,
    );
  } else if (kind === "through-left" || kind === "through-right") {
    // Combined: full straight arrow + a diagonal branch off the shaft.
    const dirSign = kind === "through-left" ? 1 : -1;
    elements.push(
      <line key="shaft" x1={baseX} y1={baseY} x2={tipX} y2={tipY} />,
      <line key="ahL" x1={tipX} y1={tipY} x2={headLeftX} y2={headLeftY} />,
      <line key="ahR" x1={tipX} y1={tipY} x2={headRightX} y2={headRightY} />,
    );
    // Branch starts ~40% up the shaft, exits at 45°.
    const branchOriginX = baseX + fx * (shaft * 0.4);
    const branchOriginY = baseY + fy * (shaft * 0.4);
    const branchTipX =
      branchOriginX + (fx + lx * dirSign) * (shaft * 0.55) * 0.7;
    const branchTipY =
      branchOriginY + (fy + ly * dirSign) * (shaft * 0.55) * 0.7;
    // Branch arrowhead.
    const bDirX = (fx + lx * dirSign) / Math.hypot(fx + lx * dirSign, fy + ly * dirSign);
    const bDirY = (fy + ly * dirSign) / Math.hypot(fx + lx * dirSign, fy + ly * dirSign);
    const bPerpX = -bDirY;
    const bPerpY = bDirX;
    const bAhLX = branchTipX - bDirX * head * 0.7 + bPerpX * head * 0.45;
    const bAhLY = branchTipY - bDirY * head * 0.7 + bPerpY * head * 0.45;
    const bAhRX = branchTipX - bDirX * head * 0.7 - bPerpX * head * 0.45;
    const bAhRY = branchTipY - bDirY * head * 0.7 - bPerpY * head * 0.45;
    elements.push(
      <line
        key="branch"
        x1={branchOriginX}
        y1={branchOriginY}
        x2={branchTipX}
        y2={branchTipY}
      />,
      <line
        key="branchAhL"
        x1={branchTipX}
        y1={branchTipY}
        x2={bAhLX}
        y2={bAhLY}
      />,
      <line
        key="branchAhR"
        x1={branchTipX}
        y1={branchTipY}
        x2={bAhRX}
        y2={bAhRY}
      />,
    );
  } else {
    // Plain through arrow.
    elements.push(
      <line key="shaft" x1={baseX} y1={baseY} x2={tipX} y2={tipY} />,
      <line key="ahL" x1={tipX} y1={tipY} x2={headLeftX} y2={headLeftY} />,
      <line key="ahR" x1={tipX} y1={tipY} x2={headRightX} y2={headRightY} />,
    );
  }

  return (
    <g
      stroke={theme.arrow}
      strokeWidth={0.32}
      strokeLinecap="round"
      fill="none"
      opacity={0.92}
    >
      {elements}
    </g>
  );
}

function CrosswalksLayer({
  crosswalks,
  stopLines,
  theme,
  showLabels,
}: {
  crosswalks: Crosswalk[];
  stopLines: StopLine[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
}) {
  return (
    <g>
      {crosswalks.map((cw) => (
        <g key={cw.id}>
          <CrosswalkGlyph cw={cw} theme={theme} />
          {showLabels ? (
            <PlanLabel
              at={{
                // Offset label perpendicular to the crosswalk by half-length,
                // sitting just outside the crossing on the curb side.
                x: r(cw.centre.x + Math.cos(cw.angle + Math.PI / 2) * (cw.length / 2 + 1.4)),
                y: r(cw.centre.y + Math.sin(cw.angle + Math.PI / 2) * (cw.length / 2 + 1.4)),
              }}
              fontSize={1.1}
              color={theme.crosswalk}
              text={cw.label}
              anchor="middle"
              bold
            />
          ) : null}
        </g>
      ))}
      {stopLines.map((sl) => (
        <line
          key={sl.id}
          x1={r(sl.centre.x + Math.cos(sl.angle) * (sl.length / 2))}
          y1={r(sl.centre.y + Math.sin(sl.angle) * (sl.length / 2))}
          x2={r(sl.centre.x - Math.cos(sl.angle) * (sl.length / 2))}
          y2={r(sl.centre.y - Math.sin(sl.angle) * (sl.length / 2))}
          stroke={theme.stopLine}
          strokeWidth={0.5}
        />
      ))}
    </g>
  );
}

function CrosswalkGlyph({ cw, theme }: { cw: Crosswalk; theme: CivilPlanThemeColors }) {
  const stripeWidth = 0.45;
  const stripeGap = 0.45;
  const stripes: React.ReactElement[] = [];
  const halfLen = cw.length / 2;
  const halfW = cw.width / 2;
  const cos = Math.cos(cw.angle);
  const sin = Math.sin(cw.angle);
  const cosPerp = Math.cos(cw.angle + Math.PI / 2);
  const sinPerp = Math.sin(cw.angle + Math.PI / 2);
  const step = stripeWidth + stripeGap;
  const count = Math.floor(cw.length / step);
  const start = -(count * step) / 2;
  for (let i = 0; i < count; i += 1) {
    const offset = start + i * step + stripeWidth / 2;
    const cx = cw.centre.x + cos * offset;
    const cy = cw.centre.y + sin * offset;
    // Each stripe is a polygon along the crosswalk width.
    stripes.push(
      <line
        key={`${cw.id}-s${i}`}
        x1={r(cx + cosPerp * halfW)}
        y1={r(cy + sinPerp * halfW)}
        x2={r(cx - cosPerp * halfW)}
        y2={r(cy - sinPerp * halfW)}
        stroke={theme.crosswalk}
        strokeWidth={stripeWidth}
        opacity={0.85}
      />,
    );
  }
  // Debug: suppress unused lint warnings for halfLen.
  void halfLen;
  return <g>{stripes}</g>;
}

function CablesLayer({
  runs,
  theme,
  showLabels,
}: {
  runs: CableRun[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
}) {
  const styleFor = (run: CableRun) => {
    switch (run.kind) {
      case "ring":
        return {
          stroke: theme.cableRing,
          width: 0.32,
          dash: "0.6 0.6",
          opacity: 0.85,
        };
      case "signal":
        return {
          stroke: theme.cableSignal,
          width: 0.22,
          dash: "1.2 0.6",
          opacity: 0.8,
        };
      case "loop":
        return {
          stroke: theme.cableLoop,
          width: 0.22,
          dash: "0.5 0.4",
          opacity: 0.8,
        };
      case "fiber":
        return {
          stroke: theme.cableFiber,
          width: 0.26,
          dash: "1.6 0.8",
          opacity: 0.85,
        };
    }
  };
  return (
    <g fill="none">
      {runs.map((run) => {
        const s = styleFor(run);
        return (
          <polyline
            key={run.id}
            points={run.path.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke={s.stroke}
            strokeWidth={s.width}
            strokeDasharray={s.dash}
            strokeOpacity={s.opacity}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
      {showLabels
        ? runs
            .filter((r) => r.label && r.kind !== "ring" && r.path.length >= 2)
            .map((run) => {
              const s = styleFor(run);
              // Place the label at the midpoint of the longest segment
              // to avoid label clutter at chamber junctions.
              let bestI = 0;
              let bestLen = 0;
              for (let i = 1; i < run.path.length; i += 1) {
                const a = run.path[i - 1];
                const b = run.path[i];
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len > bestLen) {
                  bestLen = len;
                  bestI = i;
                }
              }
              const a = run.path[bestI - 1];
              const b = run.path[bestI];
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
              return (
                <PlanLabel
                  key={`lbl-${run.id}`}
                  at={{ x: mid.x, y: mid.y + 0.6 }}
                  fontSize={0.7}
                  color={s.stroke}
                  text={run.label!}
                  anchor="middle"
                />
              );
            })
        : null}
    </g>
  );
}

/**
 * Loop detectors rendered as the "Bcl-XX" yellow box with grey-hatched
 * end caps, matching the convention in real Plan d'aménagement.
 */
function LoopsLayer({
  loops,
  theme,
  showLabels,
  editable,
  startDrag,
  livePos,
  selectedKeys,
}: {
  loops: DetectorLoop[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
} & EditableLayerProps) {
  return (
    <g>
      {loops.map((loop) => {
        const centre = livePos ? livePos("loop", loop.id, loop.centre) : loop.centre;
        const isSelected = selectedKeys?.has(`loop:${loop.id}`);
        const ringR = Math.max(loop.length, loop.width) / 2 + 0.5;
        return (
          <g key={loop.id}>
            <LoopGlyph
              loop={loop}
              theme={theme}
              showLabel={showLabels}
              editable={editable}
              startDrag={startDrag}
              livePos={livePos}
            />
            {isSelected ? (
              <SelectionRing center={centre} radius={ringR} theme={theme} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function LoopGlyph({
  loop,
  theme,
  showLabel,
  editable,
  startDrag,
  livePos,
}: {
  loop: DetectorLoop;
  theme: CivilPlanThemeColors;
  showLabel: boolean;
} & EditableLayerProps) {
  const centre = livePos ? livePos("loop", loop.id, loop.centre) : loop.centre;
  const angleDeg = (loop.angle * 180) / Math.PI;
  const w = loop.width;
  const h = loop.length;
  const capLen = Math.min(0.6, w * 0.3);
  // Hatched cap = a few short diagonal strokes inside the cap rectangle.
  const cap = (xStart: number) => {
    const lines: React.ReactElement[] = [];
    const stripeCount = 3;
    for (let i = 0; i < stripeCount; i += 1) {
      const fx = xStart + (capLen * (i + 0.5)) / stripeCount;
      lines.push(
        <line
          key={`${loop.id}-cap-${xStart}-${i}`}
          x1={fx}
          y1={-h / 2 + 0.15}
          x2={fx - capLen * 0.6}
          y2={h / 2 - 0.15}
          stroke={theme.loopCap}
          strokeWidth={0.12}
        />,
      );
    }
    return <g>{lines}</g>;
  };
  return (
    <g
      transform={`translate(${centre.x} ${centre.y}) rotate(${angleDeg})`}
      style={editable ? { cursor: "grab" } : undefined}
      onPointerDown={
        editable && startDrag
          ? startDrag("loop", loop.id, centre)
          : undefined
      }
    >
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={theme.loopBox}
        fillOpacity={0.55}
        stroke={editable ? theme.cabinetStroke : theme.loop}
        strokeWidth={editable ? 0.3 : 0.18}
        rx={0.12}
      />
      {cap(-w / 2)}
      {cap(w / 2 - capLen)}
      {showLabel ? (
        <g transform={`rotate(${-angleDeg})`}>
          <g transform={`translate(0 ${-(h / 2 + 1.3)}) scale(1,-1)`}>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize={0.85}
              fontWeight={700}
              fill={theme.loop}
            >
              {loop.label}
            </text>
          </g>
        </g>
      ) : null}
    </g>
  );
}

function ChambersLayer({
  chambers,
  theme,
  showLabels,
  editable,
  startDrag,
  livePos,
  selectedKeys,
}: {
  chambers: CableChamber[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
} & EditableLayerProps) {
  return (
    <g>
      {chambers.map((c) => {
        const size = c.size ?? 1;
        const isBoucle = c.kind === "boucle";
        const fill = isBoucle ? theme.chamberBoucleFill : theme.chamberFill;
        const stroke = editable
          ? theme.cabinetStroke
          : isBoucle
            ? theme.chamberBoucleStroke
            : theme.chamber;
        const strokeWidth = editable ? 0.3 : isBoucle ? 0.18 : 0.28;
        const pos = livePos ? livePos("chamber", c.id, c.position) : c.position;
        const isSelected = selectedKeys?.has(`chamber:${c.id}`);
        const ringR = (size * Math.SQRT2) / 2 + 0.4;
        return (
          <g
            key={c.id}
            style={editable ? { cursor: "grab" } : undefined}
            onPointerDown={
              editable && startDrag
                ? startDrag("chamber", c.id, pos)
                : undefined
            }
          >
            <rect
              x={pos.x - size / 2}
              y={pos.y - size / 2}
              width={size}
              height={size}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              rx={isBoucle ? 0 : 0.05}
            />
            {showLabels && !isBoucle ? (
              <PlanLabel
                at={{ x: pos.x + size * 0.65, y: pos.y + 0.5 }}
                fontSize={0.7}
                color={theme.chamber}
                text={c.label}
                anchor="start"
                bold
              />
            ) : null}
            {isSelected ? (
              <SelectionRing center={pos} radius={ringR} theme={theme} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

// De-duped list of signalGroupIds carried by a support, preserving
// first-seen order so the rendered label is stable across re-renders.
function uniqueSignalGroups(
  heads: SignalSupport["signalHeads"],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of heads) {
    if (!h.signalGroupId || seen.has(h.signalGroupId)) continue;
    seen.add(h.signalGroupId);
    out.push(h.signalGroupId);
  }
  return out;
}

function SupportsLayer({
  supports,
  theme,
  showLabels,
  editable,
  startDrag,
  livePos,
  selectedKeys,
}: {
  supports: SignalSupport[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
} & EditableLayerProps) {
  const fillFor = (kind: SignalSupport["kind"]) => {
    if (kind === "potence") return theme.supportPotence;
    if (kind === "poteau") return theme.supportPoteau;
    return theme.supportPotelet;
  };
  return (
    <g>
      {supports.map((support) => {
        const pos = livePos
          ? livePos("support", support.id, support.position)
          : support.position;
        const isSelected = selectedKeys?.has(`support:${support.id}`);
        return (
          <g
            key={support.id}
            style={editable ? { cursor: "grab" } : undefined}
            onPointerDown={
              editable && startDrag
                ? startDrag("support", support.id, pos)
                : undefined
            }
          >
            {/* Wider transparent hit-target so 0.75 m radius dots are
                still easy to grab on touch screens. */}
            {editable ? (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={1.5}
                fill="transparent"
              />
            ) : null}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={0.75}
              fill={fillFor(support.kind)}
              stroke={editable ? theme.cabinetStroke : theme.supportRing}
              strokeWidth={editable ? 0.3 : 0.18}
            />
            {showLabels ? (
              <PlanLabel
                at={{ x: pos.x, y: pos.y + 1.4 }}
                fontSize={1.1}
                color={theme.label}
                text={support.id}
                anchor="middle"
                bold
              />
            ) : null}
            {showLabels && support.signalHeads.length > 0 ? (
              <PlanLabel
                at={{ x: pos.x, y: pos.y + 2.7 }}
                fontSize={0.78}
                color={theme.labelSoft}
                text={uniqueSignalGroups(support.signalHeads).join(" · ")}
                anchor="middle"
              />
            ) : null}
            {isSelected ? (
              <SelectionRing center={pos} radius={1.6} theme={theme} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Curb stroke — red kerb outline drawn on top of the asphalt fill, so the
// road perimeter reads like a real engineering plan.  Each arm contributes
// two parallel strokes (curb-left + curb-right); the central node fills
// in the gaps with a darker accent ring.
// ─────────────────────────────────────────────────────────────────────────

function CurbStrokeLayer({
  arms,
  theme,
}: {
  arms: RoadArm[];
  theme: CivilPlanThemeColors;
}) {
  // Push the curb start slightly DOWN the arm (away from origin) so
  // the four arm curbs don't overlap into a chaotic X at the node.
  // The asphalt fill from RoadsLayer covers the gap, and the eye reads
  // the resulting break as the rounded fillet of a real intersection.
  const startOffset = 4.0;
  return (
    <g fill="none" stroke={theme.curbAccent} strokeWidth={0.34} strokeLinecap="round">
      {arms.map((arm) => {
        const { from, to } = arm.axis;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return null;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;
        const startX = from.x + ux * startOffset;
        const startY = from.y + uy * startOffset;
        const w = arm.halfWidth + 0.05;
        return (
          <g key={`curb-${arm.id}`}>
            <line
              x1={startX + nx * w}
              y1={startY + ny * w}
              x2={to.x + nx * w}
              y2={to.y + ny * w}
            />
            <line
              x1={startX - nx * w}
              y1={startY - ny * w}
              x2={to.x - nx * w}
              y2={to.y - ny * w}
            />
          </g>
        );
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Refuge islands — blue zebra-hatched pill / oval / diamond shapes that
// shelter pedestrians between traffic flows.  These are the dominant
// visual element of a real Plan d'aménagement.
// ─────────────────────────────────────────────────────────────────────────

function RefugeIslandsLayer({
  islands,
  theme,
  showLabels,
}: {
  islands: RefugeIsland[];
  theme: CivilPlanThemeColors;
  showLabels: boolean;
}) {
  // We use one shared <pattern> for the zebra hatch.  Defining it inside
  // the SVG once keeps the per-island rendering cheap.
  const patternId = "refuge-zebra";
  return (
    <g>
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={1.4}
          height={1.4}
          patternTransform="rotate(45)"
        >
          <rect width={1.4} height={1.4} fill={theme.islandFill} />
          <rect width={0.7} height={1.4} fill={theme.islandHatch} />
        </pattern>
      </defs>
      {islands.map((island) => (
        <RefugeIslandShape
          key={island.id}
          island={island}
          theme={theme}
          patternRef={`url(#${patternId})`}
          showLabel={showLabels}
        />
      ))}
    </g>
  );
}

function RefugeIslandShape({
  island,
  theme,
  patternRef,
  showLabel,
}: {
  island: RefugeIsland;
  theme: CivilPlanThemeColors;
  patternRef: string;
  showLabel: boolean;
}) {
  const angleDeg = (island.angle * 180) / Math.PI;
  const w = island.length;
  const h = island.width;
  const r = Math.min(w, h) / 2;

  let shapeNode: React.ReactElement;
  if (island.shape === "oval") {
    shapeNode = (
      <ellipse
        cx={0}
        cy={0}
        rx={w / 2}
        ry={h / 2}
        fill={patternRef}
        stroke={theme.islandStroke}
        strokeWidth={0.3}
      />
    );
  } else if (island.shape === "diamond") {
    shapeNode = (
      <polygon
        points={`0,${h / 2} ${w / 2},0 0,${-h / 2} ${-w / 2},0`}
        fill={patternRef}
        stroke={theme.islandStroke}
        strokeWidth={0.3}
      />
    );
  } else {
    // Pill (stadium) — rounded rectangle with full hemicircles at each end.
    shapeNode = (
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill={patternRef}
        stroke={theme.islandStroke}
        strokeWidth={0.3}
      />
    );
  }

  return (
    <g transform={`translate(${island.centre.x} ${island.centre.y}) rotate(${angleDeg})`}>
      {shapeNode}
      {showLabel ? (
        <g transform={`rotate(${-angleDeg}) scale(1,-1)`}>
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize={Math.min(2.2, h * 0.55)}
            fontWeight={800}
            fill={theme.islandLabel}
          >
            {island.label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Movement arrows — curved blue arrows derived from each inbound lane's
// `kind`.  through → straight to opposite arm.  left → CCW arc to left
// neighbour.  right → CW arc to right neighbour.  through-left and
// through-right draw both.
// ─────────────────────────────────────────────────────────────────────────

interface ArmGeom {
  arm: RoadArm;
  outwardX: number;
  outwardY: number;
  bearing: number;
}

function armGeom(arm: RoadArm): ArmGeom {
  const { from, to } = arm.axis;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { arm, outwardX: ux, outwardY: uy, bearing: Math.atan2(uy, ux) };
}

function pickReceiver(
  arms: ArmGeom[],
  from: ArmGeom,
  movement: "through" | "left" | "right",
): ArmGeom | null {
  // Inbound forward direction = from.bearing + π.  Then the new heading
  // after the manoeuvre = forward + rotation.  The receiving arm has
  // outward bearing equal to that new heading.
  const rotation =
    movement === "through" ? 0 : movement === "left" ? Math.PI / 2 : -Math.PI / 2;
  const wanted = ((from.bearing + Math.PI + rotation) + 8 * Math.PI) % (2 * Math.PI);
  let best: { arm: ArmGeom; diff: number } | null = null;
  for (const a of arms) {
    if (a.arm.id === from.arm.id) continue;
    const norm = ((a.bearing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let d = Math.abs(norm - wanted);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (best === null || d < best.diff) best = { arm: a, diff: d };
  }
  return best?.arm ?? null;
}

function MovementArrowsLayer({
  arms,
  theme,
}: {
  arms: RoadArm[];
  theme: CivilPlanThemeColors;
}) {
  const geoms = arms.map(armGeom);
  const elements: React.ReactElement[] = [];

  for (const fromGeom of geoms) {
    const fromArm = fromGeom.arm;
    const inboundLanes = fromArm.lanes.filter((l) => l.direction === "in");
    for (const lane of inboundLanes) {
      const movements = movementsFor(lane.kind);
      for (const m of movements) {
        const receiver = pickReceiver(geoms, fromGeom, m);
        if (!receiver) continue;
        const path = curvedMovementPath(fromGeom, lane, receiver, m);
        if (!path) continue;
        elements.push(
          <MovementArrow
            key={`mv-${lane.id}-${m}`}
            d={path.d}
            tip={path.tip}
            tipDir={path.tipDir}
            theme={theme}
          />,
        );
      }
    }
  }

  return <g>{elements}</g>;
}

function movementsFor(kind: Lane["kind"]): Array<"through" | "left" | "right"> {
  switch (kind) {
    case "through":
      return ["through"];
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "through-left":
      return ["through", "left"];
    case "through-right":
      return ["through", "right"];
  }
}

function curvedMovementPath(
  fromGeom: ArmGeom,
  lane: Lane,
  toGeom: ArmGeom,
  movement: "through" | "left" | "right",
): { d: string; tip: PlanPoint; tipDir: PlanPoint } | null {
  // Start point: a few metres into the arm from the node, on the
  // inbound lane's perpendicular offset.
  const inboundForwardX = -fromGeom.outwardX;
  const inboundForwardY = -fromGeom.outwardY;
  // Perp = 90° CCW of outward = matches Lane.offset > 0 = left of outward.
  const fpx = -fromGeom.outwardY;
  const fpy = fromGeom.outwardX;
  const startDist = 9; // a touch past the stop-line
  const startX = fromGeom.outwardX * startDist + fpx * lane.offset;
  const startY = fromGeom.outwardY * startDist + fpy * lane.offset;

  // End point: enter the receiving arm in its outermost outbound lane.
  // Outbound offsets are negative in our model; pick a reasonable
  // outermost outbound = -(halfWidth - 1.5).
  const tpx = -toGeom.outwardY;
  const tpy = toGeom.outwardX;
  const endLaneOffset =
    movement === "through"
      ? -(toGeom.arm.medianWidth ?? 0) / 2 - 1.5
      : -(toGeom.arm.medianWidth ?? 0) / 2 - 4.5;
  const endDist = 9;
  const endX = toGeom.outwardX * endDist + tpx * endLaneOffset;
  const endY = toGeom.outwardY * endDist + tpy * endLaneOffset;

  // Bezier control points — start tangent points along inbound forward,
  // end tangent points along receiving outward.
  const dist = Math.hypot(endX - startX, endY - startY);
  const handle =
    movement === "through" ? dist * 0.35 : Math.max(6, dist * 0.55);
  const c1x = startX + inboundForwardX * handle;
  const c1y = startY + inboundForwardY * handle;
  const c2x = endX - toGeom.outwardX * handle;
  const c2y = endY - toGeom.outwardY * handle;

  const d = `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`;
  return {
    d,
    tip: { x: endX, y: endY },
    tipDir: { x: toGeom.outwardX, y: toGeom.outwardY },
  };
}

function MovementArrow({
  d,
  tip,
  tipDir,
  theme,
}: {
  d: string;
  tip: PlanPoint;
  tipDir: PlanPoint;
  theme: CivilPlanThemeColors;
}) {
  const head = 1.2;
  const perpX = -tipDir.y;
  const perpY = tipDir.x;
  const baseLeftX = tip.x - tipDir.x * head + perpX * head * 0.55;
  const baseLeftY = tip.y - tipDir.y * head + perpY * head * 0.55;
  const baseRightX = tip.x - tipDir.x * head - perpX * head * 0.55;
  const baseRightY = tip.y - tipDir.y * head - perpY * head * 0.55;
  return (
    <g
      stroke={theme.movementArrow}
      strokeWidth={0.32}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      opacity={0.9}
    >
      <path d={d} />
      <polygon
        points={`${tip.x},${tip.y} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`}
        fill={theme.movementArrow}
        stroke="none"
        opacity={0.92}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// In-canvas legend box — positioned at the top-left of the plan bounds
// so PDF / DXF exports carry it along with the geometry.
// ─────────────────────────────────────────────────────────────────────────

function LegendBox({
  bounds,
  theme,
}: {
  bounds: PlanBounds;
  theme: CivilPlanThemeColors;
}) {
  // Bottom-left, matching the convention of real Plan d'aménagement.
  const w = 17;
  const h = 16;
  const x = bounds.minX + 1;
  const yBottom = bounds.minY + 1;
  const yTop = yBottom + h;

  // Each entry: a swatch + a label, stacked top-down.
  const entries: Array<{ label: string; render: (yy: number) => React.ReactElement }> = [
    {
      label: "Potence (R14 + R12)",
      render: (yy) => (
        <circle cx={x + 0.8} cy={yy} r={0.45} fill={theme.supportPotence} stroke={theme.supportRing} strokeWidth={0.1} />
      ),
    },
    {
      label: "Poteau (R11v + R12)",
      render: (yy) => (
        <circle cx={x + 0.8} cy={yy} r={0.45} fill={theme.supportPoteau} stroke={theme.supportRing} strokeWidth={0.1} />
      ),
    },
    {
      label: "Potelet (R12)",
      render: (yy) => (
        <circle cx={x + 0.8} cy={yy} r={0.45} fill={theme.supportPotelet} stroke={theme.supportRing} strokeWidth={0.1} />
      ),
    },
    {
      label: "Refuge piéton (P##)",
      render: (yy) => (
        <rect x={x + 0.2} y={yy - 0.45} width={1.2} height={0.9} rx={0.35} fill={theme.islandHatch} stroke={theme.islandStroke} strokeWidth={0.18} />
      ),
    },
    {
      label: "Boucle de détection",
      render: (yy) => (
        <rect x={x + 0.2} y={yy - 0.4} width={1.2} height={0.8} fill={theme.loopBox} fillOpacity={0.6} stroke={theme.loop} strokeWidth={0.12} />
      ),
    },
    {
      label: "Chambre SLT",
      render: (yy) => (
        <rect x={x + 0.3} y={yy - 0.4} width={0.9} height={0.8} fill={theme.chamberFill} stroke={theme.chamber} strokeWidth={0.18} />
      ),
    },
    {
      label: "Chambre boucle",
      render: (yy) => (
        <rect x={x + 0.45} y={yy - 0.3} width={0.6} height={0.6} fill={theme.chamberBoucleFill} stroke={theme.chamberBoucleStroke} strokeWidth={0.15} />
      ),
    },
    {
      label: "Liaison ceinturage",
      render: (yy) => (
        <line x1={x + 0.1} y1={yy} x2={x + 1.5} y2={yy} stroke={theme.cableRing} strokeWidth={0.32} strokeDasharray="0.6 0.6" />
      ),
    },
    {
      label: "Liaison support",
      render: (yy) => (
        <line x1={x + 0.1} y1={yy} x2={x + 1.5} y2={yy} stroke={theme.cableSignal} strokeWidth={0.22} strokeDasharray="1.2 0.6" />
      ),
    },
    {
      label: "Liaison boucle",
      render: (yy) => (
        <line x1={x + 0.1} y1={yy} x2={x + 1.5} y2={yy} stroke={theme.cableLoop} strokeWidth={0.22} strokeDasharray="0.5 0.4" />
      ),
    },
    {
      label: "Fibre optique",
      render: (yy) => (
        <line x1={x + 0.1} y1={yy} x2={x + 1.5} y2={yy} stroke={theme.cableFiber} strokeWidth={0.26} strokeDasharray="1.6 0.8" />
      ),
    },
    {
      label: "Mouvement véhicule",
      render: (yy) => (
        <g>
          <line x1={x + 0.1} y1={yy} x2={x + 1.3} y2={yy} stroke={theme.movementArrow} strokeWidth={0.32} strokeLinecap="round" />
          <polygon
            points={`${x + 1.5},${yy} ${x + 1.0},${yy + 0.35} ${x + 1.0},${yy - 0.35}`}
            fill={theme.movementArrow}
          />
        </g>
      ),
    },
  ];

  // Title strip + entry rows.
  const titleY = yTop - 1.2;
  const rowStart = titleY - 1.4;
  const rowStep = 1.05;

  return (
    <g>
      <rect
        x={x - 0.4}
        y={yBottom}
        width={w}
        height={h}
        fill={theme.legendBg}
        stroke={theme.legendStroke}
        strokeWidth={0.18}
        rx={0.4}
      />
      <g transform={`translate(${x + w / 2 - 0.4} ${titleY}) scale(1,-1)`}>
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={1.1}
          fontWeight={800}
          fill={theme.label}
        >
          Légende
        </text>
      </g>
      {entries.map((entry, i) => {
        const yy = rowStart - i * rowStep;
        return (
          <g key={`legend-${i}`}>
            {entry.render(yy)}
            <g transform={`translate(${x + 2.2} ${yy + 0.35}) scale(1,-1)`}>
              <text
                x={0}
                y={0}
                textAnchor="start"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                fontSize={0.78}
                fontWeight={500}
                fill={theme.label}
              >
                {entry.label}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

function CabinetLayer({
  cabinet,
  theme,
  showLabel,
  editable,
  startDrag,
  livePos,
  selectedKeys,
}: {
  cabinet: { id: string; label: string; position: PlanPoint; footprint: number };
  theme: CivilPlanThemeColors;
  showLabel: boolean;
} & EditableLayerProps) {
  const half = cabinet.footprint / 2;
  const pos = livePos ? livePos("cabinet", cabinet.id, cabinet.position) : cabinet.position;
  const isSelected = selectedKeys?.has(`cabinet:${cabinet.id}`);
  const ringR = (cabinet.footprint * Math.SQRT2) / 2 + 0.4;
  return (
    <g
      style={editable ? { cursor: "grab" } : undefined}
      onPointerDown={
        editable && startDrag
          ? startDrag("cabinet", cabinet.id, pos)
          : undefined
      }
    >
      <rect
        x={pos.x - half}
        y={pos.y - half}
        width={cabinet.footprint}
        height={cabinet.footprint}
        fill={theme.cabinet}
        stroke={theme.cabinetStroke}
        strokeWidth={editable ? 0.5 : 0.35}
        rx={0.15}
      />
      {showLabel ? (
        <PlanLabel
          at={{ x: pos.x, y: pos.y + cabinet.footprint * 0.85 }}
          fontSize={1.2}
          color={theme.cabinetStroke}
          text={cabinet.label}
          anchor="middle"
          bold
        />
      ) : null}
      {isSelected ? (
        <SelectionRing center={pos} radius={ringR} theme={theme} />
      ) : null}
    </g>
  );
}

function ApproachLabelsLayer({
  arms,
  theme,
}: {
  arms: RoadArm[];
  theme: CivilPlanThemeColors;
}) {
  return (
    <g>
      {arms.map((arm) => {
        const { from, to } = arm.axis;
        const t = 0.78;
        const mid: PlanPoint = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        };
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        const labelPos = {
          x: mid.x + nx * (arm.halfWidth + 2.4),
          y: mid.y + ny * (arm.halfWidth + 2.4),
        };
        // Rotate the label to follow the road axis.  We compute the
        // rotation in plan-frame radians; the orientation that reads
        // left-to-right from below is atan2(dy,dx) constrained to
        // [-π/2, π/2] so text never appears upside-down.
        let rotRad = Math.atan2(dy, dx);
        if (rotRad > Math.PI / 2) rotRad -= Math.PI;
        if (rotRad < -Math.PI / 2) rotRad += Math.PI;
        return (
          <PlanLabel
            key={`label-${arm.id}`}
            at={labelPos}
            fontSize={1.4}
            color={theme.labelSoft}
            text={arm.streetName}
            anchor="middle"
            bold
            italic
            rotationRad={rotRad}
          />
        );
      })}
    </g>
  );
}

function PlanLabel({
  at,
  text,
  fontSize,
  color,
  anchor = "middle",
  bold = false,
  italic = false,
  rotationRad = 0,
}: {
  at: PlanPoint;
  text: string;
  fontSize: number;
  color: string;
  anchor?: "start" | "middle" | "end";
  bold?: boolean;
  italic?: boolean;
  /** Optional rotation around the label anchor, in plan-frame radians. */
  rotationRad?: number;
}) {
  // Labels live in plan frame but text in SVG is flipped by the
  // parent scale(1,-1), so we counter-flip here.  When rotation is
  // applied, we rotate FIRST in plan-frame space then counter-flip,
  // so the text reads left-to-right along the rotated baseline.
  const rotDeg = (rotationRad * 180) / Math.PI;
  return (
    <g
      transform={`translate(${at.x} ${at.y}) rotate(${rotDeg}) scale(1,-1)`}
    >
      <text
        x={0}
        y={0}
        textAnchor={anchor}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={fontSize}
        fontWeight={bold ? 700 : 500}
        fontStyle={italic ? "italic" : "normal"}
        fill={color}
      >
        {text}
      </text>
    </g>
  );
}

function NorthArrow({ theme }: { theme: CivilPlanThemeColors }) {
  // Positioned in absolute viewBox coordinates — top-right.
  return (
    <g transform="translate(22 -22)">
      <circle r={2.4} fill="none" stroke={theme.northArrow} strokeWidth={0.2} />
      <polygon
        points="0,-2.2 0.7,0.4 0,-0.4 -0.7,0.4"
        fill={theme.northArrow}
      />
      <g transform="translate(0 2.7) scale(1,-1)">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={1.2}
          fontWeight={700}
          fill={theme.northArrow}
        >
          N
        </text>
      </g>
    </g>
  );
}

function ScaleBar({
  theme,
  metresPerUnit,
}: {
  theme: CivilPlanThemeColors;
  metresPerUnit: number;
}) {
  // Bottom-left, 10 m bar.
  const length = 10 * metresPerUnit;
  return (
    <g transform="translate(-24 22)">
      <line x1={0} y1={0} x2={length} y2={0} stroke={theme.scaleBar} strokeWidth={0.35} />
      <line x1={0} y1={-0.6} x2={0} y2={0.6} stroke={theme.scaleBar} strokeWidth={0.35} />
      <line
        x1={length / 2}
        y1={-0.4}
        x2={length / 2}
        y2={0.4}
        stroke={theme.scaleBar}
        strokeWidth={0.35}
      />
      <line
        x1={length}
        y1={-0.6}
        x2={length}
        y2={0.6}
        stroke={theme.scaleBar}
        strokeWidth={0.35}
      />
      <g transform="translate(0 1.6) scale(1,-1)">
        <text
          x={0}
          y={0}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={1.1}
          fontWeight={700}
          fill={theme.scaleBar}
        >
          0
        </text>
        <text
          x={length / 2}
          y={0}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={1.1}
          fill={theme.scaleBar}
        >
          5 m
        </text>
        <text
          x={length}
          y={0}
          textAnchor="end"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={1.1}
          fontWeight={700}
          fill={theme.scaleBar}
        >
          10 m
        </text>
      </g>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Base plan (imported topographic/vector geometry)
// ─────────────────────────────────────────────────────────────────────────

const BASE_LAYER_Z: Record<BaseLayerKind, number> = {
  contours: 0,
  parcels: 1,
  buildings: 2,
  roads: 3,
  medians: 4,
  lane_edges: 5,
  crosswalks: 6,
};

// ─────────────────────────────────────────────────────────────────────────
// Backdrop image — the operator's actual consultant étude (PNG / JPG /
// SVG) drawn under the engineering layers so the synthetic overlay sits
// on top of the real CAD plan instead of a template.
//
// The plan group already applies scale(1,-1) to flip Y so the +Y-up
// metric frame renders with north up.  An <image> drawn in that frame
// would appear mirrored vertically, so we counter-flip with another
// scale(1,-1) inside the image's local transform.  Rotation is applied
// after the counter-flip in degrees (SVG sign convention); positive
// values rotate the image clockwise on screen.
// ─────────────────────────────────────────────────────────────────────────

function BackdropImageLayer({ image }: { image: BackdropImage }) {
  const w = image.widthMetres;
  const h = image.heightMetres;
  if (!(w > 0) || !(h > 0)) return null;
  const rotDeg = (image.rotation * 180) / Math.PI;
  return (
    <g
      transform={`translate(${image.centreX} ${image.centreY}) scale(1,-1) rotate(${rotDeg})`}
      opacity={image.opacity}
      pointerEvents="none"
    >
      <image
        href={image.dataUrl}
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}

function BaseLayersGroup({
  features,
  theme,
}: {
  features: BaseLayerFeature[];
  theme: CivilPlanThemeColors;
}) {
  // OSM road features (those with an explicit metric width) are
  // rendered as fat asphalt strokes with red curb edges so the
  // carriageway has visible width, not just a centerline.
  const carriageways = features.filter(
    (f) => f.kind === "roads" && typeof f.width === "number" && f.width > 0,
  );
  const others = features.filter((f) => !carriageways.includes(f));
  const sortedOthers = [...others].sort(
    (a, b) => BASE_LAYER_Z[a.kind] - BASE_LAYER_Z[b.kind],
  );
  return (
    <g>
      {/* Carriageways: red kerb stroke first, then asphalt stroke on top.
          Drawn in two passes so kerbs of adjacent roads merge cleanly
          and the asphalt overlays its own kerb where ways meet. */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {carriageways.map((f) => (
          <CarriagewayKerb key={`kerb-${f.id}`} feature={f} theme={theme} />
        ))}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {carriageways.map((f) => (
          <CarriagewayAsphalt key={`asph-${f.id}`} feature={f} theme={theme} />
        ))}
      </g>
      {/* Optional centerline marking on multi-lane roads. */}
      <g fill="none" strokeLinecap="round">
        {carriageways.map((f) =>
          f.width && f.width >= 6 && !f.roundabout ? (
            <CarriagewayCentreline
              key={`cl-${f.id}`}
              feature={f}
              theme={theme}
            />
          ) : null,
        )}
      </g>
      {/* All other base layers (medians/islands, parcels, contours…). */}
      <g opacity={0.9}>
        {sortedOthers.map((feature) => (
          <BaseLayerFeatureShape
            key={feature.id}
            feature={feature}
            theme={theme}
          />
        ))}
      </g>
    </g>
  );
}

function carriagewayPoints(feature: BaseLayerFeature): string {
  return feature.path.map((p) => `${p.x},${p.y}`).join(" ");
}

function CarriagewayKerb({
  feature,
  theme,
}: {
  feature: BaseLayerFeature;
  theme: CivilPlanThemeColors;
}) {
  const w = (feature.width ?? 6) + 0.6;
  const Tag = feature.closed ? "polygon" : "polyline";
  return (
    <Tag
      points={carriagewayPoints(feature)}
      stroke={theme.curbAccent}
      strokeWidth={w}
      fill="none"
    />
  );
}

function CarriagewayAsphalt({
  feature,
  theme,
}: {
  feature: BaseLayerFeature;
  theme: CivilPlanThemeColors;
}) {
  const w = feature.width ?? 6;
  // Always stroke, never fill — for roundabouts the stroke alone produces
  // the carriageway ring with a clean centre-island hole.
  const Tag = feature.closed ? "polygon" : "polyline";
  return (
    <Tag
      points={carriagewayPoints(feature)}
      stroke={theme.asphalt}
      strokeWidth={w}
      fill="none"
      strokeOpacity={0.95}
    />
  );
}

function CarriagewayCentreline({
  feature,
  theme,
}: {
  feature: BaseLayerFeature;
  theme: CivilPlanThemeColors;
}) {
  return (
    <polyline
      points={carriagewayPoints(feature)}
      stroke={theme.laneMark}
      strokeWidth={0.18}
      strokeDasharray="1.4 1.6"
      strokeOpacity={0.55}
      fill="none"
    />
  );
}

function BaseLayerFeatureShape({
  feature,
  theme,
}: {
  feature: BaseLayerFeature;
  theme: CivilPlanThemeColors;
}) {
  if (feature.path.length < 2) return null;
  const points = feature.path.map((pt) => `${pt.x},${pt.y}`).join(" ");
  // Closed road polygons (typically OSM roundabout perimeters) read as
  // a bold ring, not a thin centreline.  Closed `medians` features are
  // treated as refuge islands — filled with the island colour.
  const isRoundaboutRing = feature.kind === "roads" && feature.closed;
  const isRefugeIsland = feature.kind === "medians" && feature.closed;
  const stroke = isRefugeIsland
    ? theme.islandStroke
    : isRoundaboutRing
      ? theme.curbAccent
      : feature.kind === "roads" || feature.kind === "lane_edges"
        ? theme.basePlanStroke
        : theme.basePlanStrokeSoft;
  const strokeWidth = isRefugeIsland
    ? 0.32
    : isRoundaboutRing
      ? 0.5
      : feature.kind === "roads"
        ? 0.35
        : feature.kind === "lane_edges"
          ? 0.22
          : feature.kind === "crosswalks"
            ? 0.25
            : 0.18;
  const fill = isRefugeIsland
    ? theme.islandHatch
    : feature.closed
      ? theme.basePlanFill
      : "none";
  const fillOpacity = isRefugeIsland ? 0.55 : 1;
  const dashArray =
    feature.kind === "contours"
      ? "0.6 0.4"
      : feature.kind === "parcels"
        ? "0.4 0.3"
        : undefined;
  if (feature.closed) {
    return (
      <polygon
        points={points}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
      />
    );
  }
  return (
    <polyline
      points={points}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dashArray}
    />
  );
}

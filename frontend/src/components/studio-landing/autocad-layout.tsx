"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type CadCommand,
  type CadSnap,
  type CadViewport,
  CivilPlanRenderer,
  computePlanViewport,
  darkPlanTheme,
  defaultCadSnap,
  lightPlanTheme,
} from "@/components/studio-landing/civil-plan-renderer";
import type { PlanPoint } from "@/types/civil-plan";
import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import type {
  IntersectionConfig,
  WorkflowStatus,
} from "@/components/studio/state/types";
import { buildSampleCivilPlan } from "@/lib/civil-plan-samples";
import {
  readIntersectionConfig,
  subscribeToStudioStore,
  writeCivilPlan,
} from "@/lib/civil-plan-store";
import { fetchOsmBaseLayers } from "@/lib/osm-import";
import {
  buildEngineeringFromArms,
  detectArms,
} from "@/lib/osm-engineering";
import type { CivilPlan, CivilPlanLayer } from "@/types/civil-plan";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

interface AutocadLayoutProps {
  intersections: EngineeringIntersectionRecord[];
  selectedIntersectionId: string;
}

const LAYERS: Array<{ id: CivilPlanLayer; label: string }> = [
  { id: "backdrop", label: "Backdrop" },
  { id: "roads", label: "Roads" },
  { id: "lanes", label: "Lane markings" },
  { id: "crosswalks", label: "Crosswalks" },
  { id: "islands", label: "Refuge islands" },
  { id: "movements", label: "Movement arrows" },
  { id: "supports", label: "Signal supports" },
  { id: "loops", label: "Detector loops" },
  { id: "chambers", label: "Chambers" },
  { id: "cables", label: "Cables" },
  { id: "labels", label: "Labels" },
  { id: "legend", label: "Legend box" },
];

const BACKDROP_ACCEPT = "image/png,image/jpeg,image/jpg,image/svg+xml,image/webp";
const BACKDROP_MAX_BYTES = 8 * 1024 * 1024; // 8 MB — keeps localStorage sane.

/** Read an image file as a data URL + intrinsic pixel dimensions so we
 *  can preserve aspect ratio when placing it on the plan. */
async function readBackdropFile(file: File): Promise<{
  dataUrl: string;
  pixelWidth: number;
  pixelHeight: number;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
  const dims = await new Promise<{ pixelWidth: number; pixelHeight: number }>(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          pixelWidth: img.naturalWidth || img.width || 1000,
          pixelHeight: img.naturalHeight || img.height || 700,
        });
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = dataUrl;
    },
  );
  return { dataUrl, ...dims };
}

export function AutocadLayout({
  intersections,
  selectedIntersectionId,
}: AutocadLayoutProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";

  const intersection = useMemo(
    () => intersections.find((i) => i.id === selectedIntersectionId),
    [intersections, selectedIntersectionId],
  );

  // Live-read the Studio store so edits in the Workbench Plan tab
  // surface here instantly (cross-tab via the storage event, same-tab
  // via the hook polling on navigation).
  const [storedConfig, setStoredConfig] = useState<IntersectionConfig | null>(
    null,
  );
  useEffect(() => {
    if (!intersection) return;
    const refresh = () => setStoredConfig(readIntersectionConfig(intersection.id));
    refresh();
    return subscribeToStudioStore(refresh);
  }, [intersection]);

  // Source of truth (priority order):
  //   1. Imported project geometry — storedConfig.civilPlan with a
  //      non-template basePlan source (topoexport/dxf/svg/geojson).
  //   2. Stored edited geometry — storedConfig.civilPlan regardless of
  //      basePlan source (template-seeded plans still count).
  //   3. Sample / template fallback — last resort so the page renders
  //      something rather than a blank screen.
  const plan: CivilPlan | null = useMemo(() => {
    if (!intersection) return null;
    if (storedConfig?.civilPlan) return storedConfig.civilPlan;
    return buildSampleCivilPlan({
      code: intersection.code,
      name: intersection.name,
    });
  }, [intersection, storedConfig]);

  const basePlanSource = storedConfig?.civilPlan?.basePlan?.source;
  const planSource: "imported" | "workbench" | "sample" = storedConfig?.civilPlan
    ? basePlanSource && basePlanSource !== "template"
      ? "imported"
      : "workbench"
    : "sample";
  const workflowStatus: WorkflowStatus =
    storedConfig?.workflowStatus ?? "draft_plan";
  const revision = storedConfig?.revision ?? "A";

  const [visibility, setVisibility] = useState<Record<CivilPlanLayer, boolean>>({
    backdrop: true,
    roads: true,
    lanes: true,
    crosswalks: true,
    islands: true,
    movements: true,
    supports: true,
    loops: true,
    chambers: true,
    cables: true,
    labels: true,
    legend: true,
  });
  const [backdropError, setBackdropError] = useState<string | null>(null);
  const [backdropBusy, setBackdropBusy] = useState(false);
  const backdropInputRef = useRef<HTMLInputElement | null>(null);

  const [exporting, setExporting] = useState<
    null | "plan" | "regulation" | "cablage"
  >(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [osmStatus, setOsmStatus] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "error"; message: string }
    | {
        state: "success";
        ways: number;
        roundabout: boolean;
        arms: Array<{
          letter: string;
          name: string;
          compass: string;
          lanes: number;
          category?: string;
        }>;
      }
  >({ state: "idle" });
  const [editMode, setEditMode] = useState(false);

  // ─── CAD editor state ──────────────────────────────────────────────
  // Phase 1 — viewport + cursor:
  //   viewport===null means "use canonical view"; the renderer falls
  //   back to its computed viewBox.  Wheel + middle-button-drag in the
  //   renderer set this; the Reset View button clears it.
  // Phase 2 — selection:
  //   set of "kind:id" keys.  The renderer reads it for grip rendering
  //   and writes it on click / shift-click.
  const [viewport, setViewport] = useState<CadViewport | null>(null);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [snap, setSnap] = useState<CadSnap>(defaultCadSnap);
  // Undo / redo history.  Each stack holds previous CivilPlan snapshots
  // capped at 50 entries.  A mutation pushes the pre-mutation plan to
  // undoStack and clears redoStack; undo moves the current plan to
  // redoStack and re-writes the popped snapshot.
  const HISTORY_CAP = 50;
  const [undoStack, setUndoStack] = useState<CivilPlan[]>([]);
  const [redoStack, setRedoStack] = useState<CivilPlan[]>([]);
  // Active CAD command (M / CO / RO).  null = no command in progress.
  // The state machine lives in handleCommandPoint below.
  const [command, setCommand] = useState<CadCommand | null>(null);
  // Buffer for two-letter commands (CO, RO) — when the user types `c`
  // we wait up to 1s for a follow-up `o`.
  const cmdBufferRef = useRef<{ key: string; expires: number } | null>(null);

  const baseViewport = useMemo(
    () => (plan ? computePlanViewport(plan) : null),
    [plan],
  );
  const zoomPct = viewport && baseViewport
    ? Math.round((baseViewport.w / viewport.w) * 100)
    : 100;
  const handleResetView = () => setViewport(null);

  if (!intersection || !plan) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070a] px-5 text-center text-[#edf3ee]">
        <div className="max-w-md space-y-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ff9a9a]">
            Intersection not found
          </p>
          <p className="text-[0.88rem] text-[#c3cdc6]">
            No intersection with id{" "}
            <span className="font-mono">{selectedIntersectionId}</span>.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.78rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            ← Back to Studio
          </Link>
        </div>
      </main>
    );
  }

  const primaryController = intersection.controllers[0];

  const shellClass = isDark
    ? "bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
    : "bg-[#f3f1ea] text-[#1b2322]";

  const panelBg = isDark
    ? "bg-[#0a1014]/95 border-white/8"
    : "bg-white border-black/10";
  const mutedText = isDark ? "text-[#8fa39a]" : "text-[#56605b]";
  const planTheme = isDark ? darkPlanTheme : lightPlanTheme;

  const toggleLayer = (layer: CivilPlanLayer) => {
    setVisibility((current) => ({ ...current, [layer]: !current[layer] }));
  };

  // ─── Backdrop image (consultant étude as PNG/JPG/SVG) ──────────────
  // Uploaded files are stored as data-URLs inside the CivilPlan so the
  // image survives localStorage round-trips with no backend.  We size
  // the image to span 90 % of the current plan bounds, anchored at the
  // intersection centre, and derive height from the natural aspect
  // ratio.  The operator can then dim opacity or hide the layer.
  const handleBackdropPick = async (file: File | null) => {
    if (!file || !plan || !intersection) return;
    setBackdropError(null);
    if (file.size > BACKDROP_MAX_BYTES) {
      setBackdropError(
        `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — must be under ${BACKDROP_MAX_BYTES / 1024 / 1024} MB.`,
      );
      return;
    }
    setBackdropBusy(true);
    try {
      const { dataUrl, pixelWidth, pixelHeight } = await readBackdropFile(file);
      const planWidth = plan.bounds.maxX - plan.bounds.minX;
      const planHeight = plan.bounds.maxY - plan.bounds.minY;
      const centreX = (plan.bounds.minX + plan.bounds.maxX) / 2;
      const centreY = (plan.bounds.minY + plan.bounds.maxY) / 2;
      const aspect = pixelHeight > 0 ? pixelWidth / pixelHeight : 1;
      // Fit inside 90 % of the plan bounds while preserving aspect.
      const fitW = Math.min(planWidth * 0.9, planHeight * 0.9 * aspect);
      const widthMetres = Math.max(8, fitW);
      const heightMetres = widthMetres / aspect;
      const previous = plan.backdropImage;
      persistPlan({
        ...plan,
        backdropImage: {
          dataUrl,
          name: file.name,
          mime: file.type || "image/png",
          centreX,
          centreY,
          widthMetres,
          heightMetres,
          rotation: previous?.rotation ?? 0,
          opacity: previous?.opacity ?? 0.65,
        },
      });
      setVisibility((v) => ({ ...v, backdrop: true }));
    } catch (err) {
      setBackdropError(
        err instanceof Error ? err.message : "Failed to read image",
      );
    } finally {
      setBackdropBusy(false);
      if (backdropInputRef.current) backdropInputRef.current.value = "";
    }
  };

  const handleBackdropClear = () => {
    if (!plan) return;
    setBackdropError(null);
    const { backdropImage: _omit, ...rest } = plan;
    void _omit;
    persistPlan(rest as CivilPlan);
  };

  const handleBackdropOpacity = (next: number) => {
    if (!plan?.backdropImage) return;
    persistPlan({
      ...plan,
      backdropImage: { ...plan.backdropImage, opacity: next },
    });
  };

  const handleBackdropWidth = (next: number) => {
    if (!plan?.backdropImage) return;
    const aspect =
      plan.backdropImage.widthMetres > 0
        ? plan.backdropImage.widthMetres / plan.backdropImage.heightMetres
        : 1;
    persistPlan({
      ...plan,
      backdropImage: {
        ...plan.backdropImage,
        widthMetres: next,
        heightMetres: next / aspect,
      },
    });
  };

  const handleBackdropRotation = (degrees: number) => {
    if (!plan?.backdropImage) return;
    persistPlan({
      ...plan,
      backdropImage: {
        ...plan.backdropImage,
        rotation: (degrees * Math.PI) / 180,
      },
    });
  };

  const countByKind = (k: "poteau" | "potelet" | "potence") =>
    plan.supports.filter((s) => s.kind === k).length;

  const handleExport = async (kind: "plan" | "regulation" | "cablage") => {
    setExporting(kind);
    setExportError(null);
    try {
      const { exportCivilPlanDossier } = await import(
        "@/components/studio-landing/civil-plan-export"
      );
      await exportCivilPlanDossier({
        plan,
        intersection,
        kind,
        revision,
        storedConfig: storedConfig ?? undefined,
      });
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export failed",
      );
    } finally {
      setExporting(null);
    }
  };

  // Centralised plan-write helper.  Snapshots `plan` (the current state
  // before this write) onto the undo stack, clears the redo stack, then
  // persists `next` via writeCivilPlan.  All CAD-editor mutations go
  // through here so undo/redo is consistent.
  const persistPlan = (next: CivilPlan) => {
    if (!intersection || !plan) return;
    setUndoStack((s) => {
      const trimmed = s.length >= HISTORY_CAP ? s.slice(s.length - HISTORY_CAP + 1) : s;
      return [...trimmed, plan];
    });
    setRedoStack([]);
    writeCivilPlan(
      intersection.id,
      {
        name: intersection.name,
        district: intersection.district,
        address: intersection.address,
        location: { lat: intersection.latitude, lng: intersection.longitude },
      },
      next,
    );
  };

  const handleUndo = () => {
    if (!intersection || !plan || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => {
      const trimmed = s.length >= HISTORY_CAP ? s.slice(s.length - HISTORY_CAP + 1) : s;
      return [...trimmed, plan];
    });
    writeCivilPlan(
      intersection.id,
      {
        name: intersection.name,
        district: intersection.district,
        address: intersection.address,
        location: { lat: intersection.latitude, lng: intersection.longitude },
      },
      prev,
    );
  };

  const handleRedo = () => {
    if (!intersection || !plan || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => {
      const trimmed = s.length >= HISTORY_CAP ? s.slice(s.length - HISTORY_CAP + 1) : s;
      return [...trimmed, plan];
    });
    writeCivilPlan(
      intersection.id,
      {
        name: intersection.name,
        district: intersection.district,
        address: intersection.address,
        location: { lat: intersection.latitude, lng: intersection.longitude },
      },
      next,
    );
  };

  // Pure single-entity move. Returns a new plan with the entity's
  // position updated AND any cable-run waypoints snapped to follow it.
  // Used by both single-entity drag (handleMutateElement) and group
  // drag (handleBatchMove), so the cable-routing rules stay consistent.
  function applySingleMove(
    current: CivilPlan,
    kind: "support" | "loop" | "chamber" | "cabinet",
    id: string,
    newPosition: { x: number; y: number },
  ): CivilPlan {
    if (kind === "support") {
      const supports = current.supports.map((s) =>
        s.id === id ? { ...s, position: newPosition } : s,
      );
      const cableRuns = current.cableRuns.map((run) => {
        if (run.to !== id || run.path.length < 2) return run;
        return { ...run, path: [...run.path.slice(0, -1), newPosition] };
      });
      return { ...current, supports, cableRuns };
    }
    if (kind === "loop") {
      const loops = current.loops.map((l) =>
        l.id === id ? { ...l, centre: newPosition } : l,
      );
      const cableRuns = current.cableRuns.map((run) => {
        if (run.to !== id || run.path.length < 2) return run;
        return { ...run, path: [...run.path.slice(0, -1), newPosition] };
      });
      return { ...current, loops, cableRuns };
    }
    if (kind === "chamber") {
      const chambers = current.chambers.map((c) =>
        c.id === id ? { ...c, position: newPosition } : c,
      );
      // Replace chamber waypoints in every cable path that visits it.
      // Proximity-snap: any waypoint within 0.6 m of the OLD position
      // is the chamber; move it to the new position.
      const oldPos = current.chambers.find((c) => c.id === id)?.position;
      const cableRuns = oldPos
        ? current.cableRuns.map((run) => ({
            ...run,
            path: run.path.map((p) =>
              Math.hypot(p.x - oldPos.x, p.y - oldPos.y) < 0.6
                ? newPosition
                : p,
            ),
          }))
        : current.cableRuns;
      return { ...current, chambers, cableRuns };
    }
    if (kind === "cabinet") {
      const cabinet = { ...current.cabinet, position: newPosition };
      const oldCabPos = current.cabinet.position;
      const cableRuns = current.cableRuns.map((run) => ({
        ...run,
        path: run.path.map((p, i) =>
          i === 0 ||
          Math.hypot(p.x - oldCabPos.x, p.y - oldCabPos.y) < 0.4
            ? newPosition
            : p,
        ),
      }));
      return { ...current, cabinet, cableRuns };
    }
    return current;
  }

  const handleMutateElement = (
    kind: "support" | "loop" | "chamber" | "cabinet",
    id: string,
    newPosition: { x: number; y: number },
  ) => {
    if (!intersection || !plan) return;
    persistPlan(applySingleMove(plan, kind, id, newPosition));
  };

  // Group drag — apply every move to the plan in one go and emit a
  // single undo entry.  The renderer batches moves when the user drags
  // an entity that's part of a multi-selection.
  const handleBatchMove = (
    moves: Array<{
      kind: "support" | "loop" | "chamber" | "cabinet";
      id: string;
      position: { x: number; y: number };
    }>,
  ) => {
    if (!intersection || !plan || moves.length === 0) return;
    let next = plan;
    for (const m of moves) {
      next = applySingleMove(next, m.kind, m.id, m.position);
    }
    persistPlan(next);
  };

  // Returns the canonical anchor of an entity given its "kind:id" key,
  // or null if the entity isn't found.
  const lookupAnchor = (
    p: CivilPlan,
    key: string,
  ): { kind: "support" | "loop" | "chamber" | "cabinet"; id: string; pos: PlanPoint } | null => {
    const [kind, id] = key.split(":") as [
      "support" | "loop" | "chamber" | "cabinet",
      string,
    ];
    if (kind === "support") {
      const e = p.supports.find((s) => s.id === id);
      return e ? { kind, id, pos: e.position } : null;
    }
    if (kind === "loop") {
      const e = p.loops.find((l) => l.id === id);
      return e ? { kind, id, pos: e.centre } : null;
    }
    if (kind === "chamber") {
      const e = p.chambers.find((c) => c.id === id);
      return e ? { kind, id, pos: e.position } : null;
    }
    if (kind === "cabinet") {
      return { kind, id: p.cabinet.id, pos: p.cabinet.position };
    }
    return null;
  };

  // Apply MOVE — translate every entity in `selection` by (dest - base).
  const applyMoveCommand = (base: PlanPoint, dest: PlanPoint) => {
    if (!plan) return;
    const dx = dest.x - base.x;
    const dy = dest.y - base.y;
    const moves = Array.from(selection)
      .map((k) => lookupAnchor(plan, k))
      .filter(Boolean)
      .map((e) => ({
        kind: e!.kind,
        id: e!.id,
        position: { x: e!.pos.x + dx, y: e!.pos.y + dy },
      }));
    if (moves.length > 0) handleBatchMove(moves);
  };

  // Apply COPY — clone every selected entity (except cabinet, which
  // must remain unique) at the same offset, give them new ids, and
  // persist as one undoable plan.
  const applyCopyCommand = (base: PlanPoint, dest: PlanPoint) => {
    if (!plan) return;
    const dx = dest.x - base.x;
    const dy = dest.y - base.y;
    const stamp = Date.now().toString(36).slice(-4);
    let nextSupports = [...plan.supports];
    let nextLoops = [...plan.loops];
    let nextChambers = [...plan.chambers];
    let copied = 0;
    for (const k of selection) {
      const [kind, id] = k.split(":");
      if (kind === "support") {
        const s = plan.supports.find((x) => x.id === id);
        if (!s) continue;
        nextSupports.push({
          ...s,
          id: `${s.id}-c${stamp}-${copied}`,
          position: { x: s.position.x + dx, y: s.position.y + dy },
        });
        copied += 1;
      } else if (kind === "loop") {
        const l = plan.loops.find((x) => x.id === id);
        if (!l) continue;
        nextLoops.push({
          ...l,
          id: `${l.id}-c${stamp}-${copied}`,
          label: `${l.label}*`,
          centre: { x: l.centre.x + dx, y: l.centre.y + dy },
        });
        copied += 1;
      } else if (kind === "chamber") {
        const c = plan.chambers.find((x) => x.id === id);
        if (!c) continue;
        nextChambers.push({
          ...c,
          id: `${c.id}-c${stamp}-${copied}`,
          label: `${c.label}*`,
          position: { x: c.position.x + dx, y: c.position.y + dy },
        });
        copied += 1;
      }
      // cabinet: skipped — only one allowed.
    }
    if (copied === 0) return;
    persistPlan({
      ...plan,
      supports: nextSupports,
      loops: nextLoops,
      chambers: nextChambers,
    });
  };

  // Apply ROTATE — rotate every selected entity around `pivot` by the
  // angle between (refPoint→pivot) and (newPoint→pivot).
  const applyRotateCommand = (
    pivot: PlanPoint,
    ref: PlanPoint,
    newPoint: PlanPoint,
  ) => {
    if (!plan) return;
    const a0 = Math.atan2(ref.y - pivot.y, ref.x - pivot.x);
    const a1 = Math.atan2(newPoint.y - pivot.y, newPoint.x - pivot.x);
    const theta = a1 - a0;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const rot = (p: PlanPoint): PlanPoint => {
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      return {
        x: pivot.x + dx * cosT - dy * sinT,
        y: pivot.y + dx * sinT + dy * cosT,
      };
    };
    const moves = Array.from(selection)
      .map((k) => lookupAnchor(plan, k))
      .filter(Boolean)
      .map((e) => ({ kind: e!.kind, id: e!.id, position: rot(e!.pos) }));
    if (moves.length > 0) handleBatchMove(moves);
  };

  // Drives the command state machine: each onCommandPoint advances the
  // current command's phase, then commits + clears once enough points
  // are picked.
  const handleCommandPoint = (point: PlanPoint) => {
    if (!command) return;
    if (command.kind === "move" || command.kind === "copy") {
      if (command.phase === "base") {
        setCommand({
          ...command,
          basePoint: point,
          phase: "dest",
          prompt: `${command.kind === "copy" ? "Copy" : "Move"}: pick destination point`,
        });
        return;
      }
      if (command.phase === "dest" && command.basePoint) {
        if (command.kind === "move") applyMoveCommand(command.basePoint, point);
        else applyCopyCommand(command.basePoint, point);
        setCommand(null);
        return;
      }
    }
    if (command.kind === "rotate") {
      if (command.phase === "base") {
        setCommand({
          ...command,
          basePoint: point,
          phase: "angle",
          prompt: "Rotate: pick reference angle",
        });
        return;
      }
      if (command.phase === "angle" && command.basePoint && !command.refPoint) {
        setCommand({
          ...command,
          refPoint: point,
          prompt: "Rotate: pick new angle",
        });
        return;
      }
      if (command.phase === "angle" && command.basePoint && command.refPoint) {
        applyRotateCommand(command.basePoint, command.refPoint, point);
        setCommand(null);
        return;
      }
    }
  };

  // Start a CAD command. Selection must be non-empty (commands act on
  // the current selection); if empty, do nothing — the user needs to
  // pick at least one entity first.
  const startCommand = (kind: "move" | "copy" | "rotate") => {
    if (selection.size === 0) return;
    setCommand({
      kind,
      phase: "base",
      prompt:
        kind === "rotate"
          ? "Rotate: pick pivot point"
          : kind === "copy"
            ? "Copy: pick base point"
            : "Move: pick base point",
    });
  };

  // Delete the currently selected entities. Cabinet is protected (the
  // plan needs exactly one). When a support / loop is removed, any
  // cable run terminating there is removed too — otherwise the cable
  // would point into empty space.
  const handleDeleteSelection = (keys: ReadonlySet<string>) => {
    if (!intersection || keys.size === 0) return;
    const supportIds = new Set<string>();
    const loopIds = new Set<string>();
    const chamberIds = new Set<string>();
    for (const key of keys) {
      const [kind, id] = key.split(":");
      if (kind === "support") supportIds.add(id);
      else if (kind === "loop") loopIds.add(id);
      else if (kind === "chamber") chamberIds.add(id);
      // cabinet: silently ignored.
    }
    const next: CivilPlan = {
      ...plan,
      supports: plan.supports.filter((s) => !supportIds.has(s.id)),
      loops: plan.loops.filter((l) => !loopIds.has(l.id)),
      chambers: plan.chambers.filter((c) => !chamberIds.has(c.id)),
      cableRuns: plan.cableRuns.filter(
        (r) => !supportIds.has(r.to) && !loopIds.has(r.to),
      ),
    };
    persistPlan(next);
    setSelection(new Set());
  };

  // Keyboard shortcuts for the CAD editor — only active in edit mode.
  // Esc clears selection. Delete removes selected entities. We stop
  // propagation so we don't fight the browser when the user is typing
  // into a properties-panel input.
  useEffect(() => {
    if (!editMode) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (event.key === "Escape") {
        // Esc cancels a command FIRST (so the user can back out of M
        // mid-pick), then clears selection on a second press.
        if (command) {
          event.preventDefault();
          setCommand(null);
          return;
        }
        if (selection.size > 0) {
          event.preventDefault();
          setSelection(new Set());
        }
        return;
      }
      if (!inField && (event.key === "Delete" || event.key === "Backspace")) {
        if (selection.size > 0) {
          event.preventDefault();
          handleDeleteSelection(selection);
        }
        return;
      }
      if (!inField && (event.key === "h" || event.key === "H")) {
        event.preventDefault();
        setViewport(null);
        return;
      }
      // F8 = ortho toggle, F9 = grid toggle (AutoCAD convention).
      if (!inField && event.key === "F8") {
        event.preventDefault();
        setSnap((s) => ({ ...s, ortho: !s.ortho }));
        return;
      }
      if (!inField && event.key === "F9") {
        event.preventDefault();
        setSnap((s) => ({ ...s, grid: !s.grid }));
        return;
      }
      // Ctrl+Z = undo, Ctrl+Shift+Z (or Ctrl+Y) = redo.  Works inside
      // input fields too — CAD users expect this to always undo.
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (ctrl && (event.key === "y" || event.key === "Y")) {
        event.preventDefault();
        handleRedo();
        return;
      }
      // CAD command shortcuts: M / CO / RO (case-insensitive). Skip
      // when typing in inputs or holding a modifier (so Ctrl+M etc
      // still works).
      if (inField || ctrl || event.altKey) return;
      const k = event.key.toLowerCase();
      const now = Date.now();
      const buf = cmdBufferRef.current;
      const bufActive = buf && buf.expires > now;
      if (k === "m") {
        event.preventDefault();
        cmdBufferRef.current = null;
        startCommand("move");
        return;
      }
      if (k === "c") {
        event.preventDefault();
        cmdBufferRef.current = { key: "c", expires: now + 1000 };
        return;
      }
      if (k === "r") {
        event.preventDefault();
        cmdBufferRef.current = { key: "r", expires: now + 1000 };
        return;
      }
      if (k === "o" && bufActive) {
        event.preventDefault();
        if (buf!.key === "c") startCommand("copy");
        else if (buf!.key === "r") startCommand("rotate");
        cmdBufferRef.current = null;
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selection, plan, undoStack, redoStack, command]);

  const handleImportOsm = async () => {
    if (!intersection) return;
    const lat = Number(intersection.latitude);
    const lng = Number(intersection.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setOsmStatus({
        state: "error",
        message: `Intersection has no GPS — got lat=${intersection.latitude} lng=${intersection.longitude}`,
      });
      return;
    }
    setOsmStatus({ state: "loading" });
    try {
      // Search 90 m so we catch the whole intersection, but clip to
      // 55 m so the canvas stays focused — the long approach roads
      // outside that radius are noise here, not engineering surface.
      const result = await fetchOsmBaseLayers(lat, lng, {
        radiusMetres: 90,
        clipRadiusMetres: 55,
      });
      if (result.features.length === 0) {
        setOsmStatus({
          state: "error",
          message: "No road geometry returned by OpenStreetMap.",
        });
        return;
      }
      // Detect arms from the OSM road network and synthesise the
      // engineering layers anchored to them — refuges at each approach
      // mouth, supports at each curb, loops on each inbound lane,
      // crosswalks across each entry — so the AutoCAD canvas reads
      // like a real Plan d'aménagement instead of bare OSM polylines.
      const carrefourTag = (intersection.code.match(/\d+/g)?.join("")
        ? `C${parseInt(intersection.code.match(/\d+/g)!.join(""), 10)}`
        : intersection.code.replace(/[^A-Z0-9]/gi, "").slice(0, 6) || "C0");
      const detection = detectArms(result.features, { x: 0, y: 0 });
      const eng = buildEngineeringFromArms(detection.arms, {
        carrefourTag,
        centre: detection.centre,
        roundabout: detection.roundabout,
      });

      const tightBounds = result.metresBounds
        ? {
            minX: Math.min(result.metresBounds.minX - 5, -55),
            minY: Math.min(result.metresBounds.minY - 5, -55),
            maxX: Math.max(result.metresBounds.maxX + 5, 55),
            maxY: Math.max(result.metresBounds.maxY + 5, 55),
          }
        : { minX: -55, minY: -55, maxX: 55, maxY: 55 };
      const next: CivilPlan = {
        ...plan,
        arms: eng.arms,
        crosswalks: eng.crosswalks,
        refugeIslands: eng.refugeIslands,
        stopLines: eng.stopLines,
        supports: eng.supports,
        loops: eng.loops,
        chambers: eng.chambers,
        cableRuns: eng.cableRuns,
        cabinet: eng.cabinet,
        basePlan: {
          source: "osm",
          mapCenter: { lat, lng },
          importedAt: new Date().toISOString(),
          note: `OSM live import · ${result.streetNames.join(", ")}${
            result.hasRoundabout ? " · roundabout detected" : ""
          } · ${detection.arms.length} arms detected`,
          importedFiles: [
            {
              name: `osm-${intersection.code}.json`,
              sizeBytes: 0,
              mime: "application/json",
              layer: "roads",
              featureCount: result.features.length,
            },
          ],
        },
        baseLayers: result.features,
        bounds: tightBounds,
      };
      writeCivilPlan(
        intersection.id,
        {
          name: intersection.name,
          district: intersection.district,
          address: intersection.address,
          location: { lat, lng },
        },
        next,
      );
      // The OSM carriageway is now the visual ground truth.  Hide the
      // synthetic Roads / Lanes layers so we don't render the same road
      // twice (synthetic arm polygons + OSM polylines stacked).  The
      // operator can toggle them back on if they want to compare.
      setVisibility((prev) => ({
        ...prev,
        roads: false,
        lanes: false,
      }));
      const compass = (deg: number): string => {
        const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
        return dirs[Math.round(deg / 22.5) % 16];
      };
      const armSummary = detection.arms.map((a, i) => ({
        letter: ["A", "B", "C", "D", "E", "F", "G", "H"][i] ?? `Arm${i}`,
        name: a.streetName ?? "(unnamed road)",
        compass: `${compass(a.bearingDeg)} ${a.bearingDeg}°`,
        lanes: a.laneCount,
        category: a.category,
      }));
      setOsmStatus({
        state: "success",
        ways: result.keptWays,
        roundabout: result.hasRoundabout,
        arms: armSummary,
      });
    } catch (error) {
      setOsmStatus({
        state: "error",
        message:
          error instanceof Error
            ? error.message
            : "OSM fetch failed (network?)",
      });
    }
  };

  return (
    <main className={`min-h-screen ${shellClass}`}>
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col gap-4 px-5 py-5">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-white/8 pb-4">
          <Link
            href="/studio"
            className={`rounded-[10px] border px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] transition ${panelBg} hover:brightness-110`}
          >
            ← Studio
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[0.58rem] font-semibold uppercase tracking-[0.28em] text-[#ffb547]">
              Plan d&apos;aménagement · Step 1 of 4 ·{" "}
              {planSource === "imported"
                ? `imported ${basePlanSource} base`
                : planSource === "workbench"
                  ? "loaded from Workbench"
                  : "template preview"}
            </p>
            <h1 className="mt-0.5 truncate text-[1.25rem] font-semibold">
              {intersection.name}
            </h1>
            <p className={`mt-0.5 truncate text-[0.76rem] ${mutedText}`}>
              {intersection.code} · {intersection.district || "—"} ·{" "}
              {primaryController?.code ?? "no controller"} · Scale 1:
              {plan.defaultScale ?? 200} · Rev {revision}
            </p>
          </div>
          <WorkflowBadge status={workflowStatus} />
          <button
            type="button"
            onClick={() => void handleImportOsm()}
            disabled={osmStatus.state === "loading"}
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-50 ${panelBg} hover:brightness-110`}
            title="Replace the template base with real road geometry from OpenStreetMap"
          >
            {osmStatus.state === "loading" ? "🌍 Fetching OSM…" : "🌍 Import OSM"}
          </button>
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition ${
              editMode
                ? "border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] text-[#120a02]"
                : panelBg
            } hover:brightness-110`}
            title="Toggle CAD edit mode — click to select, drag to move, scroll to zoom, middle-drag to pan"
          >
            {editMode ? "✓ Edit ON" : "✎ Edit"}
          </button>
          <button
            type="button"
            onClick={handleResetView}
            disabled={viewport === null}
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
            title="Reset pan and zoom (H)"
          >
            ⌂ Reset view
          </button>
          {editMode ? (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
                title="Undo (Ctrl+Z)"
              >
                ↶ Undo {undoStack.length > 0 ? `(${undoStack.length})` : ""}
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
                title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
              >
                ↷ Redo {redoStack.length > 0 ? `(${redoStack.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => startCommand("move")}
                disabled={selection.size === 0}
                className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
                title="Move selection (M) — pick base point, then destination"
              >
                ⇄ Move (M)
              </button>
              <button
                type="button"
                onClick={() => startCommand("copy")}
                disabled={selection.size === 0}
                className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
                title="Copy selection (CO) — pick base point, then destination"
              >
                ⎘ Copy (CO)
              </button>
              <button
                type="button"
                onClick={() => startCommand("rotate")}
                disabled={selection.size === 0}
                className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-40 ${panelBg} hover:brightness-110`}
                title="Rotate selection (RO) — pick pivot, reference angle, new angle"
              >
                ↻ Rotate (RO)
              </button>
            </>
          ) : null}
          <Link
            href="/studio/workbench"
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition ${panelBg} hover:brightness-110`}
          >
            ✎ Edit in Workbench
          </Link>
          <button
            type="button"
            onClick={toggle}
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition ${panelBg} hover:brightness-110`}
          >
            {isDark ? "☀ Light" : "☾ Dark"}
          </button>
          {primaryController ? (
            <Link
              href={`/studio/programmer/${primaryController.id}`}
              className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition ${panelBg} hover:brightness-110`}
            >
              ⌨ Programmer
            </Link>
          ) : null}
        </header>

        {/* Toolbar */}
        <section className="flex flex-wrap items-center gap-2">
          {LAYERS.map((layer) => (
            <ToggleChip
              key={layer.id}
              label={layer.label}
              active={visibility[layer.id]}
              onToggle={() => toggleLayer(layer.id)}
              isDark={isDark}
            />
          ))}

          {/* Backdrop image controls — upload a real consultant étude
              (PNG/JPG/SVG) to sit underneath the engineering overlay.
              Once an image is present we expose opacity + width sliders
              + a clear button.  The hidden <input> is reset after each
              pick so re-selecting the same file still fires onChange. */}
          <span className="mx-1 h-5 w-px bg-white/10" />
          <input
            ref={backdropInputRef}
            type="file"
            accept={BACKDROP_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void handleBackdropPick(file);
            }}
          />
          <button
            type="button"
            onClick={() => backdropInputRef.current?.click()}
            disabled={backdropBusy}
            className={`rounded-[10px] border px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] transition ${panelBg} hover:brightness-110 disabled:opacity-60`}
            title="Upload a PNG/JPG/SVG étude as the backdrop"
          >
            {backdropBusy
              ? "…"
              : plan.backdropImage
                ? "↻ Backdrop"
                : "⇪ Backdrop"}
          </button>
          {plan.backdropImage ? (
            <>
              <label className="flex items-center gap-1 rounded-[10px] border border-white/10 bg-[#0b1014]/70 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a]">
                Opacity
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={plan.backdropImage.opacity}
                  onChange={(e) =>
                    handleBackdropOpacity(Number(e.target.value))
                  }
                  className="h-1 w-20 accent-[#ffc45c]"
                />
                <span className="w-7 text-right tabular-nums text-[#c3cdc6]">
                  {Math.round(plan.backdropImage.opacity * 100)}%
                </span>
              </label>
              <label className="flex items-center gap-1 rounded-[10px] border border-white/10 bg-[#0b1014]/70 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a]">
                Width
                <input
                  type="number"
                  min={4}
                  max={300}
                  step={1}
                  value={Math.round(plan.backdropImage.widthMetres)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 4) handleBackdropWidth(v);
                  }}
                  className="w-14 rounded bg-transparent text-center tabular-nums text-[#c3cdc6] outline-none"
                />
                <span className="text-[#56605b]">m</span>
              </label>
              <label className="flex items-center gap-1 rounded-[10px] border border-white/10 bg-[#0b1014]/70 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a]">
                Rot
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step={1}
                  value={Math.round(
                    (plan.backdropImage.rotation * 180) / Math.PI,
                  )}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) handleBackdropRotation(v);
                  }}
                  className="w-12 rounded bg-transparent text-center tabular-nums text-[#c3cdc6] outline-none"
                />
                <span className="text-[#56605b]">°</span>
              </label>
              <button
                type="button"
                onClick={handleBackdropClear}
                className="rounded-[10px] border border-[#5a2018]/60 bg-[#1c0808]/70 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a] transition hover:brightness-110"
                title="Remove backdrop image"
              >
                ✕
              </button>
            </>
          ) : null}
          {backdropError ? (
            <span className="rounded-[10px] border border-[#5a2018]/60 bg-[#1c0808]/70 px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a]">
              {backdropError}
            </span>
          ) : null}

          {/* Snap-mode chips — only shown in edit mode so the toolbar
              stays sparse when just viewing.  Mirrors AutoCAD's bottom
              status-bar toggles. */}
          {editMode ? (
            <>
              <span className="mx-1 h-5 w-px bg-white/10" />
              <ToggleChip
                label="Grid (F9)"
                active={snap.grid}
                onToggle={() => setSnap((s) => ({ ...s, grid: !s.grid }))}
                isDark={isDark}
              />
              <ToggleChip
                label="OSnap"
                active={snap.osnap}
                onToggle={() => setSnap((s) => ({ ...s, osnap: !s.osnap }))}
                isDark={isDark}
              />
              <ToggleChip
                label="Ortho (F8)"
                active={snap.ortho}
                onToggle={() => setSnap((s) => ({ ...s, ortho: !s.ortho }))}
                isDark={isDark}
              />
            </>
          ) : null}

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => void handleExport("plan")}
            disabled={exporting !== null}
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee] disabled:opacity-60"
          >
            {exporting === "plan" ? "…" : "Export Plan PDF"}
          </button>
          <button
            type="button"
            onClick={() => void handleExport("regulation")}
            disabled={exporting !== null}
            className="rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#120a02] transition hover:brightness-110 disabled:opacity-60"
          >
            {exporting === "regulation" ? "…" : "Export Dossier Régulation"}
          </button>
          <button
            type="button"
            onClick={() => void handleExport("cablage")}
            disabled={exporting !== null}
            className="rounded-[10px] border border-[#294439] bg-[#112018] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#97d9b3] transition hover:brightness-110 disabled:opacity-60"
          >
            {exporting === "cablage" ? "…" : "Export Dossier Câblage"}
          </button>
        </section>

        {editMode ? (
          <div className="rounded-[10px] border border-[#5a4218]/60 bg-[#1c1408]/70 px-3 py-2 text-[0.72rem] text-[#ffd089]">
            ✎ Edit mode · drag any support / loop / chamber / cabinet to
            reposition. Cable runs follow automatically. Click ✓ Edit ON
            again to finish.
          </div>
        ) : null}

        {exportError ? (
          <div className="rounded-[10px] border border-[#5a1d1d]/60 bg-[#180d0d]/60 px-3 py-2 text-[0.72rem] text-[#ff9a9a]">
            Export failed · {exportError}
          </div>
        ) : null}

        {osmStatus.state === "error" ? (
          <div className="rounded-[10px] border border-[#5a1d1d]/60 bg-[#180d0d]/60 px-3 py-2 text-[0.72rem] text-[#ff9a9a]">
            OSM import failed · {osmStatus.message}
          </div>
        ) : null}
        {osmStatus.state === "success" ? (
          <div className="rounded-[10px] border border-[#1d4a34]/60 bg-[#0d1913]/60 px-3 py-2 text-[0.72rem] text-[#a8eac2]">
            <p className="font-semibold">
              OSM imported · {osmStatus.ways} road segments ·{" "}
              {osmStatus.arms.length} arm{osmStatus.arms.length === 1 ? "" : "s"} detected
              {osmStatus.roundabout ? " · roundabout" : ""}
            </p>
            <ul className="mt-1.5 grid grid-cols-1 gap-y-0.5 text-[0.66rem] text-[#c8e8d3] md:grid-cols-2 lg:grid-cols-4">
              {osmStatus.arms.map((arm) => (
                <li key={arm.letter} className="flex items-baseline gap-1.5">
                  <span className="font-mono font-bold text-[#ffd089]">
                    {arm.letter}
                  </span>
                  <span className="font-semibold">{arm.compass}</span>
                  <span className="truncate">— {arm.name}</span>
                  <span className="ml-auto whitespace-nowrap text-[#7fb495]">
                    {arm.lanes} lanes{arm.category ? ` · ${arm.category}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Canvas + side panel */}
        <section className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div
            className={`relative overflow-hidden rounded-[14px] border ${panelBg}`}
            style={{ minHeight: 560 }}
          >
            <div className="h-full w-full">
              <CivilPlanRenderer
                plan={plan}
                layers={visibility}
                theme={planTheme}
                editable={editMode}
                onMutate={handleMutateElement}
                viewport={viewport}
                onViewportChange={setViewport}
                onCursorChange={setCursor}
                selection={selection}
                onSelectionChange={setSelection}
                snap={snap}
                onBatchMove={handleBatchMove}
                command={command}
                onCommandPoint={handleCommandPoint}
              />
            </div>

            {/* CAD status bar — bottom of the canvas, like AutoCAD's
                command line area.  Shows live cursor X/Y and zoom %.
                Hidden when not in edit mode to avoid chrome creep. */}
            {editMode ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-white/8 bg-[#05080a]/85 px-3 py-1.5 font-mono text-[0.7rem] text-[#c3cdc6] backdrop-blur">
                <span>
                  {command ? (
                    <span className="font-bold text-[#ffd089]">
                      {command.prompt}
                    </span>
                  ) : (
                    <>
                      X{" "}
                      <span className="text-[#ffd089]">
                        {cursor ? cursor.x.toFixed(2) : "—"}
                      </span>{" "}
                      Y{" "}
                      <span className="text-[#ffd089]">
                        {cursor ? cursor.y.toFixed(2) : "—"}
                      </span>{" "}
                      m
                    </>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <span>Zoom <span className="text-[#a8eac2]">{zoomPct}%</span></span>
                  <span>
                    Snap{" "}
                    <span className={snap.grid ? "text-[#a8eac2]" : "text-[#56605b]"}>
                      GRID
                    </span>{" "}
                    ·{" "}
                    <span className={snap.osnap ? "text-[#a8eac2]" : "text-[#56605b]"}>
                      OSNAP
                    </span>{" "}
                    ·{" "}
                    <span className={snap.ortho ? "text-[#a8eac2]" : "text-[#56605b]"}>
                      ORTHO
                    </span>
                  </span>
                  <span className="text-[#8fa39a]">
                    Wheel zoom · Mid-drag pan · Click select · Shift+drag ortho · Esc clear · Del remove
                  </span>
                </span>
              </div>
            ) : null}

            {/* In-canvas legend lives inside the SVG (LegendBox layer);
                no HTML overlay here so we don't render two of them. */}
          </div>

          {/* Side panel */}
          <aside className="flex flex-col gap-3">
            {editMode ? (
              <PropertiesPanel
                plan={plan}
                selection={selection}
                onMutateElement={handleMutateElement}
                onDelete={() => handleDeleteSelection(selection)}
                onClear={() => setSelection(new Set())}
                panelBg={panelBg}
                mutedText={mutedText}
              />
            ) : null}
            <div className={`rounded-[14px] border p-4 ${panelBg}`}>
              <p
                className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}
              >
                Equipment inventory
              </p>
              <dl className="mt-3 space-y-1.5 text-[0.78rem]">
                <InventoryRow label="Potences" value={countByKind("potence")} />
                <InventoryRow label="Poteaux" value={countByKind("poteau")} />
                <InventoryRow label="Potelets" value={countByKind("potelet")} />
                <InventoryRow label="Chambres de tirage" value={plan.chambers.length} />
                <InventoryRow label="Boucles de détection" value={plan.loops.length} />
                <InventoryRow label="Tirages câbles" value={plan.cableRuns.length} />
                <InventoryRow
                  label="Contrôleur"
                  value={primaryController?.code ?? "—"}
                />
              </dl>
            </div>

            <div className={`rounded-[14px] border p-4 ${panelBg}`}>
              <p
                className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}
              >
                Supports
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-[0.7rem]">
                {plan.supports.map((support) => (
                  <div
                    key={support.id}
                    className="flex items-center gap-2 rounded-[8px] border border-white/8 bg-[#070b0e] px-2 py-1.5"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          support.kind === "potence"
                            ? planTheme.supportPotence
                            : support.kind === "poteau"
                              ? planTheme.supportPoteau
                              : planTheme.supportPotelet,
                      }}
                    />
                    <span className="font-mono font-semibold">{support.id}</span>
                    <span className={`ml-auto truncate text-[0.62rem] ${mutedText}`}>
                      {support.hardwareLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-[14px] border p-4 ${panelBg}`}>
              <p
                className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}
              >
                Longueurs câbles
              </p>
              <dl className="mt-2 space-y-1 text-[0.72rem]">
                {cableLengthsByKind(plan).map(({ spec, length }) => (
                  <div
                    key={spec}
                    className="flex items-center justify-between gap-3"
                  >
                    <dt className={mutedText}>{spec}</dt>
                    <dd className="font-mono font-semibold">≈ {length} m</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  draft_plan: "Draft plan",
  validated_plan: "Plan validated",
  regulation_ready: "Régulation ready",
  cablage_ready: "Câblage ready",
  programming_ready: "Programming ready",
  approved: "Approved",
};

function WorkflowBadge({ status }: { status: WorkflowStatus }) {
  const done = status === "approved" || status === "programming_ready";
  return (
    <span
      className={
        done
          ? "rounded-full border border-[#1d4a34] bg-[#0d1913] px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.22em] text-[#a8eac2]"
          : status === "draft_plan"
            ? "rounded-full border border-white/10 bg-[#0b1014] px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.22em] text-[#8fa39a]"
            : "rounded-full border border-[#5c4418] bg-[#141008] px-3 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.22em] text-[#ffd089]"
      }
    >
      {WORKFLOW_LABELS[status]}
    </span>
  );
}

function ToggleChip({
  label,
  active,
  onToggle,
  isDark,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  isDark: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        active
          ? "rounded-[10px] border border-[#5a4218] bg-[#14100a] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547] transition hover:brightness-110"
          : isDark
            ? "rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a] transition hover:text-[#edf3ee]"
            : "rounded-[10px] border border-black/10 bg-white px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#56605b] transition hover:text-[#1b2322]"
      }
    >
      {active ? "●" : "○"} {label}
    </button>
  );
}


function InventoryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[#8fa39a]">{label}</dt>
      <dd className="font-mono font-semibold">{value}</dd>
    </div>
  );
}

// ─── PropertiesPanel ────────────────────────────────────────────────
// Right-side aside, only visible in edit mode. Shows the currently
// selected entity's kind / id / X / Y, with X / Y editable on blur or
// Enter.  When 0 are selected, prompts the user to click something.
// When >1 are selected, shows a count + a single Delete button.
function PropertiesPanel({
  plan,
  selection,
  onMutateElement,
  onDelete,
  onClear,
  panelBg,
  mutedText,
}: {
  plan: CivilPlan;
  selection: Set<string>;
  onMutateElement: (
    kind: "support" | "loop" | "chamber" | "cabinet",
    id: string,
    next: PlanPoint,
  ) => void;
  onDelete: () => void;
  onClear: () => void;
  panelBg: string;
  mutedText: string;
}) {
  const single =
    selection.size === 1
      ? resolveSelectionEntity(plan, Array.from(selection)[0]!)
      : null;
  const isCabinet = single?.kind === "cabinet";

  return (
    <div className={`rounded-[14px] border p-4 ${panelBg}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={`text-[0.6rem] font-semibold uppercase tracking-[0.22em] ${mutedText}`}
        >
          Properties · {selection.size} selected
        </p>
        {selection.size > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a] transition hover:text-[#edf3ee]"
            title="Clear selection (Esc)"
          >
            ✕ Clear
          </button>
        ) : null}
      </div>

      {selection.size === 0 ? (
        <p className="mt-3 text-[0.74rem] leading-relaxed text-[#8fa39a]">
          Click any support, loop, chamber, or cabinet to select it.
          Shift-click to add or remove from the selection. Press Esc to
          clear.
        </p>
      ) : null}

      {single ? (
        <div className="mt-3 space-y-3 text-[0.74rem]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-[#8fa39a]">
              {single.kind}
            </span>
            <span className="font-mono font-semibold text-[#edf3ee]">
              {single.id}
            </span>
          </div>

          <CoordField
            label="X (m)"
            value={single.position.x}
            onCommit={(x) =>
              onMutateElement(single.kind, single.id, {
                x,
                y: single.position.y,
              })
            }
          />
          <CoordField
            label="Y (m)"
            value={single.position.y}
            onCommit={(y) =>
              onMutateElement(single.kind, single.id, {
                x: single.position.x,
                y,
              })
            }
          />

          {isCabinet ? (
            <p className="text-[0.66rem] text-[#ffd089]">
              Cabinet is required by the plan and cannot be deleted.
            </p>
          ) : (
            <button
              type="button"
              onClick={onDelete}
              className="w-full rounded-[8px] border border-[#5a1d1d] bg-[#1a0d0d] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a] transition hover:bg-[#260f0f]"
            >
              ✕ Delete (Del)
            </button>
          )}
        </div>
      ) : selection.size > 1 ? (
        <div className="mt-3 space-y-2 text-[0.74rem]">
          <p className="text-[#c3cdc6]">
            <span className="font-mono font-semibold text-[#edf3ee]">
              {selection.size}
            </span>{" "}
            entities selected. Drag any one to move it; multi-entity drag
            and Move/Copy/Rotate commands are coming next.
          </p>
          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-[8px] border border-[#5a1d1d] bg-[#1a0d0d] px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#ff9a9a] transition hover:bg-[#260f0f]"
          >
            ✕ Delete selected (Del)
          </button>
        </div>
      ) : null}
    </div>
  );
}

function resolveSelectionEntity(
  plan: CivilPlan,
  key: string,
):
  | {
      kind: "support" | "loop" | "chamber" | "cabinet";
      id: string;
      position: PlanPoint;
    }
  | null {
  const [kind, id] = key.split(":");
  if (kind === "support") {
    const s = plan.supports.find((x) => x.id === id);
    return s ? { kind: "support", id: s.id, position: s.position } : null;
  }
  if (kind === "loop") {
    const l = plan.loops.find((x) => x.id === id);
    return l ? { kind: "loop", id: l.id, position: l.centre } : null;
  }
  if (kind === "chamber") {
    const c = plan.chambers.find((x) => x.id === id);
    return c ? { kind: "chamber", id: c.id, position: c.position } : null;
  }
  if (kind === "cabinet") {
    return {
      kind: "cabinet",
      id: plan.cabinet.id,
      position: plan.cabinet.position,
    };
  }
  return null;
}

// Numeric coordinate input that commits on Enter or blur. Re-syncs to
// the prop value whenever the prop changes (e.g. after a drag) so the
// field reflects the canonical position.
function CoordField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(value.toFixed(2));
  useEffect(() => {
    setDraft(value.toFixed(2));
  }, [value]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && Math.abs(n - value) > 1e-6) onCommit(n);
    else setDraft(value.toFixed(2));
  };
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[#8fa39a]">{label}</span>
      <input
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-24 rounded-[6px] border border-white/10 bg-[#070b0e] px-2 py-1 text-right font-mono text-[0.74rem] text-[#edf3ee] outline-none focus:border-[#5a4218] focus:ring-1 focus:ring-[#ffb547]/40"
      />
    </label>
  );
}

function cableLengthsByKind(plan: CivilPlan) {
  const bySpec = new Map<string, number>();
  for (const run of plan.cableRuns) {
    bySpec.set(run.spec, (bySpec.get(run.spec) ?? 0) + run.length);
  }
  return Array.from(bySpec.entries())
    .map(([spec, length]) => ({ spec, length: Math.round(length / 10) * 10 }))
    .sort((a, b) => (a.spec > b.spec ? 1 : -1));
}

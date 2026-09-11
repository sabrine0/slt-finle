"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CommandPlatformApiError,
  setIntersectionForcedGreen,
  setIntersectionMode,
  setIntersectionOverride,
} from "@/lib/command-platform-api";
import { forceIntersectionPhase } from "@/lib/intersection-runtime-api";
import {
  conflictsAgainstGreens,
  phaseHasCall,
  signalGroupsForDirection,
  validateDirectionAction,
  validatePhaseAction,
} from "@/components/studio/control-mode/advisory";
import type {
  DemandSnapshot,
} from "@/components/studio/control-mode/advisory";
import type { IntersectionConfig } from "@/components/studio/state/types";
import type { OperatorDirection } from "@/types/command-platform";
import type { IntersectionRuntimeState } from "@/types/intersection-runtime";

const DIRECTIONS: OperatorDirection[] = ["N", "E", "S", "W"];

const DIRECTION_LABEL: Record<OperatorDirection, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};

// Map ArrowUp/ArrowRight/ArrowDown/ArrowLeft to bearings (N/E/S/W).
const ARROW_TO_DIRECTION: Record<string, OperatorDirection> = {
  ArrowUp: "N",
  ArrowRight: "E",
  ArrowDown: "S",
  ArrowLeft: "W",
};

type Pending =
  | { kind: "phase"; phaseId: string | null }
  | { kind: "direction"; direction: OperatorDirection | null }
  | { kind: "hold" }
  | { kind: "skip" }
  | { kind: "force-red" }
  | { kind: "release" }
  | null;

interface PianoControlsProps {
  config: IntersectionConfig;
  state: IntersectionRuntimeState | null;
  onLog: (entry: string) => void;
  /** SG ids currently green according to live runtime state — used to
   *  pre-flight-check force-direction presses against the conflict
   *  matrix.  Optional so Engineering mode usages don't break. */
  currentlyGreenSgIds?: string[];
  /** Live demand snapshot — drives the per-phase "calls / no calls"
   *  badge on the phase keys (real traffic-engineering vocabulary). */
  demand?: DemandSnapshot | null;
}

export function PianoControls({
  config,
  state,
  onLog,
  currentlyGreenSgIds = [],
  demand = null,
}: PianoControlsProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Keys that just flashed — used to add a glow class for ~220ms.
  const [flashedKeys, setFlashedKeys] = useState<Set<string>>(new Set());
  const flashTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const override = state?.commands.manualOverride ?? false;
  const forcedDirection = state?.commands.forcedDirection ?? null;
  const forcedPhaseId = state?.commands.forcedPhaseId ?? null;
  const activePhaseId = state?.activePhaseId ?? null;
  const modeOverride = state?.commands.modeOverride ?? null;

  const phaseList = useMemo(() => {
    if (state && state.orderedSlices.length > 0) {
      return state.orderedSlices.map((slice) => ({
        id: slice.phaseId,
        label: slice.label,
      }));
    }
    return config.phases.map((phase) => ({ id: phase.id, label: phase.label }));
  }, [state, config.phases]);

  const availableBearings = useMemo(() => {
    const set = new Set<OperatorDirection>();
    for (const approach of config.approaches) {
      if (
        approach.bearing === "N" ||
        approach.bearing === "E" ||
        approach.bearing === "S" ||
        approach.bearing === "W"
      ) {
        set.add(approach.bearing);
      }
    }
    return set;
  }, [config.approaches]);

  // Pre-flight conflict check per direction.  Does NOT block the
  // action (the backend is the source of truth for safety) — just
  // surfaces a visible warning so the operator is aware before they
  // issue a command that would cross a currently-green movement.
  const directionWarnings = useMemo(() => {
    const map = new Map<OperatorDirection, string>();
    if (!currentlyGreenSgIds || currentlyGreenSgIds.length === 0) return map;
    for (const d of DIRECTIONS) {
      if (!availableBearings.has(d)) continue;
      // Don't warn about forcing the direction that's already green.
      if (forcedDirection === d) continue;
      const candidateSgs = signalGroupsForDirection(config, d);
      const hits = conflictsAgainstGreens(
        config,
        candidateSgs,
        currentlyGreenSgIds,
      );
      if (hits.length > 0) {
        map.set(d, `Crosses ${hits.length} green movement${hits.length === 1 ? "" : "s"}`);
      }
    }
    return map;
  }, [availableBearings, config, currentlyGreenSgIds, forcedDirection]);

  // ──────────────────────── Tap-twice-to-confirm
  // For unsafe actions (would create a conflict against the current
  // greens) the first press only *arms* a confirmation; the second
  // press within `CONFIRM_WINDOW_MS` actually fires.  Operator keeps
  // final authority — we just refuse to fire on a single misstep.
  const CONFIRM_WINDOW_MS = 3000;
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirmExpiresAtRef = useRef<number>(0);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requireConfirm = useCallback((key: string): boolean => {
    const now = Date.now();
    if (confirmKey === key && confirmExpiresAtRef.current > now) {
      // Second tap within the window — fire and clear.
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      confirmExpiresAtRef.current = 0;
      setConfirmKey(null);
      return true;
    }
    // First tap — arm and reject this press.
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmExpiresAtRef.current = now + CONFIRM_WINDOW_MS;
    confirmTimerRef.current = setTimeout(() => {
      setConfirmKey(null);
      confirmExpiresAtRef.current = 0;
    }, CONFIRM_WINDOW_MS);
    setConfirmKey(key);
    return false;
  }, [confirmKey]);

  const flashKey = useCallback((key: string) => {
    setFlashedKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    const existing = flashTimeoutRef.current[key];
    if (existing) clearTimeout(existing);
    flashTimeoutRef.current[key] = setTimeout(() => {
      setFlashedKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, 260);
  }, []);

  const run = useCallback(
    async (
      intent: Pending,
      flashId: string,
      runner: () => Promise<void>,
      successText: string,
    ) => {
      flashKey(flashId);
      setPending(intent);
      setErrorMessage(null);
      try {
        await runner();
        onLog(`✓ ${successText}`);
      } catch (error) {
        const detail =
          error instanceof CommandPlatformApiError
            ? error.detail
            : error instanceof Error
              ? error.message
              : "Command failed";
        setErrorMessage(detail);
        onLog(`✗ ${successText} — ${detail}`);
      } finally {
        setPending(null);
      }
    },
    [flashKey, onLog],
  );

  const togglePhase = useCallback(
    (phaseId: string) => {
      const next = forcedPhaseId === phaseId ? null : phaseId;
      // Releases (next === null) are always safe.  Force-on actions go
      // through pre-flight validation; if the candidate phase greens
      // would conflict with currently-green movements, require a
      // confirm-tap before dispatching.
      if (next !== null) {
        const validation = validatePhaseAction(
          config,
          phaseId,
          currentlyGreenSgIds,
        );
        if (validation.severity === "blocked") {
          if (!requireConfirm(`phase:${phaseId}`)) {
            onLog(`◌ Tap again to confirm: ${validation.message}`);
            return;
          }
        }
      }
      void run(
        { kind: "phase", phaseId: next },
        `phase:${phaseId}`,
        () => forceIntersectionPhase(config.id, next).then(() => undefined),
        next ? `Run phase ${phaseId}` : `Release forced phase`,
      );
    },
    [config, currentlyGreenSgIds, forcedPhaseId, onLog, requireConfirm, run],
  );

  const toggleDirection = useCallback(
    (direction: OperatorDirection) => {
      if (!availableBearings.has(direction)) return;
      const next = forcedDirection === direction ? null : direction;
      if (next !== null) {
        const validation = validateDirectionAction(
          config,
          direction,
          currentlyGreenSgIds,
        );
        if (validation.severity === "blocked") {
          if (!requireConfirm(`dir:${direction}`)) {
            onLog(`◌ Tap again to confirm: ${validation.message}`);
            return;
          }
        }
      }
      void run(
        { kind: "direction", direction: next },
        `dir:${direction}`,
        async () => {
          if (next && !override) {
            await setIntersectionOverride(config.id, true);
          }
          await setIntersectionForcedGreen(config.id, next);
        },
        next ? `Force ${DIRECTION_LABEL[direction]}` : "Release force-green",
      );
    },
    [
      availableBearings,
      config,
      currentlyGreenSgIds,
      forcedDirection,
      onLog,
      override,
      requireConfirm,
      run,
    ],
  );

  const holdGreen = useCallback(() => {
    if (!activePhaseId) return;
    void run(
      { kind: "hold" },
      "hold",
      () => forceIntersectionPhase(config.id, activePhaseId).then(() => undefined),
      `Hold green (${activePhaseId})`,
    );
  }, [activePhaseId, config.id, run]);

  const skipPhase = useCallback(() => {
    if (phaseList.length === 0) return;
    const referenceId = forcedPhaseId ?? activePhaseId;
    const idx = referenceId
      ? phaseList.findIndex((entry) => entry.id === referenceId)
      : -1;
    const next = phaseList[(idx + 1 + phaseList.length) % phaseList.length];
    if (!next) return;
    void run(
      { kind: "skip" },
      "skip",
      () => forceIntersectionPhase(config.id, next.id).then(() => undefined),
      `Skip → ${next.id}`,
    );
  }, [activePhaseId, config.id, forcedPhaseId, phaseList, run]);

  const forceRed = useCallback(() => {
    void run(
      { kind: "force-red" },
      "force-red",
      async () => {
        await setIntersectionMode(config.id, "emergency", true);
      },
      "Force red (emergency)",
    );
  }, [config.id, run]);

  const releaseAll = useCallback(() => {
    void run(
      { kind: "release" },
      "release",
      async () => {
        await forceIntersectionPhase(config.id, null);
        await setIntersectionForcedGreen(config.id, null);
        await setIntersectionOverride(config.id, false);
        await setIntersectionMode(config.id, "adaptive");
      },
      "Release all overrides",
    );
  }, [config.id, run]);

  // Keyboard shortcuts.  Ignored while typing in form controls.  We also
  // refuse to fire a new command while another is in flight — keeps the
  // backend safety state machine happy and stops a fast-typing operator
  // from queuing two conflicting commands.
  const pendingRef = useRef<Pending>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (pendingRef.current !== null) return; // command in flight
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Phases 1-4
      if (["1", "2", "3", "4"].includes(event.key)) {
        const index = Number(event.key) - 1;
        const phase = phaseList[index];
        if (phase) {
          event.preventDefault();
          togglePhase(phase.id);
        }
        return;
      }

      // Direction keys via arrows
      const direction = ARROW_TO_DIRECTION[event.key];
      if (direction) {
        event.preventDefault();
        toggleDirection(direction);
        return;
      }

      if (event.key === " ") {
        event.preventDefault();
        holdGreen();
        return;
      }

      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        skipPhase();
        return;
      }

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        releaseAll();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [holdGreen, phaseList, releaseAll, skipPhase, toggleDirection, togglePhase]);

  const phaseBusy = (phaseId: string) =>
    pending?.kind === "phase" && pending.phaseId === phaseId;
  const directionBusy = (direction: OperatorDirection) =>
    pending?.kind === "direction" && pending.direction === direction;
  const holdBusy = pending?.kind === "hold";
  const skipBusy = pending?.kind === "skip";
  const forceRedBusy = pending?.kind === "force-red";
  const releaseBusy = pending?.kind === "release";

  return (
    <div className="flex flex-col gap-2 border-t border-stroke-0 bg-surface-1 px-4 py-3">
      {errorMessage ? (
        <div className="rounded-[6px] border border-danger-stroke bg-danger-surface/80 px-3 py-1.5">
          <p className="text-[0.7rem] leading-5 text-danger-ink">{errorMessage}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_260px_280px] gap-3">
        <PianoSection
          title="Phases"
          subtitle={
            forcedPhaseId
              ? `Forcing ${forcedPhaseId}`
              : activePhaseId
                ? `Auto · ${activePhaseId}`
                : "Idle"
          }
        >
          <div className="flex flex-wrap gap-2">
            {phaseList.length === 0 ? (
              <p className="text-[0.72rem] text-ink-3">
                No phases defined.
              </p>
            ) : (
              phaseList.map((phase, index) => {
                const isForced = forcedPhaseId === phase.id;
                const isActive = activePhaseId === phase.id;
                const shortcut = index < 4 ? `${index + 1}` : undefined;
                const phaseValidation = validatePhaseAction(
                  config,
                  phase.id,
                  currentlyGreenSgIds,
                );
                const phaseConfirmKey = `phase:${phase.id}`;
                const phaseAwaitingConfirm =
                  confirmKey === phaseConfirmKey;
                // Only show calls when we have a demand snapshot AND
                // the phase isn't the currently-active one (which is
                // already serving its demand).
                const call =
                  demand && phase.id !== activePhaseId
                    ? phaseHasCall(config, phase.id, demand)
                    : null;
                return (
                  <PianoKey
                    key={phase.id}
                    flashed={flashedKeys.has(`phase:${phase.id}`)}
                    onClick={() => togglePhase(phase.id)}
                    busy={phaseBusy(phase.id)}
                    tone={isForced ? "forced" : isActive ? "active" : "idle"}
                    title={
                      phaseValidation.severity === "blocked"
                        ? `${phase.label} — ${phaseValidation.message}`
                        : phase.label
                    }
                    shortcut={shortcut}
                    warning={
                      phaseValidation.severity === "blocked"
                        ? phaseValidation.message
                        : null
                    }
                    confirmPending={phaseAwaitingConfirm}
                    callIndicator={call}
                  >
                    <span className="font-mono text-[1rem] font-bold leading-none">
                      {phase.id}
                    </span>
                    <span className="block max-w-[140px] truncate text-[0.62rem] uppercase tracking-[0.16em] opacity-80">
                      {phase.label}
                    </span>
                  </PianoKey>
                );
              })
            )}
          </div>
        </PianoSection>

        <PianoSection
          title="Direction"
          subtitle={
            forcedDirection
              ? `Force ${forcedDirection}`
              : override
                ? "Override on"
                : "Standby"
          }
        >
          <div className="grid grid-cols-4 gap-2">
            {DIRECTIONS.map((direction) => {
              const isActive = forcedDirection === direction;
              const enabled = availableBearings.has(direction);
              const warning = directionWarnings.get(direction) ?? null;
              const dirConfirmKey = `dir:${direction}`;
              const dirAwaitingConfirm = confirmKey === dirConfirmKey;
              const shortcut =
                direction === "N"
                  ? "↑"
                  : direction === "E"
                    ? "→"
                    : direction === "S"
                      ? "↓"
                      : "←";
              return (
                <PianoKey
                  key={direction}
                  flashed={flashedKeys.has(`dir:${direction}`)}
                  onClick={() => toggleDirection(direction)}
                  busy={directionBusy(direction)}
                  disabled={!enabled}
                  tone={isActive ? "forced" : "idle"}
                  title={
                    !enabled
                      ? `${DIRECTION_LABEL[direction]} not configured`
                      : warning
                        ? `Force ${DIRECTION_LABEL[direction]} — ⚠ ${warning}`
                        : `Force ${DIRECTION_LABEL[direction]}`
                  }
                  shortcut={shortcut}
                  warning={warning}
                  confirmPending={dirAwaitingConfirm}
                  compact
                >
                  <span className="text-[1.1rem] font-bold leading-none">
                    {direction}
                  </span>
                </PianoKey>
              );
            })}
          </div>
        </PianoSection>

        <PianoSection
          title="Action"
          subtitle={
            modeOverride === "emergency"
              ? "Emergency · all-red"
              : modeOverride
                ? `Mode ${modeOverride}`
                : "Adaptive"
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <PianoKey
              flashed={flashedKeys.has("hold")}
              onClick={holdGreen}
              busy={holdBusy}
              tone={
                forcedPhaseId && forcedPhaseId === activePhaseId
                  ? "forced"
                  : "idle"
              }
              disabled={!activePhaseId}
              title="Hold the currently active phase indefinitely"
              shortcut="Space"
            >
              <span className="text-[0.82rem] font-bold leading-none">
                Hold green
              </span>
              <span className="block text-[0.6rem] uppercase tracking-[0.16em] opacity-80">
                {activePhaseId ?? "—"}
              </span>
            </PianoKey>
            <PianoKey
              flashed={flashedKeys.has("skip")}
              onClick={skipPhase}
              busy={skipBusy}
              tone="idle"
              disabled={phaseList.length === 0}
              title="Force the next phase in cycle order"
              shortcut="S"
            >
              <span className="text-[0.82rem] font-bold leading-none">
                Skip phase
              </span>
              <span className="block text-[0.6rem] uppercase tracking-[0.16em] opacity-80">
                next
              </span>
            </PianoKey>
            <PianoKey
              flashed={flashedKeys.has("force-red")}
              onClick={forceRed}
              busy={forceRedBusy}
              tone={modeOverride === "emergency" ? "danger-active" : "danger"}
              title="All-red emergency mode"
            >
              <span className="text-[0.82rem] font-bold leading-none">
                Force red
              </span>
              <span className="block text-[0.6rem] uppercase tracking-[0.16em] opacity-80">
                all stop
              </span>
            </PianoKey>
            <PianoKey
              flashed={flashedKeys.has("release")}
              onClick={releaseAll}
              busy={releaseBusy}
              tone="release"
              title="Release every override and return to adaptive mode"
              shortcut="R"
            >
              <span className="text-[0.82rem] font-bold leading-none">
                Release all
              </span>
              <span className="block text-[0.6rem] uppercase tracking-[0.16em] opacity-80">
                adaptive
              </span>
            </PianoKey>
          </div>
        </PianoSection>
      </div>

      <ShortcutHints />
    </div>
  );
}

function PianoSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-2">
      <header className="flex items-baseline justify-between">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
          {title}
        </p>
        <p className="font-mono text-[0.66rem] text-sig-yellow-ink">{subtitle}</p>
      </header>
      <div className="mt-2">{children}</div>
    </section>
  );
}

type KeyTone = "idle" | "active" | "forced" | "danger" | "danger-active" | "release";

function PianoKey({
  children,
  onClick,
  busy,
  disabled,
  tone,
  title,
  compact = false,
  flashed = false,
  shortcut,
  warning = null,
  confirmPending = false,
  callIndicator = null,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone: KeyTone;
  title?: string;
  compact?: boolean;
  flashed?: boolean;
  shortcut?: string;
  /** Optional pre-flight warning — renders a red dot + tooltip.  The
   *  action still runs; the backend is the source of truth for safety. */
  warning?: string | null;
  /** True when the key is waiting for a second tap inside the
   *  confirmation window.  Overlays "CONFIRM" copy and pulses the
   *  border so the operator knows they have to tap again. */
  confirmPending?: boolean;
  /** null = no call info; true = has a call (demand at that phase);
   *  false = no call (phase would run empty, candidate for skip). */
  callIndicator?: boolean | null;
}) {
  const isDisabled = busy || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={clsx(
        "group relative flex flex-col items-start justify-end overflow-hidden rounded-[8px] border text-left transition active:translate-y-[1px] disabled:cursor-not-allowed",
        compact ? "h-[72px] items-center justify-center px-1.5 py-1" : "h-[72px] px-3 py-2",
        tone === "idle" &&
          "border-stroke-1 bg-surface-3 text-ink-1 hover:border-stroke-2 hover:bg-hover hover:text-ink-0",
        tone === "active" &&
          "border-accent-stroke bg-accent-surface text-accent-ink hover:brightness-110",
        tone === "forced" &&
          "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink shadow-[inset_0_-2px_0_0_var(--stls-sig-green-stroke)]",
        tone === "danger" &&
          "border-danger-stroke bg-danger-surface text-danger-ink hover:brightness-110",
        tone === "danger-active" &&
          "border-danger-stroke bg-danger-surface text-danger-ink shadow-[inset_0_-2px_0_0_var(--stls-danger-stroke)]",
        tone === "release" &&
          "border-stroke-1 bg-surface-3 text-info-ink hover:border-stroke-2",
        isDisabled && !busy ? "opacity-40" : "",
        busy ? "animate-pulse" : "",
        flashed
          ? "shadow-[0_0_0_2px_var(--stls-accent),0_0_18px_var(--stls-accent)] brightness-110"
          : "",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-stroke-1"
      />
      {shortcut ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1 rounded-[3px] border border-stroke-1 bg-surface-1/80 px-1 text-[0.54rem] font-semibold uppercase tracking-[0.14em] text-ink-2"
        >
          {shortcut}
        </span>
      ) : null}
      {warning ? (
        <span
          aria-hidden
          title={warning}
          className="pointer-events-none absolute left-1.5 top-1 grid h-3 w-3 place-items-center rounded-full border border-danger-stroke bg-danger text-[0.5rem] font-bold leading-none text-danger-surface"
        >
          !
        </span>
      ) : null}
      {callIndicator !== null ? (
        <span
          aria-hidden
          title={callIndicator ? "Has demand call" : "No call — candidate for skip"}
          className={clsx(
            "pointer-events-none absolute left-1.5 bottom-1 h-1.5 w-1.5 rounded-full",
            callIndicator ? "bg-sig-green" : "bg-ink-3 opacity-60",
          )}
        />
      ) : null}
      {confirmPending ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center rounded-[8px] border-2 border-danger ring-2 ring-danger-stroke bg-danger-surface/90 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-danger-ink stls-soft-blink"
        >
          tap again to confirm
        </span>
      ) : null}
      {children}
    </button>
  );
}

function ShortcutHints() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[6px] border border-stroke-0 bg-surface-2/60 px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-ink-3">
      <span className="font-semibold text-ink-2">Shortcuts</span>
      <Hint label="1–4" text="phase" />
      <Hint label="← ↑ → ↓" text="direction" />
      <Hint label="Space" text="hold" />
      <Hint label="S" text="skip" />
      <Hint label="R" text="release" />
    </div>
  );
}

function Hint({ label, text }: { label: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded-[3px] border border-stroke-1 bg-surface-3 px-1.5 py-px font-mono text-[0.6rem] text-ink-1">
        {label}
      </span>
      <span className="text-ink-3">{text}</span>
    </span>
  );
}

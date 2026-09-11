"use client";

import clsx from "clsx";
import { useState } from "react";

import {
  CommandPlatformApiError,
  setIntersectionForcedGreen,
  setIntersectionMode,
  setIntersectionOverride,
} from "@/lib/command-platform-api";
import { forceIntersectionPhase } from "@/lib/intersection-runtime-api";
import { useIntersectionState } from "@/components/studio/intersection-editor/use-intersection-state";
import type { IntersectionConfig } from "@/components/studio/state/types";
import type { IntersectionMode, OperatorDirection } from "@/types/command-platform";

type ControllableMode = IntersectionMode;

const MODE_OPTIONS: Array<{
  value: ControllableMode;
  label: string;
  tone?: "danger";
  requiresConfirm?: boolean;
}> = [
  { value: "adaptive", label: "Adaptive" },
  { value: "fixed", label: "Fixed" },
  { value: "manual", label: "Manual" },
  { value: "flash", label: "Flash Y" },
  { value: "emergency", label: "Emergency", tone: "danger", requiresConfirm: true },
  { value: "fail-safe", label: "Fail-safe", tone: "danger", requiresConfirm: true },
];

const DIRECTIONS: OperatorDirection[] = ["N", "E", "S", "W"];

type PendingKind =
  | { kind: "override" }
  | { kind: "mode"; mode: ControllableMode }
  | { kind: "direction"; direction: OperatorDirection | null }
  | { kind: "phase"; phaseId: string | null }
  | null;

interface EngineeringControlPanelProps {
  config: IntersectionConfig;
}

export function EngineeringControlPanel({ config }: EngineeringControlPanelProps) {
  const { state } = useIntersectionState(config.id);
  const [pending, setPending] = useState<PendingKind>(null);
  const [log, setLog] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const override = state?.commands.manualOverride ?? false;
  const forcedDirection = state?.commands.forcedDirection ?? null;
  const forcedPhaseId = state?.commands.forcedPhaseId ?? null;
  const currentMode =
    (state?.commands.modeOverride as ControllableMode | null) ?? null;

  const pushLog = (entry: string) => {
    const stamp = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    setLog((current) => [`${stamp} ${entry}`, ...current].slice(0, 10));
  };

  const run = async (
    intent: PendingKind,
    runner: () => Promise<void>,
    successText: string,
  ) => {
    setPending(intent);
    setErrorMessage(null);
    try {
      await runner();
      pushLog(successText);
    } catch (error) {
      const detail =
        error instanceof CommandPlatformApiError
          ? error.detail
          : error instanceof Error
            ? error.message
            : "Command failed";
      setErrorMessage(detail);
      pushLog(`✗ ${successText} — ${detail}`);
    } finally {
      setPending(null);
    }
  };

  const toggleOverride = () => {
    const next = !override;
    void run(
      { kind: "override" },
      async () => {
        await setIntersectionOverride(config.id, next);
      },
      next ? "Override engaged" : "Override released",
    );
  };

  const toggleDirection = (direction: OperatorDirection) => {
    if (!override) return;
    const next = forcedDirection === direction ? null : direction;
    void run(
      { kind: "direction", direction: next },
      async () => {
        await setIntersectionForcedGreen(config.id, next);
      },
      next ? `Force green ${direction}` : "Force green cleared",
    );
  };

  const selectMode = (mode: ControllableMode) => {
    const option = MODE_OPTIONS.find((candidate) => candidate.value === mode);
    const confirmed = option?.requiresConfirm ? true : false;
    void run(
      { kind: "mode", mode },
      async () => {
        await setIntersectionMode(config.id, mode, confirmed);
      },
      `Mode → ${option?.label ?? mode}`,
    );
  };

  const togglePhase = (phaseId: string) => {
    const next = forcedPhaseId === phaseId ? null : phaseId;
    void run(
      { kind: "phase", phaseId: next },
      async () => {
        await forceIntersectionPhase(config.id, next);
      },
      next ? `Force phase → ${phaseId}` : "Forced phase cleared",
    );
  };

  const overrideBusy = pending?.kind === "override";
  const directionBusy = (direction: OperatorDirection) =>
    pending?.kind === "direction" && pending.direction === direction;
  const directionClearBusy =
    pending?.kind === "direction" && pending.direction === null;
  const phaseBusy = (phaseId: string) =>
    pending?.kind === "phase" && pending.phaseId === phaseId;
  const modeBusy = (mode: ControllableMode) =>
    pending?.kind === "mode" && pending.mode === mode;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 space-y-3">
      <section>
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
          Operator control
        </p>
        <h2 className="mt-1 text-[1rem] font-semibold text-ink-0">
          {config.identity.name}
        </h2>
        <p className="mt-0.5 text-[0.72rem] text-ink-2">
          Commands issued to backend · audited
        </p>
      </section>

      {errorMessage ? (
        <div className="rounded-[8px] border border-danger-stroke bg-danger-surface/80 px-3 py-2">
          <p className="text-[0.72rem] leading-5 text-danger-ink">{errorMessage}</p>
        </div>
      ) : null}

      <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.72rem] font-semibold text-ink-1">Manual override</p>
          <button
            type="button"
            role="switch"
            aria-checked={override}
            onClick={toggleOverride}
            disabled={overrideBusy}
            className={clsx(
              "relative h-6 w-11 shrink-0 rounded-full border transition duration-200 disabled:opacity-60",
              override
                ? "border-danger-stroke bg-gradient-to-r from-danger-stroke to-danger"
                : "border-stroke-1 bg-surface-3",
            )}
          >
            <span
              aria-hidden
              className={clsx(
                "absolute top-0.5 h-5 w-5 rounded-full transition-all duration-200",
                override ? "left-[22px] bg-danger-ink" : "left-0.5 bg-ink-3",
                overrideBusy ? "animate-pulse" : "",
              )}
            />
          </button>
        </div>
        <p className="mt-1.5 text-[0.66rem] text-ink-3">
          {override
            ? "Controller locked to operator commands"
            : "Auto-pilot active — controller follows plan"}
        </p>
      </section>

      <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-3">
        <p className="text-[0.72rem] font-semibold text-ink-1">Control mode</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={modeBusy(option.value)}
              onClick={() => selectMode(option.value)}
              className={clsx(
                "rounded-[5px] border px-2 py-1 text-[0.7rem] font-semibold transition disabled:opacity-60",
                currentMode === option.value
                  ? "border-accent-stroke bg-accent-surface text-accent-ink"
                  : option.tone === "danger"
                    ? "border-danger-stroke bg-danger-surface text-danger-ink hover:brightness-110"
                    : "border-stroke-1 bg-surface-3 text-ink-2 hover:border-stroke-2 hover:text-ink-1",
                modeBusy(option.value) ? "animate-pulse" : "",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.72rem] font-semibold text-ink-1">Force phase</p>
          <span className="text-[0.62rem] text-ink-3">
            {forcedPhaseId ? `Forcing ${forcedPhaseId}` : "Standby"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {state && state.orderedSlices.length > 0 ? (
            state.orderedSlices.map((slice) => (
              <button
                key={slice.phaseId}
                type="button"
                disabled={phaseBusy(slice.phaseId)}
                onClick={() => togglePhase(slice.phaseId)}
                className={clsx(
                  "rounded-[5px] border px-2 py-1 text-[0.7rem] font-mono transition disabled:opacity-60",
                  forcedPhaseId === slice.phaseId
                    ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                    : "border-stroke-1 bg-surface-3 text-ink-1 hover:border-stroke-2 hover:text-ink-0",
                  phaseBusy(slice.phaseId) ? "animate-pulse" : "",
                )}
                title={slice.label}
              >
                {slice.phaseId}
              </button>
            ))
          ) : (
            <p className="text-[0.7rem] text-ink-3">No phases from backend.</p>
          )}
        </div>
      </section>

      <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.72rem] font-semibold text-ink-1">Force green</p>
          <span className="text-[0.62rem] text-ink-3">
            {forcedDirection ? `Forcing ${forcedDirection}` : "Standby"}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {DIRECTIONS.map((direction) => {
            const isActive = forcedDirection === direction;
            const busy = directionBusy(direction) || directionClearBusy;
            return (
              <button
                key={direction}
                type="button"
                disabled={!override || busy}
                onClick={() => toggleDirection(direction)}
                className={clsx(
                  "rounded-[5px] border px-2 py-1.5 text-[0.72rem] font-semibold transition",
                  isActive
                    ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
                    : override
                      ? "border-stroke-1 bg-surface-3 text-ink-1 hover:border-sig-green-stroke hover:text-sig-green-ink"
                      : "border-stroke-0 bg-surface-3 text-ink-3 cursor-not-allowed",
                  busy ? "animate-pulse" : "",
                )}
              >
                {direction}
              </button>
            );
          })}
        </div>
        {!override ? (
          <p className="mt-1.5 text-[0.64rem] text-ink-3">
            Engage override to enable direction forcing.
          </p>
        ) : null}
      </section>

      <section className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-2">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Action log
        </p>
        <ul className="mt-1 max-h-[140px] overflow-y-auto space-y-0.5">
          {log.length === 0 ? (
            <li className="text-[0.68rem] text-ink-3">No actions yet.</li>
          ) : (
            log.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="truncate font-mono text-[0.66rem] text-ink-1"
              >
                {line}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import { ConfirmModal } from "@/components/command-platform/confirm-modal";
import type {
  IntersectionMode,
  IntersectionSnapshot,
  OperatorDirection,
} from "@/types/command-platform";

export type CommandKind = "override" | "force-green" | "mode";

export interface IntersectionControlsProps {
  intersection: IntersectionSnapshot;
  onSetOverride: (intersectionId: string, engaged: boolean) => Promise<void>;
  onSetForcedGreen: (
    intersectionId: string,
    direction: OperatorDirection | null,
  ) => Promise<void>;
  onSetMode: (
    intersectionId: string,
    mode: IntersectionMode,
    confirmed: boolean,
  ) => Promise<void>;
}

const DIRECTIONS: OperatorDirection[] = ["N", "E", "S", "W"];

const MODE_OPTIONS: Array<{ value: IntersectionMode; label: string; confirm?: true }> = [
  { value: "adaptive", label: "Adaptive" },
  { value: "fixed", label: "Fixed" },
  { value: "manual", label: "Manual" },
  { value: "emergency", label: "Emergency", confirm: true },
  { value: "flash", label: "Flash" },
  { value: "fail-safe", label: "Fail-safe", confirm: true },
];

type PendingAction =
  | { kind: "override" }
  | { kind: "force-green"; direction: OperatorDirection | null }
  | { kind: "mode"; mode: IntersectionMode }
  | null;

export function IntersectionControls({
  intersection,
  onSetOverride,
  onSetForcedGreen,
  onSetMode,
}: IntersectionControlsProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modeAwaitingConfirm, setModeAwaitingConfirm] =
    useState<IntersectionMode | null>(null);

  const override = intersection.manualOverride ?? false;
  const forcedDirection = intersection.forcedDirection ?? null;
  const mode = intersection.mode;

  useEffect(() => {
    setPending(null);
    setLastAction(null);
    setErrorMsg(null);
    setModeAwaitingConfirm(null);
  }, [intersection.id]);

  useEffect(() => {
    if (!lastAction) return;
    const id = setTimeout(() => setLastAction(null), 2800);
    return () => clearTimeout(id);
  }, [lastAction]);

  useEffect(() => {
    if (!errorMsg) return;
    const id = setTimeout(() => setErrorMsg(null), 4500);
    return () => clearTimeout(id);
  }, [errorMsg]);

  const runCommand = async (
    action: PendingAction,
    run: () => Promise<void>,
    successLabel: string,
  ) => {
    setPending(action);
    setErrorMsg(null);
    try {
      await run();
      setLastAction(successLabel);
    } catch (error) {
      const message =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "Command failed.";
      setErrorMsg(message);
    } finally {
      setPending(null);
    }
  };

  const toggleOverride = () => {
    const next = !override;
    void runCommand(
      { kind: "override" },
      () => onSetOverride(intersection.id, next),
      next ? "Override engaged" : "Override released",
    );
  };

  const toggleDirection = (direction: OperatorDirection) => {
    if (!override) return;
    const next = forcedDirection === direction ? null : direction;
    void runCommand(
      { kind: "force-green", direction: next },
      () => onSetForcedGreen(intersection.id, next),
      next ? `Force green · ${next}` : "Force green cleared",
    );
  };

  const requestMode = (next: IntersectionMode) => {
    if (next === mode) return;
    const option = MODE_OPTIONS.find((candidate) => candidate.value === next);
    if (option?.confirm) {
      setModeAwaitingConfirm(next);
      return;
    }
    void runCommand(
      { kind: "mode", mode: next },
      () => onSetMode(intersection.id, next, false),
      `Mode → ${option?.label ?? next}`,
    );
  };

  const confirmMode = async () => {
    if (!modeAwaitingConfirm) return;
    const pendingMode = modeAwaitingConfirm;
    await runCommand(
      { kind: "mode", mode: pendingMode },
      () => onSetMode(intersection.id, pendingMode, true),
      `Mode → ${MODE_OPTIONS.find((option) => option.value === pendingMode)?.label ?? pendingMode}`,
    );
    setModeAwaitingConfirm(null);
  };

  const overrideBusy = pending?.kind === "override";
  const directionBusyOf = (direction: OperatorDirection) =>
    pending?.kind === "force-green" && pending.direction === direction;
  const directionClearBusy =
    pending?.kind === "force-green" && pending.direction === null;
  const modeBusyOf = (candidate: IntersectionMode) =>
    pending?.kind === "mode" && pending.mode === candidate;

  const confirmMeta = modeAwaitingConfirm
    ? {
        title:
          modeAwaitingConfirm === "emergency"
            ? `Switch ${intersection.name} to Emergency?`
            : `Switch ${intersection.name} to Fail-safe?`,
        message:
          modeAwaitingConfirm === "emergency"
            ? "Emergency mode preempts normal phasing and will be broadcast to the live snapshot stream. Operator audit log will record this action."
            : "Fail-safe mode moves the intersection to all-red flashing. Continue?",
        confirmLabel:
          modeAwaitingConfirm === "emergency"
            ? "Engage emergency"
            : "Engage fail-safe",
        tone: "critical" as const,
      }
    : null;

  return (
    <section className="border-t border-[#3c2e10]/60 bg-gradient-to-b from-[#14100a]/70 to-transparent px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.3em] text-[#ffb547]">
            Operator controls
          </p>
          <p className="mt-1 text-[0.74rem] text-[#8fa39a]">
            Live commands · audited · routed to snapshot stream
          </p>
        </div>
        {lastAction ? (
          <span className="stls-fade-slide flex items-center gap-1.5 rounded-full border border-[#1d4a34] bg-[#0d1913] px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#a8eac2]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#39d98a]" />
            {lastAction}
          </span>
        ) : null}
      </div>

      {errorMsg ? (
        <div className="stls-fade-slide mt-3 flex items-start gap-2 rounded-[10px] border border-[#5a1d1d] bg-[#180d0d]/80 px-3 py-2.5">
          <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff5f5f]" />
          <p className="text-[0.78rem] leading-5 text-[#ffb0b0]">{errorMsg}</p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] border border-white/8 bg-[#0b1014] px-4 py-3">
        <div>
          <p className="text-[0.84rem] font-semibold text-[#f1f6f2]">Manual override</p>
          <p className="mt-0.5 text-[0.72rem] text-[#8fa39a]">
            {override ? "Operator controls active" : "Auto-pilot active"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={override}
          onClick={toggleOverride}
          disabled={overrideBusy}
          className={clsx(
            "relative h-7 w-12 shrink-0 rounded-full border transition duration-200 disabled:cursor-not-allowed disabled:opacity-70",
            override
              ? "border-[#5a1d1d] bg-gradient-to-r from-[#5a1d1d] to-[#ff5f5f]/70 shadow-[0_0_0_1px_rgba(255,95,95,0.35)]"
              : "border-white/12 bg-[#141b20]",
          )}
        >
          <span
            aria-hidden
            className={clsx(
              "absolute top-0.5 h-6 w-6 rounded-full transition-all duration-200",
              override ? "left-[22px] bg-[#fff4f4]" : "left-0.5 bg-[#8fa39a]",
              overrideBusy ? "animate-pulse" : "",
            )}
          />
        </button>
      </div>

      <div className="mt-3 rounded-[12px] border border-white/8 bg-[#0b1014] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.84rem] font-semibold text-[#f1f6f2]">Force green</p>
          <span className="text-[0.68rem] text-[#8fa39a]">
            {forcedDirection ? `Forcing ${forcedDirection}` : "Standby"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {DIRECTIONS.map((direction) => {
            const isActive = forcedDirection === direction;
            const busy = directionBusyOf(direction) || directionClearBusy;
            return (
              <button
                key={direction}
                type="button"
                disabled={!override || busy}
                onClick={() => toggleDirection(direction)}
                className={clsx(
                  "rounded-[10px] border px-2 py-2 text-[0.78rem] font-semibold transition duration-200 hover:-translate-y-px disabled:hover:translate-y-0",
                  isActive
                    ? "border-[#1d4a34] bg-gradient-to-b from-[#113824] to-[#0c2618] text-[#a8eac2] shadow-[0_0_0_1px_rgba(57,217,138,0.35)]"
                    : override
                      ? "border-white/10 bg-[#0b1014] text-[#c3cdc6] hover:border-[#1d4a34] hover:text-[#a8eac2]"
                      : "border-white/6 bg-[#0b1014] text-[#4c5a53] cursor-not-allowed",
                  busy ? "animate-pulse" : "",
                )}
              >
                {direction}
              </button>
            );
          })}
        </div>
        {!override ? (
          <p className="mt-2 text-[0.68rem] text-[#7c8b83]">
            Engage manual override to enable direction forcing.
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-[12px] border border-white/8 bg-[#0b1014] px-4 py-3">
        <p className="text-[0.84rem] font-semibold text-[#f1f6f2]">Control mode</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {MODE_OPTIONS.map((option) => {
            const isActive = mode === option.value;
            const busy = modeBusyOf(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => requestMode(option.value)}
                disabled={busy}
                className={clsx(
                  "relative rounded-[8px] border px-2 py-1.5 text-[0.74rem] font-semibold transition duration-200 disabled:cursor-not-allowed",
                  isActive
                    ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
                    : option.confirm
                      ? "border-[#5a1d1d]/60 bg-[#140808] text-[#ff9a9a] hover:border-[#5a1d1d] hover:bg-[#180d0d]"
                      : "border-white/8 bg-[#0b1014] text-[#8fa39a] hover:border-white/16 hover:text-[#c3cdc6]",
                  busy ? "animate-pulse" : "",
                )}
              >
                {option.label}
                {option.confirm ? (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 text-[0.55rem] font-bold text-[#ff5f5f]"
                  >
                    !
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(modeAwaitingConfirm)}
        title={confirmMeta?.title ?? ""}
        message={confirmMeta?.message ?? ""}
        confirmLabel={confirmMeta?.confirmLabel}
        tone={confirmMeta?.tone}
        busy={pending?.kind === "mode"}
        onConfirm={() => void confirmMode()}
        onCancel={() => setModeAwaitingConfirm(null)}
      />
    </section>
  );
}

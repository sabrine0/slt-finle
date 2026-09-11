"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import {
  fetchIntersectionState,
  forceIntersectionPhase,
} from "@/lib/intersection-runtime-api";
import type {
  IntersectionRuntimeState,
  SignalAspect,
  SignalGroupState,
} from "@/types/intersection-runtime";

const aspectStyles: Record<SignalAspect, string> = {
  green: "bg-[#39d98a]",
  yellow: "bg-[#ffb547]",
  red: "bg-[#ff5f5f]",
};

const aspectRing: Record<SignalAspect, string> = {
  green: "shadow-[0_0_12px_rgba(57,217,138,0.55)]",
  yellow: "shadow-[0_0_12px_rgba(255,181,71,0.55)]",
  red: "shadow-[0_0_12px_rgba(255,95,95,0.45)]",
};

const phaseStateLabel: Record<string, string> = {
  green: "Green",
  yellow: "Yellow",
  "red-clearance": "Red clearance",
  idle: "Idle",
};

function bearingPosition(bearing: SignalGroupState["approachBearing"]) {
  switch (bearing) {
    case "N":
      return "top-1 left-1/2 -translate-x-1/2";
    case "S":
      return "bottom-1 left-1/2 -translate-x-1/2";
    case "E":
      return "right-1 top-1/2 -translate-y-1/2";
    case "W":
      return "left-1 top-1/2 -translate-y-1/2";
  }
}

interface ControllerFlowProps {
  intersectionCode: string;
}

export function ControllerFlow({ intersectionCode }: ControllerFlowProps) {
  const [state, setState] = useState<IntersectionRuntimeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const next = await fetchIntersectionState(intersectionCode);
        if (!cancelled) {
          setState(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Runtime unreachable");
        }
      }
    }

    void tick();
    const interval = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [intersectionCode]);

  async function handleForce(phaseId: string | null) {
    setForcing(phaseId ?? "__release");
    try {
      const next = await forceIntersectionPhase(intersectionCode, phaseId);
      setState(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command rejected");
    } finally {
      setForcing(null);
    }
  }

  if (error && !state) {
    return (
      <div className="rounded-[12px] border border-[#5a1d1d] bg-[#180d0d]/60 px-4 py-3 text-[0.82rem] text-[#ff9a9a]">
        {error}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-[12px] border border-white/10 bg-[#0a1014] px-4 py-10 text-center text-[0.82rem] text-[#8fa39a]">
        Loading live flow…
      </div>
    );
  }

  const bearingToGroup = new Map(state.signalGroups.map((sg) => [sg.approachBearing, sg]));

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-[10px] border border-[#5a1d1d] bg-[#180d0d]/60 px-3 py-2 text-[0.72rem] text-[#ff9a9a]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="relative aspect-square rounded-[14px] border border-white/8 bg-[#0a1014]">
          <div className="absolute inset-4 rounded-[10px] border border-white/6 bg-[#05080a]" />
          <div className="absolute left-1/2 top-4 bottom-4 w-[2px] -translate-x-1/2 bg-white/10" />
          <div className="absolute top-1/2 left-4 right-4 h-[2px] -translate-y-1/2 bg-white/10" />
          {(["N", "E", "S", "W"] as const).map((bearing) => {
            const group = bearingToGroup.get(bearing);
            const aspect = group?.aspect ?? "red";
            return (
              <div
                key={bearing}
                className={clsx(
                  "absolute flex h-8 w-8 items-center justify-center rounded-full border border-white/12",
                  bearingPosition(bearing),
                  aspectStyles[aspect],
                  aspectRing[aspect],
                )}
              >
                <span className="text-[0.62rem] font-bold text-black">{bearing}</span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                Active phase
              </p>
              <p className="mt-0.5 truncate text-[0.95rem] font-semibold text-[#edf3ee]">
                {state.activePhaseLabel}
              </p>
            </div>
            <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                State
              </p>
              <p className="mt-0.5 text-[0.95rem] font-semibold text-[#edf3ee]">
                {phaseStateLabel[state.phaseState] ?? state.phaseState}
              </p>
            </div>
            <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                Remaining
              </p>
              <p className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-[#edf3ee]">
                {state.secondsRemainingInPhaseState}s
              </p>
            </div>
            <div className="rounded-[10px] border border-white/8 bg-[#0a1014] px-3 py-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                Cycle
              </p>
              <p className="mt-0.5 text-[0.95rem] font-semibold tabular-nums text-[#edf3ee]">
                {state.cycleSecond}s / {state.cycleSeconds}s
              </p>
            </div>
          </div>

          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
              Cycle timeline
            </p>
            <div className="mt-2 flex h-8 overflow-hidden rounded-[8px] border border-white/8 bg-[#05080a]">
              {state.orderedSlices.map((slice) => {
                const widthPct = state.cycleSeconds
                  ? (slice.durationSeconds / state.cycleSeconds) * 100
                  : 0;
                const isActive = slice.phaseId === state.activePhaseId;
                return (
                  <div
                    key={slice.phaseId}
                    title={`${slice.label} — ${slice.durationSeconds}s`}
                    style={{ width: `${widthPct}%` }}
                    className={clsx(
                      "flex items-center justify-center border-r border-white/10 text-[0.58rem] font-semibold uppercase tracking-[0.16em] transition",
                      isActive
                        ? "bg-[#14100a] text-[#ffb547]"
                        : "bg-[#0b1014] text-[#6b7c74]",
                    )}
                  >
                    {slice.label.replace(/^Phase\s+/i, "P")}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
              Force a phase
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.orderedSlices.map((slice) => {
                const isForced = state.commands.forcedPhaseId === slice.phaseId;
                const busy = forcing === slice.phaseId;
                return (
                  <button
                    key={slice.phaseId}
                    type="button"
                    onClick={() => handleForce(slice.phaseId)}
                    disabled={busy}
                    className={clsx(
                      "rounded-[8px] border px-2.5 py-1.5 text-[0.72rem] font-semibold transition",
                      isForced
                        ? "border-[#5a4218] bg-[#14100a] text-[#ffb547]"
                        : "border-white/10 bg-[#0b1014] text-[#c3cdc6] hover:border-white/20 hover:text-[#edf3ee]",
                      busy ? "opacity-60" : "",
                    )}
                  >
                    {busy ? "…" : slice.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => handleForce(null)}
                disabled={forcing === "__release"}
                className="rounded-[8px] border border-[#5a1d1d] bg-[#180d0d] px-2.5 py-1.5 text-[0.72rem] font-semibold text-[#ff9a9a] transition hover:brightness-110 disabled:opacity-60"
              >
                {forcing === "__release" ? "Releasing…" : "Release"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

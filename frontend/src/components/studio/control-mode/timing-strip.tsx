"use client";

import clsx from "clsx";

import type { IntersectionRuntimeState, PhaseState } from "@/types/intersection-runtime";

interface TimingStripProps {
  state: IntersectionRuntimeState | null;
  /** Phase id the advisory layer recommends running next.  When present
   *  and different from the cycle's natural-next, a small ≠ badge shows
   *  it inside the NEXT card. */
  recommendedPhaseId?: string | null;
  /** True when the recommendation disagrees with cycle order. */
  recommendationDiffersFromCycle?: boolean;
}

const STATE_COPY: Record<PhaseState, string> = {
  green: "Green",
  yellow: "Amber",
  "red-clearance": "Red clearance",
  idle: "Idle",
};

export function TimingStrip({
  state,
  recommendedPhaseId,
  recommendationDiffersFromCycle,
}: TimingStripProps) {
  if (!state) {
    return (
      <div className="border-b border-stroke-0 bg-surface-1 px-5 py-3">
        <p className="text-[0.7rem] uppercase tracking-[0.24em] text-ink-3">
          Waiting for runtime telemetry…
        </p>
      </div>
    );
  }

  const slices = state.orderedSlices;
  const activeIndex = slices.findIndex((slice) => slice.phaseId === state.activePhaseId);
  const nextSlice = slices.length > 0 ? slices[(activeIndex + 1 + slices.length) % slices.length] : null;
  const activeSlice = activeIndex >= 0 ? slices[activeIndex] : null;

  // Seconds until the next phase begins = sum of remaining time in the rest of the active slice.
  const secondsUntilNext = activeSlice
    ? Math.max(
        0,
        activeSlice.startsAtCycleSecond +
          activeSlice.durationSeconds -
          state.cycleSecond,
      )
    : 0;

  const tone = state.phaseState;

  return (
    <section className="border-b border-stroke-0 bg-surface-1 px-5 py-3">
      <div className="grid grid-cols-[200px_minmax(0,1fr)_180px] items-stretch gap-4">
        <PhaseCard
          role="now"
          phaseId={state.activePhaseId ?? "—"}
          label={cleanLabel(state.activePhaseLabel)}
          tone={tone}
          subtitle={
            activeSlice
              ? `G${activeSlice.minGreenSeconds} · Y${activeSlice.yellowSeconds} · R${activeSlice.redClearanceSeconds}`
              : "no slice"
          }
        />

        <div className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-stroke-1 bg-surface-2 px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <StateBadge state={tone} />
              <p className="font-mono text-[1.6rem] font-bold leading-none text-ink-0 tabular-nums">
                {Math.max(0, state.secondsRemainingInPhaseState)}s
              </p>
              <p className="text-[0.66rem] uppercase tracking-[0.22em] text-ink-3">
                remaining in {STATE_COPY[tone].toLowerCase()}
              </p>
            </div>
            <p className="font-mono text-[0.74rem] text-ink-2 tabular-nums">
              cycle {pad(state.cycleSecond)} / {pad(state.cycleSeconds)}s
            </p>
          </div>

          <CycleSegments state={state} />
        </div>

        <PhaseCard
          role="next"
          phaseId={nextSlice?.phaseId ?? "—"}
          label={nextSlice ? cleanLabel(nextSlice.label) : "no upcoming phase"}
          tone="idle"
          subtitle={nextSlice ? `in ${secondsUntilNext}s` : "—"}
          recommendation={
            recommendationDiffersFromCycle && recommendedPhaseId
              ? recommendedPhaseId
              : null
          }
        />
      </div>
    </section>
  );
}

function PhaseCard({
  role,
  phaseId,
  label,
  tone,
  subtitle,
  recommendation,
}: {
  role: "now" | "next";
  phaseId: string;
  label: string;
  tone: PhaseState;
  subtitle: string;
  recommendation?: string | null;
}) {
  const ring =
    role === "now"
      ? toneRing(tone)
      : "border-stroke-1 bg-surface-2 text-ink-1";
  return (
    <div
      className={clsx(
        "flex flex-col justify-between rounded-[10px] border px-3 py-2",
        ring,
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <p className="text-[0.58rem] font-semibold uppercase tracking-[0.28em] opacity-80">
          {role === "now" ? "Now" : "Next"}
        </p>
        {recommendation ? (
          <span
            title={`Advisory recommends ${recommendation}`}
            className="rounded-[3px] border border-accent-stroke bg-accent-surface px-1 py-px text-[0.52rem] font-semibold uppercase tracking-[0.14em] text-accent-ink"
          >
            rec {recommendation}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate font-mono text-[1.05rem] font-bold leading-tight">
        {phaseId}
      </p>
      <p className="truncate text-[0.7rem] opacity-80">{label}</p>
      <p className="mt-0.5 font-mono text-[0.66rem] uppercase tracking-[0.18em] opacity-70">
        {subtitle}
      </p>
    </div>
  );
}

function StateBadge({ state }: { state: PhaseState }) {
  const tone =
    state === "green"
      ? "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink"
      : state === "yellow"
        ? "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink"
        : state === "red-clearance"
          ? "border-danger-stroke bg-danger-surface text-danger-ink"
          : "border-stroke-1 bg-surface-3 text-ink-2";
  const dot =
    state === "green"
      ? "bg-sig-green"
      : state === "yellow"
        ? "bg-sig-yellow"
        : state === "red-clearance"
          ? "bg-sig-red"
          : "bg-ink-3";
  return (
    <span
      className={clsx(
        "flex items-center gap-1.5 rounded-[5px] border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em]",
        tone,
      )}
    >
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", dot)} />
      {STATE_COPY[state]}
    </span>
  );
}

function CycleSegments({ state }: { state: IntersectionRuntimeState }) {
  if (state.cycleSeconds === 0) {
    return (
      <p className="text-[0.7rem] text-ink-3">
        Cycle is empty — backend has no configured slices.
      </p>
    );
  }
  return (
    <div className="relative">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-stroke-1 bg-surface-1">
        {state.orderedSlices.map((slice) => {
          const ratio = slice.durationSeconds / state.cycleSeconds;
          const isActive = slice.phaseId === state.activePhaseId;
          const greenW =
            (slice.minGreenSeconds / slice.durationSeconds) * 100;
          const yellowW =
            (slice.yellowSeconds / slice.durationSeconds) * 100;
          const redW =
            (slice.redClearanceSeconds / slice.durationSeconds) * 100;
          return (
            <div
              key={slice.phaseId}
              className="relative h-full border-r border-surface-1/80 last:border-r-0"
              style={{ width: `${ratio * 100}%` }}
              title={`${slice.phaseId} — ${slice.durationSeconds}s`}
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${greenW}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-green)"
                    : "var(--stls-sig-green-stroke)",
                  opacity: isActive ? 1 : 0.55,
                }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${greenW}%`,
                  width: `${yellowW}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-yellow)"
                    : "var(--stls-sig-yellow-stroke)",
                  opacity: isActive ? 1 : 0.55,
                }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${greenW + yellowW}%`,
                  width: `${redW}%`,
                  backgroundColor: isActive
                    ? "var(--stls-sig-red)"
                    : "var(--stls-sig-red-stroke)",
                  opacity: isActive ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-2px] h-[20px] w-[2px] rounded bg-accent shadow-[0_0_4px_var(--stls-accent)]"
        style={{ left: `${(state.cycleSecond / state.cycleSeconds) * 100}%` }}
      />
    </div>
  );
}

function toneRing(state: PhaseState): string {
  switch (state) {
    case "green":
      return "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink";
    case "yellow":
      return "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink";
    case "red-clearance":
      return "border-danger-stroke bg-danger-surface text-danger-ink";
    case "idle":
      return "border-stroke-1 bg-surface-2 text-ink-1";
  }
}

function cleanLabel(label: string) {
  return label.replace(/^Phase\s*\d*\s*—?\s*/i, "") || label;
}

function pad(seconds: number) {
  return Math.max(0, Math.floor(seconds)).toString();
}

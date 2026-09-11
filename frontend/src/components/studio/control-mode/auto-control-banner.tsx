"use client";

import clsx from "clsx";

import type {
  AutoControllerState,
  AutoStatus,
} from "@/components/studio/control-mode/use-auto-controller";
import type { PhaseRecommendation } from "@/components/studio/control-mode/advisory";

interface AutoControlBannerProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  controller: AutoControllerState;
  recommendation: PhaseRecommendation | null;
}

const STATUS_COPY: Record<AutoStatus, string> = {
  off: "Operator drives every phase change",
  idle: "Waiting for runtime telemetry",
  driving: "Engine driving phase selection",
  "waiting-min-green": "Holding current phase until min-green clears",
  "paused-operator": "Paused — operator is in control",
  "paused-emergency": "Paused — special runtime mode active",
};

export function AutoControlBanner({
  enabled,
  onToggle,
  controller,
  recommendation,
}: AutoControlBannerProps) {
  const { status, secondsUntilNextSwitch } = controller;
  const bannerTone = enabled
    ? status === "paused-emergency"
      ? "danger"
      : status === "paused-operator"
        ? "amber"
        : "live"
    : "neutral";

  return (
    <section
      className={clsx(
        "rounded-[8px] border px-3 py-2",
        bannerTone === "live" &&
          "border-sig-green-stroke bg-sig-green-surface/70",
        bannerTone === "amber" &&
          "border-accent-stroke bg-accent-surface/60",
        bannerTone === "danger" &&
          "border-danger-stroke bg-danger-surface/60",
        bannerTone === "neutral" && "border-stroke-1 bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={clsx(
              "grid h-5 w-5 place-items-center rounded-full border text-[0.66rem] font-bold leading-none",
              bannerTone === "live" &&
                "border-sig-green-stroke bg-sig-green text-sig-green-surface stls-soft-blink",
              bannerTone === "amber" &&
                "border-accent-stroke bg-accent text-accent-surface",
              bannerTone === "danger" &&
                "border-danger-stroke bg-danger text-danger-surface",
              bannerTone === "neutral" &&
                "border-stroke-1 bg-surface-3 text-ink-3",
            )}
          >
            {enabled ? "▶" : "◌"}
          </span>
          <div>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-ink-3">
              Auto control
            </p>
            <p
              className={clsx(
                "text-[0.78rem] font-semibold",
                enabled ? "text-ink-0" : "text-ink-1",
              )}
            >
              {enabled ? "ON" : "OFF"}
            </p>
          </div>
        </div>
        <ModeToggle enabled={enabled} onToggle={onToggle} />
      </div>

      <p className="mt-1.5 text-[0.66rem] leading-4 text-ink-2">
        {STATUS_COPY[status]}
        {status === "waiting-min-green" && secondsUntilNextSwitch > 0 ? (
          <>
            {" · "}
            <span className="font-mono text-ink-1 tabular-nums">
              {secondsUntilNextSwitch}s
            </span>
          </>
        ) : null}
      </p>

      {enabled && recommendation ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-1 rounded-[4px] border border-stroke-1 bg-surface-1 px-2 py-1">
          <div className="min-w-0 flex-1">
            <p className="text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Decision
            </p>
            <p className="truncate font-mono text-[0.78rem] font-bold text-accent-ink">
              {recommendation.phaseId}
            </p>
            <p className="truncate text-[0.6rem] leading-4 text-ink-2">
              {recommendation.reason}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ModeToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Auto / Manual"
      className="flex items-center gap-0.5 rounded-[6px] border border-stroke-1 bg-surface-3 p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!enabled}
        onClick={() => onToggle(false)}
        className={clsx(
          "rounded-[4px] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition",
          !enabled
            ? "bg-surface-1 text-ink-0 ring-1 ring-stroke-2"
            : "text-ink-2 hover:text-ink-1",
        )}
      >
        Manual
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={enabled}
        onClick={() => onToggle(true)}
        className={clsx(
          "rounded-[4px] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition",
          enabled
            ? "bg-sig-green-surface text-sig-green-ink ring-1 ring-sig-green-stroke"
            : "text-ink-2 hover:text-ink-1",
        )}
      >
        Auto
      </button>
    </div>
  );
}

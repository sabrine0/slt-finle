"use client";

import clsx from "clsx";
import Link from "next/link";

import type {
  EngineeringControllerRecord,
  EngineeringIntersectionRecord,
} from "@/types/engineering-studio";

export type ControllerTone = "healthy" | "watch" | "critical" | "offline";

const toneStyles: Record<
  ControllerTone,
  { bar: string; ring: string; text: string; label: string }
> = {
  healthy: {
    bar: "bg-[#39d98a]",
    ring: "ring-[#1d4a34]",
    text: "text-[#a8eac2]",
    label: "Online",
  },
  watch: {
    bar: "bg-[#ffb547]",
    ring: "ring-[#4a3a18]",
    text: "text-[#ffd089]",
    label: "Degraded",
  },
  critical: {
    bar: "bg-[#ff5f5f]",
    ring: "ring-[#5a1d1d]",
    text: "text-[#ffb0b0]",
    label: "Critical",
  },
  offline: {
    bar: "bg-[#6b7c74]",
    ring: "ring-[#27332e]",
    text: "text-[#8fa39a]",
    label: "Offline",
  },
};

export function resolveControllerTone(
  controller: EngineeringControllerRecord | undefined,
  intersection: EngineeringIntersectionRecord,
): ControllerTone {
  if (!controller) return "offline";
  if (controller.connectionState === "offline") return "offline";
  if (controller.connectionState === "degraded") return "watch";
  if (intersection.status === "critical") return "critical";
  if (intersection.status === "watch") return "watch";
  return "healthy";
}

const controlModeLabel: Record<string, string> = {
  adaptive: "Adaptive",
  manual: "Manual",
  fixed: "Fixed-time",
  emergency: "Emergency",
  flash: "Flashing",
  "fail-safe": "Fail-safe",
};

function formatLastSeen(value?: string | null): string {
  if (!value) return "never";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "—";
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ControllerCardProps {
  controller: EngineeringControllerRecord;
  intersection: EngineeringIntersectionRecord;
  href: string;
  compact?: boolean;
}

export function ControllerCard({
  controller,
  intersection,
  href,
  compact = false,
}: ControllerCardProps) {
  const tone = resolveControllerTone(controller, intersection);
  const accent = toneStyles[tone];
  const activePlan = intersection.timingPlans.find((p) => p.status === "active");

  return (
    <Link
      href={href}
      className={clsx(
        "relative flex flex-col overflow-hidden rounded-[14px] border border-white/6 bg-[#0a1014]/95 ring-1 transition",
        accent.ring,
        "hover:-translate-y-0.5 hover:border-white/18 hover:bg-[#0e151b]",
        compact ? "px-4 py-3" : "px-5 py-4",
      )}
    >
      <span
        aria-hidden
        className={clsx("absolute left-0 top-0 h-full w-[3px]", accent.bar)}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-[#6b7c74]">
            {controller.code}
          </p>
          <p
            className={clsx(
              "mt-0.5 truncate font-semibold text-[#f6faf5]",
              compact ? "text-[0.95rem]" : "text-[1.05rem]",
            )}
          >
            {intersection.name}
          </p>
          <p className="mt-0.5 truncate text-[0.7rem] text-[#8fa39a]">
            {intersection.district || intersection.address || "—"}
          </p>
        </div>
        <span
          className={clsx(
            "flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-white/8 bg-[#070b0e] px-2 py-1",
            accent.text,
          )}
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", accent.bar)} />
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.18em]">
            {accent.label}
          </span>
        </span>
      </div>

      {!compact ? (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-[0.68rem]">
          <div className="rounded-[10px] border border-white/6 bg-[#070b0e] px-2.5 py-2">
            <dt className="uppercase tracking-[0.18em] text-[#6b7c74]">Mode</dt>
            <dd className="mt-0.5 truncate font-semibold text-[#edf3ee]">
              {controlModeLabel[intersection.controlMode] ??
                intersection.controlMode}
            </dd>
          </div>
          <div className="rounded-[10px] border border-white/6 bg-[#070b0e] px-2.5 py-2">
            <dt className="uppercase tracking-[0.18em] text-[#6b7c74]">Plan</dt>
            <dd className="mt-0.5 truncate font-semibold text-[#edf3ee]">
              {activePlan?.code ?? "—"}
            </dd>
          </div>
          <div className="rounded-[10px] border border-white/6 bg-[#070b0e] px-2.5 py-2">
            <dt className="uppercase tracking-[0.18em] text-[#6b7c74]">Seen</dt>
            <dd className="mt-0.5 font-semibold text-[#edf3ee]">
              {formatLastSeen(controller.lastSeen)}
            </dd>
          </div>
        </dl>
      ) : null}

      <p
        className={clsx(
          "text-[0.66rem] text-[#8fa39a]",
          compact ? "mt-2" : "mt-3",
        )}
      >
        {(controller.controllerType ?? "controller").toUpperCase()} · fw{" "}
        {controller.firmwareVersion}
        {controller.operatingEnvironment
          ? ` · ${controller.operatingEnvironment}`
          : ""}
      </p>
    </Link>
  );
}

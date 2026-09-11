"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

import {
  connectionColor,
  flowColor,
  healthColor,
} from "@/components/ui/tokens";
import type {
  ConnectionState,
  IntersectionHealth,
  TrafficFlowState,
} from "@/types/command-platform";

export type Tone =
  | "neutral"
  | "info"
  | IntersectionHealth
  | ConnectionState
  | TrafficFlowState;

/**
 * StatusBadge — small pill used to display health, congestion or
 * connection state. One element, one consistent visual treatment,
 * everywhere. Pass either a `tone` (semantic) or a custom `color`.
 */
export function StatusBadge({
  tone = "neutral",
  label,
  icon,
  size = "sm",
  className,
}: {
  tone?: Tone;
  label: ReactNode;
  icon?: ReactNode;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const color = resolveTone(tone);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-[0.18em]",
        size === "xs" && "px-1.5 py-0.5 text-[0.55rem]",
        size === "sm" && "px-2 py-0.5 text-[0.62rem]",
        size === "md" && "px-2.5 py-1 text-[0.7rem]",
        className,
      )}
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}1f`,
      }}
    >
      {icon ?? <Dot color={color} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Dot — single coloured marker. Used inline beside text or in lists.
 */
export function Dot({
  color,
  size = 8,
  className,
}: {
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}

function resolveTone(tone: Tone): string {
  if (tone === "neutral") return "#8fa39a";
  if (tone === "info") return "#8ed2ef";
  if (tone in healthColor) return healthColor[tone as IntersectionHealth];
  if (tone in connectionColor) return connectionColor[tone as ConnectionState];
  if (tone in flowColor) return flowColor[tone as TrafficFlowState];
  return "#8fa39a";
}

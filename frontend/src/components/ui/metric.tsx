"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Metric — label + value + optional unit/sub. The standard way to
 * present a single KPI inside a panel. Stops the "div + p + p with
 * arbitrary text-[0.NNrem]" pattern from spreading further.
 */
export function Metric({
  label,
  value,
  unit,
  hint,
  align = "left",
  size = "md",
  emphasis = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  hint?: ReactNode;
  align?: "left" | "right" | "center";
  size?: "sm" | "md" | "lg";
  emphasis?: "default" | "strong" | "muted";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-0.5 min-w-0",
        align === "right" && "items-end text-right",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <span className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
        {label}
      </span>
      <span
        className={clsx(
          "font-semibold tabular-nums tracking-tight",
          size === "sm" && "text-[0.92rem]",
          size === "md" && "text-[1.1rem]",
          size === "lg" && "text-[1.4rem]",
          emphasis === "default" && "text-[#edf3ee]",
          emphasis === "strong" && "text-[#ffb547]",
          emphasis === "muted" && "text-[#a8b5ae]",
        )}
      >
        {value}
        {unit ? (
          <span className="ml-1 text-[0.7em] font-medium text-[#8fa39a]">
            {unit}
          </span>
        ) : null}
      </span>
      {hint ? (
        <span className="text-[0.66rem] font-medium text-[#6b7c74]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

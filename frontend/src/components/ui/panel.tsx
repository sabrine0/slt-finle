"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Panel — the standard container for a card or right-rail section.
 * Wraps existing surfaces so we stop repeating the
 * `border border-white/6 bg-[#0a1014]/95 …` chant on every panel.
 */
export function Panel({
  children,
  className,
  variant = "default",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "muted" | "inset";
  padded?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-[12px] border",
        variant === "default" && "border-white/6 bg-[#0a1014]/95",
        variant === "muted" && "border-white/6 bg-[#0b1115]/85",
        variant === "inset" && "border-white/4 bg-[#0c1216]/80",
        padded && "px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Section header — small, uppercase, tracked. Use this for every
 * sub-section inside a panel so labels are scannable.
 */
export function PanelSectionHeader({
  label,
  hint,
  trailing,
  className,
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={clsx(
        "flex items-baseline justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-baseline gap-2 min-w-0">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a] truncate">
          {label}
        </p>
        {hint ? (
          <span className="text-[0.62rem] font-medium text-[#6b7c74] truncate">
            {hint}
          </span>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}

/**
 * Section — header + body grouping inside an existing Panel.
 * Use it for the recurring "small label / value list" pattern.
 */
export function PanelSection({
  label,
  hint,
  trailing,
  children,
  className,
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("flex flex-col gap-2", className)}>
      <PanelSectionHeader label={label} hint={hint} trailing={trailing} />
      {children}
    </section>
  );
}

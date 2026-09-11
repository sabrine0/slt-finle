"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * EmptyState — single placeholder used wherever a panel has no data.
 * Replaces the various "Aucune donnée disponible" plain-text spots.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-white/8 bg-white/[0.02] px-4 py-6 text-center",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="text-[1.05rem] text-[#6b7c74]">
          {icon}
        </span>
      ) : null}
      <p className="text-[0.78rem] font-semibold text-[#cdd7d0]">{title}</p>
      {description ? (
        <p className="max-w-[34ch] text-[0.7rem] leading-snug text-[#8fa39a]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/**
 * LoadingPulse — uniform "computing…" indicator. Amber dot, label.
 */
export function LoadingPulse({
  label = "Calcul…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[#ffb547]",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ffb547]"
      />
      {label}
    </span>
  );
}

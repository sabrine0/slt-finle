"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  hint?: string;
}

/**
 * SegmentedControl — small set of mutually-exclusive options.
 * Use it for view toggles (map / graph), layout switches
 * (relation / geometry), tabs that don't deserve a full tab bar, etc.
 * Visual treatment matches the gold-accent active state used elsewhere
 * in the platform (selection rail, breadcrumb).
 */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  options: SegmentedOption<TValue>[];
  value: TValue;
  onChange: (next: TValue) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        "inline-flex items-center gap-1 rounded-[12px] border border-white/10 bg-[#070b0e]/85 p-1 backdrop-blur",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={clsx(
              "rounded-[10px] font-semibold uppercase tracking-[0.16em] transition",
              size === "sm" && "px-2.5 py-1.5 text-[0.66rem]",
              size === "md" && "px-3 py-2 text-[0.72rem]",
              active
                ? "bg-[#14100a] text-[#ffb547]"
                : "text-[#8fa39a] hover:text-[#edf3ee]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

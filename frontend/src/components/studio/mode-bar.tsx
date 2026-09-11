"use client";

import clsx from "clsx";

export type DesktopMode = "operations" | "engineering";

interface ModeBarProps {
  mode: DesktopMode;
  onChange: (mode: DesktopMode) => void;
}

const MODES: Array<{ id: DesktopMode; label: string; hint: string; icon: string }> = [
  {
    id: "operations",
    label: "Operations",
    hint: "Command dashboard — live map, alerts, supervision",
    icon: "◎",
  },
  {
    id: "engineering",
    label: "Engineering",
    hint: "Studio — intersection engineering + schematic",
    icon: "◈",
  },
];

export function ModeBar({ mode, onChange }: ModeBarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-stroke-0 bg-surface-0 px-4 py-1.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-[3px] border border-accent-stroke bg-accent-surface text-[0.58rem] font-bold uppercase tracking-[0.2em] text-accent-ink"
        >
          S
        </span>
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink-1">
          STLS Desktop
        </span>
        <span className="text-[0.58rem] font-semibold uppercase tracking-[0.28em] text-ink-3">
          Royaume du Maroc
        </span>
      </div>

      <div className="mx-2 h-4 w-px bg-stroke-1" />

      <div
        role="tablist"
        aria-label="Desktop mode"
        className="flex items-center gap-0.5 rounded-[6px] border border-stroke-0 bg-surface-1 p-0.5"
      >
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={mode === option.id}
            onClick={() => onChange(option.id)}
            title={option.hint}
            className={clsx(
              "flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition",
              mode === option.id
                ? "bg-accent-surface text-accent-ink ring-1 ring-accent-stroke"
                : "text-ink-2 hover:bg-hover hover:text-ink-1",
            )}
          >
            <span aria-hidden className="text-[0.82rem] leading-none">
              {option.icon}
            </span>
            {option.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        <span>{mode === "engineering" ? "Studio" : "Command"}</span>
        <span className="text-ink-3">·</span>
        <span>MA · Casablanca-Settat</span>
      </div>
    </div>
  );
}

"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import { useStudioTheme } from "@/components/studio/theme/theme-provider";

export type EngineeringMode = "engineering" | "control" | "simulation";

const MODE_TABS: Array<{
  id: EngineeringMode;
  label: string;
  hint: string;
  enabled: boolean;
}> = [
  {
    id: "engineering",
    label: "Engineering",
    hint: "Configure intersections — phases, stages, conflict matrix",
    enabled: true,
  },
  {
    id: "control",
    label: "Control",
    hint: "Operator console — live diagram, piano keys, force phase / direction",
    enabled: true,
  },
  {
    id: "simulation",
    label: "Simulation",
    hint: "Local dry-run of timing plan (planned)",
    enabled: false,
  },
];

interface EngineeringHeaderProps {
  mode: EngineeringMode;
  onChange: (mode: EngineeringMode) => void;
  selectionLabel?: string;
  explorerHidden?: boolean;
  onToggleExplorer?: () => void;
  controlPanelHidden?: boolean;
  onToggleControlPanel?: () => void;
}

export function EngineeringHeader({
  mode,
  onChange,
  selectionLabel,
  explorerHidden,
  onToggleExplorer,
  controlPanelHidden,
  onToggleControlPanel,
}: EngineeringHeaderProps) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => setNow(new Date()));
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
    };
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";

  return (
    <header className="flex items-center gap-4 border-b border-stroke-0 bg-surface-0 px-4 py-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-[4px] border border-accent-stroke bg-accent-surface text-[0.62rem] font-bold uppercase tracking-[0.2em] text-accent-ink"
        >
          ◆
        </span>
        <span className="text-[0.82rem] font-semibold tracking-[0.04em] text-ink-0">
          STLS Studio
        </span>
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-ink-3">
          Engineering
        </span>
      </div>

      <div className="mx-1 h-4 w-px bg-stroke-1" />

      <div
        role="tablist"
        aria-label="Workspace mode"
        className="flex items-center gap-0.5 rounded-[6px] border border-stroke-0 bg-surface-1 p-0.5"
      >
        {MODE_TABS.map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={!tab.enabled}
              onClick={() => tab.enabled && onChange(tab.id)}
              title={tab.hint}
              className={clsx(
                "relative rounded-[4px] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.18em] transition",
                active
                  ? "bg-accent-surface text-accent-ink ring-1 ring-accent-stroke"
                  : tab.enabled
                    ? "text-ink-2 hover:bg-hover hover:text-ink-0"
                    : "text-ink-3/60 cursor-not-allowed",
              )}
            >
              {tab.label}
              {!tab.enabled ? (
                <span
                  aria-hidden
                  className="ml-1.5 rounded-full bg-surface-3 px-1 py-px text-[0.52rem] font-semibold tracking-[0.12em] text-ink-3"
                >
                  soon
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3 text-[0.66rem] font-medium tracking-[0.04em] text-ink-2">
        {selectionLabel ? (
          <>
            <span className="uppercase tracking-[0.22em] text-ink-3">
              Selection
            </span>
            <span className="text-ink-1">{selectionLabel}</span>
            <span aria-hidden className="text-ink-3">·</span>
          </>
        ) : null}
        <span className="uppercase tracking-[0.22em] text-ink-3">MA</span>
        <span aria-hidden className="text-ink-3">·</span>
        <span className="font-mono tabular-nums text-ink-1">{time}</span>

        {onToggleExplorer ? (
          <PanelToggle
            side="left"
            hidden={explorerHidden ?? false}
            label="Explorer"
            onToggle={onToggleExplorer}
          />
        ) : null}
        {onToggleControlPanel ? (
          <PanelToggle
            side="right"
            hidden={controlPanelHidden ?? false}
            label="Panel"
            onToggle={onToggleControlPanel}
          />
        ) : null}

        <ThemeToggle />
      </div>
    </header>
  );
}

function PanelToggle({
  side,
  hidden,
  label,
  onToggle,
}: {
  side: "left" | "right";
  hidden: boolean;
  label: string;
  onToggle: () => void;
}) {
  const glyph =
    side === "left" ? (hidden ? "⟩" : "⟨") : hidden ? "⟨" : "⟩";
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={!hidden}
      aria-label={`${hidden ? "Show" : "Hide"} ${label}`}
      title={`${hidden ? "Show" : "Hide"} ${label}`}
      className={clsx(
        "ml-1 flex items-center gap-1 rounded-[5px] border px-1.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] transition",
        hidden
          ? "border-stroke-0 bg-surface-1 text-ink-3 hover:border-stroke-1 hover:text-ink-1"
          : "border-accent-stroke bg-accent-surface text-accent-ink hover:brightness-110",
      )}
    >
      <span aria-hidden className="text-[0.7rem] leading-none">
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useStudioTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Dark theme" : "Light theme"}
      className="ml-1 flex items-center gap-1 rounded-[5px] border border-stroke-0 bg-surface-1 px-1.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-ink-2 transition hover:border-stroke-1 hover:text-ink-0"
    >
      <span
        aria-hidden
        className={clsx(
          "grid h-3.5 w-3.5 place-items-center rounded-full text-[0.7rem] leading-none",
          isLight ? "text-accent-ink" : "text-ink-2",
        )}
      >
        {isLight ? "☀" : "☾"}
      </span>
      <span>{isLight ? "Light" : "Dark"}</span>
    </button>
  );
}

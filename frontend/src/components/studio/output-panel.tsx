"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import type { OutputChannel, OutputLine } from "@/components/studio/types";

interface OutputPanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const SAMPLE_LINES: OutputLine[] = [
  {
    channel: "system",
    level: "info",
    text: "STLS Studio started — license: Studio Engineer (dev mode).",
    timestamp: "08:41:02",
  },
  {
    channel: "system",
    level: "info",
    text: "Loaded project: Casablanca-Settat — 12 regions, 22 cities.",
    timestamp: "08:41:02",
  },
  {
    channel: "system",
    level: "info",
    text: "Connected to backend: http://localhost:4010 (snapshot stream attached).",
    timestamp: "08:41:03",
  },
  {
    channel: "output",
    level: "info",
    text: "Conflict matrix verifier: idle. Run from Tools → Validate conflict matrix.",
    timestamp: "08:41:03",
  },
  {
    channel: "problems",
    level: "warn",
    text: "Maarif / Zerktouni — controller firmware v2.3.8 trails latest stable v2.5.0.",
    timestamp: "08:41:04",
  },
  {
    channel: "problems",
    level: "warn",
    text: "Port Gate A5 — degraded controller link, last heartbeat 36s ago.",
    timestamp: "08:41:05",
  },
];

const CHANNELS: Array<{ id: OutputChannel; label: string; badge?: number }> = [
  { id: "output", label: "Output" },
  { id: "problems", label: "Problems", badge: 2 },
  { id: "system", label: "System log" },
];

const LEVEL_COLOR = {
  info: "text-ink-2",
  warn: "text-sig-yellow-ink",
  error: "text-sig-red-ink",
};

export function OutputPanel({ collapsed, onToggleCollapsed }: OutputPanelProps) {
  const [active, setActive] = useState<OutputChannel>("output");

  const visibleLines = useMemo(
    () => SAMPLE_LINES.filter((line) => line.channel === active),
    [active],
  );

  return (
    <section
      className={clsx(
        "flex min-h-0 flex-col border-t border-stroke-0 bg-surface-1",
        collapsed ? "h-9" : "h-[230px]",
      )}
    >
      <header className="flex items-center gap-1 border-b border-stroke-0 px-2">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => {
              if (collapsed) onToggleCollapsed();
              setActive(channel.id);
            }}
            className={clsx(
              "relative flex items-center gap-1.5 px-3 py-1.5 text-[0.74rem] font-medium transition",
              !collapsed && active === channel.id
                ? "text-ink-0"
                : "text-ink-2 hover:text-ink-1",
            )}
          >
            {channel.label}
            {channel.badge ? (
              <span className="rounded-full bg-sig-yellow-surface px-1.5 py-px text-[0.58rem] font-semibold text-sig-yellow-ink">
                {channel.badge}
              </span>
            ) : null}
            {!collapsed && active === channel.id ? (
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-px bg-accent"
              />
            ) : null}
          </button>
        ))}

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand output panel" : "Collapse output panel"}
          className="ml-auto grid h-6 w-6 place-items-center rounded-[4px] text-ink-3 transition hover:bg-hover hover:text-ink-1"
        >
          <span aria-hidden className="text-[0.78rem] leading-none">
            {collapsed ? "▴" : "▾"}
          </span>
        </button>
      </header>

      {!collapsed ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 font-mono text-[0.74rem] leading-5">
          {visibleLines.length === 0 ? (
            <p className="text-ink-3">No messages.</p>
          ) : (
            visibleLines.map((line, index) => (
              <div key={`${active}-${index}`} className="flex items-start gap-3">
                <span className="shrink-0 text-ink-3 tabular-nums">
                  {line.timestamp}
                </span>
                <span
                  className={clsx(
                    "shrink-0 uppercase tracking-[0.16em]",
                    LEVEL_COLOR[line.level],
                  )}
                >
                  {line.level}
                </span>
                <span className="text-ink-1">{line.text}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

interface StatusBarProps {
  projectName: string;
  selectedLabel?: string;
  modeTag?: string;
}

export function StatusBar({
  projectName,
  selectedLabel,
  modeTag = "Online",
}: StatusBarProps) {
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
    <footer className="flex items-center gap-3 border-t border-stroke-0 bg-surface-1 px-3 py-1 text-[0.7rem] text-ink-2">
      <span
        className={clsx(
          "flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-semibold uppercase tracking-[0.18em]",
          modeTag === "Online"
            ? "text-sig-green-ink"
            : modeTag === "Offline"
              ? "text-sig-red-ink"
              : "text-sig-yellow-ink",
        )}
      >
        <span
          aria-hidden
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            modeTag === "Online"
              ? "bg-sig-green"
              : modeTag === "Offline"
                ? "bg-sig-red"
                : "bg-accent",
          )}
        />
        {modeTag}
      </span>

      <span className="text-ink-3">|</span>
      <span>
        Project: <span className="text-ink-1">{projectName}</span>
      </span>

      {selectedLabel ? (
        <>
          <span className="text-ink-3">|</span>
          <span>
            Selection: <span className="text-ink-1">{selectedLabel}</span>
          </span>
        </>
      ) : null}

      <span className="ml-auto flex items-center gap-3">
        <span>License: <span className="text-accent-ink">Studio Engineer (dev)</span></span>
        <span className="text-ink-3">|</span>
        <span>User: <span className="text-ink-1">admin@stls.local</span></span>
        <span className="text-ink-3">|</span>
        <span className="tabular-nums">{time}</span>
      </span>
    </footer>
  );
}

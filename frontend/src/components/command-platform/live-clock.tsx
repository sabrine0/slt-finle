"use client";

import { useEffect, useState } from "react";

interface LiveClockProps {
  lastSnapshotAt?: string;
}

export function LiveClock({ lastSnapshotAt }: LiveClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => setNow(new Date()));
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearInterval(intervalId);
    };
  }, []);

  const timeLabel = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";

  const lagSeconds =
    now && lastSnapshotAt
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(lastSnapshotAt).getTime()) / 1000),
        )
      : null;

  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-white/8 bg-[#0b1014] px-3 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="stls-soft-blink absolute inset-0 rounded-full bg-[#39d98a]" />
        </span>
        <span className="text-[0.95rem] font-semibold tracking-[0.08em] text-[#f1f6f2] tabular-nums">
          {timeLabel}
        </span>
      </div>
      {lagSeconds !== null ? (
        <span className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-[#7c8b83]">
          +{lagSeconds}s
        </span>
      ) : null}
    </div>
  );
}

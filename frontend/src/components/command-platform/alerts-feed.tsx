"use client";

import clsx from "clsx";

import type { AlertSnapshot } from "@/types/command-platform";

interface AlertsFeedProps {
  alerts: AlertSnapshot[];
}

export function AlertsFeed({ alerts }: AlertsFeedProps) {
  const sortedByTime = [...alerts].sort(
    (left, right) =>
      new Date(right.timestamp).getTime() -
      new Date(left.timestamp).getTime(),
  );
  const criticals = sortedByTime.filter((alert) => alert.level === "critical");
  const rest = sortedByTime.filter((alert) => alert.level !== "critical");
  const warnings = sortedByTime.filter((alert) => alert.level === "warning");
  const info = sortedByTime.filter((alert) => alert.level === "info");

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-white/6 bg-[#0a1014]/95 shadow-[0_20px_40px_rgba(0,0,0,0.32)]">
      <header className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.3em] text-[#8fa39a]">
            Live alerts
          </p>
          <h2 className="mt-1 text-[1.15rem] font-semibold text-[#f6faf5]">
            Operational feed
            <span
              dir="rtl"
              lang="ar"
              className="ml-2 text-[0.82rem] font-medium text-[#8fa39a]"
            >
              التنبيهات
            </span>
          </h2>
        </div>
        {criticals.length > 0 ? (
          <div className="flex items-center gap-2 rounded-full border border-[#5a1d1d] bg-[#180d0d]/80 px-3 py-1.5 shadow-[0_0_0_1px_rgba(255,95,95,0.25)]">
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#ff5f5f]/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5f5f]" />
            </span>
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#ff9a9a]">
              {criticals.length} critical
            </span>
          </div>
        ) : (
          <span className="rounded-full border border-[#1d4a34] bg-[#0d1913]/80 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#a8eac2]">
            All clear
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 gap-px border-b border-white/6 bg-white/6">
        <FeedStat label="Critical" value={criticals.length} tone="critical" />
        <FeedStat label="Warning" value={warnings.length} tone="warning" />
        <FeedStat label="Info" value={info.length} tone="info" />
      </div>

      {criticals.length > 0 ? (
        <div className="border-b border-[#5a1d1d]/50 bg-[#110606]/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[#5a1d1d] bg-[#180d0d] px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-[#ff9a9a]">
              <span aria-hidden className="stls-soft-blink inline-block h-1.5 w-1.5 rounded-full bg-[#ff5f5f]" />
              Pinned
            </span>
            <span className="text-[0.64rem] uppercase tracking-[0.22em] text-[#8fa39a]">
              Critical · stays in view
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {criticals.map((alert) => (
              <CriticalAlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {rest.length === 0 && criticals.length === 0 ? (
          <p className="text-[0.88rem] text-[#8fa69a]">No active alerts.</p>
        ) : rest.length === 0 ? (
          <p className="text-[0.82rem] text-[#8fa69a]">
            No other events. Pinned critical alerts shown above.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rest.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CriticalAlertCard({ alert }: { alert: AlertSnapshot }) {
  return (
    <li className="stls-fade-slide relative overflow-hidden rounded-[12px] border border-[#5a1d1d] bg-gradient-to-br from-[#1e0a0a] to-[#120606] px-4 py-3.5 shadow-[0_0_0_1px_rgba(255,95,95,0.22),0_16px_30px_rgba(255,95,95,0.08)]">
      <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-[#ff5f5f]" />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-[#ff9a9a]">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#ff5f5f]/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff5f5f]" />
          </span>
          Critical
        </span>
        <span className="text-[0.72rem] text-[#caa6a6] tabular-nums">
          {formatTimeFull(alert.timestamp)}
        </span>
      </div>
      <p className="mt-2.5 text-[0.98rem] font-semibold leading-tight text-[#fff4f4]">
        {alert.title}
      </p>
      <p className="mt-1.5 text-[0.8rem] leading-5 text-[#e6c8c8]">
        {alert.detail}
      </p>
    </li>
  );
}

function AlertCard({ alert }: { alert: AlertSnapshot }) {
  const accent =
    alert.level === "warning"
      ? {
          frame: "border-[#5c4418]/70 bg-[#141008]",
          bar: "bg-[#ffb547]",
          label: "text-[#ffd089]",
          dot: "bg-[#ffb547]",
        }
      : {
          frame: "border-[#24546a]/50 bg-[#0a1317]",
          bar: "bg-[#8ed2ef]",
          label: "text-[#8ed2ef]",
          dot: "bg-[#8ed2ef]",
        };

  return (
    <li
      className={clsx(
        "stls-fade-slide relative overflow-hidden rounded-[12px] border px-4 py-3",
        accent.frame,
      )}
    >
      <span aria-hidden className={clsx("absolute left-0 top-0 h-full w-[3px]", accent.bar)} />
      <div className="flex items-center justify-between gap-3">
        <span
          className={clsx(
            "flex items-center gap-2 text-[0.64rem] font-semibold uppercase tracking-[0.24em]",
            accent.label,
          )}
        >
          <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", accent.dot)} />
          {alert.level}
        </span>
        <span className="text-[0.7rem] text-[#7c8b83] tabular-nums">
          {formatTimeFull(alert.timestamp)}
        </span>
      </div>
      <p className="mt-1.5 text-[0.9rem] font-semibold leading-snug text-[#f1f6f2]">
        {alert.title}
      </p>
      <p className="mt-1 text-[0.8rem] leading-5 text-[#a9b6af]">
        {alert.detail}
      </p>
    </li>
  );
}

function FeedStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "info";
}) {
  const color =
    tone === "critical"
      ? "#ff5f5f"
      : tone === "warning"
        ? "#ffb547"
        : "#8ed2ef";

  return (
    <div className="bg-[#0a1014]/95 px-3 py-2">
      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.2em] text-[#8fa39a]">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[0.95rem] font-semibold text-[#edf3ee] tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

function formatTimeFull(value?: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

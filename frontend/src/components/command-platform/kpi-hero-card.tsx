"use client";

import clsx from "clsx";

export type KpiTone = "healthy" | "watch" | "critical" | "accent" | "info";

interface KpiHeroCardProps {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  tone?: KpiTone;
}

const toneAccent: Record<
  KpiTone,
  { bar: string; text: string; ring: string; glow: string }
> = {
  healthy: {
    bar: "bg-[#39d98a]",
    text: "text-[#a8eac2]",
    ring: "ring-[#1d4a34]",
    glow: "",
  },
  watch: {
    bar: "bg-[#ffb547]",
    text: "text-[#ffd089]",
    ring: "ring-[#4a3a18]",
    glow: "",
  },
  critical: {
    bar: "bg-[#ff5f5f]",
    text: "text-[#ffb0b0]",
    ring: "ring-[#5a1d1d]",
    glow: "shadow-[0_0_0_1px_rgba(255,95,95,0.35),0_18px_40px_rgba(255,95,95,0.12)]",
  },
  accent: {
    bar: "bg-[#ffb547]",
    text: "text-[#ffb547]",
    ring: "ring-[#4a3a18]",
    glow: "",
  },
  info: {
    bar: "bg-[#8ed2ef]",
    text: "text-[#a7dcef]",
    ring: "ring-[#1e3e4c]",
    glow: "",
  },
};

export function KpiHeroCard({
  label,
  value,
  unit,
  detail,
  tone = "accent",
}: KpiHeroCardProps) {
  const accent = toneAccent[tone];

  return (
    <section
      className={clsx(
        "relative overflow-hidden rounded-[14px] border border-white/6 bg-[#0a1014]/95 px-5 py-4 ring-1 transition",
        accent.ring,
        accent.glow,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.26em] text-[#8fa39a]">
            {label}
          </p>
          {detail ? (
            <p
              className={clsx(
                "mt-2 text-[0.76rem] font-medium leading-5",
                accent.text,
              )}
            >
              {detail}
            </p>
          ) : null}
        </div>
        <span
          aria-hidden
          className={clsx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", accent.bar)}
        />
      </div>

      <div className="mt-5 flex items-end gap-2">
        <p className="text-[2.6rem] font-semibold leading-none tracking-tight text-[#f6faf5] tabular-nums">
          {value}
        </p>
        {unit ? (
          <span className="pb-1 text-[0.82rem] font-semibold uppercase tracking-[0.18em] text-[#8fa69a]">
            {unit}
          </span>
        ) : null}
      </div>
    </section>
  );
}

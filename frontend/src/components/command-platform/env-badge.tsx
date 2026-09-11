"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";

import { fetchPlatformMeta, type PlatformMeta } from "@/lib/command-platform-api";

type EnvTone = "production" | "staging" | "development" | "unknown";

function toneFor(environment: string): EnvTone {
  const normalized = environment.trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") return "production";
  if (normalized === "staging" || normalized === "stage") return "staging";
  if (
    normalized === "development" ||
    normalized === "dev" ||
    normalized === "local" ||
    normalized === "test"
  ) {
    return "development";
  }
  return "unknown";
}

const toneStyles: Record<EnvTone, string> = {
  production: "border-[#5a1d1d] bg-[#180d0d] text-[#ff9a9a]",
  staging: "border-[#5a4218] bg-[#14100a] text-[#ffb547]",
  development: "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]",
  unknown: "border-white/10 bg-[#0b1014] text-[#8fa39a]",
};

function shortLabel(environment: string): string {
  const tone = toneFor(environment);
  if (tone === "production") return "PROD";
  if (tone === "staging") return "STAGING";
  if (tone === "development") return "DEV";
  return environment.slice(0, 8).toUpperCase() || "ENV";
}

export function EnvBadge() {
  const [meta, setMeta] = useState<PlatformMeta | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformMeta()
      .then((value) => {
        if (!cancelled) setMeta(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const environment = meta?.environment ?? (failed ? "offline" : "loading");
  const tone = toneFor(environment);
  const label = meta ? shortLabel(meta.environment) : failed ? "OFFLINE" : "…";

  return (
    <span
      title={
        meta
          ? `Environment: ${meta.environment} · Server: ${meta.serverTime}`
          : "Loading environment…"
      }
      className={clsx(
        "rounded-[10px] border px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em]",
        toneStyles[tone],
      )}
    >
      {label}
    </span>
  );
}

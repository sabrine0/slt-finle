"use client";

import type {
  ConnectionState,
  CorridorSnapshot,
  IntersectionHealth,
  TrafficFlowState,
} from "@/types/command-platform";

interface BottomStripProps {
  corridorMix: Record<TrafficFlowState, number>;
  controllerMix: Record<ConnectionState, number>;
  statusMix: Record<IntersectionHealth, number>;
  corridors: CorridorSnapshot[];
  city: string;
  snapshotAt: string;
}

const flowColor: Record<TrafficFlowState, string> = {
  smooth: "#39d98a",
  pressure: "#ffb547",
  congestion: "#ff6363",
};

const controllerColor: Record<ConnectionState, string> = {
  online: "#39d98a",
  degraded: "#ffb547",
  offline: "#ff6363",
};

const statusColor: Record<IntersectionHealth, string> = {
  healthy: "#39d98a",
  watch: "#ffb547",
  critical: "#ff6363",
};

export function BottomStrip({
  corridorMix,
  controllerMix,
  statusMix,
  corridors,
  city,
  snapshotAt,
}: BottomStripProps) {
  const worstCorridors = [...corridors]
    .sort((left, right) => corridorScore(right) - corridorScore(left))
    .slice(0, 3);

  return (
    <section className="grid gap-3 rounded-[12px] border border-white/6 bg-[#0a1014]/90 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.24)] md:grid-cols-[1fr_1fr_1fr_minmax(0,1.4fr)]">
      <HealthCard label="Corridors" total={sum(corridorMix)} segments={[
        { label: "Smooth", value: corridorMix.smooth, color: flowColor.smooth },
        { label: "Pressure", value: corridorMix.pressure, color: flowColor.pressure },
        { label: "Congestion", value: corridorMix.congestion, color: flowColor.congestion },
      ]} />

      <HealthCard label="Controllers" total={sum(controllerMix)} segments={[
        { label: "Online", value: controllerMix.online, color: controllerColor.online },
        { label: "Degraded", value: controllerMix.degraded, color: controllerColor.degraded },
        { label: "Offline", value: controllerMix.offline, color: controllerColor.offline },
      ]} />

      <HealthCard label="Intersections" total={sum(statusMix)} segments={[
        { label: "Healthy", value: statusMix.healthy, color: statusColor.healthy },
        { label: "Watch", value: statusMix.watch, color: statusColor.watch },
        { label: "Critical", value: statusMix.critical, color: statusColor.critical },
      ]} />

      <div className="rounded-[10px] border border-white/6 bg-[#0b1115] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#7c8b83]">
            Corridor watch
          </p>
          <p className="text-[0.66rem] text-[#7c8b83]">
            {city} · {formatTime(snapshotAt)}
          </p>
        </div>
        <ul className="mt-3 space-y-1.5">
          {worstCorridors.length === 0 ? (
            <li className="text-[0.78rem] text-[#8fa69a]">No corridor data.</li>
          ) : (
            worstCorridors.map((corridor) => (
              <li
                key={corridor.id}
                className="flex items-center gap-2 rounded-[8px] border border-white/6 bg-[#0c1216] px-2.5 py-1.5"
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: flowColor[corridor.state] }}
                />
                <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold text-[#f1f6f2]">
                  {corridor.label}
                </span>
                <span className="text-[0.7rem] text-[#a9b6af] tabular-nums">
                  {corridor.volumeKph} km/h
                </span>
                <span className="text-[0.7rem] text-[#a9b6af] tabular-nums">
                  {corridor.travelTimeMinutes}m
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

function HealthCard({
  label,
  total,
  segments,
}: {
  label: string;
  total: number;
  segments: Array<{ label: string; value: number; color: string }>;
}) {
  return (
    <div className="rounded-[10px] border border-white/6 bg-[#0b1115] px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#7c8b83]">
          {label}
        </p>
        <p className="text-[0.86rem] font-semibold text-[#f1f6f2] tabular-nums">{total}</p>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/6">
        {segments.map((seg) =>
          seg.value > 0 && total > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: seg.color,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {segments.map((seg) => (
          <span
            key={seg.label}
            className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#a9b6af]"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
            {seg.label}
            <span className="text-[#d9e3dc] tabular-nums">{seg.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function sum(map: Record<string, number>) {
  return Object.values(map).reduce((total, value) => total + value, 0);
}

function corridorScore(corridor: CorridorSnapshot) {
  const weight =
    corridor.state === "congestion"
      ? 180
      : corridor.state === "pressure"
        ? 90
        : 30;
  return weight + corridor.travelTimeMinutes * 5 - corridor.volumeKph;
}

function formatTime(value?: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

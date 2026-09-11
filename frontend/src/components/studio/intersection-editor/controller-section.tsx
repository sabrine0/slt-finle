"use client";

import clsx from "clsx";

import { SectionToolbar } from "@/components/studio/intersection-editor/form-controls";
import { useStudioProjectIntersection } from "@/components/studio/project-context";
import type { IntersectionConfig } from "@/components/studio/state/types";

const STATE_COLOR = {
  online: "var(--stls-sig-green)",
  degraded: "var(--stls-accent)",
  offline: "var(--stls-sig-red)",
} as const;

export function ControllerSection({ config }: { config: IntersectionConfig }) {
  const projectIntersection = useStudioProjectIntersection(config.id);
  const controller =
    projectIntersection?.controllers.find((item) => item.id === config.controllerId) ??
    projectIntersection?.controllers[0];
  const controllerId = controller?.id ?? config.controllerId;
  const link = controller?.connectionState;
  const linkColor =
    link === "online" || link === "degraded" || link === "offline"
      ? STATE_COLOR[link]
      : "var(--stls-ink-3)";

  return (
    <section className="flex flex-col">
      <SectionToolbar
        title="Controller link"
        subtitle="Live summary of the controller bound to this intersection. Edit controller configuration (I/O map, firmware targeting) in the Controller workbench."
      />

      <div className="grid grid-cols-2 gap-4 px-6 py-5">
        <Card label="Controller ID" value={controllerId} mono tone="gold" />
        <Card
          label="Connection"
          value={link ?? "unknown"}
          accentColor={linkColor}
        />
        {controller ? (
          <>
            <Card label="Controller code" value={controller.code} mono />
            <Card label="Firmware" value={controller.firmwareVersion} mono />
            <Card label="Uptime" value={`${controller.uptimeHours} h`} mono />
            <Card
              label="Operating type"
              value={controller.controllerType ?? "controller"}
            />
            <Card
              label="Battery"
              value={controller.batteryBacked ? "Backed" : "None"}
            />
            <Card
              label="Last seen"
              value={formatTimestamp(controller.lastSeen ?? undefined)}
              mono
            />
          </>
        ) : (
          <p className="col-span-2 text-[0.84rem] text-ink-3">
            No controller telemetry for this intersection in the current engineering project.
          </p>
        )}
      </div>
    </section>
  );
}

function Card({
  label,
  value,
  mono = false,
  tone = "neutral",
  accentColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "gold";
  accentColor?: string;
}) {
  return (
    <div className="rounded-[8px] border border-stroke-1 bg-surface-2 px-3 py-3">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
        {label}
      </p>
      <p
        className={clsx(
          "mt-1.5 text-[0.9rem] font-semibold",
          mono ? "font-mono" : "",
          tone === "gold" ? "text-accent-ink" : "text-ink-1",
        )}
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function formatTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

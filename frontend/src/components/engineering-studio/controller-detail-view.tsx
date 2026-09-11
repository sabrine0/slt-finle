import clsx from "clsx";
import Link from "next/link";

import type { EngineeringControllerDetailRecord } from "@/types/engineering-studio";

const accentByValue = {
  online: "bg-[#173823] text-[#8fe1ac]",
  degraded: "bg-[#51350f] text-[#ffcb7c]",
  offline: "bg-[#5b1a1a] text-[#ffb2b2]",
  real: "bg-[#11303a] text-[#9adcf3]",
  simulation: "bg-[#2e2530] text-[#d7b8ec]",
  published: "bg-[#11303a] text-[#9adcf3]",
  acknowledged: "bg-[#173823] text-[#8fe1ac]",
  applied: "bg-[#173823] text-[#8fe1ac]",
  rejected: "bg-[#5b1a1a] text-[#ffb2b2]",
  failed: "bg-[#5b1a1a] text-[#ffb2b2]",
  warning: "bg-[#51350f] text-[#ffcb7c]",
  critical: "bg-[#5b1a1a] text-[#ffb2b2]",
  info: "bg-[#11303a] text-[#9adcf3]",
} as const;

interface ControllerDetailViewProps {
  controller: EngineeringControllerDetailRecord;
}

export function ControllerDetailView({
  controller,
}: ControllerDetailViewProps) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Controller Type" value={toLabel(controller.controllerType ?? "unknown")} />
          <SummaryTile label="Runtime" value={controller.runtimeVersion ?? "Unknown"} />
          <SummaryTile
            label="Last Package"
            value={controller.lastDeployedPackageVersion ?? "None"}
          />
          <SummaryTile
            label="Schema Support"
            value={`v${controller.supportedPackageSchemaVersion ?? 1}`}
          />
        </div>
        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#8fa39a]">
                {controller.code}
              </p>
              <p className="mt-1 text-lg font-semibold text-[#f7f3ea]">
                {controller.intersection?.name ?? "Unassigned"}
              </p>
              <p className="mt-2 text-sm text-[#b7c1bb]">
                {controller.intersection?.code ?? "No intersection assignment"}
              </p>
            </div>
            <div className="flex gap-2">
              <StatusPill value={controller.connectionState} />
              <StatusPill value={controller.operatingEnvironment} />
              <StatusPill value={controller.lastDeploymentState ?? "idle"} />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricCell label="Last Heartbeat" value={formatDate(controller.lastSeen)} />
            <MetricCell
              label="Last Deployment"
              value={formatDate(controller.lastDeploymentAt)}
            />
            <MetricCell
              label="Last Telemetry"
              value={formatDate(controller.lastTelemetryAt)}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
            Capabilities
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCell
              label="Detector Capacity"
              value={`${controller.detectorCapacity ?? 0}`}
            />
            <MetricCell
              label="Signal Capacity"
              value={`${controller.signalGroupCapacity ?? 0}`}
            />
            <MetricCell
              label="Firmware"
              value={controller.firmwareVersion}
            />
            <MetricCell
              label="Uptime"
              value={`${controller.uptimeHours}h`}
            />
          </div>
          <div className="mt-4 rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3 text-sm text-[#c7d0cb]">
            <p>
              Last known IP:{" "}
              <span className="text-[#f7f3ea]">
                {controller.lastKnownIpAddress ?? "Unavailable"}
              </span>
            </p>
            <p className="mt-2">
              Role:{" "}
              <span className="text-[#f7f3ea]">
                {controller.isPrimary ? "Primary" : "Secondary"}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
            Credentials
          </p>
          <div className="mt-4 grid gap-3">
            {controller.credentials.length > 0 ? (
              controller.credentials.map((credential) => (
                <div
                  key={credential.id}
                  className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3"
                >
                  <p className="text-sm font-semibold text-[#f7f3ea]">
                    {credential.label}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#8fa39a]">
                    {credential.clientId}
                  </p>
                  <p className="mt-2 text-sm text-[#c7d0cb]">
                    Issued {formatDate(credential.issuedAt)}
                  </p>
                  <p className="mt-1 text-sm text-[#c7d0cb]">
                    Last used {formatDate(credential.lastUsedAt)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel message="No controller credentials have been issued yet." />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
            Detector Mapping
          </p>
          <div className="mt-4 grid gap-3">
            {controller.detectors.length > 0 ? (
              controller.detectors.map((detector) => (
                <div
                  key={detector.id}
                  className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f7f3ea]">
                        {detector.name}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#8fa39a]">
                        {detector.code}
                      </p>
                    </div>
                    <span className="rounded-[8px] bg-[#11303a] px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#9adcf3]">
                      {toLabel(detector.type)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#c7d0cb]">
                    Lane {detector.laneReference ?? "Unassigned"}
                  </p>
                  <p className="mt-1 text-sm text-[#c7d0cb]">
                    Phases{" "}
                    <span className="text-[#f7f3ea]">
                      {detector.assignedPhaseSequenceNumbers.length > 0
                        ? detector.assignedPhaseSequenceNumbers.join(", ")
                        : "None"}
                    </span>
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel message="No detector mappings are assigned to this controller." />
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
            Runtime Events
          </p>
          <div className="mt-4 grid gap-3">
            {controller.recentRuntimeEvents.length > 0 ? (
              controller.recentRuntimeEvents.map((runtimeEvent) => (
                <div
                  key={runtimeEvent.id}
                  className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={runtimeEvent.severity} />
                    <span className="rounded-[8px] border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.12em] text-[#d8dedb]">
                      {toLabel(runtimeEvent.eventType)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[#f7f3ea]">
                    {runtimeEvent.summary}
                  </p>
                  <p className="mt-2 text-sm text-[#c7d0cb]">
                    {formatDate(runtimeEvent.occurredAt)}
                  </p>
                  {runtimeEvent.deploymentPackageVersion ? (
                    <p className="mt-1 text-sm text-[#c7d0cb]">
                      Package{" "}
                      <span className="text-[#f7f3ea]">
                        {runtimeEvent.deploymentPackageVersion}
                      </span>
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyPanel message="No controller runtime events have been recorded yet." />
            )}
          </div>
        </div>
      </section>

      {controller.intersection ? (
        <div className="flex">
          <Link
            href={`/engineering/intersections/${controller.intersection.id}`}
            className="rounded-[8px] border border-[#294439] bg-[#112018] px-3 py-2 text-sm text-[#97d9b3] transition hover:border-[#3a5c4d] hover:bg-[#162820]"
          >
            Open Assigned Intersection
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[#0a1014] px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#f7f3ea]">{value}</p>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8fa39a]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#f7f3ea]">{value}</p>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-white/10 bg-[#0f171d] px-3 py-6 text-sm text-[#b7c1bb]">
      {message}
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={clsx(
        "rounded-[8px] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        accentByValue[value as keyof typeof accentByValue] ??
          "bg-[#1b2228] text-[#d8dedb]",
      )}
    >
      {toLabel(value)}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

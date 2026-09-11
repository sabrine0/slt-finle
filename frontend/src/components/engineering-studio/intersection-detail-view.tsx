"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";

import type {
  EngineeringDeploymentRecord,
  EngineeringIntersectionRecord,
  EngineeringPhaseRecord,
  EngineeringTimingPlanRecord,
} from "@/types/engineering-studio";

const tabIds = ["phases", "timing-plans", "detectors", "deployments"] as const;

type TabId = (typeof tabIds)[number];

const statusAccentByValue = {
  healthy: "bg-[#173823] text-[#8fe1ac]",
  watch: "bg-[#51350f] text-[#ffcb7c]",
  critical: "bg-[#5b1a1a] text-[#ffb2b2]",
  online: "bg-[#173823] text-[#8fe1ac]",
  degraded: "bg-[#51350f] text-[#ffcb7c]",
  offline: "bg-[#5b1a1a] text-[#ffb2b2]",
  published: "bg-[#173823] text-[#8fe1ac]",
  signed: "bg-[#11303a] text-[#9adcf3]",
  validated: "bg-[#11303a] text-[#9adcf3]",
  draft: "bg-[#2e2530] text-[#d7b8ec]",
  superseded: "bg-[#3b2e16] text-[#ffd48f]",
  rolled_back: "bg-[#5b1a1a] text-[#ffb2b2]",
} as const;

interface IntersectionDetailViewProps {
  intersection: EngineeringIntersectionRecord;
}

export function IntersectionDetailView({
  intersection,
}: IntersectionDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>("phases");

  const controllerSummary = useMemo(() => {
    const realControllers = intersection.controllers.filter(
      (controller) => controller.operatingEnvironment === "real",
    ).length;
    const simulationControllers = intersection.controllers.filter(
      (controller) => controller.operatingEnvironment === "simulation",
    ).length;

    return { realControllers, simulationControllers };
  }, [intersection.controllers]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="District" value={intersection.district} />
          <SummaryTile label="Control Mode" value={toLabel(intersection.controlMode)} />
          <SummaryTile
            label="Real Controllers"
            value={`${controllerSummary.realControllers}`}
          />
          <SummaryTile
            label="Simulation Controllers"
            value={`${controllerSummary.simulationControllers}`}
          />
        </div>
        <div className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#8fa39a]">
                {intersection.code}
              </p>
              <p className="mt-1 text-lg font-semibold text-[#f7f3ea]">
                {intersection.name}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#b7c1bb]">
                {intersection.address}
              </p>
            </div>
            <span
              className={clsx(
                "rounded-[8px] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
                statusAccentByValue[
                  intersection.status as keyof typeof statusAccentByValue
                ] ?? "bg-[#1b2228] text-[#d8dedb]",
              )}
            >
              {toLabel(intersection.status)}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricCell label="Queue" value={`${intersection.queueLength} veh`} />
            <MetricCell
              label="Delay"
              value={`${intersection.averageDelaySeconds}s`}
            />
            <MetricCell label="Incidents" value={`${intersection.incidents}`} />
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2 border-b border-white/8 pb-3">
        {tabIds.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setActiveTab(tabId)}
            className={clsx(
              "rounded-[8px] border px-3 py-2 text-sm transition",
              activeTab === tabId
                ? "border-[#31473d] bg-[#15211a] text-[#97d9b3]"
                : "border-white/10 bg-[#0c1116] text-[#c7d0cb] hover:border-white/20 hover:bg-[#121922]",
            )}
          >
            {toLabel(tabId)}
          </button>
        ))}
      </section>

      {activeTab === "phases" ? <PhasesPanel phases={intersection.phases} /> : null}
      {activeTab === "timing-plans" ? (
        <TimingPlansPanel timingPlans={intersection.timingPlans} />
      ) : null}
      {activeTab === "detectors" ? (
        <DetectorsPanel intersection={intersection} />
      ) : null}
      {activeTab === "deployments" ? (
        <DeploymentsPanel deployments={intersection.deployments ?? []} />
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
    <div className="rounded-[8px] border border-white/8 bg-[#0e151b] px-3 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8fa39a]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#f7f3ea]">{value}</p>
    </div>
  );
}

function PhasesPanel({ phases }: { phases: EngineeringPhaseRecord[] }) {
  return (
    <section className="grid gap-3">
      {phases.map((phase) => (
        <div
          key={phase.id}
          className="grid gap-3 rounded-[8px] border border-white/8 bg-[#0a1014] p-4 lg:grid-cols-[1.1fr_1.4fr_1.1fr]"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
              Phase {phase.sequenceNumber}
            </p>
            <p className="mt-1 text-lg font-semibold text-[#f7f3ea]">{phase.name}</p>
            <p className="mt-2 text-sm text-[#b7c1bb]">
              {toLabel(phase.phaseType)} / {phase.approach} / {phase.movementGroup}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCell label="Min Green" value={`${phase.minGreenSeconds}s`} />
            <MetricCell label="Yellow" value={`${phase.yellowSeconds}s`} />
            <MetricCell label="Clearance" value={`${phase.redClearanceSeconds}s`} />
          </div>
          <div className="space-y-2 text-sm text-[#c7d0cb]">
            <p>
              Allowed concurrency:{" "}
              <span className="text-[#f7f3ea]">
                {phase.allowedConcurrentPhaseSequenceNumbers.length > 0
                  ? phase.allowedConcurrentPhaseSequenceNumbers.join(", ")
                  : "None"}
              </span>
            </p>
            <p>
              Conflicts:{" "}
              <span className="text-[#f7f3ea]">
                {phase.conflictingPhaseSequenceNumbers.length > 0
                  ? phase.conflictingPhaseSequenceNumbers.join(", ")
                  : "None"}
              </span>
            </p>
            <p>
              Clearance group:{" "}
              <span className="text-[#f7f3ea]">
                {phase.clearanceGroup ?? "Unassigned"}
              </span>
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

function TimingPlansPanel({
  timingPlans,
}: {
  timingPlans: EngineeringTimingPlanRecord[];
}) {
  return (
    <section className="grid gap-3">
      {timingPlans.map((timingPlan) => {
        const stagePlan = readStagePlan(timingPlan.planData);

        return (
          <div
            key={timingPlan.id}
            className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
                  {timingPlan.code}
                </p>
                <p className="mt-1 text-lg font-semibold text-[#f7f3ea]">
                  {timingPlan.name}
                </p>
                <p className="mt-2 text-sm text-[#b7c1bb]">
                  {stagePlan.length} stages / Cycle {timingPlan.cycleLengthSeconds}s /
                  Offset {timingPlan.offsetSeconds}s
                </p>
              </div>
              <div className="flex gap-2">
                <StatusPill value={timingPlan.status} />
                <StatusPill
                  value={timingPlan.simulationOnly ? "simulation" : "field"}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {stagePlan.map((stage) => (
                <div
                  key={stage.key}
                  className="rounded-[8px] border border-white/8 bg-[#0f171d] px-3 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.14em] text-[#8fa39a]">
                    {stage.name}
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#f7f3ea]">
                    {stage.splitSeconds}s
                  </p>
                  <p className="mt-2 text-sm text-[#b7c1bb]">
                    Phases {stage.phaseSequenceNumbers.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DetectorsPanel({
  intersection,
}: {
  intersection: EngineeringIntersectionRecord;
}) {
  const controllerById = useMemo(
    () => new Map(intersection.controllers.map((controller) => [controller.id, controller])),
    [intersection.controllers],
  );

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {intersection.detectors.map((detector) => (
        <div
          key={detector.id}
          className="rounded-[8px] border border-white/8 bg-[#0a1014] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[#8fa39a]">
                {detector.code}
              </p>
              <p className="mt-1 text-lg font-semibold text-[#f7f3ea]">
                {detector.name}
              </p>
            </div>
            <StatusPill value={detector.isActive ? "online" : "offline"} />
          </div>
          <div className="mt-3 space-y-2 text-sm text-[#c7d0cb]">
            <p>Type: <span className="text-[#f7f3ea]">{toLabel(detector.type)}</span></p>
            <p>Lane: <span className="text-[#f7f3ea]">{detector.laneReference ?? "Unassigned"}</span></p>
            <p>
              Controller:{" "}
              <span className="text-[#f7f3ea]">
                {detector.controllerId
                  ? controllerById.get(detector.controllerId)?.code ?? "Missing"
                  : "Unmapped"}
              </span>
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

function DeploymentsPanel({
  deployments,
}: {
  deployments: EngineeringDeploymentRecord[];
}) {
  const sortedDeployments = [...deployments].sort(
    (leftDeployment, rightDeployment) =>
      new Date(rightDeployment.requestedAt).getTime() -
      new Date(leftDeployment.requestedAt).getTime(),
  );

  return (
    <section className="grid gap-3">
      {sortedDeployments.map((deployment) => (
        <div
          key={deployment.id}
          className="grid gap-3 rounded-[8px] border border-white/8 bg-[#0a1014] p-4 xl:grid-cols-[1.2fr_1fr]"
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={deployment.status} />
              <StatusPill value={deployment.targetEnvironment} />
              <StatusPill value={deployment.operatingMode} />
            </div>
            <p className="mt-3 text-lg font-semibold text-[#f7f3ea]">
              {deployment.packageVersion ?? "Draft package"}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#b7c1bb]">
              {deployment.resultSummary ?? "No release notes recorded."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCell label="Requested" value={formatDateTime(deployment.requestedAt)} />
            <MetricCell
              label="Published"
              value={
                deployment.publishedAt
                  ? formatDateTime(deployment.publishedAt)
                  : "Pending"
              }
            />
            <MetricCell label="Type" value={toLabel(deployment.targetType)} />
            <MetricCell label="Signature" value={deployment.isSigned ? "Signed" : "Unsigned"} />
          </div>
        </div>
      ))}
    </section>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={clsx(
        "rounded-[8px] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        statusAccentByValue[value as keyof typeof statusAccentByValue] ??
          "bg-[#1b2228] text-[#d8dedb]",
      )}
    >
      {toLabel(value)}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readStagePlan(planData: Record<string, unknown>) {
  const candidate =
    (Array.isArray(planData.stagePlan) ? planData.stagePlan : undefined) ??
    (Array.isArray(planData.stages) ? planData.stages : undefined) ??
    [];

  return candidate.flatMap((stage, index) => {
    if (!stage || typeof stage !== "object") {
      return [];
    }

    const stageRecord = stage as Record<string, unknown>;
    const phaseSequenceNumbers = Array.isArray(stageRecord.phaseSequenceNumbers)
      ? stageRecord.phaseSequenceNumbers.map((value) => Number(value))
      : [];

    return [
      {
        key:
          typeof stageRecord.key === "string" && stageRecord.key.length > 0
            ? stageRecord.key
            : `stage-${index + 1}`,
        name:
          typeof stageRecord.name === "string" && stageRecord.name.length > 0
            ? stageRecord.name
            : `Stage ${index + 1}`,
        splitSeconds: Number(stageRecord.splitSeconds ?? 0),
        phaseSequenceNumbers,
      },
    ];
  });
}

function toLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

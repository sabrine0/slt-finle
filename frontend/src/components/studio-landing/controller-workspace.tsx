"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ControllerFlow } from "@/components/studio-landing/controller-flow";
import { resolveControllerTone } from "@/components/studio-landing/controller-card";
import { EngineeringReferencesPanel } from "@/components/engineering-studio/engineering-references-panel";
import type {
  IntersectionConfig,
  WorkflowStatus,
} from "@/components/studio/state/types";
import {
  readIntersectionConfig,
  subscribeToStudioStore,
} from "@/lib/civil-plan-store";
import type {
  EngineeringControllerRecord,
  EngineeringIntersectionRecord,
} from "@/types/engineering-studio";

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  draft_plan: "Draft plan",
  validated_plan: "Plan validated",
  regulation_ready: "Régulation ready",
  cablage_ready: "Câblage ready",
  programming_ready: "Programming ready",
  approved: "Approved",
};

const PROGRAMMING_READY_STAGES: WorkflowStatus[] = [
  "programming_ready",
  "approved",
];

interface ControllerWorkspaceProps {
  intersections: EngineeringIntersectionRecord[];
  selectedControllerId: string;
}

const chipTone: Record<string, string> = {
  healthy: "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]",
  watch: "border-[#4a3a18] bg-[#14100a] text-[#ffd089]",
  critical: "border-[#5a1d1d] bg-[#180d0d] text-[#ffb0b0]",
  offline: "border-white/10 bg-[#0b1014] text-[#8fa39a]",
};

const controlModeLabel: Record<string, string> = {
  adaptive: "Adaptive",
  manual: "Manual",
  fixed: "Fixed-time",
  emergency: "Emergency",
  flash: "Flashing",
  "fail-safe": "Fail-safe",
};

export function ControllerWorkspace({
  intersections,
  selectedControllerId,
}: ControllerWorkspaceProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const rows = useMemo(() => {
    const all: Array<{
      controller: EngineeringControllerRecord;
      intersection: EngineeringIntersectionRecord;
    }> = [];
    for (const intersection of intersections) {
      for (const controller of intersection.controllers) {
        all.push({ controller, intersection });
      }
    }
    return all;
  }, [intersections]);

  const selected = rows.find((r) => r.controller.id === selectedControllerId);
  const selectedIntersectionId = selected?.intersection.id ?? null;

  // Hooks that subscribe to the Studio store must run unconditionally —
  // keep them above the early return.
  const [storedConfig, setStoredConfig] = useState<IntersectionConfig | null>(
    null,
  );
  useEffect(() => {
    if (!selectedIntersectionId) return;
    const refresh = () =>
      setStoredConfig(readIntersectionConfig(selectedIntersectionId));
    refresh();
    return subscribeToStudioStore(refresh);
  }, [selectedIntersectionId]);

  if (!selected) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#05070a] px-5 text-center text-[#edf3ee]">
        <div className="max-w-md space-y-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#ff9a9a]">
            Controller not found
          </p>
          <p className="text-[0.88rem] text-[#c3cdc6]">
            The controller <span className="font-mono">{selectedControllerId}</span>{" "}
            is not in this project.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.78rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            ← Back to Studio
          </Link>
        </div>
      </main>
    );
  }

  const { controller, intersection } = selected;
  const activePlan = intersection.timingPlans.find((p) => p.status === "active");
  const selectedTone = resolveControllerTone(controller, intersection);

  const workflowStatus: WorkflowStatus =
    storedConfig?.workflowStatus ?? "draft_plan";
  const canProgram = PROGRAMMING_READY_STAGES.includes(workflowStatus);
  const programmingNotes = storedConfig?.programmingSettings?.notes;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col gap-5 px-5 py-5">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/8 pb-4">
          <Link
            href="/studio"
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            ← Studio
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-[#ffb547]">
              {controller.code}
            </p>
            <h1 className="mt-0.5 truncate text-[1.25rem] font-semibold">
              {intersection.name}
            </h1>
            <p className="mt-0.5 truncate text-[0.76rem] text-[#8fa39a]">
              {intersection.district || intersection.address || "—"} ·{" "}
              {(controller.controllerType ?? "controller").toUpperCase()} · fw{" "}
              {controller.firmwareVersion}
            </p>
          </div>
          <span
            className={clsx(
              "rounded-[10px] border px-2.5 py-2 text-[0.62rem] font-bold uppercase tracking-[0.2em]",
              canProgram
                ? "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]"
                : "border-[#5c4418] bg-[#141008] text-[#ffd089]",
            )}
            title={`Workflow stage: ${WORKFLOW_LABELS[workflowStatus]}`}
          >
            Step 4 · {WORKFLOW_LABELS[workflowStatus]}
          </span>
          <span
            className={clsx(
              "rounded-[10px] border px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em]",
              chipTone[selectedTone],
            )}
          >
            {controller.connectionState}
          </span>
          <Link
            href="/studio/workbench"
            className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
          >
            ✎ Workbench
          </Link>
        </header>

        {!canProgram ? (
          <section className="rounded-[12px] border border-[#5c4418] bg-[#14100a] px-4 py-3 text-[0.78rem] text-[#ffd089]">
            <p className="font-semibold">
              Program this controller only after the engineering workflow is
              approved.
            </p>
            <p className="mt-0.5 text-[0.72rem] text-[#c3a060]">
              Current stage: <b>{WORKFLOW_LABELS[workflowStatus]}</b>. Promote
              through Plan → Régulation → Câblage → Programmer in the
              Workbench&apos;s Plan tab before sending commands.
            </p>
          </section>
        ) : null}

        {programmingNotes ? (
          <section className="rounded-[12px] border border-white/8 bg-[#0a1014] px-4 py-3 text-[0.78rem] text-[#edf3ee]">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
              Programmer notes
            </p>
            <p className="mt-1 whitespace-pre-line">{programmingNotes}</p>
          </section>
        ) : null}

        <section>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
            All controllers · jump to workspace
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
            {rows.map((row) => {
              const tone = resolveControllerTone(row.controller, row.intersection);
              const active = row.controller.id === selectedControllerId;
              return (
                <Link
                  key={row.controller.id}
                  href={`/studio/programmer/${row.controller.id}`}
                  className={clsx(
                    "flex min-w-[180px] flex-col rounded-[10px] border px-3 py-2 transition",
                    active
                      ? "border-[#5a4218] bg-[#14100a] shadow-[0_0_0_1px_rgba(255,181,71,0.18)]"
                      : clsx(chipTone[tone], "hover:brightness-110"),
                  )}
                >
                  <span className="font-mono text-[0.56rem] font-semibold uppercase tracking-[0.22em] opacity-80">
                    {row.controller.code}
                  </span>
                  <span className="mt-0.5 truncate text-[0.82rem] font-semibold">
                    {row.intersection.name}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[0.6rem] uppercase tracking-[0.18em] opacity-80">
                    <span
                      className={clsx(
                        "h-1.5 w-1.5 rounded-full",
                        tone === "healthy"
                          ? "bg-[#39d98a]"
                          : tone === "watch"
                            ? "bg-[#ffb547]"
                            : tone === "critical"
                              ? "bg-[#ff5f5f]"
                              : "bg-[#6b7c74]",
                      )}
                    />
                    {row.controller.connectionState}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="grid flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-3">
            <div className="rounded-[14px] border border-white/8 bg-[#0a1014]/95 p-4">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                Controller details
              </p>
              <dl className="mt-3 space-y-2 text-[0.78rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Intersection</dt>
                  <dd className="font-mono text-[#edf3ee]">
                    {intersection.code}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Mode</dt>
                  <dd className="text-[#edf3ee]">
                    {controlModeLabel[intersection.controlMode] ??
                      intersection.controlMode}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Environment</dt>
                  <dd className="text-[#edf3ee] capitalize">
                    {controller.operatingEnvironment}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Runtime</dt>
                  <dd className="text-[#edf3ee]">
                    {controller.runtimeVersion ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Active plan</dt>
                  <dd className="text-[#edf3ee]">
                    {activePlan?.code ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#8fa39a]">Uptime</dt>
                  <dd className="text-[#edf3ee]">
                    {controller.uptimeHours ?? 0}h
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[14px] border border-white/8 bg-[#0a1014]/95 p-4">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                Quick actions
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  href={`/engineering/controllers/${controller.id}`}
                  className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-center text-[0.78rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
                >
                  Open controller detail
                </Link>
                <Link
                  href={`/engineering/intersections/${intersection.id}`}
                  className="rounded-[10px] border border-white/10 bg-[#0b1014] px-3 py-2 text-center text-[0.78rem] font-semibold text-[#c3cdc6] transition hover:border-white/20 hover:text-[#edf3ee]"
                >
                  Open intersection record
                </Link>
                <Link
                  href="/studio/workbench"
                  className="rounded-[10px] border border-[#5a4218] bg-gradient-to-b from-[#ffc45c] to-[#c38a29] px-3 py-2 text-center text-[0.78rem] font-semibold text-[#120a02] transition hover:brightness-110"
                >
                  Open in workbench
                </Link>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    if (deleting) return;
                    const confirmed = window.confirm(
                      `Supprimer définitivement le carrefour « ${intersection.name} » (${intersection.code}) ?\n\n` +
                        `Cette action supprime aussi le contrôleur, les phases, les détecteurs et les plans de feux associés. Elle est irréversible.`,
                    );
                    if (!confirmed) return;
                    setDeleting(true);
                    setDeleteError(null);
                    try {
                      const response = await fetch(
                        `/api/intersections/${intersection.id}`,
                        { method: "DELETE" },
                      );
                      if (!response.ok) {
                        let detail = `${response.status} ${response.statusText}`;
                        try {
                          const body = (await response.json()) as {
                            detail?: string;
                          };
                          if (body?.detail) detail = body.detail;
                        } catch {
                          /* not json */
                        }
                        setDeleteError(
                          response.status === 403
                            ? "Permission refusée — droits intersections.manage requis."
                            : detail,
                        );
                        setDeleting(false);
                        return;
                      }
                      router.push("/studio");
                      router.refresh();
                    } catch (err) {
                      setDeleteError(
                        err instanceof Error ? err.message : String(err),
                      );
                      setDeleting(false);
                    }
                  }}
                  className={clsx(
                    "rounded-[10px] border px-3 py-2 text-center text-[0.78rem] font-semibold transition",
                    deleting
                      ? "border-white/10 bg-[#0b1014] text-[#6b7c74]"
                      : "border-[#5a1d1d] bg-[#180d0d] text-[#ffb0b0] hover:border-[#7a2d2d] hover:bg-[#251010]",
                  )}
                >
                  {deleting
                    ? "Suppression en cours…"
                    : "✕ Supprimer le carrefour"}
                </button>
                {deleteError ? (
                  <p className="rounded-[8px] border border-[#5a1d1d] bg-[#180d0d] px-2.5 py-1.5 text-[0.7rem] text-[#ffb0b0]">
                    {deleteError}
                  </p>
                ) : null}
              </div>
            </div>
          </aside>

          <div className="flex flex-col gap-3">
            <div className="rounded-[14px] border border-white/8 bg-[#0a1014]/95 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-[#6b7c74]">
                  Live signal flow
                </p>
                <span className="text-[0.6rem] uppercase tracking-[0.2em] text-[#8fa39a]">
                  polling every 1s
                </span>
              </div>
              <div className="mt-3">
                <ControllerFlow intersectionCode={intersection.code} />
              </div>
            </div>
            <EngineeringReferencesPanel
              intersectionCodeOrId={intersection.id}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

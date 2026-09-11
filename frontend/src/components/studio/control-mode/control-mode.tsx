"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";

import { IntersectionDiagram } from "@/components/studio/intersection-editor/intersection-diagram";
import { useIntersectionState } from "@/components/studio/intersection-editor/use-intersection-state";
import { useStudioIntersection } from "@/components/studio/state/store";
import { PianoControls } from "@/components/studio/control-mode/piano-controls";
import { TimingStrip } from "@/components/studio/control-mode/timing-strip";
import { DemandPriorityPanel } from "@/components/studio/control-mode/demand-priority";
import { AutoControlBanner } from "@/components/studio/control-mode/auto-control-banner";
import {
  phasePriorityList,
  recommendNextPhase,
  signalGroupsForDirection,
} from "@/components/studio/control-mode/advisory";
import { useDemand } from "@/components/studio/control-mode/use-demand";
import { useAutoController } from "@/components/studio/control-mode/use-auto-controller";
import type {
  ApproachBearing,
} from "@/components/studio/state/types";
import type { OperatorDirection } from "@/types/command-platform";
import type { IntersectionRuntimeState, SignalAspect } from "@/types/intersection-runtime";

interface ControlModeProps {
  intersectionId: string;
}

export function ControlMode({ intersectionId }: ControlModeProps) {
  const config = useStudioIntersection(intersectionId);
  const { state, status, lastMessage } = useIntersectionState(intersectionId);
  const [hoveredSignalGroupId, setHoveredSignalGroupId] = useState<string | null>(
    null,
  );
  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  // Operator-declared priority route — biases the engine's recommendation
  // toward phases that serve this bearing.  Pure-frontend; never sent to
  // backend.  Distinct from the runtime "emergency" mode (= all-red).
  const [emergencyRoute, setEmergencyRoute] =
    useState<OperatorDirection | null>(null);
  // AUTO control — when on, the auto-controller hook evaluates the
  // advisory every 2 s and dispatches force-phase when conditions are
  // met (min-green elapsed, no operator interference, no conflict).
  // Default OFF for safety — operator must explicitly opt in.
  const [autoMode, setAutoMode] = useState(false);

  const pushLog = useCallback((entry: string) => {
    const stamp = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    setLog((current) => [`${stamp} ${entry}`, ...current].slice(0, 40));
  }, []);

  const activePhaseId = state?.activePhaseId ?? null;
  const modeOverride = state?.commands.modeOverride ?? null;
  const override = state?.commands.manualOverride ?? false;
  const forcedDirection = state?.commands.forcedDirection ?? null;
  const forcedPhaseId = state?.commands.forcedPhaseId ?? null;
  const isEmergency = modeOverride === "emergency";

  // Bearings actually configured for this intersection.
  const configuredBearings = useMemo<ApproachBearing[]>(() => {
    if (!config) return [];
    const seen = new Set<ApproachBearing>();
    for (const a of config.approaches) seen.add(a.bearing);
    return Array.from(seen);
  }, [config]);

  const availableDirections = useMemo<OperatorDirection[]>(() => {
    return (["N", "E", "S", "W"] as const).filter((d) =>
      configuredBearings.includes(d),
    );
  }, [configuredBearings]);

  // Demand engine — auto-selects between live runtime detectors and
  // the deterministic simulator fallback.  The DemandSnapshot it
  // returns carries a `source` field that the UI surfaces so the
  // operator knows which signal is driving the recommendation.
  const demand = useDemand(intersectionId, configuredBearings, state);

  // SGs whose live aspect is currently green — used for pre-flight
  // conflict checks on the piano direction keys.
  const currentlyGreenSgIds = useMemo<string[]>(() => {
    if (!state) return [];
    return state.signalGroups
      .filter((sg) => sg.aspect === "green")
      .map((sg) => sg.id);
  }, [state]);

  // Recommended next phase from the advisory layer.
  const recommendation = useMemo(() => {
    if (!config) return null;
    return recommendNextPhase(config, activePhaseId, demand, emergencyRoute);
  }, [config, activePhaseId, demand, emergencyRoute]);

  // Full ranked candidate list for the priority panel.
  const priorityList = useMemo(() => {
    if (!config) return [];
    return phasePriorityList(config, activePhaseId, demand, emergencyRoute);
  }, [config, activePhaseId, demand, emergencyRoute]);

  // Auto controller — evaluates + dispatches when AUTO is on.  All
  // safety gates (min-green, operator override, emergency, conflicts)
  // live inside the hook; when AUTO is off the hook is a no-op.
  const autoController = useAutoController({
    enabled: autoMode,
    intersectionId,
    config: config ?? null,
    state,
    recommendation,
    currentlyGreenSgIds,
    onLog: pushLog,
  });

  // The natural-next phase id (from cycle order in runtime state).
  const naturalNextPhaseId = useMemo<string | null>(() => {
    if (!state || state.orderedSlices.length === 0) return null;
    const idx = state.orderedSlices.findIndex(
      (s) => s.phaseId === state.activePhaseId,
    );
    if (idx < 0) return state.orderedSlices[0].phaseId;
    return state.orderedSlices[(idx + 1) % state.orderedSlices.length].phaseId;
  }, [state]);

  const recommendationDiffersFromCycle = Boolean(
    recommendation && naturalNextPhaseId &&
      recommendation.phaseId !== naturalNextPhaseId,
  );

  // SGs that the emergency route would activate — used for diagram halo.
  const emergencyRouteSgIds = useMemo<string[]>(() => {
    if (!config || !emergencyRoute) return [];
    return signalGroupsForDirection(config, emergencyRoute);
  }, [config, emergencyRoute]);

  const liveAspects = useMemo(() => {
    if (!state) return undefined;
    const map = new Map<string, "red" | "yellow" | "green">();
    for (const group of state.signalGroups) {
      if (
        group.aspect === "red" ||
        group.aspect === "yellow" ||
        group.aspect === "green"
      ) {
        map.set(group.id, group.aspect);
      }
    }
    return map;
  }, [state]);

  if (!config) {
    return (
      <div className="grid h-full place-items-center px-10 text-center">
        <div>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.3em] text-ink-3">
            Control mode
          </p>
          <h2 className="mt-3 text-[1.2rem] font-semibold text-ink-1">
            {intersectionId} is not loaded in Studio.
          </h2>
          <p className="mt-2 text-[0.84rem] text-ink-2">
            Open the intersection from the project explorer first — Control
            mode reads from the live runtime once the config has been applied.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center justify-between gap-4 border-b border-stroke-0 bg-surface-1 px-5 py-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-ink-3">
            Control · Operator console
          </p>
          <h1 className="mt-1 text-[1.15rem] font-semibold tracking-tight text-ink-0">
            {config.identity.name}
          </h1>
          <p className="mt-0.5 text-[0.76rem] text-ink-2">
            {config.identity.address} · {config.identity.district}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill
            label="Link"
            value={status}
            tone={linkTone(status)}
          />
          <StatusPill
            label="Mode"
            value={modeOverride ?? "adaptive"}
            tone={isEmergency ? "red" : modeOverride ? "amber" : "neutral"}
          />
        </div>
      </header>

      {isEmergency ? (
        <OperatorBanner
          tone="danger"
          icon="emergency"
          heading="Emergency · all-red"
          body="Controller is forced to all-red. Release from the piano to return to adaptive mode."
        />
      ) : forcedPhaseId ? (
        <OperatorBanner
          tone="amber"
          icon="hold"
          heading={`Forced phase · ${forcedPhaseId}`}
          body="Operator is holding this phase. Release from the piano to restore cycle."
        />
      ) : override ? (
        <OperatorBanner
          tone="amber"
          icon="lock"
          heading={`Override engaged${forcedDirection ? ` · force ${forcedDirection}` : ""}`}
          body={
            forcedDirection
              ? `All approaches are forced to the ${forcedDirection} direction.`
              : "Manual override is on. Select a direction or release to return to adaptive mode."
          }
        />
      ) : null}

      <TimingStrip
        state={state}
        recommendedPhaseId={recommendation?.phaseId ?? null}
        recommendationDiffersFromCycle={recommendationDiffersFromCycle}
      />

      {status === "error" && lastMessage ? (
        <div className="border-b border-danger-stroke bg-danger-surface/60 px-5 py-1.5">
          <p className="text-[0.72rem] text-danger-ink">
            Runtime link error — {lastMessage}
          </p>
        </div>
      ) : null}

      <div className="grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative overflow-hidden bg-canvas">
          <div className="absolute inset-0 p-3">
            <IntersectionDiagram
              config={config}
              highlightedPhaseId={activePhaseId}
              hoveredSignalGroupId={hoveredSignalGroupId}
              onHoverSignalGroup={setHoveredSignalGroupId}
              showAllConflicts={showAllConflicts}
              liveAspects={liveAspects}
              activePhaseState={state?.phaseState ?? null}
              emergencyRouteSgIds={emergencyRouteSgIds}
              animateActiveFlow
            />
          </div>

          {state === null && status !== "error" ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-[10px] border border-stroke-0 bg-surface-1/90 px-4 py-3 text-center backdrop-blur">
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.24em] text-ink-3">
                  Waiting for runtime
                </p>
                <p className="mt-1 text-[0.8rem] text-ink-1">
                  Connecting to the controller…
                </p>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setShowAllConflicts((v) => !v)}
            className={clsx(
              "absolute right-4 top-4 rounded-[6px] border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] transition",
              showAllConflicts
                ? "border-danger-stroke bg-danger-surface text-danger-ink"
                : "border-stroke-1 bg-surface-1/85 text-ink-1 backdrop-blur hover:border-stroke-2 hover:text-ink-0",
            )}
            title="Toggle all-conflict overlay"
          >
            {showAllConflicts ? "Conflicts ON" : "Show conflicts"}
          </button>

        </div>

        <aside className="flex min-h-0 flex-col border-l border-stroke-0 bg-surface-1">
          <RailSection title="Auto control" subtitle="Adaptive loop · frontend only">
            <AutoControlBanner
              enabled={autoMode}
              onToggle={setAutoMode}
              controller={autoController}
              recommendation={recommendation}
            />
          </RailSection>
          <RailSection title="Demand & priority" subtitle="Advisory layer · frontend only">
            <DemandPriorityPanel
              configuredBearings={configuredBearings}
              availableDirections={availableDirections}
              demand={demand}
              emergencyRoute={emergencyRoute}
              onSetEmergencyRoute={setEmergencyRoute}
              recommendation={recommendation}
              recommendationDiffersFromCycle={recommendationDiffersFromCycle}
              naturalNextPhaseId={naturalNextPhaseId}
              priorityList={priorityList}
            />
          </RailSection>
          <RightRail state={state} log={log} />
        </aside>
      </div>

      <PianoControls
        config={config}
        state={state}
        onLog={pushLog}
        currentlyGreenSgIds={currentlyGreenSgIds}
        demand={demand}
      />
    </div>
  );
}

function RightRail({
  state,
  log,
}: {
  state: IntersectionRuntimeState | null;
  log: string[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RailSection title="Signal groups" subtitle="Live aspect per movement">
        <ul className="space-y-1">
          {!state || state.signalGroups.length === 0 ? (
            <li className="text-[0.72rem] text-ink-3">
              {state ? "No signal groups in state." : "Waiting for runtime…"}
            </li>
          ) : (
            state.signalGroups.map((group) => (
              <SignalGroupLine
                key={group.id}
                id={group.id}
                bearing={group.approachBearing}
                aspect={group.aspect}
              />
            ))
          )}
        </ul>
      </RailSection>

      <RailSection title="Detectors" subtitle="Upstream loop / radar inputs">
        <ul className="space-y-1">
          {!state || state.detectors.length === 0 ? (
            <li className="text-[0.72rem] text-ink-3">No detectors.</li>
          ) : (
            state.detectors.map((detector) => (
              <li
                key={detector.id}
                className="flex items-center gap-2 rounded-[4px] px-2 py-1 text-[0.72rem] hover:bg-hover"
              >
                <span
                  aria-hidden
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full",
                    detector.active ? "bg-sig-green" : "bg-stroke-2",
                  )}
                />
                <span className="font-mono text-sig-yellow-ink">
                  {detector.id}
                </span>
                <span className="text-ink-2">· {detector.approachBearing}</span>
                <span
                  className={clsx(
                    "ml-auto text-[0.62rem] uppercase tracking-[0.18em]",
                    detector.active ? "text-sig-green-ink" : "text-ink-3",
                  )}
                >
                  {detector.active ? "active" : "idle"}
                </span>
              </li>
            ))
          )}
        </ul>
      </RailSection>

      <RailSection title="Action log" subtitle="Newest first" flex>
        <ul className="min-h-0 space-y-0.5 overflow-y-auto pr-0.5">
          {log.length === 0 ? (
            <li className="text-[0.72rem] text-ink-3">
              No actions yet. Press a piano key to start.
            </li>
          ) : (
            log.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="truncate rounded px-1.5 py-0.5 font-mono text-[0.68rem] text-ink-1 hover:bg-hover"
              >
                {line}
              </li>
            ))
          )}
        </ul>
      </RailSection>
    </div>
  );
}

function RailSection({
  title,
  subtitle,
  children,
  flex = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  flex?: boolean;
}) {
  return (
    <section
      className={clsx(
        "border-b border-stroke-0 px-3 py-2 last:border-b-0",
        flex ? "flex min-h-0 flex-1 flex-col" : "",
      )}
    >
      <div className={flex ? "shrink-0" : undefined}>
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[0.66rem] text-ink-2">{subtitle}</p>
        ) : null}
      </div>
      <div className={clsx("mt-1.5", flex ? "flex min-h-0 flex-1 flex-col" : "")}>
        {children}
      </div>
    </section>
  );
}

function SignalGroupLine({
  id,
  bearing,
  aspect,
}: {
  id: string;
  bearing: string;
  aspect: SignalAspect;
}) {
  const color =
    aspect === "green"
      ? "var(--stls-sig-green)"
      : aspect === "yellow"
        ? "var(--stls-sig-yellow)"
        : "var(--stls-sig-red)";
  return (
    <li className="flex items-center gap-2 rounded-[4px] px-2 py-1 text-[0.72rem] hover:bg-hover">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate font-mono text-sig-yellow-ink">{id}</span>
      <span className="text-ink-2">· {bearing}</span>
      <span
        className="ml-auto rounded-[3px] border px-1.5 py-px text-[0.58rem] font-semibold uppercase tracking-[0.16em]"
        style={{
          color,
          borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
          backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        }}
      >
        {aspect}
      </span>
    </li>
  );
}

function OperatorBanner({
  tone,
  icon,
  heading,
  body,
}: {
  tone: "amber" | "danger";
  icon: "emergency" | "hold" | "lock";
  heading: string;
  body: string;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 border-b px-5 py-2",
        tone === "danger"
          ? "border-danger-stroke bg-danger-surface/80"
          : "border-accent-stroke bg-accent-surface/70",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "stls-soft-blink grid h-6 w-6 place-items-center rounded-full border",
          tone === "danger"
            ? "border-danger-stroke bg-danger text-danger-surface"
            : "border-accent-stroke bg-accent text-accent-surface",
        )}
      >
        <BannerIcon icon={icon} />
      </span>
      <div className="flex-1">
        <p
          className={clsx(
            "text-[0.72rem] font-semibold uppercase tracking-[0.18em]",
            tone === "danger" ? "text-danger-ink" : "text-accent-ink",
          )}
        >
          {heading}
        </p>
        <p
          className={clsx(
            "text-[0.72rem]",
            tone === "danger" ? "text-danger-ink" : "text-accent-ink",
          )}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function BannerIcon({ icon }: { icon: "emergency" | "hold" | "lock" }) {
  // Each tone gets a distinct shape so the state is readable even
  // without colour (and reads clearly to colour-blind operators).
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "emergency") {
    // Warning triangle with !
    return (
      <svg {...common}>
        <path d="M12 3 L22 20 L2 20 Z" />
        <line x1="12" y1="10" x2="12" y2="14" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (icon === "hold") {
    // Pause / hold
    return (
      <svg {...common}>
        <line x1="9"  y1="6" x2="9"  y2="18" />
        <line x1="15" y1="6" x2="15" y2="18" />
      </svg>
    );
  }
  // lock
  return (
    <svg {...common}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
    </svg>
  );
}

type StatusTone = "green" | "amber" | "red" | "yellow" | "neutral";

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  return (
    <span
      className={clsx(
        "flex items-baseline gap-1.5 rounded-[6px] border px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
        tone === "green" && "border-sig-green-stroke bg-sig-green-surface text-sig-green-ink",
        tone === "yellow" && "border-sig-yellow-stroke bg-sig-yellow-surface text-sig-yellow-ink",
        tone === "amber" && "border-accent-stroke bg-accent-surface text-accent-ink",
        tone === "red" && "border-danger-stroke bg-danger-surface text-danger-ink",
        tone === "neutral" && "border-stroke-1 bg-surface-2 text-ink-1",
      )}
    >
      <span className="text-ink-3">{label}</span>
      <span className="font-mono tracking-[0.08em]">{value}</span>
    </span>
  );
}

function linkTone(
  status: "connecting" | "live" | "stale" | "error",
): StatusTone {
  switch (status) {
    case "live":
      return "green";
    case "connecting":
      return "amber";
    case "stale":
      return "yellow";
    case "error":
      return "red";
  }
}

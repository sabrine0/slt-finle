"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useStudioThemeContext } from "@/components/studio-landing/theme-context";
import {
  WorkspaceMapTab,
  WorkspaceOverviewTab,
  WorkspaceAutocadTab,
  WorkspaceEtudeTab,
  WorkspaceLanesTab,
  WorkspacePhasesTab,
  WorkspaceSimulationTab,
  WorkspaceProgramTab,
  WorkspaceValidationTab,
  WorkspaceReportsTab,
} from "@/components/studio-landing/workspace-tabs";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

interface EngineeringWorkspaceProps {
  intersectionId: string;
  intersections: EngineeringIntersectionRecord[];
  apiKey?: string;
}

type TabId =
  | "overview"
  | "map"
  | "autocad"
  | "etude"
  | "lanes"
  | "phases"
  | "simulation"
  | "program"
  | "validation"
  | "reports";

interface TabDescriptor {
  id: TabId;
  number: number;
  title: string;
  hint: string;
  /** External / sibling Studio route that hosts the full tool. */
  external?: string;
}

const TABS: TabDescriptor[] = [
  {
    id: "overview",
    number: 1,
    title: "Overview",
    hint: "Controller info, location, status",
  },
  { id: "map", number: 2, title: "Map / Location", hint: "Exact GPS position" },
  {
    id: "autocad",
    number: 3,
    title: "AutoCAD / Plan",
    hint: "Civil plan & cabling",
  },
  {
    id: "etude",
    number: 4,
    title: "AI Traffic Study",
    hint: "Étude carrefour générée",
  },
  {
    id: "lanes",
    number: 5,
    title: "Lanes & Movements",
    hint: "Branches, voies, mouvements",
  },
  {
    id: "phases",
    number: 6,
    title: "Phases & Timing",
    hint: "Cycle, splits, all-red",
  },
  {
    id: "simulation",
    number: 7,
    title: "Simulation",
    hint: "Preview light sequence",
  },
  {
    id: "program",
    number: 8,
    title: "Controller Program",
    hint: "Generate firmware payload",
  },
  {
    id: "validation",
    number: 9,
    title: "Validation",
    hint: "Conflicts, missing data, safety",
  },
  {
    id: "reports",
    number: 10,
    title: "Reports",
    hint: "Export PDF dossier",
  },
];

export function EngineeringWorkspace({
  intersectionId,
  intersections,
  apiKey,
}: EngineeringWorkspaceProps) {
  const { theme, toggle } = useStudioThemeContext();
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const intersection = useMemo(
    () => intersections.find((entry) => entry.id === intersectionId),
    [intersections, intersectionId],
  );

  const baseClass = isDark
    ? "min-h-screen bg-[#04070a] text-[#edf3ee]"
    : "min-h-screen bg-[#f5f3ec] text-[#1b2322]";

  if (!intersection) {
    return (
      <div className={`${baseClass} p-6`}>
        <p className="text-sm text-red-400">Carrefour introuvable.</p>
        <Link className="mt-4 inline-block text-sm underline" href="/studio">
          ← Retour au studio
        </Link>
      </div>
    );
  }

  const primaryController =
    intersection.controllers.find((entry) => entry.isPrimary) ??
    intersection.controllers[0] ??
    null;
  const tone = statusTone(intersection, primaryController?.connectionState);

  return (
    <div className={baseClass}>
      <Header
        intersection={intersection}
        controllerLabel={primaryController?.code ?? "—"}
        controllerState={primaryController?.connectionState ?? "unknown"}
        tone={tone}
        isDark={isDark}
        toggle={toggle}
      />

      <div className="grid grid-cols-[260px_1fr]">
        <aside
          className={`min-h-[calc(100vh-128px)] border-r px-2 py-4 ${
            isDark ? "border-white/10" : "border-black/10"
          }`}
        >
          <p className="px-3 text-[0.58rem] font-semibold uppercase tracking-[0.24em] opacity-60">
            Workflow
          </p>
          <nav className="mt-2 flex flex-col gap-1">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-left transition ${
                    active
                      ? isDark
                        ? "bg-white/10"
                        : "bg-[#1b2322] text-white"
                      : isDark
                        ? "hover:bg-white/5"
                        : "hover:bg-black/5"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-semibold ${
                      active
                        ? isDark
                          ? "bg-amber-400 text-[#120a02]"
                          : "bg-amber-300 text-[#120a02]"
                        : isDark
                          ? "bg-white/10 text-[#9eb1a4]"
                          : "bg-black/10 text-[#5e6962]"
                    }`}
                  >
                    {tab.number}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[0.78rem] font-semibold">{tab.title}</span>
                    <span className="text-[0.6rem] uppercase tracking-[0.16em] opacity-70">
                      {tab.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="px-6 py-6">
          {activeTab === "overview" ? (
            <WorkspaceOverviewTab
              intersection={intersection}
              controller={primaryController}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "map" ? (
            <WorkspaceMapTab
              intersection={intersection}
              apiKey={apiKey}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "autocad" ? (
            <WorkspaceAutocadTab intersection={intersection} isDark={isDark} />
          ) : null}
          {activeTab === "etude" ? (
            <WorkspaceEtudeTab intersection={intersection} isDark={isDark} />
          ) : null}
          {activeTab === "lanes" ? (
            <WorkspaceLanesTab intersection={intersection} isDark={isDark} />
          ) : null}
          {activeTab === "phases" ? (
            <WorkspacePhasesTab
              intersection={intersection}
              controller={primaryController}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "simulation" ? (
            <WorkspaceSimulationTab
              intersection={intersection}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "program" ? (
            <WorkspaceProgramTab
              intersection={intersection}
              controller={primaryController}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "validation" ? (
            <WorkspaceValidationTab
              intersection={intersection}
              controller={primaryController}
              isDark={isDark}
            />
          ) : null}
          {activeTab === "reports" ? (
            <WorkspaceReportsTab intersection={intersection} isDark={isDark} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

interface HeaderProps {
  intersection: EngineeringIntersectionRecord;
  controllerLabel: string;
  controllerState: string;
  tone: "healthy" | "watch" | "critical" | "offline";
  isDark: boolean;
  toggle: () => void;
}

function Header({
  intersection,
  controllerLabel,
  controllerState,
  tone,
  isDark,
  toggle,
}: HeaderProps) {
  const toneStyles: Record<HeaderProps["tone"], string> = {
    healthy: isDark
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
      : "border-emerald-700/30 bg-emerald-100 text-emerald-900",
    watch: isDark
      ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
      : "border-amber-700/30 bg-amber-100 text-amber-900",
    critical: isDark
      ? "border-red-400/40 bg-red-500/15 text-red-100"
      : "border-red-700/30 bg-red-100 text-red-900",
    offline: isDark
      ? "border-white/15 bg-white/5 text-[#9eb1a4]"
      : "border-black/15 bg-black/5 text-[#5e6962]",
  };
  return (
    <header
      className={`flex flex-col gap-3 border-b px-6 py-4 md:flex-row md:items-center md:justify-between ${
        isDark ? "border-white/10" : "border-black/10"
      }`}
    >
      <div className="flex items-center gap-4">
        <Link
          className={`text-xs font-semibold uppercase tracking-[0.2em] ${
            isDark ? "text-[#9eb1a4]" : "text-[#5e6962]"
          }`}
          href="/studio"
        >
          ← Studio
        </Link>
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] opacity-70">
            Engineering workspace · Carrefour
          </p>
          <h1 className="mt-0.5 text-lg font-semibold">{intersection.name}</h1>
          <p className="text-[0.7rem] opacity-70">
            {intersection.code} · {intersection.district || "—"} ·{" "}
            controller <span className="font-mono">{controllerLabel}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${toneStyles[tone]}`}
        >
          {controllerState}
        </span>
        <button
          type="button"
          onClick={toggle}
          className={`rounded-full border px-3 py-1 text-[0.7rem] font-semibold ${
            isDark
              ? "border-white/15 hover:border-white/30"
              : "border-black/15 hover:bg-white"
          }`}
        >
          {isDark ? "Mode clair" : "Mode sombre"}
        </button>
      </div>
    </header>
  );
}

function statusTone(
  intersection: EngineeringIntersectionRecord,
  connection?: string,
): "healthy" | "watch" | "critical" | "offline" {
  if (connection === "offline") return "offline";
  if (intersection.status === "critical" || intersection.incidents > 1)
    return "critical";
  if (
    intersection.status === "watch" ||
    intersection.incidents > 0 ||
    connection === "degraded"
  )
    return "watch";
  return "healthy";
}

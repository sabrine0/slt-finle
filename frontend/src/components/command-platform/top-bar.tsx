"use client";

import clsx from "clsx";

import type { DemoScenario } from "@/components/command-platform/demo/scenarios";
import { EnvBadge } from "@/components/command-platform/env-badge";
import { LiveClock } from "@/components/command-platform/live-clock";
import { useCommandTheme } from "@/components/command-platform/theme-context";
import type {
  BreadcrumbCrumb,
  SelectionPath,
} from "@/components/command-platform/types";
import type {
  ScenarioId,
  ScenarioOption,
  SystemMode,
  SystemState,
} from "@/types/command-platform";

interface TopBarProps {
  crumbs: BreadcrumbCrumb[];
  onSelectCrumb: (selection: SelectionPath) => void;
  systemMode: SystemMode;
  systemState: SystemState;
  scenarios: ScenarioOption[];
  scenarioId: ScenarioId;
  onScenarioChange: (id: ScenarioId) => void;
  actionPending: "run" | "stop" | null;
  onRunScenario: () => void;
  onStopSystem: () => void;
  socketState: "connecting" | "connected" | "offline";
  dataSource: "backend" | "fallback";
  snapshotTick: number;
  lastSnapshotAt?: string;
  soundEnabled: boolean;
  onToggleSound: () => void;
  demoRunning: boolean;
  onDemoStart: (scenarioId: DemoScenario["id"]) => void;
  onDemoStop: () => void;
}

const modeAccent: Record<SystemMode, string> = {
  real: "border-[#24546a] bg-[#0d1519] text-[#8ed2ef]",
  simulation: "border-[#4a3d62] bg-[#17121e] text-[#c9b7ff]",
};

const stateAccent: Record<SystemState, string> = {
  running: "border-[#1d4a34] bg-[#0d1913] text-[#a8eac2]",
  stopped: "border-[#5a1d1d] bg-[#180d0d] text-[#ff9a9a]",
};

const socketAccent: Record<TopBarProps["socketState"], string> = {
  connected: "bg-[#39d98a]",
  connecting: "bg-[#ffb547]",
  offline: "bg-[#ff5f5f]",
};

export function TopBar({
  crumbs,
  onSelectCrumb,
  systemMode,
  systemState,
  socketState,
  dataSource,
  snapshotTick,
  lastSnapshotAt,
  soundEnabled,
  onToggleSound,
}: TopBarProps) {
  return (
    <header className="flex flex-wrap items-start gap-2 border-b border-white/6 bg-[#070b0e]/92 px-3 py-2 backdrop-blur sm:gap-3 sm:px-4 sm:py-3 xl:flex-nowrap xl:items-center xl:gap-6 xl:px-6 xl:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 xl:min-w-[320px]">
        <nav
          aria-label="Selection path"
          className="flex min-w-0 flex-wrap items-center gap-2"
        >
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <div key={`${crumb.level}-${crumb.label}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectCrumb(crumb.selection)}
                  className={clsx(
                    "rounded-[8px] px-3 py-1.5 text-left transition duration-200",
                    isLast
                      ? "border border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
                      : "border border-transparent text-[#8fa39a] hover:-translate-y-px hover:border-white/12 hover:bg-white/5 hover:text-[#f1f6f2]",
                  )}
                >
                  <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.24em] opacity-70">
                    {toTypeLabel(crumb.level)}
                  </span>
                  <span className="mt-0.5 block text-[0.95rem] font-semibold">
                    {crumb.label}
                  </span>
                </button>
                {!isLast ? (
                  <span aria-hidden className="text-[#3e4a44] text-lg">
                    ›
                  </span>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5 sm:gap-2 xl:w-auto xl:justify-end">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 rounded-[12px] border border-white/8 bg-[#0b1014]/90 px-2 py-1.5 sm:px-3 sm:py-2">
          <EnvBadge />
          <CommandThemeToggle />
          <LiveClock lastSnapshotAt={lastSnapshotAt} />
        </div>

        <div className="flex items-center gap-2 rounded-[12px] border border-white/8 bg-[#0b1014] px-2 py-1.5 sm:px-3 sm:py-2">
          <span aria-hidden className="relative flex h-2 w-2">
            <span
              className={clsx(
                "absolute inset-0 rounded-full",
                socketAccent[socketState],
              )}
            />
            {socketState === "connected" ? (
              <span
                key={snapshotTick}
                className="stls-refresh-flash absolute inset-0 rounded-full bg-[#39d98a]"
              />
            ) : null}
          </span>
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#c3cdc6]">
            {socketState === "connected" ? "Live" : socketState}
          </span>
          <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[#6b7c74]">
            {dataSource === "backend" ? "backend" : "fallback"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 rounded-[12px] border border-white/8 bg-[#0b1014] px-1.5 py-1.5 sm:px-2 sm:py-2">
          <span
            className={clsx(
              "rounded-[10px] border px-2 py-1.5 text-[0.66rem] tracking-[0.16em] sm:px-3 sm:py-2 sm:text-[0.7rem] sm:tracking-[0.2em] font-semibold uppercase",
              modeAccent[systemMode],
            )}
          >
            {systemMode}
          </span>

          <span
            className={clsx(
              "rounded-[10px] border px-2 py-1.5 text-[0.66rem] tracking-[0.16em] sm:px-3 sm:py-2 sm:text-[0.7rem] sm:tracking-[0.2em] font-semibold uppercase",
              stateAccent[systemState],
            )}
          >
            {systemState}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? "Disable alert sound" : "Enable alert sound"}
          className={clsx(
            "grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-[10px] border transition duration-200 hover:-translate-y-px",
            soundEnabled
              ? "border-[#3c2e10] bg-[#14100a] text-[#ffb547]"
              : "border-white/10 bg-[#0b1014] text-[#6b7c74] hover:border-white/20 hover:text-[#c3cdc6]",
          )}
        >
          <span aria-hidden className="text-sm">
            {soundEnabled ? "♪" : "⨯"}
          </span>
        </button>
      </div>
    </header>
  );
}

function CommandThemeToggle() {
  const { theme, toggle } = useCommandTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Dark theme" : "Light theme"}
      className={clsx(
        "flex items-center gap-1 rounded-[10px] border px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.2em] transition",
        isLight
          ? "border-[#e8b56b] bg-[#fff4db] text-[#7a4400] hover:brightness-105"
          : "border-white/10 bg-[#0b1014] text-[#c3cdc6] hover:border-white/20 hover:text-[#edf3ee]",
      )}
    >
      <span aria-hidden className="text-[0.9rem] leading-none">
        {isLight ? "☀" : "☾"}
      </span>
      <span>{isLight ? "Light" : "Dark"}</span>
    </button>
  );
}

function toTypeLabel(level: BreadcrumbCrumb["level"]) {
  if (level === "country") return "Country";
  if (level === "region") return "Region";
  if (level === "city") return "City";
  if (level === "district") return "District";
  return "Intersection";
}

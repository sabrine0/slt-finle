"use client";

import clsx from "clsx";
import { useState } from "react";

import { ControlMode } from "@/components/studio/control-mode/control-mode";
import { DossierImportModal } from "@/components/studio/dossier/dossier-import-modal";
import type { EngineeringMode } from "@/components/studio/engineering-header";
import { IntersectionEditor } from "@/components/studio/intersection-editor/intersection-editor";
import { NetworkWorkspace } from "@/components/studio/network/network-workspace";
import type { IntersectionConfig } from "@/components/studio/state/types";
import type { StudioTab } from "@/components/studio/types";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";

interface EditorWorkspaceProps {
  tabs: StudioTab[];
  activeTabId: string;
  mode: EngineeringMode;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  /** Splash: create a blank intersection (generated id + empty config)
   *  and open it in a new tab. */
  onCreateBlankIntersection: () => void;
  /** Splash: commit a fully-assembled config (typically from the PDF
   *  import flow) into the store and open it in a new tab. */
  onCreateFromConfig: (config: IntersectionConfig) => void;
  /** Splash / network: open the carrefour network map tab. */
  onOpenNetwork: () => void;
  /** Network workspace -> open an intersection in the Workbench editor. */
  onOpenIntersection: (record: EngineeringIntersectionRecord) => void;
}

export function EditorWorkspace({
  tabs,
  activeTabId,
  mode,
  onActivateTab,
  onCloseTab,
  onCreateBlankIntersection,
  onCreateFromConfig,
  onOpenNetwork,
  onOpenIntersection,
}: EditorWorkspaceProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-0">
      {tabs.length > 0 ? (
        <div className="flex items-stretch border-b border-stroke-0 bg-surface-1">
          <ul className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <li
                  key={tab.id}
                  className={clsx(
                    "group relative flex shrink-0 items-center",
                    active
                      ? "border-b border-accent bg-surface-2"
                      : "border-b border-transparent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onActivateTab(tab.id)}
                    className={clsx(
                      "flex items-center gap-2 py-2 pl-3 pr-2 text-[0.78rem] transition",
                      active
                        ? "text-ink-0"
                        : "text-ink-2 hover:text-ink-1",
                    )}
                  >
                    <span aria-hidden className="text-[0.82rem] text-info-ink">
                      ◈
                    </span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className={clsx(
                      "mr-1.5 grid h-5 w-5 place-items-center rounded-[3px] text-[0.78rem] leading-none",
                      active
                        ? "text-ink-2 hover:bg-hover hover:text-ink-0"
                        : "text-transparent group-hover:text-ink-2 group-hover:hover:bg-hover group-hover:hover:text-ink-0",
                    )}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab && activeTab.kind === "intersection" && activeTab.intersectionId ? (
          mode === "control" ? (
            <ControlMode intersectionId={activeTab.intersectionId} />
          ) : (
            <IntersectionEditor intersectionId={activeTab.intersectionId} />
          )
        ) : activeTab && activeTab.kind === "network" ? (
          <NetworkWorkspace onOpenIntersection={onOpenIntersection} />
        ) : (
          <EngineeringSplash
            mode={mode}
            onCreateBlank={onCreateBlankIntersection}
            onCreateFromConfig={onCreateFromConfig}
            onOpenNetwork={onOpenNetwork}
          />
        )}
      </div>
    </div>
  );
}

function EngineeringSplash({
  mode,
  onCreateBlank,
  onCreateFromConfig,
  onOpenNetwork,
}: {
  mode: EngineeringMode;
  onCreateBlank: () => void;
  onCreateFromConfig: (config: IntersectionConfig) => void;
  onOpenNetwork: () => void;
}) {
  const isControl = mode === "control";
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="grid h-full place-items-center px-10">
      <div className="max-w-xl text-center">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-ink-3">
          STLS Studio · {isControl ? "Control" : "Engineering"}
        </p>
        <h2 className="mt-4 text-[1.4rem] font-semibold tracking-tight text-ink-0">
          Pick an intersection — or bring one in
        </h2>
        <p className="mt-2 text-[0.84rem] leading-6 text-ink-2">
          {isControl
            ? "Select an intersection from the project explorer. The operator console opens with a live diagram and piano-key controls."
            : "Select from the project explorer, or create a new intersection from scratch or from a GroupéRyX dossier PDF."}
        </p>

        {!isControl ? (
          <div className="mx-auto mt-6 flex max-w-md flex-wrap items-stretch justify-center gap-2">
            <button
              type="button"
              onClick={onCreateBlank}
              className="flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-[8px] border border-stroke-1 bg-surface-1 px-4 py-3 text-[0.84rem] font-semibold text-ink-1 transition hover:-translate-y-px hover:border-stroke-2 hover:text-ink-0"
            >
              <span aria-hidden className="text-[1.1rem] leading-none text-accent-ink">
                ＋
              </span>
              Create new intersection
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-[8px] border border-accent-stroke bg-gradient-to-b from-[var(--stls-accent)] to-[var(--stls-accent-ink)] px-4 py-3 text-[0.84rem] font-semibold text-accent-surface shadow-[0_3px_10px_rgba(255,181,71,0.22)] transition hover:-translate-y-px hover:brightness-110"
            >
              <span aria-hidden className="text-[1.1rem] leading-none">
                ⇪
              </span>
              Import dossier (PDF)
            </button>
            <button
              type="button"
              onClick={onOpenNetwork}
              className="flex min-w-[180px] flex-1 items-center justify-center gap-2 rounded-[8px] border border-stroke-1 bg-surface-1 px-4 py-3 text-[0.84rem] font-semibold text-ink-1 transition hover:-translate-y-px hover:border-stroke-2 hover:text-ink-0"
            >
              <span aria-hidden className="text-[1.1rem] leading-none text-info-ink">
                ◉
              </span>
              Open network map
            </button>
          </div>
        ) : null}

        <ul className="mt-6 space-y-1.5 text-left text-[0.78rem] text-ink-2">
          <Hint
            label="Engineering"
            body="Configure intersections — phases, conflicts, apply to runtime"
            muted={isControl}
          />
          <Hint
            label="Control"
            body="Live operator console — play the traffic lights like a piano"
            muted={!isControl}
          />
          <Hint label="Simulation" body="Local dry-run of plans (planned)" muted />
        </ul>
      </div>

      {/* Import modal mounted from the splash → CREATE flow (no target id
          supplied, so the parser's inferred id becomes the new carrefour
          code). */}
      <DossierImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={(config) => {
          onCreateFromConfig(config);
          setImportOpen(false);
        }}
      />
    </div>
  );
}

function Hint({
  label,
  body,
  muted = false,
}: {
  label: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-3 rounded-[6px] border border-stroke-0 bg-surface-1 px-3 py-2">
      <span
        className={clsx(
          "shrink-0 text-[0.62rem] font-semibold uppercase tracking-[0.22em]",
          muted ? "text-ink-3" : "text-accent-ink",
        )}
      >
        {label}
      </span>
      <span className={clsx(muted ? "text-ink-3" : "text-ink-1")}>
        {body}
      </span>
    </li>
  );
}

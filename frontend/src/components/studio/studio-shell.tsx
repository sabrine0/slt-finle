"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import { EditorWorkspace } from "@/components/studio/editor-workspace";
import {
  EngineeringHeader,
  type EngineeringMode,
} from "@/components/studio/engineering-header";
import { EngineeringControlPanel } from "@/components/studio/intersection-editor/engineering-control-panel";
import { OutputPanel } from "@/components/studio/output-panel";
import {
  StudioProjectProvider,
  useStudioMapCarrefours,
} from "@/components/studio/project-context";
import { ProjectExplorer } from "@/components/studio/project-explorer";
import { PropertiesPanel } from "@/components/studio/properties-panel";
import { StatusBar } from "@/components/studio/status-bar";
import {
  StudioStoreProvider,
  useStudioDispatch,
  useStudioIntersection,
} from "@/components/studio/state/store";
import type { IntersectionConfig } from "@/components/studio/state/types";
import {
  StudioThemeProvider,
  useStudioTheme,
} from "@/components/studio/theme/theme-provider";
import type { ExplorerNode, StudioTab } from "@/components/studio/types";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedView,
} from "@/types/traffic-graph";

export function StudioShell({
  intersections = [],
  graphCarrefours = [],
  graphLinks = [],
  initialTabKind,
}: {
  intersections?: EngineeringIntersectionRecord[];
  graphCarrefours?: TrafficGraphCarrefourSummary[];
  graphLinks?: TrafficGraphConnectedView[];
  initialTabKind?: "network";
}) {
  return (
    <StudioThemeProvider>
      <StudioProjectProvider
        intersections={intersections}
        graphCarrefours={graphCarrefours}
        graphLinks={graphLinks}
      >
        <StudioStoreProvider engineeringIntersections={intersections}>
          <StudioShellInner initialTabKind={initialTabKind} />
        </StudioStoreProvider>
      </StudioProjectProvider>
    </StudioThemeProvider>
  );
}

const SESSION_STORAGE_KEY = "stls.studio.session";
const PANELS_STORAGE_KEY = "stls.studio.panels";

interface PersistedSession {
  mode: EngineeringMode;
  tabs: StudioTab[];
  activeTabId: string;
}

interface PersistedPanels {
  explorerHidden: boolean;
  controlPanelHidden: boolean;
}

function StudioShellInner({
  initialTabKind,
}: {
  initialTabKind?: "network";
}) {
  const { theme } = useStudioTheme();
  const dispatch = useStudioDispatch();
  const mapCarrefours = useStudioMapCarrefours();
  const [mode, setMode] = useState<EngineeringMode>("engineering");
  const [selection, setSelection] = useState<ExplorerNode | undefined>();
  const [tabs, setTabs] = useState<StudioTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [explorerHidden, setExplorerHidden] = useState(false);
  const [controlPanelHidden, setControlPanelHidden] = useState(false);

  useEffect(() => {
    let parsed: Partial<PersistedPanels> | null = null;
    try {
      const raw = window.localStorage.getItem(PANELS_STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw) as Partial<PersistedPanels>;
    } catch {
      return;
    }
    if (!parsed) return;
    if (typeof parsed.explorerHidden === "boolean") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExplorerHidden(parsed.explorerHidden);
    }
    if (typeof parsed.controlPanelHidden === "boolean") {
      setControlPanelHidden(parsed.controlPanelHidden);
    }
  }, []);

  useEffect(() => {
    try {
      const payload: PersistedPanels = {
        explorerHidden,
        controlPanelHidden,
      };
      window.localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [explorerHidden, controlPanelHidden]);

  const toggleExplorer = useCallback(() => {
    setExplorerHidden((current) => !current);
  }, []);

  const toggleControlPanel = useCallback(() => {
    setControlPanelHidden((current) => !current);
  }, []);

  // Restore the previous session (mode, open tabs, active tab) so the
  // operator lands back on the intersection they were last working on —
  // an SEA/TOPS-style "remember last opened" behaviour.
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedSession>;
          if (
            parsed.mode === "engineering" ||
            parsed.mode === "control" ||
            parsed.mode === "simulation"
          ) {
            setMode(parsed.mode);
          }
          if (Array.isArray(parsed.tabs)) {
            setTabs(parsed.tabs);
          }
          if (typeof parsed.activeTabId === "string") {
            setActiveTabId(parsed.activeTabId);
          }
          const activeTab = parsed.tabs?.find(
            (tab) => tab.id === parsed.activeTabId,
          );
          if (
            activeTab &&
            activeTab.kind === "intersection" &&
            activeTab.intersectionId
          ) {
            setSelection({
              id: `intersection-${activeTab.intersectionId}`,
              kind: "intersection",
              label: activeTab.label,
              intersectionId: activeTab.intersectionId,
            });
          }
        }
      } catch {
        /* ignore — session restore is best-effort */
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistedSession = { mode, tabs, activeTabId };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [hydrated, mode, tabs, activeTabId]);

  useEffect(() => {
    if (!hydrated || initialTabKind !== "network") return;
    const frameId = window.requestAnimationFrame(() => {
      const tabId = "tab-network";
      setTabs((current) => {
        if (current.some((tab) => tab.id === tabId)) return current;
        return [
          ...current,
          {
            id: tabId,
            kind: "network" as const,
            label: "Network map",
            closable: true,
          },
        ];
      });
      setActiveTabId(tabId);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [hydrated, initialTabKind]);

  const openIntersectionTab = useCallback((node: ExplorerNode) => {
    if (node.kind !== "intersection" || !node.intersectionId) return;
    const tabId = `tab-intersection-${node.intersectionId}`;
    setTabs((current) => {
      if (current.some((tab) => tab.id === tabId)) return current;
      const newTab: StudioTab = {
        id: tabId,
        kind: "intersection",
        label: node.label,
        intersectionId: node.intersectionId,
        closable: true,
      };
      return [...current, newTab];
    });
    setActiveTabId(tabId);
  }, []);

  const handleActivateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // Register a new intersection config in the store and open it in a
  // tab.  Used by both CREATE-blank and IMPORT-from-PDF flows from the
  // splash screen.  If a tab already exists for the id we just re-focus
  // it so the operator isn't surprised by duplicates.
  const openAsTab = useCallback(
    (config: IntersectionConfig) => {
      dispatch({
        type: "replaceIntersection",
        intersectionId: config.id,
        config,
        markBaseline: true,
      });
      const tabId = `tab-intersection-${config.id}`;
      setTabs((current) => {
        if (current.some((tab) => tab.id === tabId)) return current;
        return [
          ...current,
          {
            id: tabId,
            kind: "intersection" as const,
            label: config.identity.name || config.id,
            intersectionId: config.id,
            closable: true,
          },
        ];
      });
      setActiveTabId(tabId);
      setSelection({
        id: `intersection-${config.id}`,
        kind: "intersection",
        label: config.identity.name || config.id,
        intersectionId: config.id,
      });
    },
    [dispatch],
  );

  // When a zone proposal is clicked in the tree we materialise a
  // default IntersectionConfig from the locally-saved proposal and
  // drop it into the store via openAsTab. The tab then behaves
  // exactly like a real-intersection tab — Engineering / Control
  // modes both work.
  const openProposalAsTab = useCallback(
    (node: ExplorerNode) => {
      if (!node.proposalId) return;
      interface StoredProposal {
        id: string;
        code: string;
        name: string;
        street?: string;
        centre?: { lat: number; lng: number };
      }
      let proposal: StoredProposal | null = null;
      try {
        const raw = window.localStorage.getItem("stls.zone-builder.proposals");
        if (raw) {
          const parsed = JSON.parse(raw) as StoredProposal[];
          proposal =
            parsed?.find?.((p) => p?.id === node.proposalId) ?? null;
        }
      } catch {
        return;
      }
      if (!proposal) return;
      const configId =
        proposal.code || `PROP-${proposal.id.slice(-6).toUpperCase()}`;
      const config: IntersectionConfig = {
        id: configId,
        identity: {
          name: proposal.name || configId,
          district: "",
          address: proposal.street ?? "",
          location: proposal.centre ?? { lat: 0, lng: 0 },
        },
        controllerId: `CTRL-${configId}`,
        approaches: [],
        signalGroups: [],
        detectors: [],
        phases: [],
        stages: [],
        conflicts: [],
      };
      openAsTab(config);
    },
    [openAsTab],
  );

  const handleSelectNode = useCallback(
    (node: ExplorerNode) => {
      setSelection(node);
      if (node.kind === "intersection" && node.intersectionId) {
        // Map-created carrefours aren't in the studio-store seed —
        // synthesize a minimal IntersectionConfig so the Workbench tab
        // has data to edit.  Backend intersections are already seeded
        // by StudioStoreProvider.
        if (node.isMapCarrefour) {
          const carrefour = mapCarrefours.find(
            (entry) => entry.id === node.intersectionId,
          );
          if (carrefour) {
            openAsTab({
              id: carrefour.id,
              identity: {
                name: carrefour.name,
                district: carrefour.district ?? carrefour.city ?? "",
                address: carrefour.address ?? "",
                location: carrefour.location,
              },
              controllerId: `CTRL-${carrefour.code}`,
              approaches: [],
              signalGroups: [],
              detectors: [],
              phases: [],
              stages: [],
              conflicts: [],
            });
            return;
          }
        }
        openIntersectionTab(node);
      } else if (node.kind === "proposal") {
        openProposalAsTab(node);
      }
    },
    [mapCarrefours, openAsTab, openIntersectionTab, openProposalAsTab],
  );

  const handleCreateBlankIntersection = useCallback(() => {
    const suggestion =
      typeof window !== "undefined"
        ? window.prompt(
            "Nom du nouveau carrefour ?",
            "Nouveau carrefour",
          )
        : "Nouveau carrefour";
    if (!suggestion) return; // operator cancelled
    const name = suggestion.trim() || "Nouveau carrefour";
    const id = `INT-NEW-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const config: IntersectionConfig = {
      id,
      identity: {
        name,
        district: "",
        address: "",
        location: { lat: 0, lng: 0 },
      },
      controllerId: `CTRL-${id}`,
      approaches: [],
      signalGroups: [],
      detectors: [],
      phases: [],
      stages: [],
      conflicts: [],
    };
    openAsTab(config);
  }, [openAsTab]);

  const handleCreateFromConfig = useCallback(
    (config: IntersectionConfig) => {
      openAsTab(config);
    },
    [openAsTab],
  );

  const handleOpenNetwork = useCallback(() => {
    const tabId = "tab-network";
    setTabs((current) => {
      if (current.some((tab) => tab.id === tabId)) return current;
      return [
        ...current,
        {
          id: tabId,
          kind: "network" as const,
          label: "Network map",
          closable: true,
        },
      ];
    });
    setActiveTabId(tabId);
  }, []);

  // When the Network workspace opens a carrefour, materialise a
  // minimal IntersectionConfig in the store (so the Workbench tab has
  // data to edit) and register the tab.  Backend intersections come
  // pre-hydrated by the store seed, so we re-use openAsTab for both.
  const handleOpenIntersectionRecord = useCallback(
    (record: EngineeringIntersectionRecord) => {
      const config: IntersectionConfig = {
        id: record.id,
        identity: {
          name: record.name,
          district: record.district ?? "",
          address: record.address ?? "",
          location: {
            lat: Number(record.latitude),
            lng: Number(record.longitude),
          },
        },
        controllerId:
          record.controllers?.[0]?.code ?? `CTRL-${record.code}`,
        approaches: [],
        signalGroups: [],
        detectors: [],
        phases: [],
        stages: [],
        conflicts: [],
      };
      openAsTab(config);
    },
    [openAsTab],
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((current) => current.filter((tab) => tab.id !== tabId));
      setActiveTabId((current) => {
        if (current !== tabId) return current;
        const remaining = tabs.filter((tab) => tab.id !== tabId);
        return remaining[remaining.length - 1]?.id ?? "";
      });
    },
    [tabs],
  );

  const selectedLabel =
    selection?.kind === "intersection"
      ? `${selection.label}${selection.hint ? " · " + selection.hint : ""}`
      : selection?.label;

  const activeIntersectionId =
    selection?.kind === "intersection" ? selection.intersectionId : undefined;

  return (
    <div
      data-theme={theme}
      className="flex h-screen min-h-0 flex-col bg-surface-0 text-ink-1"
    >
      <EngineeringHeader
        mode={mode}
        onChange={setMode}
        selectionLabel={selectedLabel}
        explorerHidden={explorerHidden}
        onToggleExplorer={toggleExplorer}
        controlPanelHidden={mode === "control" ? undefined : controlPanelHidden}
        onToggleControlPanel={
          mode === "control" ? undefined : toggleControlPanel
        }
      />

      <div
        className={clsx(
          "grid flex-1 min-h-0",
          computeGridColumns(mode, explorerHidden, controlPanelHidden),
        )}
      >
        {!explorerHidden ? (
          <ProjectExplorer
            selectedNodeId={selection?.id}
            onSelectNode={handleSelectNode}
            onOpenNetwork={handleOpenNetwork}
          />
        ) : null}

        <div className="flex min-h-0 flex-col">
          <EditorWorkspace
            tabs={tabs}
            activeTabId={activeTabId}
            mode={mode}
            onActivateTab={handleActivateTab}
            onCloseTab={handleCloseTab}
            onCreateBlankIntersection={handleCreateBlankIntersection}
            onCreateFromConfig={handleCreateFromConfig}
            onOpenNetwork={handleOpenNetwork}
            onOpenIntersection={handleOpenIntersectionRecord}
          />
          <OutputPanel
            collapsed={outputCollapsed}
            onToggleCollapsed={() => setOutputCollapsed((v) => !v)}
          />
        </div>

        {mode === "control" || controlPanelHidden ? null : (
          <aside className="flex min-h-0 flex-col border-l border-stroke-0 bg-surface-1">
            {activeIntersectionId ? (
              <EngineeringRightRail
                intersectionId={activeIntersectionId}
                selection={selection}
              />
            ) : (
              <PropertiesPanel selection={selection} />
            )}
          </aside>
        )}
      </div>

      <StatusBar
        projectName="Casablanca-Settat"
        selectedLabel={selectedLabel}
        modeTag="Online"
      />
    </div>
  );
}

function computeGridColumns(
  mode: EngineeringMode,
  explorerHidden: boolean,
  controlPanelHidden: boolean,
): string {
  const rightVisible = mode !== "control" && !controlPanelHidden;
  const leftVisible = !explorerHidden;

  // Static variants so Tailwind JIT generates the classes:
  //   grid-cols-[280px_minmax(0,1fr)_320px]
  //   grid-cols-[280px_minmax(0,1fr)]
  //   grid-cols-[minmax(0,1fr)_320px]
  //   grid-cols-[minmax(0,1fr)]
  if (leftVisible && rightVisible) {
    return "grid-cols-[280px_minmax(0,1fr)_320px]";
  }
  if (leftVisible && !rightVisible) {
    return "grid-cols-[280px_minmax(0,1fr)]";
  }
  if (!leftVisible && rightVisible) {
    return "grid-cols-[minmax(0,1fr)_320px]";
  }
  return "grid-cols-[minmax(0,1fr)]";
}

function EngineeringRightRail({
  intersectionId,
  selection,
}: {
  intersectionId: string;
  selection?: ExplorerNode;
}) {
  const config = useStudioIntersection(intersectionId);
  if (!config) {
    return <PropertiesPanel selection={selection} />;
  }
  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-stroke-0 px-3 py-2">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Control panel
          </p>
          <p className="mt-0.5 text-[0.78rem] font-medium text-ink-1">
            {config.identity.name}
          </p>
        </div>
      </header>
      <EngineeringControlPanel config={config} />
    </>
  );
}

"use client";

import { io } from "socket.io-client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertsFeed } from "@/components/command-platform/alerts-feed";
import { CommandMap } from "@/components/command-platform/command-map";
import { ControllerNetworkGraph } from "@/components/command-platform/controller-network-graph";
import { DemoControlBar } from "@/components/command-platform/demo/demo-control-bar";
import { NarrativeOverlay } from "@/components/command-platform/demo/narrative-overlay";
import type {
  DemoContext,
  IntersectionPatch,
} from "@/components/command-platform/demo/scenarios";
import { useDemoPlayer } from "@/components/command-platform/demo/use-demo-player";
import { KpiHeroCard } from "@/components/command-platform/kpi-hero-card";
import {
  NavRail,
  type NavRailSection,
} from "@/components/command-platform/nav-rail";
import type {
  CommandNetworkLink,
  CommandNetworkNode,
  CommandPredictionHeatPoint,
  CommandPredictionInsight,
  CommandNetworkPredictionSummary,
} from "@/components/command-platform/network-types";
import type { AiApplyRequest } from "@/components/command-platform/ai-assist-panel";
import {
  OverrideReasonModal,
  type OverrideModalRequest,
  type OverrideModalResult,
} from "@/components/command-platform/override-reason-modal";
import { SelectedAreaPanel } from "@/components/command-platform/selected-area-panel";
import {
  CommandThemeProvider,
  useCommandTheme,
} from "@/components/command-platform/theme-context";
import { TopBar } from "@/components/command-platform/top-bar";
import type { SelectionPath } from "@/components/command-platform/types";
import { SegmentedControl, StatusBadge } from "@/components/ui";
import { useCriticalAlertSound } from "@/components/command-platform/use-critical-alert-sound";
import {
  applySelectionToCrumbIntersectionLabel,
  buildBreadcrumb,
  buildRegionMarkers,
  buildRegionPolygons,
  buildSummary,
  defaultSelectionForSnapshot,
  selectionCenterAndZoom,
} from "@/lib/geography-rollup";
import {
  fetchBackendCities,
  fetchBackendRoadLinks,
  fetchBackendZones,
  fetchCityPredictionSnapshot,
  fetchCommandPlatformBootstrap,
  fetchTrafficAgentLayers,
  fetchTrafficGraphIntersections,
  fetchZonePredictionSnapshot,
  getSocketConnectionConfig,
  logOverride,
  runTrafficPrediction,
  runScenario,
  setIntersectionForcedGreen,
  setIntersectionMode,
  setIntersectionOverride,
  stopSystem,
} from "@/lib/command-platform-api";
import {
  derivePredictionFlowState,
  deriveLinkFlowState,
  resolveEquipmentStatus,
  statusToneToFlow,
} from "@/lib/command-platform-format";
import { fallbackCommandPlatformSnapshot } from "@/lib/mock-command-platform-data";
import type {
  AlertSnapshot,
  CommandPlatformSnapshot,
  ConnectionState,
  IntersectionHealth,
  IntersectionMode,
  IntersectionSnapshot,
  OperatorDirection,
  ScenarioId,
  TrafficFlowState,
} from "@/types/command-platform";
import type {
  BackendCityView,
  BackendRoadLinkView,
  BackendZoneView,
} from "@/types/backend-topology";
import type { PredictionRunResult } from "@/types/prediction";
import type {
  TrafficGraphCarrefourSummary,
  TrafficGraphConnectedRelationKind,
} from "@/types/traffic-graph";

const RELATION_KINDS: TrafficGraphConnectedRelationKind[] = [
  "upstream",
  "downstream",
  "corridor",
  "parallel",
];

function normalizeRelationKind(value: string): TrafficGraphConnectedRelationKind {
  return (RELATION_KINDS as readonly string[]).includes(value)
    ? (value as TrafficGraphConnectedRelationKind)
    : "upstream";
}

const ZONE_TONE_RANK: Record<BackendZoneView["tone"], number> = {
  critical: 3,
  watch: 2,
  healthy: 1,
};

const EQUIPMENT_STATUSES: ReadonlyArray<
  "Équipé en service" | "Équipé hors service" | "Non régulé" | "Non spécifié"
> = ["Équipé en service", "Équipé hors service", "Non régulé", "Non spécifié"];

function normalizeEquipmentStatus(
  value: string,
): "Équipé en service" | "Équipé hors service" | "Non régulé" | "Non spécifié" {
  return (EQUIPMENT_STATUSES as readonly string[]).includes(value)
    ? (value as "Équipé en service" | "Équipé hors service" | "Non régulé" | "Non spécifié")
    : "Non spécifié";
}

function selectWorstZoneId(zones: BackendZoneView[]): string | undefined {
  if (zones.length === 0) return undefined;
  let worst: BackendZoneView | undefined;
  for (const zone of zones) {
    if (
      !worst ||
      ZONE_TONE_RANK[zone.tone] > ZONE_TONE_RANK[worst.tone] ||
      (ZONE_TONE_RANK[zone.tone] === ZONE_TONE_RANK[worst.tone] &&
        (zone.incidentCount > worst.incidentCount ||
          (zone.incidentCount === worst.incidentCount &&
            zone.averageDelaySeconds > worst.averageDelaySeconds)))
    ) {
      worst = zone;
    }
  }
  return worst?.id;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function offsetPoint(
  center: { lat: number; lng: number },
  latOffset: number,
  lngOffset: number,
) {
  return {
    lat: center.lat + latOffset,
    lng: center.lng + lngOffset,
  };
}

function buildInsightSignals({
  now,
  cityName,
  center,
  hotspots,
}: {
  now: Date;
  cityName: string;
  center: { lat: number; lng: number };
  hotspots: CommandPredictionHeatPoint[];
}): CommandPredictionInsight[] {
  const insights: CommandPredictionInsight[] = [];
  const hour = now.getHours();
  const day = now.getDay();
  const cityKey = cityName.toLowerCase();
  const topHotspot = hotspots[0];

  if (topHotspot) {
    insights.push({
      id: `hotspot-${topHotspot.intersectionId}`,
      emoji: topHotspot.trafficState === "congestion" ? "🚧" : "🚦",
      title: `${topHotspot.label} sous surveillance`,
      summary: `Le modèle H+15 place ${topHotspot.label} parmi les points les plus chargés de ${cityName}.`,
      detail: `Prévision: saturation ${topHotspot.saturationForecast.toFixed(2)}, file ${Math.round(topHotspot.queueLengthForecast)} m, délai ${Math.round(topHotspot.delaySecondsForecast)} s. Cette explication vient des métriques de prédiction STLS.`,
      location: topHotspot.location,
      trafficState: topHotspot.trafficState,
    });
  }

  if (day >= 1 && day <= 5 && hour >= 7 && hour < 10) {
    insights.push({
      id: "commute-morning",
      emoji: "💼",
      title: "Trajet du matin",
      summary: `Le trafic est poussé par les déplacements domicile-travail autour de ${cityName}.`,
      detail: "Signal heuristique: en semaine, les flux du matin augmentent la demande sur les axes d’entrée, les accès centres-villes et les nœuds proches des zones d’emploi.",
      location: offsetPoint(center, 0.02, -0.02),
      trafficState: topHotspot?.trafficState ?? "pressure",
    });
  }

  if (day >= 1 && day <= 5 && hour >= 16 && hour < 20) {
    insights.push({
      id: "commute-evening",
      emoji: "🏁",
      title: "Retour du soir",
      summary: `Le système anticipe un report de charge sur les sorties de ${cityName}.`,
      detail: "Signal heuristique: la plage 16h–20h augmente en général les retours domicile, les déposes scolaires et les mouvements d’échange entre corridors.",
      location: offsetPoint(center, -0.02, 0.018),
      trafficState: topHotspot?.trafficState ?? "pressure",
    });
  }

  if (
    (cityKey.includes("casablanca") || cityKey.includes("rabat")) &&
    ((day === 5 || day === 6) || hour >= 18) &&
    hour < 23
  ) {
    insights.push({
      id: "event-watch",
      emoji: "⚽",
      title: "Veille événement / match",
      summary: `${cityName} peut voir une hausse de charge autour des grands axes en soirée d’événement.`,
      detail: "Ceci est un signal prédictif heuristique. Il représente un comportement de type match/événement sportif dans Casablanca ou Rabat. Connecter plus tard un calendrier d’événements réel permettra d’afficher les équipes, le stade et l’horaire exact.",
      location: offsetPoint(center, 0.012, 0.022),
      trafficState:
        topHotspot?.trafficState === "congestion"
          ? "congestion"
          : "pressure",
    });
  }

  return insights;
}

export function CommandPlatform() {
  return (
    <CommandThemeProvider>
      <CommandPlatformInner />
    </CommandThemeProvider>
  );
}

function CommandPlatformInner() {
  const { theme } = useCommandTheme();
  const [snapshot, setSnapshot] = useState<CommandPlatformSnapshot>(
    fallbackCommandPlatformSnapshot,
  );
  const [selection, setSelection] = useState<SelectionPath>(() =>
    defaultSelectionForSnapshot(fallbackCommandPlatformSnapshot),
  );
  const [scenarioId, setScenarioId] = useState<ScenarioId>(
    fallbackCommandPlatformSnapshot.metrics.activeScenario,
  );
  const [socketState, setSocketState] = useState<
    "connecting" | "connected" | "offline"
  >("connecting");
  const [dataSource, setDataSource] = useState<"backend" | "fallback">(
    "fallback",
  );
  const [actionPending, setActionPending] = useState<"run" | "stop" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshotTick, setSnapshotTick] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [surfaceView, setSurfaceView] = useState<"map" | "graph">("map");
  const [mapLayerMode, setMapLayerMode] = useState<"controllers" | "heatmap">(
    "controllers",
  );
  const [railSection, setRailSection] = useState<NavRailSection>("command");
  const [graphCarrefours, setGraphCarrefours] = useState<
    TrafficGraphCarrefourSummary[]
  >([]);
  const [backendCities, setBackendCities] = useState<BackendCityView[]>([]);
  const [backendZones, setBackendZones] = useState<BackendZoneView[]>([]);
  const [roadLinks, setRoadLinks] = useState<BackendRoadLinkView[]>([]);
  const [graphState, setGraphState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [selectedPrediction, setSelectedPrediction] =
    useState<PredictionRunResult | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [networkPrediction, setNetworkPrediction] = useState<
    CommandNetworkPredictionSummary[]
  >([]);
  const [networkPredictionLoading, setNetworkPredictionLoading] =
    useState(false);
  // Heatmap + anticipation layers produced by the backend agents
  // (traffic-heatmap, traffic-anticipation). Empty when the backend is
  // unavailable — the client-side heuristics then take over.
  const [backendHeatPoints, setBackendHeatPoints] = useState<
    CommandPredictionHeatPoint[]
  >([]);
  const [backendHeatSegments, setBackendHeatSegments] = useState<
    Array<{
      id: string;
      path: { lat: number; lng: number }[];
      state: "smooth" | "pressure" | "congestion";
      intensity: number;
    }>
  >([]);
  const [backendInsights, setBackendInsights] = useState<
    CommandPredictionInsight[]
  >([]);

  const applySnapshot = useCallback((nextSnapshot: CommandPlatformSnapshot) => {
    setSnapshot(nextSnapshot);
    setScenarioId(nextSnapshot.metrics.activeScenario);
    setSnapshotTick((current) => current + 1);
    setSelection((currentSelection) => {
      if (currentSelection.level === "intersection") {
        const stillExists = nextSnapshot.intersections.some(
          (intersection) => intersection.id === currentSelection.intersectionId,
        );
        if (!stillExists) {
          return defaultSelectionForSnapshot(nextSnapshot);
        }
      }
      return currentSelection;
    });
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("stls-sound-enabled");
    if (stored === "true") setSoundEnabled(true);
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("stls-sound-enabled", String(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadBootstrap = async () => {
      try {
        const nextSnapshot = await fetchCommandPlatformBootstrap();

        if (cancelled) {
          return;
        }

        applySnapshot(nextSnapshot);
        setDataSource("backend");
        setActionError(null);
      } catch {
        if (!cancelled) {
          setDataSource("fallback");
        }
      }
    };

    void loadBootstrap();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;

    const loadGraph = async () => {
      try {
        const [nextCities, nextCarrefours] = await Promise.all([
          fetchBackendCities(),
          fetchTrafficGraphIntersections(),
        ]);
        if (cancelled) return;
        setBackendCities(nextCities);
        setGraphCarrefours(nextCarrefours);
        setGraphState("ready");
      } catch {
        if (cancelled) return;
        setBackendCities([]);
        setGraphCarrefours([]);
        setRoadLinks([]);
        setGraphState("error");
      }
    };

    void loadGraph();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadZones = async () => {
      if (!selection.cityId) {
        setBackendZones([]);
        return;
      }

      try {
        const nextZones = await fetchBackendZones(selection.cityId);
        if (cancelled) return;
        setBackendZones(nextZones);
      } catch {
        if (!cancelled) {
          setBackendZones([]);
        }
      }
    };

    void loadZones();

    return () => {
      cancelled = true;
    };
  }, [selection.cityId]);

  useEffect(() => {
    let cancelled = false;

    const loadRoadLinks = async () => {
      const shouldScopeLinks =
        selection.level === "city" ||
        selection.level === "district" ||
        selection.level === "intersection";

      if (!shouldScopeLinks || !selection.cityId) {
        setRoadLinks([]);
        return;
      }

      try {
        const nextRoadLinks = await fetchBackendRoadLinks(
          selection.cityId,
          selection.level === "district" ? selection.districtId : undefined,
        );
        if (cancelled) return;
        setRoadLinks(nextRoadLinks);
      } catch {
        if (!cancelled) {
          setRoadLinks([]);
        }
      }
    };

    void loadRoadLinks();

    return () => {
      cancelled = true;
    };
  }, [selection.cityId, selection.districtId, selection.level]);

  useEffect(() => {
    const socketConfig = getSocketConnectionConfig();
    const socket = io(socketConfig.url, {
      path: socketConfig.path,
      transports: socketConfig.transports,
      timeout: 3000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      setSocketState("connected");
      setDataSource("backend");
    });

    socket.on("disconnect", () => {
      setSocketState("offline");
    });

    socket.on("connect_error", () => {
      setSocketState("offline");
    });

    socket.on("traffic.snapshot", (nextSnapshot: CommandPlatformSnapshot) => {
      applySnapshot(nextSnapshot);
      setDataSource("backend");
    });

    return () => {
      socket.close();
    };
  }, [applySnapshot]);

  const handleRunScenario = useCallback(async () => {
    setActionPending("run");
    setActionError(null);

    try {
      const nextSnapshot = await runScenario(scenarioId);
      applySnapshot(nextSnapshot);
      setDataSource("backend");
    } catch {
      setActionError("Backend unavailable. Scenario command was not applied.");
    } finally {
      setActionPending(null);
    }
  }, [applySnapshot, scenarioId]);

  const handleStopSystem = useCallback(async () => {
    setActionPending("stop");
    setActionError(null);

    try {
      const nextSnapshot = await stopSystem();
      applySnapshot(nextSnapshot);
      setDataSource("backend");
    } catch {
      setActionError("Backend unavailable. Stop command was not applied.");
    } finally {
      setActionPending(null);
    }
  }, [applySnapshot]);

  const [flashIntersectionId, setFlashIntersectionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!flashIntersectionId) return;
    const id = setTimeout(() => setFlashIntersectionId(null), 1400);
    return () => clearTimeout(id);
  }, [flashIntersectionId]);

  const flashAfterCommand = useCallback((intersectionId: string) => {
    setFlashIntersectionId(null);
    setTimeout(() => setFlashIntersectionId(intersectionId), 10);
  }, []);

  const [overrideRequest, setOverrideRequest] =
    useState<OverrideModalRequest | null>(null);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideExecutor, setOverrideExecutor] = useState<
    | ((result: OverrideModalResult) => Promise<void>)
    | null
  >(null);

  const logReleaseQuietly = useCallback(
    async (
      intersectionCode: string,
      reason: "override_release" | "mode_release" | "forced_green_release",
    ) => {
      try {
        await logOverride(intersectionCode, {
          action: "release",
          reasonCode: "other",
          note: reason,
        });
      } catch {
        /* release logging is best-effort */
      }
    },
    [],
  );

  const handleSetOverride = useCallback(
    async (intersectionId: string, engaged: boolean) => {
      if (!engaged) {
        const nextSnapshot = await setIntersectionOverride(intersectionId, false);
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
        void logReleaseQuietly(intersectionId, "override_release");
        return;
      }

      setOverrideRequest({
        intersectionCode: intersectionId,
        intersectionLabel: intersectionId,
        action: "force_green",
        actionLabel: "Engage operator override",
        detail: "Intersection will follow operator command",
        supportsDuration: true,
      });
      setOverrideExecutor(() => async (result: OverrideModalResult) => {
        await logOverride(intersectionId, {
          action: "force_green",
          reasonCode: result.reasonCode,
          note: result.note || undefined,
          durationSeconds: result.durationSeconds ?? undefined,
        });
        const nextSnapshot = await setIntersectionOverride(intersectionId, true);
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
      });
    },
    [applySnapshot, flashAfterCommand, logReleaseQuietly],
  );

  const handleSetForcedGreen = useCallback(
    async (intersectionId: string, direction: OperatorDirection | null) => {
      if (direction == null) {
        const nextSnapshot = await setIntersectionForcedGreen(
          intersectionId,
          null,
        );
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
        void logReleaseQuietly(intersectionId, "forced_green_release");
        return;
      }

      setOverrideRequest({
        intersectionCode: intersectionId,
        intersectionLabel: intersectionId,
        action: "force_green",
        actionLabel: `Force green — ${direction}`,
        detail: `Approach ${direction} will hold green until released`,
        targetReference: direction,
        supportsDuration: true,
      });
      setOverrideExecutor(() => async (result: OverrideModalResult) => {
        await logOverride(intersectionId, {
          action: "force_green",
          reasonCode: result.reasonCode,
          note: result.note || undefined,
          durationSeconds: result.durationSeconds ?? undefined,
          targetReference: direction,
        });
        const nextSnapshot = await setIntersectionForcedGreen(
          intersectionId,
          direction,
        );
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
      });
    },
    [applySnapshot, flashAfterCommand, logReleaseQuietly],
  );

  const handleSetMode = useCallback(
    async (
      intersectionId: string,
      mode: IntersectionMode,
      confirmed: boolean,
    ) => {
      const isReleaseMode = mode === "adaptive" || mode === "fixed";
      if (isReleaseMode) {
        const nextSnapshot = await setIntersectionMode(
          intersectionId,
          mode,
          confirmed,
        );
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
        void logReleaseQuietly(intersectionId, "mode_release");
        return;
      }

      setOverrideRequest({
        intersectionCode: intersectionId,
        intersectionLabel: intersectionId,
        action: mode === "emergency" ? "emergency" : "mode_change",
        actionLabel: `Mode change → ${mode}`,
        detail: `Intersection will switch to ${mode} mode`,
        targetReference: mode,
        supportsDuration: false,
      });
      setOverrideExecutor(() => async (result: OverrideModalResult) => {
        await logOverride(intersectionId, {
          action: mode === "emergency" ? "emergency" : "mode_change",
          reasonCode: result.reasonCode,
          note: result.note || undefined,
          targetReference: mode,
        });
        const nextSnapshot = await setIntersectionMode(
          intersectionId,
          mode,
          confirmed,
        );
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionId);
      });
    },
    [applySnapshot, flashAfterCommand, logReleaseQuietly],
  );

  const handleOverrideConfirm = useCallback(
    async (result: OverrideModalResult) => {
      if (!overrideExecutor) {
        setOverrideRequest(null);
        return;
      }
      setOverrideSubmitting(true);
      try {
        await overrideExecutor(result);
        setOverrideRequest(null);
        setOverrideExecutor(null);
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : "Backend rejected the override command.";
        setActionError(detail);
      } finally {
        setOverrideSubmitting(false);
      }
    },
    [overrideExecutor],
  );

  const handleOverrideCancel = useCallback(() => {
    if (overrideSubmitting) return;
    setOverrideRequest(null);
    setOverrideExecutor(null);
  }, [overrideSubmitting]);

  // AI Assist → existing reason-coded override flow. AI never applies
  // a command itself; this just primes the same modal operators already
  // use, with the recommendation as context. On confirm we engage the
  // generic operator override so the operator can drive the rest
  // manually (force-green direction / phase via the control panel).
  const handleAiRequestApply = useCallback(
    (request: AiApplyRequest) => {
      const { intersectionCode, recommendation } = request;

      const actionVerb =
        recommendation.action === "release"
          ? "Release AI-suggested override"
          : `Apply AI suggestion — ${recommendation.action.replace("_", " ")}`;

      setOverrideRequest({
        intersectionCode,
        intersectionLabel: intersectionCode,
        action: recommendation.action === "release" ? "release" : "force_green",
        actionLabel: actionVerb,
        detail: recommendation.reason,
        targetReference: recommendation.targetPhaseId ?? undefined,
        supportsDuration: recommendation.durationSeconds != null,
      });
      setOverrideExecutor(() => async (result: OverrideModalResult) => {
        // Log the AI-originated intent through the existing override
        // audit endpoint first, then engage/release the operator
        // override so the operator can see the change on the map.
        const note = result.note
          ? `${result.note} · AI: ${recommendation.reason}`
          : `AI: ${recommendation.reason}`;
        await logOverride(intersectionCode, {
          action:
            recommendation.action === "release" ? "release" : "force_green",
          reasonCode: result.reasonCode,
          note,
          durationSeconds: result.durationSeconds ?? undefined,
          targetReference: recommendation.targetPhaseId ?? undefined,
        });
        const engaged = recommendation.action !== "release";
        const nextSnapshot = await setIntersectionOverride(
          intersectionCode,
          engaged,
        );
        applySnapshot(nextSnapshot);
        setDataSource("backend");
        flashAfterCommand(intersectionCode);
      });
    },
    [applySnapshot, flashAfterCommand],
  );

  const [demoAlerts, setDemoAlerts] = useState<AlertSnapshot[]>([]);
  const [demoPatches, setDemoPatches] = useState<Record<string, IntersectionPatch>>({});

  const addDemoAlert = useCallback<DemoContext["addDemoAlert"]>((alert) => {
    const stamped: AlertSnapshot = {
      id:
        alert.id ??
        `demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
      timestamp: new Date().toISOString(),
    };
    setDemoAlerts((current) => [stamped, ...current].slice(0, 10));
  }, []);

  const patchIntersectionDemo = useCallback<DemoContext["patchIntersection"]>(
    (intersectionId, patch) => {
      setDemoPatches((current) => ({
        ...current,
        [intersectionId]: { ...(current[intersectionId] ?? {}), ...patch },
      }));
    },
    [],
  );

  const clearDemoOverrides = useCallback(() => {
    setDemoAlerts([]);
    setDemoPatches({});
  }, []);

  const demoContext = useMemo<DemoContext>(
    () => ({
      setSelection,
      setScenarioId,
      addDemoAlert,
      patchIntersection: patchIntersectionDemo,
      flashIntersection: (intersectionId: string) => {
        setFlashIntersectionId(null);
        window.setTimeout(() => setFlashIntersectionId(intersectionId), 10);
      },
      clearDemoOverrides,
    }),
    [addDemoAlert, clearDemoOverrides, patchIntersectionDemo],
  );

  const demoPlayer = useDemoPlayer(demoContext);

  const patchedSnapshot = useMemo<CommandPlatformSnapshot>(() => {
    if (Object.keys(demoPatches).length === 0) return snapshot;
    return {
      ...snapshot,
      intersections: snapshot.intersections.map((intersection) => {
        const patch = demoPatches[intersection.id];
        if (!patch) return intersection;
        return { ...intersection, ...patch };
      }),
    };
  }, [demoPatches, snapshot]);

  const mergedAlerts = useMemo<AlertSnapshot[]>(() => {
    if (demoAlerts.length === 0) return snapshot.alerts;
    return [...demoAlerts, ...snapshot.alerts].slice(0, 12);
  }, [demoAlerts, snapshot.alerts]);

  useCriticalAlertSound(mergedAlerts, soundEnabled);

  const selectedIntersection = useMemo(() => {
    if (selection.level !== "intersection" || !selection.intersectionId) {
      return undefined;
    }
    return patchedSnapshot.intersections.find(
      (intersection) => intersection.id === selection.intersectionId,
    );
  }, [selection, patchedSnapshot.intersections]);

  const selectedHardware = useMemo(() => {
    if (!selectedIntersection) return undefined;
    return snapshot.hardware.find(
      (hardware) => hardware.intersectionId === selectedIntersection.id,
    );
  }, [selectedIntersection, snapshot.hardware]);

  const graphCarrefourByIntersectionCode = useMemo(() => {
    const map = new Map<string, TrafficGraphCarrefourSummary>();
    for (const entry of graphCarrefours) {
      if (entry.engineeringIntersectionCode) {
        map.set(entry.engineeringIntersectionCode, entry);
      }
    }
    return map;
  }, [graphCarrefours]);

  const graphCarrefourByControllerCode = useMemo(() => {
    const map = new Map<string, TrafficGraphCarrefourSummary>();
    for (const entry of graphCarrefours) {
      if (entry.primaryControllerCode) {
        map.set(entry.primaryControllerCode, entry);
      }
    }
    return map;
  }, [graphCarrefours]);

  const cityCatalogById = useMemo(
    () => new Map(backendCities.map((city) => [city.id, city])),
    [backendCities],
  );

  const networkNodes = useMemo<CommandNetworkNode[]>(() => {
    return patchedSnapshot.intersections.map((intersection) => {
      const graphCarrefour =
        graphCarrefourByIntersectionCode.get(intersection.id) ??
        graphCarrefourByControllerCode.get(intersection.controllerId);
      const explicitCity = intersection.cityId
        ? cityCatalogById.get(intersection.cityId)
        : undefined;
      return {
        intersectionId: intersection.id,
        carrefourId: graphCarrefour?.id ?? null,
        cityId: intersection.cityId ?? graphCarrefour?.cityId ?? null,
        cityName: explicitCity?.name ?? graphCarrefour?.cityName ?? null,
        label: intersection.name,
        district: intersection.district,
        controllerId: intersection.controllerId,
        controllerType: graphCarrefour?.primaryControllerType ?? null,
        equipmentStatus: resolveEquipmentStatus(intersection, graphCarrefour),
        connectionState: intersection.controllerConnectionState,
        location: intersection.location,
        status: intersection.status,
        trafficState: statusToneToFlow(intersection.status),
        queueLength: intersection.queueLength,
        averageDelaySeconds: intersection.averageDelaySeconds,
        incidents: intersection.incidents,
        saturationScore: graphCarrefour?.saturationScore ?? null,
        criticalityScore: graphCarrefour?.criticalityScore ?? null,
      };
    });
  }, [
    cityCatalogById,
    graphCarrefourByControllerCode,
    graphCarrefourByIntersectionCode,
    patchedSnapshot.intersections,
  ]);

  const networkNodeByIntersectionId = useMemo(
    () => new Map(networkNodes.map((node) => [node.intersectionId, node])),
    [networkNodes],
  );

  const intersectionIdsByCity = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of networkNodes) {
      if (!node.cityId) continue;
      const current = map.get(node.cityId);
      if (current) {
        current.add(node.intersectionId);
      } else {
        map.set(node.cityId, new Set([node.intersectionId]));
      }
    }
    return map;
  }, [networkNodes]);

  const networkLinks = useMemo<CommandNetworkLink[]>(() => {
    const mapped: CommandNetworkLink[] = [];
    for (const link of roadLinks) {
      const from = networkNodeByIntersectionId.get(link.fromIntersectionId);
      const to = networkNodeByIntersectionId.get(link.toIntersectionId);
      if (!from || !to) continue;
      mapped.push({
        id: link.id,
        fromIntersectionId: from.intersectionId,
        toIntersectionId: to.intersectionId,
        relationKind: normalizeRelationKind(link.relationKind),
        distanceMetres: link.distanceMetres,
        travelTimeSeconds: link.travelTimeSeconds,
        queueSpillbackRisk: link.queueSpillbackRisk,
        state: deriveLinkFlowState({
          leftStatus: from.status,
          rightStatus: to.status,
          queueSpillbackRisk: link.queueSpillbackRisk,
        }),
      });
    }
    return mapped;
  }, [networkNodeByIntersectionId, roadLinks]);

  const regionMarkers = useMemo(() => buildRegionMarkers(snapshot), [snapshot]);
  const regionPolygons = useMemo(() => buildRegionPolygons(snapshot), [snapshot]);
  const cityMarkers = useMemo(() => {
    if (!selection.regionId) return [];
    return backendCities
      .filter((city) => city.regionId === selection.regionId)
      .map((city) => ({
        id: city.id,
        regionId: city.regionId,
        name: city.name,
        nameAr: city.nameAr,
        center: city.center,
        intersectionCount: city.intersectionCount,
        tone: city.tone,
      }));
  }, [backendCities, selection.regionId]);

  const summary = useMemo(() => {
    const nextSummary = buildSummary(selection, snapshot);
    if (selection.level === "city" && backendZones.length > 0) {
      return {
        ...nextSummary,
        worstDistrictId: selectWorstZoneId(backendZones),
      };
    }
    return nextSummary;
  }, [backendZones, selection, snapshot]);

  const crumbsRaw = useMemo(() => buildBreadcrumb(selection), [selection]);
  const crumbs = useMemo(
    () => applySelectionToCrumbIntersectionLabel(crumbsRaw, selectedIntersection),
    [crumbsRaw, selectedIntersection],
  );

  const scopedIntersections = useMemo(() => {
    if (selection.level === "intersection" && selectedIntersection) {
      return [selectedIntersection];
    }
    if (selection.level === "district" && selection.districtId) {
      const districtId = selection.districtId;
      return patchedSnapshot.intersections.filter(
        (intersection) => intersection.zoneId === districtId,
      );
    }
    if (selection.level === "city" && selection.cityId) {
      const cityId = selection.cityId;
      const graphIds = intersectionIdsByCity.get(cityId);
      if (graphIds && graphIds.size > 0) {
        return patchedSnapshot.intersections.filter((intersection) =>
          graphIds.has(intersection.id),
        );
      }
      return patchedSnapshot.intersections.filter(
        (intersection) => intersection.cityId === cityId,
      );
    }
    if (selection.level === "region" && selection.regionId) {
      const regionId = selection.regionId;
      return patchedSnapshot.intersections.filter(
        (intersection) => intersection.regionId === regionId,
      );
    }
    return patchedSnapshot.intersections;
  }, [intersectionIdsByCity, selection, patchedSnapshot.intersections, selectedIntersection]);

  const priorityIntersections = useMemo(() => {
    return [...scopedIntersections].sort(
      (left, right) =>
        getIntersectionPriorityScore(right) -
        getIntersectionPriorityScore(left),
    );
  }, [scopedIntersections]);

  const networkScopeIntersections = useMemo(() => {
    if (selection.level === "intersection" && selectedIntersection) {
      const graphNode = networkNodeByIntersectionId.get(selectedIntersection.id);
      const cityId = graphNode?.cityId ?? selectedIntersection.cityId;
      if (cityId) {
        const graphIds = intersectionIdsByCity.get(cityId);
        if (graphIds && graphIds.size > 0) {
          return patchedSnapshot.intersections.filter((intersection) =>
            graphIds.has(intersection.id),
          );
        }
        return patchedSnapshot.intersections.filter(
          (intersection) => intersection.cityId === cityId,
        );
      }
      return patchedSnapshot.intersections;
    }
    return scopedIntersections;
  }, [
    intersectionIdsByCity,
    networkNodeByIntersectionId,
    patchedSnapshot.intersections,
    scopedIntersections,
    selectedIntersection,
    selection.level,
  ]);

  const networkPriorityIntersections = useMemo(() => {
    return [...networkScopeIntersections].sort(
      (left, right) =>
        getIntersectionPriorityScore(right) -
        getIntersectionPriorityScore(left),
    );
  }, [networkScopeIntersections]);

  const visibleIntersectionIds = useMemo(() => {
    const scopedIds = networkScopeIntersections.map(
      (intersection) => intersection.id,
    );
    const trimmed =
      scopedIds.length > 72
        ? networkPriorityIntersections
            .slice(0, 72)
            .map((intersection) => intersection.id)
        : scopedIds;
    return new Set(trimmed);
  }, [networkPriorityIntersections, networkScopeIntersections]);

  const visibleIntersections = useMemo(
    () =>
      patchedSnapshot.intersections.filter((intersection) =>
        visibleIntersectionIds.has(intersection.id),
      ),
    [patchedSnapshot.intersections, visibleIntersectionIds],
  );

  const visibleNetworkNodes = useMemo(
    () =>
      networkNodes.filter((node) => visibleIntersectionIds.has(node.intersectionId)),
    [networkNodes, visibleIntersectionIds],
  );

  const visibleNetworkLinks = useMemo(
    () =>
      networkLinks.filter(
        (link) =>
          visibleIntersectionIds.has(link.fromIntersectionId) &&
          visibleIntersectionIds.has(link.toIntersectionId),
      ),
    [networkLinks, visibleIntersectionIds],
  );

  // When no backend links exist for the current city view, generate
  // proximity-based display links so the graph always shows connections.
  const displayNetworkLinks = useMemo<CommandNetworkLink[]>(() => {
    if (
      visibleNetworkLinks.length > 0 ||
      visibleNetworkNodes.length < 2 ||
      (selection.level !== "city" &&
        selection.level !== "district" &&
        selection.level !== "intersection" &&
        selection.level !== "region")
    ) {
      return visibleNetworkLinks;
    }
    const links: CommandNetworkLink[] = [];
    const added = new Set<string>();
    const maxNeighbors = Math.min(3, visibleNetworkNodes.length - 1);
    for (const node of visibleNetworkNodes) {
      const sorted = visibleNetworkNodes
        .filter((other) => other.intersectionId !== node.intersectionId)
        .map((other) => ({
          node: other,
          dist: Math.hypot(
            other.location.lat - node.location.lat,
            other.location.lng - node.location.lng,
          ),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, maxNeighbors);
      for (const { node: neighbor } of sorted) {
        const key = [node.intersectionId, neighbor.intersectionId]
          .sort()
          .join("|");
        if (added.has(key)) continue;
        added.add(key);
        links.push({
          id: `prox-${key}`,
          fromIntersectionId: node.intersectionId,
          toIntersectionId: neighbor.intersectionId,
          relationKind: "upstream",
          distanceMetres: null,
          travelTimeSeconds: null,
          queueSpillbackRisk: null,
          state: deriveLinkFlowState({
            leftStatus: node.status,
            rightStatus: neighbor.status,
            queueSpillbackRisk: null,
          }),
        });
      }
    }
    return links;
  }, [visibleNetworkLinks, visibleNetworkNodes, selection.level]);

  // Cities to offer in the graph city-picker when at country / region level.
  const citiesForGraphPicker = useMemo(() => {
    return backendCities
      .filter((city) => !selection.regionId || city.regionId === selection.regionId)
      .map((city) => ({ id: city.id, name: city.name }));
  }, [backendCities, selection.regionId]);

  // Name of the currently selected city (for graph header).
  const selectedCityName = useMemo(() => {
    if (!selection.cityId) return null;
    return cityCatalogById.get(selection.cityId)?.name ?? null;
  }, [cityCatalogById, selection.cityId]);

  const selectedGraphNode = useMemo(() => {
    if (selectedIntersection) {
      return networkNodeByIntersectionId.get(selectedIntersection.id);
    }
    return visibleNetworkNodes[0];
  }, [networkNodeByIntersectionId, selectedIntersection, visibleNetworkNodes]);

  useEffect(() => {
    let cancelled = false;

    const runSelectedPrediction = async () => {
      if (!selectedGraphNode?.carrefourId) {
        setPredictionLoading(false);
        setSelectedPrediction(null);
        return;
      }

      setPredictionLoading(true);
      try {
        const result = await runTrafficPrediction(selectedGraphNode.carrefourId);
        if (!cancelled) {
          setSelectedPrediction(result);
        }
      } catch {
        if (!cancelled) {
          setSelectedPrediction(null);
        }
      } finally {
        if (!cancelled) {
          setPredictionLoading(false);
        }
      }
    };

    void runSelectedPrediction();

    return () => {
      cancelled = true;
    };
  }, [selectedGraphNode?.carrefourId]);

  useEffect(() => {
    let cancelled = false;

    const loadScopePrediction = async () => {
      if (
        selection.level !== "city" &&
        selection.level !== "district" &&
        selection.level !== "intersection"
      ) {
        setNetworkPrediction([]);
        setNetworkPredictionLoading(false);
        return;
      }

      if (selection.level === "district" && !selection.districtId) {
        setNetworkPrediction([]);
        setNetworkPredictionLoading(false);
        return;
      }

      const scopeCityId =
        selection.cityId ?? selectedIntersection?.cityId ?? null;

      if (
        (selection.level === "city" || selection.level === "intersection") &&
        !scopeCityId
      ) {
        setNetworkPrediction([]);
        setNetworkPredictionLoading(false);
        return;
      }

      setNetworkPredictionLoading(true);
      try {
        const scopeSnapshot =
          selection.level === "district" && selection.districtId
            ? await fetchZonePredictionSnapshot(selection.districtId, "H+15")
            : await fetchCityPredictionSnapshot(scopeCityId!, "H+15");
        if (cancelled) return;
        setNetworkPrediction(
          scopeSnapshot.hotspots.map((hotspot) => ({
            intersectionId: hotspot.intersectionId,
            label: hotspot.label,
            district: hotspot.district,
            equipmentStatus: normalizeEquipmentStatus(hotspot.equipmentStatus),
            trafficState: hotspot.trafficState,
            horizon: hotspot.horizon,
            saturationForecast: hotspot.saturationForecast,
            queueLengthForecast: hotspot.queueLengthForecast,
            delaySecondsForecast: hotspot.delaySecondsForecast,
            confidence: hotspot.confidence,
          })),
        );
      } catch {
        if (!cancelled) {
          setNetworkPrediction([]);
        }
      } finally {
        if (!cancelled) {
          setNetworkPredictionLoading(false);
        }
      }
    };

    void loadScopePrediction();

    return () => {
      cancelled = true;
    };
  }, [
    selectedIntersection?.cityId,
    selection.cityId,
    selection.districtId,
    selection.level,
  ]);

  // Fetch the backend agent visualization layers (heatmap +
  // anticipation) for the current scope. Read-only endpoint — no
  // persistence or runtime commands. On any failure the state is
  // cleared and the client-side heuristics below take over.
  useEffect(() => {
    let cancelled = false;

    const loadAgentLayers = async () => {
      let scope: "city" | "zone" | null = null;
      let scopeId: string | null = null;
      if (selection.level === "district" && selection.districtId) {
        scope = "zone";
        scopeId = selection.districtId;
      } else if (
        selection.level === "city" ||
        selection.level === "intersection"
      ) {
        const scopeCityId =
          selection.cityId ?? selectedIntersection?.cityId ?? null;
        if (scopeCityId) {
          scope = "city";
          scopeId = scopeCityId;
        }
      }

      if (!scope || !scopeId) {
        setBackendHeatPoints([]);
        setBackendHeatSegments([]);
        setBackendInsights([]);
        return;
      }

      try {
        const layers = await fetchTrafficAgentLayers(scope, scopeId, "H+15");
        if (cancelled) return;
        setBackendHeatPoints(
          (layers.heatmap?.points ?? []).map((point) => ({
            id: point.id,
            intersectionId: point.intersectionId,
            label: point.label,
            location: point.location,
            trafficState: point.trafficState,
            saturationForecast: point.saturationForecast,
            queueLengthForecast: point.queueLengthForecast,
            delaySecondsForecast: point.delaySecondsForecast,
            confidence: point.confidence,
            radiusMetres: point.radiusMetres,
          })),
        );
        setBackendHeatSegments(
          (layers.heatmap?.segments ?? []).map((segment) => ({
            id: segment.id,
            path: [segment.from, segment.to],
            state: segment.trafficState,
            intensity: segment.intensity,
          })),
        );
        setBackendInsights(
          (layers.anticipation?.insights ?? []).map((insight) => ({
            id: insight.id,
            emoji: insight.emoji,
            title: insight.title,
            summary: insight.summary,
            detail:
              insight.causes.length > 0
                ? `${insight.detail} · ${insight.causes
                    .map((cause) => cause.label)
                    .join(" · ")}`
                : insight.detail,
            location: insight.location,
            trafficState: insight.trafficState,
          })),
        );
      } catch {
        if (!cancelled) {
          setBackendHeatPoints([]);
          setBackendHeatSegments([]);
          setBackendInsights([]);
        }
      }
    };

    void loadAgentLayers();

    return () => {
      cancelled = true;
    };
  }, [
    selectedIntersection?.cityId,
    selection.cityId,
    selection.districtId,
    selection.level,
  ]);

  const effectiveNetworkPrediction = useMemo<
    CommandNetworkPredictionSummary[]
  >(() => {
    if (networkPrediction.length > 0) {
      return networkPrediction;
    }

    if (dataSource !== "fallback") {
      return [];
    }

    return networkScopeIntersections
      .map((intersection) => {
        const trafficState = statusToneToFlow(intersection.status);
        const saturationForecast =
          intersection.status === "critical"
            ? 0.96
            : intersection.status === "watch"
              ? 0.78
              : 0.58;

        return {
          intersectionId: intersection.id,
          label: intersection.name,
          district: intersection.district,
          equipmentStatus: normalizeEquipmentStatus(
            resolveEquipmentStatus(intersection),
          ),
          trafficState,
          horizon: "H+15",
          saturationForecast,
          queueLengthForecast: Math.max(
            intersection.queueLength,
            Math.round(intersection.queueLength * 1.35 + 8),
          ),
          delaySecondsForecast: Math.max(
            intersection.averageDelaySeconds,
            Math.round(intersection.averageDelaySeconds * 1.2 + 6),
          ),
          confidence: 0.42,
        } satisfies CommandNetworkPredictionSummary;
      })
      .sort(
        (left, right) =>
          right.queueLengthForecast +
          right.delaySecondsForecast +
          right.saturationForecast * 100 -
          (left.queueLengthForecast +
            left.delaySecondsForecast +
            left.saturationForecast * 100),
      )
      .slice(0, 8);
  }, [dataSource, networkPrediction, networkScopeIntersections]);

  const predictionHeat = useMemo<CommandPredictionHeatPoint[]>(() => {
    if (selection.level === "country") {
      return [];
    }

    // Prefer the backend traffic-heatmap agent. Respect the current map
    // visibility, but if filtering hides everything (id scheme mismatch)
    // fall back to the full backend set rather than showing nothing.
    if (backendHeatPoints.length > 0) {
      const visible = backendHeatPoints.filter((point) =>
        visibleIntersectionIds.has(point.intersectionId),
      );
      return (visible.length > 0 ? visible : backendHeatPoints).slice(0, 12);
    }

    const hotspotPoints = effectiveNetworkPrediction
      .map((entry) => {
        const node = networkNodeByIntersectionId.get(entry.intersectionId);
        if (!node || !visibleIntersectionIds.has(node.intersectionId)) {
          return null;
        }
        return {
          id: `hotspot-${entry.intersectionId}`,
          intersectionId: entry.intersectionId,
          label: entry.label,
          location: node.location,
          trafficState: entry.trafficState,
          saturationForecast: entry.saturationForecast,
          queueLengthForecast: entry.queueLengthForecast,
          delaySecondsForecast: entry.delaySecondsForecast,
          confidence: entry.confidence,
          radiusMetres: clamp(
            entry.queueLengthForecast * 3 +
              entry.delaySecondsForecast * 1.15 +
              entry.saturationForecast * 110,
            140,
            520,
          ),
        } satisfies CommandPredictionHeatPoint;
      })
      .filter((entry): entry is CommandPredictionHeatPoint => entry != null)
      .sort(
        (left, right) =>
          right.queueLengthForecast +
          right.delaySecondsForecast +
          right.saturationForecast * 100 -
          (left.queueLengthForecast +
            left.delaySecondsForecast +
            left.saturationForecast * 100),
      )
      .slice(0, 10);

    if (hotspotPoints.length > 0) {
      return hotspotPoints;
    }

    if (!selectedIntersection || !selectedPrediction) {
      return [];
    }

    const forecast =
      selectedPrediction.forecasts.find((entry) => entry.horizon === "H+15") ??
      selectedPrediction.forecasts[0];
    if (!forecast) {
      return [];
    }

    return [
      {
        id: `selected-${selectedIntersection.id}`,
        intersectionId: selectedIntersection.id,
        label: selectedIntersection.name,
        location: selectedIntersection.location,
        trafficState: derivePredictionFlowState(
          selectedPrediction,
          selectedIntersection.status,
        ),
        saturationForecast: forecast.saturationForecast,
        queueLengthForecast: forecast.queueLengthForecast,
        delaySecondsForecast: forecast.delaySecondsForecast,
        confidence: forecast.confidence,
        radiusMetres: clamp(
          forecast.queueLengthForecast * 3 +
            forecast.delaySecondsForecast * 1.15 +
            forecast.saturationForecast * 110,
          140,
          520,
        ),
      },
    ];
  }, [
    backendHeatPoints,
    effectiveNetworkPrediction,
    networkNodeByIntersectionId,
    selection.level,
    selectedIntersection,
    selectedPrediction,
    visibleIntersectionIds,
  ]);

  const activeCityName = useMemo(() => {
    if (selection.cityId) {
      return cityCatalogById.get(selection.cityId)?.name ?? summary.name;
    }
    return selectedGraphNode?.cityName ?? summary.name;
  }, [cityCatalogById, selectedGraphNode?.cityName, selection.cityId, summary.name]);

  const predictionInsights = useMemo<CommandPredictionInsight[]>(() => {
    if (selection.level === "country") {
      return [];
    }

    const parsedSnapshotTime = new Date(snapshot.metrics.updatedAt);
    const stableNow = Number.isNaN(parsedSnapshotTime.getTime())
      ? new Date("2026-01-01T08:00:00Z")
      : parsedSnapshotTime;

    // Prefer the backend traffic-anticipation agent (real "why" cards);
    // fall back to the client-side heuristic when it is unavailable.
    const generated =
      backendInsights.length > 0
        ? [...backendInsights]
        : buildInsightSignals({
            now: stableNow,
            cityName: activeCityName,
            center: summary.center,
            hotspots: predictionHeat,
          });

    if (selectedIntersection && selectedPrediction) {
      const h15 =
        selectedPrediction.forecasts.find((entry) => entry.horizon === "H+15") ??
        selectedPrediction.forecasts[0];
      if (h15) {
        generated.unshift({
          id: `focus-${selectedIntersection.id}`,
          emoji:
            h15.saturationForecast >= 0.95 || h15.queueLengthForecast >= 120
              ? "🔥"
              : h15.saturationForecast >= 0.72 || h15.queueLengthForecast >= 55
                ? "⚠️"
                : "🟢",
          title: `${selectedIntersection.name} — point surveillé`,
          summary: `Le point sélectionné garde une prévision ${h15.horizon} à saturation ${h15.saturationForecast.toFixed(2)}.`,
          detail: `STLS estime ${Math.round(h15.queueLengthForecast)} m de file et ${Math.round(h15.delaySecondsForecast)} s de délai. Cette carte explique la prédiction sur le nœud actuellement sélectionné.`,
          location: selectedIntersection.location,
          trafficState: derivePredictionFlowState(
            selectedPrediction,
            selectedIntersection.status,
          ),
        });
      }
    }

    return generated.slice(0, 5);
  }, [
    activeCityName,
    backendInsights,
    predictionHeat,
    selection.level,
    selectedIntersection,
    selectedPrediction,
    snapshot.metrics.updatedAt,
    summary.center,
  ]);

  const linkedControllers = useMemo(() => {
    if (!selectedGraphNode) return [];

    const ranked = displayNetworkLinks
      .filter(
        (link) =>
          link.fromIntersectionId === selectedGraphNode.intersectionId ||
          link.toIntersectionId === selectedGraphNode.intersectionId,
      )
      .map((link) => {
        const otherId =
          link.fromIntersectionId === selectedGraphNode.intersectionId
            ? link.toIntersectionId
            : link.fromIntersectionId;
        const other = networkNodeByIntersectionId.get(otherId);
        if (!other) return null;
        return {
          intersectionId: other.intersectionId,
          label: other.label,
          controllerId: other.controllerId,
          relationKind: link.relationKind,
          travelTimeSeconds: link.travelTimeSeconds,
          equipmentStatus: other.equipmentStatus,
          trafficState: other.trafficState,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      .sort((left, right) => {
        const leftWeight = left.trafficState === "congestion" ? 3 : left.trafficState === "pressure" ? 2 : 1;
        const rightWeight = right.trafficState === "congestion" ? 3 : right.trafficState === "pressure" ? 2 : 1;
        return rightWeight - leftWeight;
      });

    const deduped = new Map<
      string,
      (typeof ranked)[number] & { relationKindSet: Set<string> }
    >();

    for (const entry of ranked) {
      const existing = deduped.get(entry.intersectionId);
      if (!existing) {
        deduped.set(entry.intersectionId, {
          ...entry,
          relationKindSet: new Set([entry.relationKind]),
        });
        continue;
      }

      existing.relationKindSet.add(entry.relationKind);
      if (
        existing.travelTimeSeconds == null ||
        (entry.travelTimeSeconds != null &&
          entry.travelTimeSeconds < existing.travelTimeSeconds)
      ) {
        existing.travelTimeSeconds = entry.travelTimeSeconds;
      }
      if (entry.trafficState === "congestion") {
        existing.trafficState = entry.trafficState;
      } else if (
        entry.trafficState === "pressure" &&
        existing.trafficState === "smooth"
      ) {
        existing.trafficState = entry.trafficState;
      }
    }

    return [...deduped.values()].map(({ relationKindSet, ...entry }) => ({
      ...entry,
      relationKind: [...relationKindSet].join(", "),
    }));
  }, [displayNetworkLinks, networkNodeByIntersectionId, selectedGraphNode]);

  const corridorMix = useMemo(() => {
    return snapshot.corridors.reduce(
      (accumulator, corridor) => {
        accumulator[corridor.state] += 1;
        return accumulator;
      },
      {
        smooth: 0,
        pressure: 0,
        congestion: 0,
      } as Record<TrafficFlowState, number>,
    );
  }, [snapshot.corridors]);

  const intersectionMix = useMemo(() => {
    return snapshot.intersections.reduce(
      (accumulator, intersection) => {
        accumulator[intersection.status] += 1;
        return accumulator;
      },
      {
        healthy: 0,
        watch: 0,
        critical: 0,
      } as Record<IntersectionHealth, number>,
    );
  }, [snapshot.intersections]);

  const controllerMix = useMemo(() => {
    return snapshot.hardware.reduce(
      (accumulator, hardware) => {
        accumulator[hardware.connectionState] += 1;
        return accumulator;
      },
      {
        online: 0,
        degraded: 0,
        offline: 0,
      } as Record<ConnectionState, number>,
    );
  }, [snapshot.hardware]);

  const equipmentMix = useMemo(() => {
    const base = {
      "Équipé en service": 0,
      "Équipé hors service": 0,
      "Non régulé": 0,
      "Non spécifié": 0,
    } as Record<string, number>;

    for (const node of networkNodes) {
      base[node.equipmentStatus] += 1;
    }

    return base;
  }, [networkNodes]);

  const controllerInventoryCount = useMemo(
    () =>
      equipmentMix["Équipé en service"] + equipmentMix["Équipé hors service"],
    [equipmentMix],
  );

  const alertMix = useMemo(() => {
    return snapshot.alerts.reduce(
      (accumulator, alert) => {
        accumulator[alert.level] += 1;
        return accumulator;
      },
      {
        info: 0,
        warning: 0,
        critical: 0,
      } as Record<AlertSnapshot["level"], number>,
    );
  }, [snapshot.alerts]);

  const mapView = useMemo(() => {
    const { center, zoom } = selectionCenterAndZoom(selection);
    if (selection.level === "country") {
      return {
        mode: "country" as const,
        center,
        zoom,
        regionMarkers,
        regionPolygons,
      };
    }
    if (selection.level === "region") {
      return {
        mode: "region" as const,
        center,
        zoom,
        cityMarkers,
        regionPolygons,
        focusRegionId: selection.regionId,
      };
    }
    return {
      mode: "city" as const,
      center,
      zoom,
    };
  }, [selection, regionMarkers, regionPolygons, cityMarkers]);

  const handleSelectRegion = useCallback((regionId: string) => {
    setSelection({ level: "region", regionId });
  }, []);

  const handleSelectCity = useCallback(
    (cityId: string) => {
      const regionId =
        cityCatalogById.get(cityId)?.regionId ?? selection.regionId;
      setSelection({ level: "city", regionId, cityId });
    },
    [cityCatalogById, selection.regionId],
  );

  const handleSelectIntersection = useCallback(
    (intersectionId: string) => {
      const intersection = snapshot.intersections.find(
        (candidate) => candidate.id === intersectionId,
      );
      if (!intersection) {
        return;
      }
      setSelection({
        level: "intersection",
        regionId: intersection.regionId,
        cityId: intersection.cityId,
        districtId: intersection.zoneId ?? undefined,
        intersectionId,
      });
    },
    [snapshot.intersections],
  );

  const handleSelectDistrict = useCallback(
    (districtId: string) => {
      const backendZone = backendZones.find((zone) => zone.id === districtId);
      if (!backendZone) return;
      setSelection({
        level: "district",
        regionId: backendZone.regionId,
        cityId: backendZone.cityId,
        districtId,
      });
    },
    [backendZones],
  );

  const districtsForCity = useMemo(() => {
    if (!selection.cityId) return [];
    return backendZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      nameAr: zone.nameAr,
      intersectionCount: zone.intersectionCount,
      incidentCount: zone.incidentCount,
      worstStatus: zone.tone,
      averageDelaySeconds: zone.averageDelaySeconds,
    }));
  }, [backendZones, selection.cityId]);

  const selectedSystemMode =
    selectedIntersection?.systemMode ??
    snapshot.intersections.find(
      (intersection) => intersection.systemMode === "real",
    )?.systemMode ??
    "simulation";

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const handleSelectRailSection = useCallback((section: NavRailSection) => {
    setRailSection(section);
    setSurfaceView(section === "controllers" ? "graph" : "map");
  }, []);

  const handleOpenStudioWorkbench = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.assign("/studio/workbench");
  }, []);

  return (
    <main
      data-cmd-theme={theme}
      className={
        theme === "light"
          ? "flex min-h-screen bg-[radial-gradient(circle_at_top_left,#fff4db_0%,#f7f4ec_28%,#eef1f4_65%,#e6e9ec_100%)] text-[#1b2322]"
          : "flex min-h-screen bg-[radial-gradient(circle_at_top_left,#14100a_0%,#0a0c0e_28%,#050709_65%,#030405_100%)] text-[#edf3ee]"
      }
    >
      <NavRail
        activeId={railSection}
        onSelect={handleSelectRailSection}
        onOpenStudio={handleOpenStudioWorkbench}
      />
      <div className="flex min-h-screen flex-1 flex-col pb-14 sm:pb-0">
        <TopBar
          crumbs={crumbs}
          onSelectCrumb={setSelection}
          systemMode={selectedSystemMode}
          systemState={snapshot.systemState}
          scenarios={snapshot.scenarios}
          scenarioId={scenarioId}
          onScenarioChange={setScenarioId}
          actionPending={actionPending}
          onRunScenario={() => void handleRunScenario()}
          onStopSystem={() => void handleStopSystem()}
          socketState={socketState}
          dataSource={dataSource}
          snapshotTick={snapshotTick}
          lastSnapshotAt={snapshot.metrics.updatedAt}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
          demoRunning={demoPlayer.running}
          onDemoStart={demoPlayer.start}
          onDemoStop={demoPlayer.stop}
        />

        <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 xl:px-6 xl:py-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiHeroCard
              label="Active incidents"
              value={String(snapshot.metrics.incidentsCount)}
              detail={
                snapshot.metrics.incidentsCount > 0
                  ? `${alertMix.critical} critical · ${alertMix.warning} warning`
                  : "No active incidents"
              }
              tone={snapshot.metrics.incidentsCount > 0 ? "critical" : "healthy"}
            />
            <KpiHeroCard
              label="Network"
              value={String(intersectionMix.healthy + intersectionMix.watch + intersectionMix.critical)}
              unit="nodes"
              detail={
                intersectionMix.critical > 0
                  ? `${intersectionMix.critical} critical · ${intersectionMix.watch} watch`
                  : intersectionMix.watch > 0
                    ? `${intersectionMix.watch} under watch`
                    : "All nodes healthy"
              }
              tone={
                intersectionMix.critical > 0
                  ? "critical"
                  : intersectionMix.watch > 0
                    ? "watch"
                    : "healthy"
              }
            />
            <KpiHeroCard
              label="Controllers"
              value={String(controllerInventoryCount)}
              detail={
                controllerMix.offline > 0
                  ? `${controllerMix.offline} offline · ${controllerMix.degraded} degraded`
                  : controllerMix.degraded > 0
                    ? `${controllerMix.degraded} degraded`
                    : `${controllerMix.online} online`
              }
              tone={
                controllerMix.offline > 0
                  ? "critical"
                  : controllerMix.degraded > 0
                    ? "watch"
                    : "healthy"
              }
            />
            <KpiHeroCard
              label="Throughput"
              value={snapshot.metrics.throughputVph.toLocaleString()}
              unit="vph"
              detail={
                corridorMix.congestion > 0
                  ? `${corridorMix.congestion} corridor congested`
                  : corridorMix.pressure > 0
                    ? `${corridorMix.pressure} under pressure`
                    : `${corridorMix.smooth} corridors flowing`
              }
              tone={
                corridorMix.congestion > 0
                  ? "critical"
                  : corridorMix.pressure > 0
                    ? "watch"
                    : "accent"
              }
            />
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                [
                  "Équipé en service",
                  equipmentMix["Équipé en service"],
                  "smooth",
                  "Actif",
                  "Contrôleurs connectés et actifs",
                ],
                [
                  "Équipé hors service",
                  equipmentMix["Équipé hors service"],
                  "critical",
                  "Hors svc",
                  "Contrôleurs installés mais indisponibles",
                ],
                [
                  "Non régulé",
                  equipmentMix["Non régulé"],
                  "pressure",
                  "Libre",
                  "Sites sans régulation active",
                ],
                [
                  "Non spécifié",
                  equipmentMix["Non spécifié"],
                  "neutral",
                  "Inconnu",
                  "État d’équipement encore incomplet",
                ],
              ] as const
            ).map(([label, value, tone, badgeLabel, description]) => (
              <div
                key={label}
                className="rounded-[12px] border border-white/8 bg-[#0b1115] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#8fa39a]">
                      {label}
                    </p>
                    <p className="mt-1 text-[0.72rem] text-[#6b7c74]">
                      {description}
                    </p>
                  </div>
                  <StatusBadge tone={tone} size="xs" label={badgeLabel} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[1.35rem] font-semibold text-[#edf3ee] tabular-nums">
                    {value}
                  </span>
                  <span className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#8fa39a]">
                    unités
                  </span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_390px] 2xl:grid-cols-[320px_minmax(0,1fr)_410px]">
            <aside className="hidden xl:flex min-h-0 flex-col">
              <AlertsFeed alerts={mergedAlerts} />
            </aside>

            <div className="relative min-h-[320px] sm:min-h-[420px] xl:min-h-[560px] overflow-hidden rounded-[16px] border border-white/8 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
              {surfaceView === "map" ? (
                <CommandMap
                  apiKey={mapsApiKey}
                  cityCenter={snapshot.cityCenter}
                  intersections={
                    selection.level === "city" ||
                    selection.level === "region" ||
                    selection.level === "district" ||
                    selection.level === "intersection"
                      ? visibleIntersections
                      : []
                  }
                  corridors={
                    selection.level === "city" ||
                    selection.level === "district" ||
                    selection.level === "intersection"
                      ? snapshot.corridors
                      : []
                  }
                  controllerLinks={displayNetworkLinks.map((link) => {
                    const from = networkNodeByIntersectionId.get(link.fromIntersectionId);
                    const to = networkNodeByIntersectionId.get(link.toIntersectionId);
                    return {
                      id: link.id,
                      path: [from?.location, to?.location].filter(
                        (point): point is IntersectionSnapshot["location"] => point != null,
                      ),
                      state: link.state,
                      relationKind: link.relationKind,
                    };
                  }).filter((link) => link.path.length === 2)}
                  predictionHeat={mapLayerMode === "heatmap" ? predictionHeat : []}
                  heatSegments={mapLayerMode === "heatmap" ? backendHeatSegments : []}
                  predictionInsights={mapLayerMode === "controllers" ? predictionInsights : []}
                  selectedIntersectionId={selectedIntersection?.id}
                  onSelectIntersection={handleSelectIntersection}
                  view={mapView}
                  onSelectRegion={handleSelectRegion}
                  onSelectCity={handleSelectCity}
                  scenarioId={scenarioId}
                  flashIntersectionId={flashIntersectionId ?? undefined}
                  overlayMode={mapLayerMode}
                />
              ) : (
                <>
                  <ControllerNetworkGraph
                    nodes={visibleNetworkNodes}
                    links={displayNetworkLinks}
                    selectedIntersectionId={selectedIntersection?.id}
                    onSelectIntersection={handleSelectIntersection}
                    cityName={selectedCityName ?? undefined}
                  />
                  {(selection.level === "country" ||
                    selection.level === "region") ? (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#030405]/82 px-6 backdrop-blur-sm">
                      <div className="max-w-[420px] text-center">
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-[#7c8b83]">
                          Graphe contrôleurs
                        </p>
                        <p className="mt-2 text-[1.05rem] font-semibold text-[#edf3ee]">
                          Sélectionnez une ville
                        </p>
                        <p className="mt-2 text-[0.8rem] leading-6 text-[#8fa39a]">
                          Le graphe affiche les contrôleurs d&apos;une seule ville à la fois.
                        </p>
                      </div>
                      <div className="flex max-w-[520px] flex-wrap justify-center gap-2">
                        {citiesForGraphPicker.map((city) => (
                          <button
                            key={city.id}
                            type="button"
                            onClick={() => handleSelectCity(city.id)}
                            className="rounded-[10px] border border-white/10 bg-[#0d1a24]/90 px-4 py-2 text-[0.76rem] font-semibold text-[#d6e2db] transition hover:border-[#39d98a]/40 hover:bg-[#0d1a24] hover:text-[#edf3ee]"
                          >
                            {city.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              <NarrativeOverlay
                scenario={demoPlayer.scenario}
                stepIndex={demoPlayer.stepIndex}
                progress={demoPlayer.progress}
                running={demoPlayer.running}
              />

              <DemoControlBar player={demoPlayer} />

              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#030405]/90 via-[#030405]/35 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#030405]/80 via-[#030405]/20 to-transparent" />

              <div className="absolute left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] flex-col gap-1.5 sm:left-5 sm:top-5 sm:max-w-[calc(100%-2.5rem)] sm:gap-2">
                <div
                  className={
                    theme === "light"
                      ? "flex flex-wrap items-center gap-2 rounded-[12px] border border-black/10 bg-white/90 px-4 py-3 backdrop-blur shadow-[0_2px_12px_rgba(20,16,10,0.06)]"
                      : "flex flex-wrap items-center gap-2 rounded-[12px] border border-white/10 bg-[#070b0e]/88 px-4 py-3 backdrop-blur"
                  }
                >
                  <StatusBadge tone="info" size="xs" label={viewLabel(mapView.mode)} />
                  <span
                    className={`text-[0.86rem] font-semibold ${
                      theme === "light" ? "text-[#1b2322]" : "text-[#edf3ee]"
                    }`}
                  >
                    {summary.name}
                  </span>
                  <span
                    className={`text-[0.68rem] ${
                      theme === "light" ? "text-[#4d5b56]" : "text-[#8fa39a]"
                    }`}
                  >
                    {summary.intersectionCount} intersections
                  </span>
                  <span
                    className={`text-[0.68rem] ${
                      theme === "light" ? "text-[#7c8a85]" : "text-[#6b7c74]"
                    }`}
                  >
                    {displayNetworkLinks.length} links
                  </span>
                </div>
                <SegmentedControl
                  aria-label="Surface view"
                  value={surfaceView === "graph" ? "graph" : "map"}
                  onChange={(next) =>
                    handleSelectRailSection(
                      next === "graph" ? "controllers" : "map",
                    )
                  }
                  options={[
                    { value: "map", label: "Carte trafic" },
                    { value: "graph", label: "Graphe contrôleurs" },
                  ]}
                />
                {surfaceView === "map" ? (
                  <SegmentedControl
                    aria-label="Map overlay mode"
                    value={mapLayerMode}
                    onChange={(next) =>
                      setMapLayerMode(
                        next === "heatmap" ? "heatmap" : "controllers",
                      )
                    }
                    options={[
                      { value: "controllers", label: "Contrôleurs" },
                      { value: "heatmap", label: "Heatmap" },
                    ]}
                  />
                ) : null}
                {selection.level === "country" || selection.level === "region" ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-white/10 bg-[#070b0e]/88 px-3 py-2 backdrop-blur">
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.26em] text-[#7c8b83]">
                      Zones
                    </span>
                    <StatusBadge tone="smooth" size="xs" label="Smooth" />
                    <StatusBadge tone="pressure" size="xs" label="Pressure" />
                    <StatusBadge tone="congestion" size="xs" label="Congestion" />
                  </div>
                ) : null}
              </div>

              <div className="absolute left-2 bottom-2 right-2 flex flex-wrap items-center gap-2 rounded-[12px] border border-white/10 bg-[#070b0e]/88 px-3 py-2 backdrop-blur sm:left-5 sm:right-auto sm:bottom-5 sm:gap-3 sm:px-4 sm:py-2.5">
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.28em] text-[#7c8b83]">
                  Snapshot
                </span>
                <span className="text-[0.82rem] font-medium text-[#f1f6f2]">
                  {snapshot.metrics.city}
                </span>
                <span className="text-[0.7rem] text-[#8fa39a] tabular-nums">
                  {formatClock(snapshot.metrics.updatedAt)}
                </span>
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-[#6b7c74]">
                  {graphState === "ready"
                    ? `${displayNetworkLinks.length} links`
                    : graphState === "loading"
                      ? "graph loading"
                      : "graph unavailable"}
                </span>
              </div>

              {actionError ? (
                <div className="absolute right-5 top-5 rounded-[12px] border border-[#5a1d1d] bg-[#1a0e0e]/92 px-4 py-3 backdrop-blur shadow-[0_0_0_1px_rgba(255,95,95,0.22)]">
                  <p className="text-[0.78rem] font-semibold text-[#ff9a9a]">
                    {actionError}
                  </p>
                </div>
              ) : null}
            </div>

            <aside className="flex min-h-0 flex-col">
              <SelectedAreaPanel
                summary={summary}
                hardware={selectedHardware}
                graphNode={selectedGraphNode}
                linkedControllers={linkedControllers}
                prediction={selectedPrediction}
                predictionLoading={predictionLoading}
                networkPrediction={effectiveNetworkPrediction}
                networkPredictionLoading={networkPredictionLoading}
                priorityIntersections={priorityIntersections}
                districts={districtsForCity}
                selectedIntersectionId={selectedIntersection?.id}
                onSelectIntersection={handleSelectIntersection}
                onSelectDistrict={handleSelectDistrict}
                onSetOverride={handleSetOverride}
                onSetForcedGreen={handleSetForcedGreen}
                onSetMode={handleSetMode}
                onAiRequestApply={handleAiRequestApply}
              />
            </aside>
          </section>

          <section className="flex min-h-0 xl:hidden">
            <AlertsFeed alerts={mergedAlerts} />
          </section>
        </div>
      </div>

      <OverrideReasonModal
        request={overrideRequest}
        onConfirm={handleOverrideConfirm}
        onCancel={handleOverrideCancel}
        submitting={overrideSubmitting}
      />
    </main>
  );
}

function viewLabel(mode: "country" | "region" | "city") {
  if (mode === "country") return "Country";
  if (mode === "region") return "Region";
  return "City";
}

function formatClock(value?: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getIntersectionPriorityScore(intersection: IntersectionSnapshot) {
  const statusWeight =
    intersection.status === "critical"
      ? 250
      : intersection.status === "watch"
        ? 130
        : 40;
  const controllerWeight =
    intersection.controllerConnectionState === "offline"
      ? 120
      : intersection.controllerConnectionState === "degraded"
        ? 70
        : 25;

  return (
    statusWeight +
    controllerWeight +
    intersection.incidents * 90 +
    intersection.queueLength * 4 +
    intersection.averageDelaySeconds * 2
  );
}

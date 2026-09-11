"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";

import type {
  BaseLayerFeature,
  BasePlan,
  CableChamber,
  CableRun,
  CivilPlan,
  DetectorLoop,
  SignalSupport,
} from "@/types/civil-plan";
import type { EngineeringIntersectionRecord } from "@/types/engineering-studio";
import { buildInitialIntersections } from "./seed";
import {
  normaliseIntersectionConfig,
  type Approach,
  type CablageSettings,
  type ConflictPair,
  type Detector,
  type IntersectionConfig,
  type Lane,
  type Movement,
  type OperatingMode,
  type Phase,
  type ProgrammingSettings,
  type RegulationSettings,
  type SignalGroup,
  type Stage,
  type StudioPersistedState,
  type WorkflowStatus,
} from "./types";

function normaliseAll(
  intersections: Record<string, IntersectionConfig>,
): Record<string, IntersectionConfig> {
  const out: Record<string, IntersectionConfig> = {};
  for (const [id, config] of Object.entries(intersections)) {
    out[id] = normaliseIntersectionConfig(config);
  }
  return out;
}

function mergeHydratedIntersections(
  seeded: Record<string, IntersectionConfig>,
  persisted: Record<string, IntersectionConfig>,
) {
  const merged: Record<string, IntersectionConfig> = { ...seeded };

  for (const [id, config] of Object.entries(persisted)) {
    const seed = seeded[id];
    merged[id] = normaliseIntersectionConfig({
      ...seed,
      ...config,
      identity: {
        ...(seed?.identity ?? {
          name: "",
          district: "",
          address: "",
          location: { lat: 0, lng: 0 },
        }),
        ...config.identity,
      },
      controllerId: config.controllerId || seed?.controllerId || "",
    });
  }

  return merged;
}

const STORAGE_KEY = "stls-studio-state-v1";

interface StoreState {
  intersections: Record<string, IntersectionConfig>;
  baseline: Record<string, IntersectionConfig>;
  hydrated: boolean;
}

type Action =
  | { type: "hydrate"; payload: Record<string, IntersectionConfig> }
  | { type: "reset"; intersectionId: string }
  | { type: "save"; intersectionId: string }
  | {
      type: "replaceIntersection";
      intersectionId: string;
      config: IntersectionConfig;
      markBaseline?: boolean;
    }
  | { type: "patchIdentity"; intersectionId: string; patch: Partial<IntersectionConfig["identity"]> }
  | { type: "addApproach"; intersectionId: string; approach: Approach }
  | { type: "updateApproach"; intersectionId: string; approachId: string; patch: Partial<Approach> }
  | { type: "deleteApproach"; intersectionId: string; approachId: string }
  | { type: "addSignalGroup"; intersectionId: string; signalGroup: SignalGroup }
  | { type: "updateSignalGroup"; intersectionId: string; signalGroupId: string; patch: Partial<SignalGroup> }
  | { type: "deleteSignalGroup"; intersectionId: string; signalGroupId: string }
  | { type: "addDetector"; intersectionId: string; detector: Detector }
  | { type: "updateDetector"; intersectionId: string; detectorId: string; patch: Partial<Detector> }
  | { type: "deleteDetector"; intersectionId: string; detectorId: string }
  | { type: "addPhase"; intersectionId: string; phase: Phase }
  | { type: "updatePhase"; intersectionId: string; phaseId: string; patch: Partial<Phase> }
  | { type: "deletePhase"; intersectionId: string; phaseId: string }
  | { type: "addStage"; intersectionId: string; stage: Stage }
  | { type: "updateStage"; intersectionId: string; stageId: string; patch: Partial<Stage> }
  | { type: "deleteStage"; intersectionId: string; stageId: string }
  | { type: "moveStage"; intersectionId: string; stageId: string; direction: "up" | "down" }
  | { type: "toggleConflict"; intersectionId: string; pair: ConflictPair }
  | { type: "addMovement"; intersectionId: string; movement: Movement }
  | { type: "updateMovement"; intersectionId: string; movementId: string; patch: Partial<Movement> }
  | { type: "deleteMovement"; intersectionId: string; movementId: string }
  | { type: "addMode"; intersectionId: string; mode: OperatingMode }
  | { type: "updateMode"; intersectionId: string; modeId: string; patch: Partial<OperatingMode> }
  | { type: "deleteMode"; intersectionId: string; modeId: string }
  | { type: "addLane"; intersectionId: string; lane: Lane }
  | { type: "updateLane"; intersectionId: string; laneId: string; patch: Partial<Lane> }
  | { type: "deleteLane"; intersectionId: string; laneId: string }
  // ── Civil plan (editable spatial source of truth)
  | { type: "setCivilPlan"; intersectionId: string; plan: CivilPlan }
  | { type: "addSupport"; intersectionId: string; support: SignalSupport }
  | {
      type: "updateSupport";
      intersectionId: string;
      supportId: string;
      patch: Partial<SignalSupport>;
    }
  | { type: "deleteSupport"; intersectionId: string; supportId: string }
  | { type: "addLoop"; intersectionId: string; loop: DetectorLoop }
  | {
      type: "updateLoop";
      intersectionId: string;
      loopId: string;
      patch: Partial<DetectorLoop>;
    }
  | { type: "deleteLoop"; intersectionId: string; loopId: string }
  | { type: "addChamber"; intersectionId: string; chamber: CableChamber }
  | {
      type: "updateChamber";
      intersectionId: string;
      chamberId: string;
      patch: Partial<CableChamber>;
    }
  | { type: "deleteChamber"; intersectionId: string; chamberId: string }
  | { type: "addCableRun"; intersectionId: string; run: CableRun }
  | {
      type: "updateCableRun";
      intersectionId: string;
      runId: string;
      patch: Partial<CableRun>;
    }
  | { type: "deleteCableRun"; intersectionId: string; runId: string }
  // ── Base plan (map-located + imported topo/vector)
  | {
      type: "setBasePlan";
      intersectionId: string;
      basePlan: BasePlan;
    }
  | {
      type: "patchBasePlan";
      intersectionId: string;
      patch: Partial<BasePlan>;
    }
  | { type: "clearBasePlan"; intersectionId: string }
  | {
      type: "setBaseLayers";
      intersectionId: string;
      layers: BaseLayerFeature[];
    }
  | {
      type: "appendBaseLayers";
      intersectionId: string;
      layers: BaseLayerFeature[];
    }
  // ── Dossier settings + workflow
  | {
      type: "patchRegulationSettings";
      intersectionId: string;
      patch: Partial<RegulationSettings>;
    }
  | {
      type: "patchCablageSettings";
      intersectionId: string;
      patch: Partial<CablageSettings>;
    }
  | {
      type: "patchProgrammingSettings";
      intersectionId: string;
      patch: Partial<ProgrammingSettings>;
    }
  | {
      type: "setWorkflowStatus";
      intersectionId: string;
      status: WorkflowStatus;
    }
  | { type: "setRevision"; intersectionId: string; revision: string };

function patchIntersection(
  state: StoreState,
  intersectionId: string,
  updater: (config: IntersectionConfig) => IntersectionConfig,
): StoreState {
  const config = state.intersections[intersectionId];
  if (!config) return state;
  const next = updater(config);
  return {
    ...state,
    intersections: { ...state.intersections, [intersectionId]: next },
  };
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "hydrate": {
      // Normalise on hydrate so multi-modal fields (kind, movements,
      // modes) are always populated — legacy persisted state without
      // those fields upgrades transparently.
      const normalised = normaliseAll(action.payload);
      return {
        ...state,
        intersections: { ...state.intersections, ...normalised },
        baseline: { ...state.baseline, ...normalised },
        hydrated: true,
      };
    }
    case "reset": {
      const baseline = state.baseline[action.intersectionId];
      if (!baseline) return state;
      return {
        ...state,
        intersections: { ...state.intersections, [action.intersectionId]: baseline },
      };
    }
    case "save": {
      const current = state.intersections[action.intersectionId];
      if (!current) return state;
      return {
        ...state,
        baseline: { ...state.baseline, [action.intersectionId]: current },
      };
    }
    case "replaceIntersection": {
      const next = normaliseIntersectionConfig(action.config);
      const intersections = {
        ...state.intersections,
        [action.intersectionId]: next,
      };
      const baseline = action.markBaseline
        ? { ...state.baseline, [action.intersectionId]: next }
        : state.baseline;
      return { ...state, intersections, baseline };
    }
    case "patchIdentity":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        identity: { ...config.identity, ...action.patch },
      }));
    case "addApproach":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        approaches: [...config.approaches, action.approach],
      }));
    case "updateApproach":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        approaches: config.approaches.map((approach) =>
          approach.id === action.approachId ? { ...approach, ...action.patch } : approach,
        ),
      }));
    case "deleteApproach":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        approaches: config.approaches.filter((approach) => approach.id !== action.approachId),
        signalGroups: config.signalGroups.map((group) =>
          group.approachId === action.approachId ? { ...group, approachId: undefined } : group,
        ),
        detectors: config.detectors.map((detector) =>
          detector.approachId === action.approachId
            ? { ...detector, approachId: undefined }
            : detector,
        ),
      }));
    case "addSignalGroup":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        signalGroups: [...config.signalGroups, action.signalGroup],
      }));
    case "updateSignalGroup":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        signalGroups: config.signalGroups.map((group) =>
          group.id === action.signalGroupId ? { ...group, ...action.patch } : group,
        ),
      }));
    case "deleteSignalGroup":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        signalGroups: config.signalGroups.filter((group) => group.id !== action.signalGroupId),
        phases: config.phases.map((phase) => ({
          ...phase,
          greenSignalGroupIds: phase.greenSignalGroupIds.filter(
            (id) => id !== action.signalGroupId,
          ),
        })),
        conflicts: config.conflicts.filter(
          (pair) =>
            pair.a !== action.signalGroupId && pair.b !== action.signalGroupId,
        ),
      }));
    case "addDetector":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        detectors: [...config.detectors, action.detector],
      }));
    case "updateDetector":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        detectors: config.detectors.map((detector) =>
          detector.id === action.detectorId ? { ...detector, ...action.patch } : detector,
        ),
      }));
    case "deleteDetector":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        detectors: config.detectors.filter((detector) => detector.id !== action.detectorId),
      }));
    case "addPhase":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        phases: [...config.phases, action.phase],
      }));
    case "updatePhase":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        phases: config.phases.map((phase) =>
          phase.id === action.phaseId ? { ...phase, ...action.patch } : phase,
        ),
      }));
    case "deletePhase":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        phases: config.phases.filter((phase) => phase.id !== action.phaseId),
        stages: config.stages.filter((stage) => stage.phaseId !== action.phaseId),
      }));
    case "addStage":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        stages: [...config.stages, action.stage],
      }));
    case "updateStage":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        stages: config.stages.map((stage) =>
          stage.id === action.stageId ? { ...stage, ...action.patch } : stage,
        ),
      }));
    case "deleteStage":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        stages: config.stages.filter((stage) => stage.id !== action.stageId),
      }));
    case "moveStage":
      return patchIntersection(state, action.intersectionId, (config) => {
        const sorted = [...config.stages].sort((a, b) => a.order - b.order);
        const index = sorted.findIndex((stage) => stage.id === action.stageId);
        if (index < 0) return config;
        const target = action.direction === "up" ? index - 1 : index + 1;
        if (target < 0 || target >= sorted.length) return config;
        const swap = sorted[index];
        sorted[index] = sorted[target];
        sorted[target] = swap;
        const reordered = sorted.map((stage, idx) => ({ ...stage, order: idx + 1 }));
        return { ...config, stages: reordered };
      });
    case "toggleConflict":
      return patchIntersection(state, action.intersectionId, (config) => {
        const existing = config.conflicts.find(
          (pair) =>
            (pair.a === action.pair.a && pair.b === action.pair.b) ||
            (pair.a === action.pair.b && pair.b === action.pair.a),
        );
        if (existing) {
          return {
            ...config,
            conflicts: config.conflicts.filter((pair) => pair !== existing),
          };
        }
        return { ...config, conflicts: [...config.conflicts, action.pair] };
      });
    case "addMovement":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        movements: [...(config.movements ?? []), action.movement],
      }));
    case "updateMovement":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        movements: (config.movements ?? []).map((movement) =>
          movement.id === action.movementId
            ? { ...movement, ...action.patch }
            : movement,
        ),
      }));
    case "deleteMovement":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        movements: (config.movements ?? []).filter(
          (movement) => movement.id !== action.movementId,
        ),
      }));
    case "addMode":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        modes: [...(config.modes ?? []), action.mode],
      }));
    case "updateMode":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        modes: (config.modes ?? []).map((mode) =>
          mode.id === action.modeId ? { ...mode, ...action.patch } : mode,
        ),
      }));
    case "deleteMode":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        modes: (config.modes ?? []).filter(
          (mode) => mode.id !== action.modeId,
        ),
      }));
    case "addLane":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        lanes: [...(config.lanes ?? []), action.lane],
      }));
    case "updateLane":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        lanes: (config.lanes ?? []).map((lane) =>
          lane.id === action.laneId ? { ...lane, ...action.patch } : lane,
        ),
      }));
    case "deleteLane":
      // Also clear lane refs from movements so the dataset stays
      // consistent.  Lanes aren't referenced by phases or SGs directly.
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        lanes: (config.lanes ?? []).filter(
          (lane) => lane.id !== action.laneId,
        ),
        movements: (config.movements ?? []).map((movement) => ({
          ...movement,
          fromLaneId:
            movement.fromLaneId === action.laneId
              ? undefined
              : movement.fromLaneId,
          toLaneId:
            movement.toLaneId === action.laneId ? undefined : movement.toLaneId,
        })),
      }));
    case "setCivilPlan":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        civilPlan: action.plan,
      }));
    case "addSupport":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        supports: [...plan.supports, action.support],
      }));
    case "updateSupport":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        supports: plan.supports.map((support) =>
          support.id === action.supportId
            ? { ...support, ...action.patch }
            : support,
        ),
      }));
    case "deleteSupport":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        supports: plan.supports.filter(
          (support) => support.id !== action.supportId,
        ),
        cableRuns: plan.cableRuns.filter((run) => run.to !== action.supportId),
      }));
    case "addLoop":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        loops: [...plan.loops, action.loop],
      }));
    case "updateLoop":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        loops: plan.loops.map((loop) =>
          loop.id === action.loopId ? { ...loop, ...action.patch } : loop,
        ),
      }));
    case "deleteLoop":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        loops: plan.loops.filter((loop) => loop.id !== action.loopId),
        cableRuns: plan.cableRuns.filter((run) => run.to !== action.loopId),
      }));
    case "addChamber":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        chambers: [...plan.chambers, action.chamber],
      }));
    case "updateChamber":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        chambers: plan.chambers.map((chamber) =>
          chamber.id === action.chamberId
            ? { ...chamber, ...action.patch }
            : chamber,
        ),
      }));
    case "deleteChamber":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        chambers: plan.chambers.filter(
          (chamber) => chamber.id !== action.chamberId,
        ),
      }));
    case "addCableRun":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        cableRuns: [...plan.cableRuns, action.run],
      }));
    case "updateCableRun":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        cableRuns: plan.cableRuns.map((run) =>
          run.id === action.runId ? { ...run, ...action.patch } : run,
        ),
      }));
    case "deleteCableRun":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        cableRuns: plan.cableRuns.filter((run) => run.id !== action.runId),
      }));
    case "setBasePlan":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        basePlan: action.basePlan,
      }));
    case "patchBasePlan":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        basePlan: plan.basePlan
          ? { ...plan.basePlan, ...action.patch }
          : {
              source: "google_located",
              mapCenter: { lat: 0, lng: 0 },
              ...action.patch,
            },
      }));
    case "clearBasePlan":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        basePlan: undefined,
        baseLayers: undefined,
      }));
    case "setBaseLayers":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        baseLayers: action.layers,
      }));
    case "appendBaseLayers":
      return patchCivilPlan(state, action.intersectionId, (plan) => ({
        ...plan,
        baseLayers: [...(plan.baseLayers ?? []), ...action.layers],
      }));
    case "patchRegulationSettings":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        regulationSettings: {
          ...(config.regulationSettings ?? {}),
          ...action.patch,
        },
      }));
    case "patchCablageSettings":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        cablageSettings: {
          ...(config.cablageSettings ?? {}),
          ...action.patch,
        },
      }));
    case "patchProgrammingSettings":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        programmingSettings: {
          ...(config.programmingSettings ?? {}),
          ...action.patch,
        },
      }));
    case "setWorkflowStatus":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        workflowStatus: action.status,
      }));
    case "setRevision":
      return patchIntersection(state, action.intersectionId, (config) => ({
        ...config,
        revision: action.revision,
      }));
    default:
      return state;
  }
}

function patchCivilPlan(
  state: StoreState,
  intersectionId: string,
  updater: (plan: CivilPlan) => CivilPlan,
): StoreState {
  const config = state.intersections[intersectionId];
  if (!config || !config.civilPlan) return state;
  const nextPlan = updater(config.civilPlan);
  return {
    ...state,
    intersections: {
      ...state.intersections,
      [intersectionId]: { ...config, civilPlan: nextPlan },
    },
  };
}

interface StudioStoreContextValue {
  state: StoreState;
  dispatch: Dispatch<Action>;
}

const StudioStoreContext = createContext<StudioStoreContextValue | null>(null);

export function StudioStoreProvider({
  children,
  engineeringIntersections = [],
}: {
  children: ReactNode;
  engineeringIntersections?: EngineeringIntersectionRecord[];
}) {
  const initial = useMemo<StoreState>(() => {
    const seeded = normaliseAll(
      buildInitialIntersections(engineeringIntersections),
    );
    return {
      intersections: seeded,
      baseline: seeded,
      hydrated: false,
    };
  }, [engineeringIntersections]);

  const [state, dispatch] = useReducer(reducer, initial);
  const persistRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        persistRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as StudioPersistedState;
      if (parsed.version === 1 && parsed.intersections) {
        dispatch({
          type: "hydrate",
          payload: mergeHydratedIntersections(
            initial.intersections,
            parsed.intersections,
          ),
        });
      }
    } catch {
      /* ignore broken cache */
    } finally {
      persistRef.current = true;
    }
  }, [initial.intersections]);

  useEffect(() => {
    if (typeof window === "undefined" || !persistRef.current) return;
    try {
      const payload: StudioPersistedState = {
        version: 1,
        intersections: state.intersections,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* localStorage may be full / disabled */
    }
  }, [state.intersections]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <StudioStoreContext.Provider value={value}>
      {children}
    </StudioStoreContext.Provider>
  );
}

function useStudioContext() {
  const context = useContext(StudioStoreContext);
  if (!context) {
    throw new Error("Studio store hook used outside StudioStoreProvider");
  }
  return context;
}

export function useStudioIntersection(id: string | undefined) {
  const { state } = useStudioContext();
  if (!id) return undefined;
  return state.intersections[id];
}

export function useStudioBaseline(id: string | undefined) {
  const { state } = useStudioContext();
  if (!id) return undefined;
  return state.baseline[id];
}

export function useStudioDispatch() {
  const { dispatch } = useStudioContext();
  return dispatch;
}

export function useStudioIsDirty(id: string | undefined) {
  const { state } = useStudioContext();
  return useCallback(() => {
    if (!id) return false;
    const current = state.intersections[id];
    const baseline = state.baseline[id];
    if (!current || !baseline) return false;
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }, [id, state.baseline, state.intersections])();
}

/**
 * AI Analysis Error Handling Layer.
 *
 * Converts low-level transport/validation/runtime errors into
 * engineering-grade notices so the UI never leaks raw backend
 * messages. The translator and pipeline state machine are used by
 * the AI Engineering workspace to render a stable, professional UX
 * even when individual analysis stages fail or fall back.
 */

export type AnalysisStageId =
  | "map-extraction"
  | "geometry-analysis"
  | "topology-classification"
  | "engineering-inference"
  | "proposal-generation";

export type AnalysisStageStatus =
  | "idle"
  | "running"
  | "ok"
  | "fallback"
  | "failed";

export interface AnalysisStage {
  id: AnalysisStageId;
  label: string;
  status: AnalysisStageStatus;
  /** Short engineering-grade message, max ~120 chars. */
  message?: string;
}

export type AnalysisNoticeSeverity = "info" | "warning" | "critical";

export interface AnalysisNotice {
  id: string;
  severity: AnalysisNoticeSeverity;
  title: string;
  description: string;
  stage?: AnalysisStageId;
}

const STAGE_LABELS: Record<AnalysisStageId, string> = {
  "map-extraction": "Extraction cartographique (OSM)",
  "geometry-analysis": "Analyse géométrique",
  "topology-classification": "Classification topologique",
  "engineering-inference": "Inférence ingénierie",
  "proposal-generation": "Génération des variantes",
};

export function initialStages(): AnalysisStage[] {
  return (Object.keys(STAGE_LABELS) as AnalysisStageId[]).map((id) => ({
    id,
    label: STAGE_LABELS[id],
    status: "idle",
  }));
}

export function setStage(
  stages: AnalysisStage[],
  id: AnalysisStageId,
  status: AnalysisStageStatus,
  message?: string,
): AnalysisStage[] {
  return stages.map((s) =>
    s.id === id ? { ...s, status, message: message ?? s.message } : s,
  );
}

/**
 * Inspect a raw error and return a stable, user-facing notice plus
 * an actionable kind that the caller can use to decide whether to
 * retry, fall back, or fail.
 */
export type AnalysisErrorKind =
  | "schema-mismatch"
  | "network"
  | "timeout"
  | "server-5xx"
  | "client-4xx"
  | "unknown";

export interface TranslatedError {
  kind: AnalysisErrorKind;
  notice: AnalysisNotice;
  /** Should the caller try a degraded retry (e.g. analyze w/o geometry)? */
  recoverable: boolean;
}

function makeNoticeId(): string {
  return `n-${Math.random().toString(36).slice(2, 9)}`;
}

export function translateAnalysisError(
  err: unknown,
  context: {
    stage?: AnalysisStageId;
    fallbackHint?: string;
  } = {},
): TranslatedError {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = raw.toLowerCase();

  // 1. Schema validation rejection from class-validator.
  //    Examples:
  //      "geometry.property hasRoundabout should not exist"
  //      "geometry.property landUses should not exist"
  //      "approaches must be an array; ..."
  if (
    lower.includes("should not exist") ||
    lower.includes("must be an array") ||
    lower.includes("must be a string") ||
    lower.includes("must be a number") ||
    lower.includes("must be a boolean") ||
    lower.includes("nested property") ||
    lower.includes("validation failed")
  ) {
    return {
      kind: "schema-mismatch",
      recoverable: true,
      notice: {
        id: makeNoticeId(),
        severity: "warning",
        stage: context.stage,
        title: "Enrichissement géométrie partiellement indisponible",
        description:
          context.fallbackHint ??
          "Une partie des champs avancés n'a pas été acceptée par le moteur d'analyse. L'analyse continue avec une géométrie simplifiée.",
      },
    };
  }

  // 2. Network failures (no fetch response).
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return {
      kind: "network",
      recoverable: true,
      notice: {
        id: makeNoticeId(),
        severity: "warning",
        stage: context.stage,
        title: "Connexion au moteur d'analyse interrompue",
        description:
          "Le service d'analyse n'a pas répondu. Vérifiez le réseau, l'analyse passera en mode dégradé si la situation persiste.",
      },
    };
  }

  // 3. Timeout.
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return {
      kind: "timeout",
      recoverable: true,
      notice: {
        id: makeNoticeId(),
        severity: "warning",
        stage: context.stage,
        title: "Délai d'analyse dépassé",
        description:
          "Le serveur d'analyse n'a pas répondu dans le délai imparti. L'analyse a été interrompue, vous pouvez relancer.",
      },
    };
  }

  // 4. Server 5xx.
  if (/^5\d\d/.test(raw) || lower.includes("internal server")) {
    return {
      kind: "server-5xx",
      recoverable: false,
      notice: {
        id: makeNoticeId(),
        severity: "critical",
        stage: context.stage,
        title: "Erreur côté moteur d'analyse",
        description:
          "Le moteur d'analyse a renvoyé une erreur interne. L'équipe technique a été notifiée — relancez l'analyse dans quelques instants.",
      },
    };
  }

  // 5. Client 4xx (other than schema).
  if (/^4\d\d/.test(raw)) {
    return {
      kind: "client-4xx",
      recoverable: false,
      notice: {
        id: makeNoticeId(),
        severity: "warning",
        stage: context.stage,
        title: "Paramètres d'analyse non valides",
        description:
          "Le moteur d'analyse a rejeté la requête. Vérifiez les coordonnées et le périmètre, puis relancez.",
      },
    };
  }

  // 6. Fallback — generic but still professional.
  return {
    kind: "unknown",
    recoverable: false,
    notice: {
      id: makeNoticeId(),
      severity: "warning",
      stage: context.stage,
      title: "Analyse partiellement indisponible",
      description:
        "Une étape de l'analyse n'a pas pu être complétée. L'analyse continue avec des hypothèses d'ingénierie simplifiées.",
    },
  };
}

/**
 * Append a notice to a list while filtering out duplicates and
 * suppressing generic catch-all notices when a more specific one
 * already exists for the same stage. Returns a new array (does not
 * mutate). This is the single chokepoint the workspace uses so we
 * never end up with the same warning rendered twice.
 */
export function mergeNotice(
  notices: AnalysisNotice[],
  notice: AnalysisNotice,
  options: { kind?: AnalysisErrorKind } = {},
): AnalysisNotice[] {
  // Drop if exact title already collected (no flapping duplicates).
  if (notices.some((n) => n.title === notice.title)) {
    return notices;
  }
  // Drop the generic "unknown" notice if a specific one for the
  // same stage is already collected.
  if (
    options.kind === "unknown" &&
    notice.stage != null &&
    notices.some((n) => n.stage === notice.stage)
  ) {
    return notices;
  }
  return [...notices, notice];
}

/**
 * Sanitise the OSM geometry to send only the fields the backend
 * DTO is known to accept. Used as a defensive fallback when the
 * full payload was rejected by the schema, so the analyzer can
 * still run with a stripped-down geometry rather than no geometry
 * at all. Returns the same structural type as the input minus the
 * new enrichment fields (landUses, hasRoundabout, etc.).
 */
export function geometrySafeSubset<
  T extends {
    approaches: unknown[];
    pedestrianCrossings?: unknown[];
    tramLines?: unknown[];
    nearbyPoi?: unknown[];
    source: string;
  },
>(geometry: T): T {
  const { approaches, pedestrianCrossings, tramLines, nearbyPoi, source } =
    geometry;
  return {
    ...geometry,
    approaches,
    pedestrianCrossings: pedestrianCrossings ?? [],
    tramLines: tramLines ?? [],
    nearbyPoi: nearbyPoi ?? [],
    source,
    // Strip the enrichment fields that older backends may reject.
    landUses: undefined,
    hasRoundabout: undefined,
    nearestSignalDistanceMeters: undefined,
  } as T;
}

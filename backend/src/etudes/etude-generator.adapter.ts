import type { EtudeEntity } from '../database/entities';
import type { EtudeSectionId } from './etude-sections';

/**
 * Resolved metadata for the carrefour targeted by an étude. Built by
 * `EtudesService.buildContext` from the catalog data plus any rich
 * data available (controllers, detectors, phases, timing plans).
 *
 * Generators consume this directly — no further DB calls required.
 */
export interface ResolvedIntersection {
  code: string;
  name: string;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  cityId: string | null;
  zoneId: string | null;
  controlMode: string;
  status: string;
  queueLength: number;
  averageDelaySeconds: number;
  incidents: number;
  controllers: Array<{
    code: string;
    controllerType: string | null;
    firmwareVersion: string;
    operatingEnvironment: string;
    connectionState: string;
    batteryBacked: boolean;
    isPrimary: boolean;
  }>;
  detectors: Array<{
    code: string;
    name: string;
    type: string;
    laneReference: string | null;
    isActive: boolean;
  }>;
  phases: Array<{
    sequenceNumber: number;
    name: string;
    approach: string;
    movementGroup: string;
    phaseType: string;
    minGreenSeconds: number;
    yellowSeconds: number;
    redClearanceSeconds: number;
    pedestrianWalkSeconds: number | null;
    pedestrianClearSeconds: number | null;
    conflictingPhaseSequenceNumbers: number[];
  }>;
  timingPlans: Array<{
    code: string;
    name: string;
    status: string;
    cycleLengthSeconds: number;
    offsetSeconds: number;
  }>;
}

/**
 * Context handed to a generator. `intersection` is resolved from the
 * catalog when `etude.intersectionCode` is set; otherwise null.
 */
export interface EtudeGenerationContext {
  etude: EtudeEntity;
  intersection: ResolvedIntersection | null;
}

/** Result of a single section generation. */
export interface EtudeGenerationResult {
  sectionId: EtudeSectionId;
  content: Record<string, unknown>;
  rationale?: string;
  source: string;
}

/**
 * Pluggable generator. Default is offline (canned dossier templates
 * derived from the reference Casablanca + Fès dossiers, instantiated
 * with the real carrefour data). A future `ClaudeEtudeGenerator`
 * will plug in once `@anthropic-ai/sdk` is installed.
 */
export interface EtudeGeneratorAdapter {
  readonly mode: 'offline' | 'claude';
  generateSection(
    sectionId: EtudeSectionId,
    context: EtudeGenerationContext,
  ): Promise<EtudeGenerationResult>;
}

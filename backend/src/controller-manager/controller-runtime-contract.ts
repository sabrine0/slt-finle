import type {
  ControllerEntity,
  DeploymentEntity,
  DetectorEntity,
  IntersectionEntity,
  PhaseEntity,
  TimingPlanEntity,
} from '../database/entities';
import { AlarmSeverity, ControllerType, PhaseType } from '../database/entities';
import type { ValidationReport } from '../engineering/engineering.types';

export const CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION = 1;

export interface ControllerRuntimePackage {
  schemaVersion: number;
  controllerIdentity: {
    id: string;
    code: string;
    controllerType: ControllerType;
    runtimeVersion: string;
    firmwareVersion: string;
    supportedPackageSchemaVersion: number;
    environment: string;
  };
  intersectionIdentity: {
    id: string;
    code: string;
    name: string;
    district: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  operatingEnvironment: string;
  detectorsMapping: ControllerDetectorMapping[];
  signalGroups: ControllerSignalGroup[];
  phases: ControllerPhasePayload[];
  interphases: ControllerInterphase[];
  timingPlans: ControllerTimingPlanPayload[];
  safetyRules: ControllerSafetyRules;
  deploymentMetadata: {
    deploymentId: string;
    packageVersion: string;
    generatedAt: string;
    requestedAt: string;
    publishedAt: string | null;
    operatingMode: string;
    targetEnvironment: string;
    targetControllerId: string;
    timingPlanCode: string;
    scenarioCode: string | null;
    requiredRuntimeVersion: string | null;
    compatibleControllerTypes: ControllerType[];
    compatibilityWarnings: string[];
    requestPayload: Record<string, unknown>;
  };
  signatureMetadata: {
    algorithm: 'HMAC-SHA256';
    digestAlgorithm: 'SHA-256';
    digest: string;
    signature: string | null;
    signedAt: string | null;
    signer: string;
  };
}

export interface ControllerDetectorMapping {
  id: string;
  code: string;
  name: string;
  type: string;
  laneReference: string | null;
  channel: string;
  controllerId: string | null;
  assignedPhaseSequenceNumbers: number[];
  signalGroupCodes: string[];
  active: boolean;
}

export interface ControllerSignalGroup {
  code: string;
  name: string;
  approach: string;
  movementGroup: string;
  phaseSequenceNumbers: number[];
  protectedMovement: boolean;
  detectorCodes: string[];
}

export interface ControllerPhasePayload {
  sequenceNumber: number;
  name: string;
  approach: string;
  movementGroup: string;
  phaseType: string;
  signalGroupCode: string;
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
  pedestrianWalkSeconds: number | null;
  pedestrianClearSeconds: number | null;
  isProtected: boolean;
  clearanceGroup: string | null;
  allowedConcurrentPhaseSequenceNumbers: number[];
  conflictingPhaseSequenceNumbers: number[];
  detectorCodes: string[];
}

export interface ControllerInterphase {
  key: string;
  fromPhaseSequenceNumber: number;
  toPhaseSequenceNumber: number;
  clearanceSeconds: number;
  transitionType: 'yellow_change' | 'all_red' | 'pedestrian_clearance';
}

export interface ControllerTimingPlanPayload {
  id: string;
  code: string;
  name: string;
  status: string;
  cycleLengthSeconds: number;
  offsetSeconds: number;
  simulationOnly: boolean;
  stagePlan: Array<{
    key: string;
    name: string;
    splitSeconds: number;
    phaseSequenceNumbers: number[];
  }>;
  scheduleConfig: Record<string, unknown>;
}

export interface ControllerSafetyRules {
  validationSummary: string;
  validationGeneratedAt: string;
  conflictMatrix: Array<{
    phaseSequenceNumber: number;
    conflictingPhaseSequenceNumbers: number[];
  }>;
  concurrencyMatrix: Array<{
    phaseSequenceNumber: number;
    allowedConcurrentPhaseSequenceNumbers: number[];
  }>;
  minimumClearances: Array<{
    phaseSequenceNumber: number;
    yellowSeconds: number;
    redClearanceSeconds: number;
  }>;
  phaseValidationErrors: string[];
  phaseValidationWarnings: string[];
  runtimeLimits: {
    detectorCapacity: number;
    signalGroupCapacity: number;
  };
}

export interface BuildControllerRuntimeSectionsInput {
  controller: ControllerEntity;
  intersection: IntersectionEntity;
  detectors: DetectorEntity[];
  phases: PhaseEntity[];
  timingPlan: TimingPlanEntity;
  deployment: DeploymentEntity;
  validationReport: ValidationReport;
  requestPayload: Record<string, unknown>;
  scenarioCode: string | null;
}

export const controllerRuntimePackageJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://stls.local/schemas/controller-runtime-package-v1.json',
  type: 'object',
  required: [
    'schemaVersion',
    'controllerIdentity',
    'intersectionIdentity',
    'operatingEnvironment',
    'detectorsMapping',
    'signalGroups',
    'phases',
    'interphases',
    'timingPlans',
    'safetyRules',
    'deploymentMetadata',
    'signatureMetadata',
  ],
  properties: {
    schemaVersion: {
      type: 'integer',
      const: CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION,
    },
    controllerIdentity: { type: 'object' },
    intersectionIdentity: { type: 'object' },
    operatingEnvironment: { type: 'string' },
    detectorsMapping: { type: 'array' },
    signalGroups: { type: 'array' },
    phases: { type: 'array' },
    interphases: { type: 'array' },
    timingPlans: { type: 'array' },
    safetyRules: { type: 'object' },
    deploymentMetadata: { type: 'object' },
    signatureMetadata: { type: 'object' },
  },
  additionalProperties: false,
} as const;

export function buildControllerRuntimeSections(
  input: BuildControllerRuntimeSectionsInput,
) {
  const signalGroups = buildSignalGroups(input.phases, input.detectors);

  return {
    detectorsMapping: buildDetectorsMapping(input.detectors, signalGroups),
    signalGroups,
    phases: buildPhasePayloads(input.phases, input.detectors),
    interphases: buildInterphases(input.phases),
    timingPlans: [buildTimingPlanPayload(input.timingPlan)],
    safetyRules: buildSafetyRules(
      input.phases,
      input.validationReport,
      input.controller,
    ),
    deploymentMetadata: {
      deploymentId: input.deployment.id,
      packageVersion: input.deployment.packageVersion ?? 'draft',
      generatedAt: input.deployment.requestedAt.toISOString(),
      requestedAt: input.deployment.requestedAt.toISOString(),
      publishedAt: input.deployment.publishedAt?.toISOString() ?? null,
      operatingMode: input.deployment.operatingMode,
      targetEnvironment: input.deployment.targetEnvironment,
      targetControllerId: input.controller.id,
      timingPlanCode: input.timingPlan.code,
      scenarioCode: input.scenarioCode,
      requiredRuntimeVersion: input.deployment.requiredRuntimeVersion,
      compatibleControllerTypes:
        input.deployment.compatibleControllerTypes.length > 0
          ? input.deployment.compatibleControllerTypes
          : [input.controller.controllerType],
      compatibilityWarnings: input.validationReport.warnings.map(
        (warning) => warning.message,
      ),
      requestPayload: input.requestPayload,
    },
  };
}

function buildDetectorsMapping(
  detectors: DetectorEntity[],
  signalGroups: ControllerSignalGroup[],
): ControllerDetectorMapping[] {
  return detectors.map((detector) => {
    const assignedPhaseSequenceNumbers = [
      ...new Set(detector.assignedPhaseSequenceNumbers ?? []),
    ].sort((left, right) => left - right);
    const signalGroupCodes = signalGroups
      .filter((signalGroup) =>
        signalGroup.phaseSequenceNumbers.some((sequenceNumber) =>
          assignedPhaseSequenceNumbers.includes(sequenceNumber),
        ),
      )
      .map((signalGroup) => signalGroup.code);

    return {
      id: detector.id,
      code: detector.code,
      name: detector.name,
      type: detector.type,
      laneReference: detector.laneReference,
      channel: detector.laneReference ?? detector.code,
      controllerId: detector.controllerId,
      assignedPhaseSequenceNumbers,
      signalGroupCodes,
      active: detector.isActive,
    };
  });
}

function buildSignalGroups(
  phases: PhaseEntity[],
  detectors: DetectorEntity[],
): ControllerSignalGroup[] {
  return phases.map((phase) => ({
    code: buildSignalGroupCode(phase.sequenceNumber),
    name: phase.name,
    approach: phase.approach,
    movementGroup: phase.movementGroup,
    phaseSequenceNumbers: [phase.sequenceNumber],
    protectedMovement: phase.isProtected,
    detectorCodes: detectors
      .filter((detector) =>
        (detector.assignedPhaseSequenceNumbers ?? []).includes(
          phase.sequenceNumber,
        ),
      )
      .map((detector) => detector.code),
  }));
}

function buildPhasePayloads(
  phases: PhaseEntity[],
  detectors: DetectorEntity[],
): ControllerPhasePayload[] {
  return phases.map((phase) => ({
    sequenceNumber: phase.sequenceNumber,
    name: phase.name,
    approach: phase.approach,
    movementGroup: phase.movementGroup,
    phaseType: phase.phaseType,
    signalGroupCode: buildSignalGroupCode(phase.sequenceNumber),
    minGreenSeconds: phase.minGreenSeconds,
    yellowSeconds: phase.yellowSeconds,
    redClearanceSeconds: phase.redClearanceSeconds,
    pedestrianWalkSeconds: phase.pedestrianWalkSeconds,
    pedestrianClearSeconds: phase.pedestrianClearSeconds,
    isProtected: phase.isProtected,
    clearanceGroup: phase.clearanceGroup,
    allowedConcurrentPhaseSequenceNumbers:
      phase.allowedConcurrentPhaseSequenceNumbers,
    conflictingPhaseSequenceNumbers: phase.conflictingPhaseSequenceNumbers,
    detectorCodes: detectors
      .filter((detector) =>
        (detector.assignedPhaseSequenceNumbers ?? []).includes(
          phase.sequenceNumber,
        ),
      )
      .map((detector) => detector.code),
  }));
}

function buildInterphases(phases: PhaseEntity[]): ControllerInterphase[] {
  const entries: ControllerInterphase[] = [];

  for (const phase of phases) {
    for (const targetSequenceNumber of phase.conflictingPhaseSequenceNumbers) {
      const targetPhase = phases.find(
        (candidate) => candidate.sequenceNumber === targetSequenceNumber,
      );

      if (!targetPhase) {
        continue;
      }

      entries.push({
        key: `${phase.sequenceNumber}-${targetPhase.sequenceNumber}`,
        fromPhaseSequenceNumber: phase.sequenceNumber,
        toPhaseSequenceNumber: targetPhase.sequenceNumber,
        clearanceSeconds: phase.yellowSeconds + phase.redClearanceSeconds,
        transitionType: resolveTransitionType(phase, targetPhase),
      });
    }
  }

  return entries;
}

function buildTimingPlanPayload(
  timingPlan: TimingPlanEntity,
): ControllerTimingPlanPayload {
  return {
    id: timingPlan.id,
    code: timingPlan.code,
    name: timingPlan.name,
    status: timingPlan.status,
    cycleLengthSeconds: timingPlan.cycleLengthSeconds,
    offsetSeconds: timingPlan.offsetSeconds,
    simulationOnly: timingPlan.simulationOnly,
    stagePlan: readStagePlan(timingPlan.planData),
    scheduleConfig:
      (timingPlan.scheduleConfig as Record<string, unknown> | null) ?? {},
  };
}

function buildSafetyRules(
  phases: PhaseEntity[],
  validationReport: ValidationReport,
  controller: ControllerEntity,
): ControllerSafetyRules {
  return {
    validationSummary: validationReport.summary,
    validationGeneratedAt: validationReport.generatedAt,
    conflictMatrix: phases.map((phase) => ({
      phaseSequenceNumber: phase.sequenceNumber,
      conflictingPhaseSequenceNumbers: phase.conflictingPhaseSequenceNumbers,
    })),
    concurrencyMatrix: phases.map((phase) => ({
      phaseSequenceNumber: phase.sequenceNumber,
      allowedConcurrentPhaseSequenceNumbers:
        phase.allowedConcurrentPhaseSequenceNumbers,
    })),
    minimumClearances: phases.map((phase) => ({
      phaseSequenceNumber: phase.sequenceNumber,
      yellowSeconds: phase.yellowSeconds,
      redClearanceSeconds: phase.redClearanceSeconds,
    })),
    phaseValidationErrors: validationReport.errors.map(
      (error) => error.message,
    ),
    phaseValidationWarnings: validationReport.warnings.map(
      (warning) => warning.message,
    ),
    runtimeLimits: {
      detectorCapacity: controller.detectorCapacity,
      signalGroupCapacity: controller.signalGroupCapacity,
    },
  };
}

function buildSignalGroupCode(sequenceNumber: number) {
  return `SG-${sequenceNumber.toString().padStart(3, '0')}`;
}

function readStagePlan(planData: Record<string, unknown>) {
  const stageCandidates =
    (Array.isArray(planData.stagePlan) ? planData.stagePlan : undefined) ??
    (Array.isArray(planData.stages) ? planData.stages : undefined) ??
    [];

  return stageCandidates.flatMap((stage, index) => {
    if (!stage || typeof stage !== 'object') {
      return [];
    }

    const stageRecord = stage as Record<string, unknown>;
    const phaseSequenceNumbers = Array.isArray(stageRecord.phaseSequenceNumbers)
      ? stageRecord.phaseSequenceNumbers.map((value) => Number(value))
      : [];

    return [
      {
        key:
          typeof stageRecord.key === 'string' && stageRecord.key.length > 0
            ? stageRecord.key
            : `stage-${index + 1}`,
        name:
          typeof stageRecord.name === 'string' && stageRecord.name.length > 0
            ? stageRecord.name
            : `Stage ${index + 1}`,
        splitSeconds: Number(stageRecord.splitSeconds ?? 0),
        phaseSequenceNumbers,
      },
    ];
  });
}

function resolveTransitionType(
  phase: PhaseEntity,
  targetPhase: PhaseEntity,
): ControllerInterphase['transitionType'] {
  if (
    phase.phaseType === PhaseType.PEDESTRIAN ||
    targetPhase.phaseType === PhaseType.PEDESTRIAN
  ) {
    return 'pedestrian_clearance';
  }

  if (
    phase.conflictingPhaseSequenceNumbers.includes(targetPhase.sequenceNumber)
  ) {
    return 'all_red';
  }

  return 'yellow_change';
}

export function buildControllerRuntimeBasePackage(input: {
  controller: ControllerEntity;
  intersection: IntersectionEntity;
  deployment: DeploymentEntity;
  detectors: DetectorEntity[];
  phases: PhaseEntity[];
  timingPlan: TimingPlanEntity;
  validationReport: ValidationReport;
  requestPayload: Record<string, unknown>;
  scenarioCode: string | null;
}): Omit<ControllerRuntimePackage, 'signatureMetadata'> {
  const sections = buildControllerRuntimeSections(input);

  return {
    schemaVersion: CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION,
    controllerIdentity: {
      id: input.controller.id,
      code: input.controller.code,
      controllerType: input.controller.controllerType,
      runtimeVersion: input.controller.runtimeVersion,
      firmwareVersion: input.controller.firmwareVersion,
      supportedPackageSchemaVersion:
        input.controller.supportedPackageSchemaVersion,
      environment: input.controller.operatingEnvironment,
    },
    intersectionIdentity: {
      id: input.intersection.id,
      code: input.intersection.code,
      name: input.intersection.name,
      district: input.intersection.district,
      address: input.intersection.address,
      latitude: Number(input.intersection.latitude),
      longitude: Number(input.intersection.longitude),
    },
    operatingEnvironment: input.deployment.targetEnvironment,
    detectorsMapping: sections.detectorsMapping,
    signalGroups: sections.signalGroups,
    phases: sections.phases,
    interphases: sections.interphases,
    timingPlans: sections.timingPlans,
    safetyRules: sections.safetyRules,
    deploymentMetadata: sections.deploymentMetadata,
  };
}

export function buildSignatureMetadata(input: {
  digest: string;
  signature: string | null;
  signedAt: string | null;
}) {
  return {
    algorithm: 'HMAC-SHA256' as const,
    digestAlgorithm: 'SHA-256' as const,
    digest: input.digest,
    signature: input.signature,
    signedAt: input.signedAt,
    signer: 'stls-control-plane',
  };
}

export function mapControllerEventSeverity(
  hasError: boolean,
  hasWarnings: boolean,
) {
  if (hasError) {
    return AlarmSeverity.CRITICAL;
  }

  if (hasWarnings) {
    return AlarmSeverity.WARNING;
  }

  return AlarmSeverity.INFO;
}

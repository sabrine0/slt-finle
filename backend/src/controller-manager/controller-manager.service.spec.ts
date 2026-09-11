import {
  ControllerConnectionState,
  ControllerDeploymentState,
  ControllerType,
  DeploymentStatus,
  DeploymentTargetType,
  IntersectionControlMode,
  OperatingEnvironment,
  TimingPlanStatus,
  type ControllerEntity,
  type DeploymentEntity,
  type DetectorEntity,
  type IntersectionEntity,
  type PhaseEntity,
  type TimingPlanEntity,
} from '../database/entities';
import type { DeploymentConfigurationContext } from '../engineering/engineering.types';
import { ControllerManagerService } from './controller-manager.service';

describe('ControllerManagerService compatibility validation', () => {
  const service = new ControllerManagerService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  it('rejects deployments when runtime version and detector capacity do not match', () => {
    const controller = buildController({
      runtimeVersion: '2.3.0',
      detectorCapacity: 1,
    });
    const deployment = buildDeployment({
      controllerId: controller.id,
      requiredRuntimeVersion: '2.5.0',
      compatibleControllerTypes: [ControllerType.ATC],
    });
    const context = buildContext({
      controllers: [controller],
      detectors: [buildDetector('DET-1'), buildDetector('DET-2')],
    });

    const result = service.validateDeploymentCompatibility({
      deployment,
      context,
    });

    expect(result.valid).toBe(false);
    expect(result.targetController?.id).toBe(controller.id);
    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'controller.compatibility.runtime-version',
        'controller.compatibility.detector-capacity',
      ]),
    );
  });

  it('requires a specific controller target when multiple compatible controllers exist', () => {
    const context = buildContext({
      controllers: [
        buildController({ id: 'controller-a', code: 'CTRL-A' }),
        buildController({ id: 'controller-b', code: 'CTRL-B' }),
      ],
    });
    const deployment = buildDeployment({
      controllerId: null,
      requiredRuntimeVersion: null,
      compatibleControllerTypes: [],
    });

    const result = service.validateDeploymentCompatibility({
      deployment,
      context,
    });

    expect(result.valid).toBe(false);
    expect(result.targetController).toBeNull();
    expect(result.errors.map((issue) => issue.code)).toContain(
      'controller.compatibility.ambiguous-target',
    );
  });
});

function buildController(overrides: Partial<ControllerEntity> = {}) {
  return {
    id: 'controller-1',
    code: 'CTRL-1',
    firmwareVersion: 'v2.5.0',
    controllerType: ControllerType.ATC,
    runtimeVersion: '2.5.0',
    supportedPackageSchemaVersion: 1,
    connectionState: ControllerConnectionState.ONLINE,
    operatingEnvironment: OperatingEnvironment.REAL,
    batteryBacked: true,
    uptimeHours: 10,
    detectorCapacity: 8,
    signalGroupCapacity: 8,
    isPrimary: true,
    lastSeen: new Date(),
    lastDeployedPackageVersion: null,
    lastDeploymentState: ControllerDeploymentState.IDLE,
    lastDeploymentAt: null,
    lastTelemetryAt: null,
    telemetrySummary: {},
    lastKnownIpAddress: null,
    intersectionId: 'intersection-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ControllerEntity;
}

function buildDeployment(overrides: Partial<DeploymentEntity> = {}) {
  return {
    id: 'deployment-1',
    status: DeploymentStatus.DRAFT,
    targetType: DeploymentTargetType.TIMING_PLAN,
    targetEnvironment: OperatingEnvironment.REAL,
    operatingMode: IntersectionControlMode.ADAPTIVE,
    payload: {},
    packageManifest: {},
    validationReport: {},
    packageVersion: 'PKG-1',
    packageDigest: 'digest',
    packageSignature: null,
    requiredRuntimeVersion: '2.5.0',
    compatibleControllerTypes: [ControllerType.ATC],
    runtimeContractSchemaVersion: 1,
    resultSummary: null,
    isSigned: false,
    requestedAt: new Date(),
    validatedAt: null,
    signedAt: null,
    publishedAt: null,
    acknowledgedAt: null,
    completedAt: null,
    rolledBackAt: null,
    controllerReportedPackageDigest: null,
    requestedByUserId: null,
    acknowledgedByControllerId: null,
    intersectionId: 'intersection-1',
    controllerId: 'controller-1',
    timingPlanId: 'timing-plan-1',
    scenarioId: null,
    rollbackOfDeploymentId: null,
    supersededByDeploymentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DeploymentEntity;
}

function buildContext(
  overrides: Partial<DeploymentConfigurationContext> = {},
): DeploymentConfigurationContext {
  return {
    intersection: {
      id: 'intersection-1',
      code: 'INT-1',
      name: 'Main',
      district: 'Central',
      address: 'Main x 1st',
      latitude: 0,
      longitude: 0,
      controlMode: IntersectionControlMode.ADAPTIVE,
      status: 'healthy',
      queueLength: 0,
      incidents: 0,
      averageDelaySeconds: 0,
      lastHeartbeat: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as IntersectionEntity,
    controllers: [buildController()],
    detectors: [buildDetector('DET-1')],
    phases: [buildPhase(1), buildPhase(2)],
    timingPlan: {
      id: 'timing-plan-1',
      code: 'TP-1',
      name: 'Plan 1',
      status: TimingPlanStatus.ACTIVE,
      cycleLengthSeconds: 90,
      offsetSeconds: 0,
      simulationOnly: false,
      scheduleConfig: {},
      planData: {},
      intersectionId: 'intersection-1',
      scenarioId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TimingPlanEntity,
    scenario: null,
    ...overrides,
  };
}

function buildDetector(code: string) {
  return {
    id: code,
    code,
    name: code,
    type: 'loop',
    laneReference: 'N1',
    isActive: true,
    lastTriggeredAt: null,
    assignedPhaseSequenceNumbers: [1],
    intersectionId: 'intersection-1',
    controllerId: 'controller-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DetectorEntity;
}

function buildPhase(sequenceNumber: number) {
  return {
    id: `phase-${sequenceNumber}`,
    sequenceNumber,
    name: `Phase ${sequenceNumber}`,
    approach: 'north-south',
    movementGroup: 'through',
    phaseType: 'vehicle',
    minGreenSeconds: 20,
    yellowSeconds: 4,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds: null,
    pedestrianClearSeconds: null,
    isProtected: true,
    clearanceGroup: null,
    allowedConcurrentPhaseSequenceNumbers: [],
    conflictingPhaseSequenceNumbers: [sequenceNumber === 1 ? 2 : 1],
    intersectionId: 'intersection-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as PhaseEntity;
}

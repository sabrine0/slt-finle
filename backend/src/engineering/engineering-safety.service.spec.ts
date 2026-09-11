import {
  OperatingEnvironment,
  PhaseType,
  TimingPlanStatus,
  type ControllerEntity,
  type PhaseEntity,
  type TimingPlanEntity,
} from '../database/entities';
import { EngineeringSafetyService } from './engineering-safety.service';

describe('EngineeringSafetyService', () => {
  const service = new EngineeringSafetyService();

  it('accepts a timing plan with one safe phase per stage', () => {
    const phases = [
      createPhase(1, 'North-South Through', PhaseType.VEHICLE, 28),
      createPhase(2, 'East-West Through', PhaseType.VEHICLE, 24),
      createPhase(3, 'Protected Turn', PhaseType.VEHICLE, 12),
      createPhase(4, 'Pedestrian', PhaseType.PEDESTRIAN, 16, 16, 10),
    ];
    const timingPlan = createTimingPlan({
      cycleLengthSeconds: 108,
      planData: {
        stagePlan: [
          {
            key: 'stage-1',
            name: 'Stage 1',
            splitSeconds: 30,
            phaseSequenceNumbers: [1],
          },
          {
            key: 'stage-2',
            name: 'Stage 2',
            splitSeconds: 28,
            phaseSequenceNumbers: [2],
          },
          {
            key: 'stage-3',
            name: 'Stage 3',
            splitSeconds: 20,
            phaseSequenceNumbers: [3],
          },
          {
            key: 'stage-4',
            name: 'Stage 4',
            splitSeconds: 30,
            phaseSequenceNumbers: [4],
          },
        ],
      },
    });
    const controllers = [createController(OperatingEnvironment.REAL)];

    const report = service.validateTimingPlanConfiguration({
      phases,
      timingPlan,
      controllers,
      scenario: null,
      targetEnvironment: OperatingEnvironment.REAL,
    });

    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
  });

  it('rejects unsafe concurrent conflicting phases', () => {
    const phases = [
      createPhase(1, 'North-South Through', PhaseType.VEHICLE, 28, null, null, {
        conflictingPhaseSequenceNumbers: [2],
        allowedConcurrentPhaseSequenceNumbers: [2],
      }),
      createPhase(2, 'East-West Through', PhaseType.VEHICLE, 24, null, null, {
        conflictingPhaseSequenceNumbers: [1],
        allowedConcurrentPhaseSequenceNumbers: [1],
      }),
    ];
    const timingPlan = createTimingPlan({
      cycleLengthSeconds: 60,
      planData: {
        stagePlan: [
          {
            key: 'stage-1',
            name: 'Unsafe Stage',
            splitSeconds: 60,
            phaseSequenceNumbers: [1, 2],
          },
        ],
      },
    });
    const controllers = [createController(OperatingEnvironment.REAL)];

    const report = service.validateTimingPlanConfiguration({
      phases,
      timingPlan,
      controllers,
      scenario: null,
      targetEnvironment: OperatingEnvironment.REAL,
    });

    expect(report.valid).toBe(false);
    expect(
      report.errors.some(
        (issue) => issue.code === 'unsafe-concurrent-phase-conflict',
      ),
    ).toBe(true);
  });
});

function createPhase(
  sequenceNumber: number,
  name: string,
  phaseType: PhaseType,
  minGreenSeconds: number,
  pedestrianWalkSeconds: number | null = null,
  pedestrianClearSeconds: number | null = null,
  overrides?: Partial<PhaseEntity>,
): PhaseEntity {
  return {
    id: `phase-${sequenceNumber}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    sequenceNumber,
    name,
    approach: `approach-${sequenceNumber}`,
    movementGroup: name,
    phaseType,
    minGreenSeconds,
    yellowSeconds: 3,
    redClearanceSeconds: 2,
    pedestrianWalkSeconds,
    pedestrianClearSeconds,
    isProtected: true,
    clearanceGroup: `group-${sequenceNumber}`,
    allowedConcurrentPhaseSequenceNumbers: [],
    conflictingPhaseSequenceNumbers: [],
    intersectionId: 'intersection-1',
    ...overrides,
  } as PhaseEntity;
}

function createTimingPlan(
  overrides?: Partial<TimingPlanEntity>,
): TimingPlanEntity {
  return {
    id: 'timing-plan-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    code: 'TP-001',
    name: 'Test timing plan',
    status: TimingPlanStatus.DRAFT,
    cycleLengthSeconds: 60,
    offsetSeconds: 0,
    simulationOnly: false,
    scheduleConfig: {},
    planData: {},
    intersectionId: 'intersection-1',
    scenarioId: null,
    ...overrides,
  } as TimingPlanEntity;
}

function createController(
  operatingEnvironment: OperatingEnvironment,
): ControllerEntity {
  return {
    id: 'controller-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    code: 'CTRL-001',
    firmwareVersion: 'v1',
    connectionState: 'online',
    operatingEnvironment,
    batteryBacked: true,
    uptimeHours: 10,
    isPrimary: true,
    lastSeen: new Date(),
    intersectionId: 'intersection-1',
  } as ControllerEntity;
}

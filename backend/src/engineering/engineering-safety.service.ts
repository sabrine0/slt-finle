import { Injectable } from '@nestjs/common';

import {
  ControllerEntity,
  OperatingEnvironment,
  PhaseEntity,
  PhaseType,
  ScenarioEntity,
  ScenarioTarget,
  TimingPlanEntity,
} from '../database/entities';
import type {
  StagePlan,
  ValidationIssue,
  ValidationReport,
} from './engineering.types';

@Injectable()
export class EngineeringSafetyService {
  validatePhaseSet(phases: PhaseEntity[]): ValidationReport {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const phasesBySequence = new Map<number, PhaseEntity>();

    for (const phase of phases) {
      if (phasesBySequence.has(phase.sequenceNumber)) {
        errors.push({
          code: 'duplicate-phase-sequence',
          message: `Phase sequence ${phase.sequenceNumber} is duplicated within the intersection.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber],
        });
      } else {
        phasesBySequence.set(phase.sequenceNumber, phase);
      }

      if (
        phase.allowedConcurrentPhaseSequenceNumbers.includes(
          phase.sequenceNumber,
        )
      ) {
        errors.push({
          code: 'phase-self-allow',
          message: `Phase ${phase.sequenceNumber} cannot explicitly allow itself.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber],
        });
      }

      if (
        phase.conflictingPhaseSequenceNumbers.includes(phase.sequenceNumber)
      ) {
        errors.push({
          code: 'phase-self-conflict',
          message: `Phase ${phase.sequenceNumber} cannot explicitly conflict with itself.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber],
        });
      }

      const overlap = phase.allowedConcurrentPhaseSequenceNumbers.filter(
        (sequence) => phase.conflictingPhaseSequenceNumbers.includes(sequence),
      );

      if (overlap.length > 0) {
        errors.push({
          code: 'phase-conflict-overlap',
          message: `Phase ${phase.sequenceNumber} marks ${overlap.join(', ')} as both allowed and conflicting.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber, ...overlap],
        });
      }

      if (
        phase.phaseType === PhaseType.PEDESTRIAN &&
        (!phase.pedestrianWalkSeconds || !phase.pedestrianClearSeconds)
      ) {
        errors.push({
          code: 'pedestrian-clearance-required',
          message: `Pedestrian phase ${phase.sequenceNumber} must define walk and clearance durations.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber],
        });
      }

      if (
        phase.phaseType !== PhaseType.PEDESTRIAN &&
        (phase.pedestrianWalkSeconds || phase.pedestrianClearSeconds)
      ) {
        warnings.push({
          code: 'vehicle-phase-pedestrian-timing',
          message: `Phase ${phase.sequenceNumber} includes pedestrian timing but is typed as ${phase.phaseType}.`,
          relatedPhaseSequenceNumbers: [phase.sequenceNumber],
        });
      }
    }

    for (const phase of phases) {
      for (const allowedSequence of phase.allowedConcurrentPhaseSequenceNumbers) {
        const counterpart = phasesBySequence.get(allowedSequence);

        if (!counterpart) {
          errors.push({
            code: 'missing-allowed-phase-reference',
            message: `Phase ${phase.sequenceNumber} allows phase ${allowedSequence}, but that phase does not exist in the same intersection.`,
            relatedPhaseSequenceNumbers: [
              phase.sequenceNumber,
              allowedSequence,
            ],
          });
          continue;
        }

        if (
          !counterpart.allowedConcurrentPhaseSequenceNumbers.includes(
            phase.sequenceNumber,
          )
        ) {
          warnings.push({
            code: 'non-mutual-phase-allow',
            message: `Phase ${phase.sequenceNumber} allows phase ${allowedSequence}, but the reverse compatibility is not declared.`,
            relatedPhaseSequenceNumbers: [
              phase.sequenceNumber,
              allowedSequence,
            ],
          });
        }
      }

      for (const conflictingSequence of phase.conflictingPhaseSequenceNumbers) {
        const counterpart = phasesBySequence.get(conflictingSequence);

        if (!counterpart) {
          errors.push({
            code: 'missing-conflict-phase-reference',
            message: `Phase ${phase.sequenceNumber} conflicts with phase ${conflictingSequence}, but that phase does not exist in the same intersection.`,
            relatedPhaseSequenceNumbers: [
              phase.sequenceNumber,
              conflictingSequence,
            ],
          });
          continue;
        }

        if (
          !counterpart.conflictingPhaseSequenceNumbers.includes(
            phase.sequenceNumber,
          )
        ) {
          warnings.push({
            code: 'non-mutual-phase-conflict',
            message: `Phase ${phase.sequenceNumber} conflicts with phase ${conflictingSequence}, but the reverse conflict is not declared.`,
            relatedPhaseSequenceNumbers: [
              phase.sequenceNumber,
              conflictingSequence,
            ],
          });
        }
      }
    }

    return buildValidationReport({
      errors,
      warnings,
      cycleLengthSeconds: 0,
      configuredStageSeconds: 0,
      phaseCount: phases.length,
    });
  }

  validateTimingPlanConfiguration(input: {
    phases: PhaseEntity[];
    timingPlan: TimingPlanEntity;
    controllers: ControllerEntity[];
    scenario: ScenarioEntity | null;
    targetEnvironment: OperatingEnvironment;
    targetControllerId?: string | null;
  }): ValidationReport {
    const phaseReport = this.validatePhaseSet(input.phases);
    const errors = [...phaseReport.errors];
    const warnings = [...phaseReport.warnings];
    const phasesBySequence = new Map(
      input.phases.map((phase) => [phase.sequenceNumber, phase]),
    );
    const stagePlan = readStagePlan(input.timingPlan.planData);
    let configuredStageSeconds = 0;

    if (stagePlan.length === 0) {
      errors.push({
        code: 'missing-stage-plan',
        message:
          'Timing plan planData must include a non-empty stagePlan or stages array.',
      });
    }

    for (const stage of stagePlan) {
      configuredStageSeconds += stage.splitSeconds;

      if (!Number.isInteger(stage.splitSeconds) || stage.splitSeconds <= 0) {
        errors.push({
          code: 'invalid-stage-split',
          message: `Stage ${stage.name} must define a positive integer split.`,
          metadata: { stage: stage.name },
        });
      }

      const uniquePhaseSequences = new Set(stage.phaseSequenceNumbers);

      if (uniquePhaseSequences.size !== stage.phaseSequenceNumbers.length) {
        errors.push({
          code: 'duplicate-stage-phase',
          message: `Stage ${stage.name} contains the same phase more than once.`,
          relatedPhaseSequenceNumbers: stage.phaseSequenceNumbers,
          metadata: { stage: stage.name },
        });
      }

      const stagePhases: PhaseEntity[] = [];

      for (const phaseSequence of stage.phaseSequenceNumbers) {
        const phase = phasesBySequence.get(phaseSequence);

        if (!phase) {
          errors.push({
            code: 'unknown-stage-phase',
            message: `Stage ${stage.name} references phase ${phaseSequence}, which does not exist in the intersection.`,
            relatedPhaseSequenceNumbers: [phaseSequence],
            metadata: { stage: stage.name },
          });
          continue;
        }

        stagePhases.push(phase);

        const minimumStageSeconds = Math.max(
          phase.minGreenSeconds,
          (phase.pedestrianWalkSeconds ?? 0) +
            (phase.pedestrianClearSeconds ?? 0),
        );

        if (stage.splitSeconds < minimumStageSeconds) {
          errors.push({
            code: 'insufficient-stage-duration',
            message: `Stage ${stage.name} allocates ${stage.splitSeconds}s, below the ${minimumStageSeconds}s minimum required for phase ${phase.sequenceNumber}.`,
            relatedPhaseSequenceNumbers: [phase.sequenceNumber],
            metadata: { stage: stage.name, minimumStageSeconds },
          });
        }
      }

      for (let index = 0; index < stagePhases.length; index += 1) {
        const leftPhase = stagePhases[index];

        for (
          let comparisonIndex = index + 1;
          comparisonIndex < stagePhases.length;
          comparisonIndex += 1
        ) {
          const rightPhase = stagePhases[comparisonIndex];

          if (
            leftPhase.conflictingPhaseSequenceNumbers.includes(
              rightPhase.sequenceNumber,
            ) ||
            rightPhase.conflictingPhaseSequenceNumbers.includes(
              leftPhase.sequenceNumber,
            )
          ) {
            errors.push({
              code: 'unsafe-concurrent-phase-conflict',
              message: `Stage ${stage.name} combines phases ${leftPhase.sequenceNumber} and ${rightPhase.sequenceNumber}, which are marked as conflicting.`,
              relatedPhaseSequenceNumbers: [
                leftPhase.sequenceNumber,
                rightPhase.sequenceNumber,
              ],
              metadata: { stage: stage.name },
            });
          }

          if (
            leftPhase.clearanceGroup &&
            rightPhase.clearanceGroup &&
            leftPhase.clearanceGroup === rightPhase.clearanceGroup
          ) {
            errors.push({
              code: 'shared-clearance-group',
              message: `Stage ${stage.name} combines phases ${leftPhase.sequenceNumber} and ${rightPhase.sequenceNumber}, which share clearance group ${leftPhase.clearanceGroup}.`,
              relatedPhaseSequenceNumbers: [
                leftPhase.sequenceNumber,
                rightPhase.sequenceNumber,
              ],
              metadata: { stage: stage.name },
            });
          }

          const isExplicitlyAllowed =
            leftPhase.allowedConcurrentPhaseSequenceNumbers.includes(
              rightPhase.sequenceNumber,
            ) &&
            rightPhase.allowedConcurrentPhaseSequenceNumbers.includes(
              leftPhase.sequenceNumber,
            );

          if (!isExplicitlyAllowed) {
            errors.push({
              code: 'unsafe-concurrent-phase-allow',
              message: `Stage ${stage.name} combines phases ${leftPhase.sequenceNumber} and ${rightPhase.sequenceNumber} without mutual explicit concurrency approval.`,
              relatedPhaseSequenceNumbers: [
                leftPhase.sequenceNumber,
                rightPhase.sequenceNumber,
              ],
              metadata: { stage: stage.name },
            });
          }
        }
      }
    }

    if (configuredStageSeconds !== input.timingPlan.cycleLengthSeconds) {
      errors.push({
        code: 'cycle-length-mismatch',
        message: `Stage splits total ${configuredStageSeconds}s, but the timing plan cycle is ${input.timingPlan.cycleLengthSeconds}s.`,
      });
    }

    if (
      input.timingPlan.simulationOnly &&
      input.targetEnvironment === OperatingEnvironment.REAL
    ) {
      errors.push({
        code: 'simulation-only-plan',
        message:
          'A simulation-only timing plan cannot be published to a real controller environment.',
      });
    }

    const controllersForEnvironment = input.controllers.filter(
      (controller) =>
        controller.operatingEnvironment === input.targetEnvironment,
    );

    if (controllersForEnvironment.length === 0) {
      errors.push({
        code: 'missing-target-controller',
        message: `No controller is registered for the ${input.targetEnvironment} environment on this intersection.`,
      });
    }

    if (input.targetControllerId) {
      const targetController = input.controllers.find(
        (controller) => controller.id === input.targetControllerId,
      );

      if (!targetController) {
        errors.push({
          code: 'unknown-target-controller',
          message:
            'The selected deployment controller does not belong to the intersection.',
        });
      } else if (
        targetController.operatingEnvironment !== input.targetEnvironment
      ) {
        errors.push({
          code: 'controller-environment-mismatch',
          message: `Controller ${targetController.code} runs in ${targetController.operatingEnvironment}, not ${input.targetEnvironment}.`,
        });
      }
    }

    if (input.scenario) {
      if (
        input.targetEnvironment === OperatingEnvironment.REAL &&
        input.scenario.appliesTo === ScenarioTarget.SIMULATION
      ) {
        errors.push({
          code: 'scenario-environment-mismatch',
          message: `Scenario ${input.scenario.code} is simulation-only and cannot be deployed to real controllers.`,
        });
      }

      if (
        input.targetEnvironment === OperatingEnvironment.SIMULATION &&
        input.scenario.appliesTo === ScenarioTarget.REAL
      ) {
        errors.push({
          code: 'scenario-environment-mismatch',
          message: `Scenario ${input.scenario.code} is real-only and cannot be deployed to simulation controllers.`,
        });
      }
    }

    const referencedPhaseSequences = new Set<number>();

    for (const stage of stagePlan) {
      for (const phaseSequence of stage.phaseSequenceNumbers) {
        referencedPhaseSequences.add(phaseSequence);
      }
    }

    const unassignedPhases = input.phases
      .map((phase) => phase.sequenceNumber)
      .filter((sequence) => !referencedPhaseSequences.has(sequence));

    if (unassignedPhases.length > 0) {
      warnings.push({
        code: 'unassigned-phases',
        message: `The timing plan does not reference phases ${unassignedPhases.join(', ')}.`,
        relatedPhaseSequenceNumbers: unassignedPhases,
      });
    }

    return buildValidationReport({
      errors,
      warnings,
      cycleLengthSeconds: input.timingPlan.cycleLengthSeconds,
      configuredStageSeconds,
      phaseCount: input.phases.length,
    });
  }
}

function readStagePlan(planData: Record<string, unknown>): StagePlan[] {
  const candidate =
    (Array.isArray(planData.stagePlan) ? planData.stagePlan : undefined) ??
    (Array.isArray(planData.stages) ? planData.stages : undefined) ??
    [];

  return candidate.flatMap((stage, index) => {
    if (!stage || typeof stage !== 'object') {
      return [];
    }

    const stageRecord = stage as Record<string, unknown>;
    const phaseSequenceNumbers = Array.isArray(stageRecord.phaseSequenceNumbers)
      ? stageRecord.phaseSequenceNumbers
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      : [];

    return [
      {
        key:
          typeof stageRecord.key === 'string' &&
          stageRecord.key.trim().length > 0
            ? stageRecord.key
            : `stage-${index + 1}`,
        name:
          typeof stageRecord.name === 'string' &&
          stageRecord.name.trim().length > 0
            ? stageRecord.name
            : `Stage ${index + 1}`,
        splitSeconds: Number(stageRecord.splitSeconds ?? 0),
        phaseSequenceNumbers,
      },
    ];
  });
}

function buildValidationReport(input: {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  cycleLengthSeconds: number;
  configuredStageSeconds: number;
  phaseCount: number;
}): ValidationReport {
  return {
    valid: input.errors.length === 0,
    errors: input.errors,
    warnings: input.warnings,
    generatedAt: new Date().toISOString(),
    cycleLengthSeconds: input.cycleLengthSeconds,
    configuredStageSeconds: input.configuredStageSeconds,
    phaseCount: input.phaseCount,
    summary: `${input.errors.length} errors, ${input.warnings.length} warnings`,
  };
}

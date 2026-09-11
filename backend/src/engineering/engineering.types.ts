import type { ControllerRuntimePackage } from '../controller-manager/controller-runtime-contract';
import type {
  ControllerEntity,
  DetectorEntity,
  IntersectionEntity,
  PhaseEntity,
  ScenarioEntity,
  TimingPlanEntity,
} from '../database/entities';

export interface ValidationIssue {
  code: string;
  message: string;
  relatedPhaseSequenceNumbers?: number[];
  metadata?: Record<string, unknown>;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  generatedAt: string;
  cycleLengthSeconds: number;
  configuredStageSeconds: number;
  phaseCount: number;
  summary: string;
}

export interface StagePlan {
  key: string;
  name: string;
  splitSeconds: number;
  phaseSequenceNumbers: number[];
}

export type DeploymentPackageDocument = ControllerRuntimePackage;

export interface DeploymentConfigurationContext {
  intersection: IntersectionEntity;
  controllers: ControllerEntity[];
  detectors: DetectorEntity[];
  phases: PhaseEntity[];
  timingPlan: TimingPlanEntity;
  scenario: ScenarioEntity | null;
}

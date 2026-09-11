import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

import {
  ControllerConnectionState,
  ControllerType,
  DeploymentTargetType,
  DetectorType,
  IntersectionControlMode,
  OperatingEnvironment,
  PhaseType,
  ScenarioTarget,
  TimingPlanStatus,
} from '../../database/entities';

export class CreateIntersectionDto {
  @IsString()
  @Length(3, 64)
  code!: string;

  @IsString()
  @Length(3, 160)
  name!: string;

  @IsString()
  @Length(2, 120)
  district!: string;

  @IsString()
  @Length(3, 255)
  address!: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsEnum(IntersectionControlMode)
  controlMode!: IntersectionControlMode;
}

export class UpdateIntersectionDto {
  @IsOptional()
  @IsString()
  @Length(3, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsEnum(IntersectionControlMode)
  controlMode?: IntersectionControlMode;
}

export class CreateControllerDto {
  @IsString()
  @Length(3, 80)
  code!: string;

  @IsString()
  @Length(3, 64)
  firmwareVersion!: string;

  @IsOptional()
  @IsEnum(ControllerType)
  controllerType?: ControllerType;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  runtimeVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  supportedPackageSchemaVersion?: number;

  @IsOptional()
  @IsEnum(ControllerConnectionState)
  connectionState?: ControllerConnectionState;

  @IsEnum(OperatingEnvironment)
  operatingEnvironment!: OperatingEnvironment;

  @IsOptional()
  @IsBoolean()
  batteryBacked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  uptimeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  detectorCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  signalGroupCapacity?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsUUID()
  intersectionId!: string;
}

export class UpdateControllerDto {
  @IsOptional()
  @IsString()
  @Length(3, 64)
  firmwareVersion?: string;

  @IsOptional()
  @IsEnum(ControllerType)
  controllerType?: ControllerType;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  runtimeVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  supportedPackageSchemaVersion?: number;

  @IsOptional()
  @IsEnum(ControllerConnectionState)
  connectionState?: ControllerConnectionState;

  @IsOptional()
  @IsEnum(OperatingEnvironment)
  operatingEnvironment?: OperatingEnvironment;

  @IsOptional()
  @IsBoolean()
  batteryBacked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  uptimeHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  detectorCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  signalGroupCapacity?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsUUID()
  intersectionId?: string;
}

export class CreateDetectorDto {
  @IsString()
  @Length(3, 80)
  code!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsEnum(DetectorType)
  type!: DetectorType;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  laneReference?: string | null;

  @IsUUID()
  intersectionId!: string;

  @IsOptional()
  @IsUUID()
  controllerId?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  assignedPhaseSequenceNumbers?: number[];
}

export class UpdateDetectorDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsEnum(DetectorType)
  type?: DetectorType;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  laneReference?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  controllerId?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  assignedPhaseSequenceNumbers?: number[];
}

export class CreatePhaseDto {
  @IsInt()
  @Min(1)
  sequenceNumber!: number;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 32)
  approach!: string;

  @IsString()
  @Length(2, 120)
  movementGroup!: string;

  @IsEnum(PhaseType)
  phaseType!: PhaseType;

  @IsInt()
  @Min(1)
  minGreenSeconds!: number;

  @IsInt()
  @Min(1)
  yellowSeconds!: number;

  @IsInt()
  @Min(1)
  redClearanceSeconds!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pedestrianWalkSeconds?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  pedestrianClearSeconds?: number | null;

  @IsBoolean()
  isProtected!: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  clearanceGroup?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  allowedConcurrentPhaseSequenceNumbers?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  conflictingPhaseSequenceNumbers?: number[];

  @IsUUID()
  intersectionId!: string;
}

export class UpdatePhaseDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  sequenceNumber?: number;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 32)
  approach?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  movementGroup?: string;

  @IsOptional()
  @IsEnum(PhaseType)
  phaseType?: PhaseType;

  @IsOptional()
  @IsInt()
  @Min(1)
  minGreenSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  yellowSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  redClearanceSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pedestrianWalkSeconds?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  pedestrianClearSeconds?: number | null;

  @IsOptional()
  @IsBoolean()
  isProtected?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  clearanceGroup?: string | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  allowedConcurrentPhaseSequenceNumbers?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  conflictingPhaseSequenceNumbers?: number[];
}

export class CreateTimingPlanDto {
  @IsString()
  @Length(3, 80)
  code!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsEnum(TimingPlanStatus)
  status!: TimingPlanStatus;

  @IsInt()
  @Min(10)
  cycleLengthSeconds!: number;

  @IsInt()
  @Min(0)
  offsetSeconds!: number;

  @IsBoolean()
  simulationOnly!: boolean;

  @IsUUID()
  intersectionId!: string;

  @IsOptional()
  @IsUUID()
  scenarioId?: string | null;

  @IsOptional()
  @IsObject()
  scheduleConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  planData?: Record<string, unknown>;
}

export class UpdateTimingPlanDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsEnum(TimingPlanStatus)
  status?: TimingPlanStatus;

  @IsOptional()
  @IsInt()
  @Min(10)
  cycleLengthSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offsetSeconds?: number;

  @IsOptional()
  @IsBoolean()
  simulationOnly?: boolean;

  @IsOptional()
  @IsUUID()
  scenarioId?: string | null;

  @IsOptional()
  @IsObject()
  scheduleConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  planData?: Record<string, unknown>;
}

export class CreateScenarioDto {
  @IsString()
  @Length(3, 80)
  code!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsString()
  @Length(3, 255)
  description!: string;

  @IsEnum(ScenarioTarget)
  appliesTo!: ScenarioTarget;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class UpdateScenarioDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 255)
  description?: string;

  @IsOptional()
  @IsEnum(ScenarioTarget)
  appliesTo?: ScenarioTarget;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

export class CreateDeploymentDraftDto {
  @IsEnum(DeploymentTargetType)
  targetType!: DeploymentTargetType;

  @IsEnum(OperatingEnvironment)
  targetEnvironment!: OperatingEnvironment;

  @IsEnum(IntersectionControlMode)
  operatingMode!: IntersectionControlMode;

  @IsUUID()
  intersectionId!: string;

  @IsOptional()
  @IsUUID()
  controllerId?: string | null;

  @IsOptional()
  @IsUUID()
  timingPlanId?: string | null;

  @IsOptional()
  @IsUUID()
  scenarioId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  requiredRuntimeVersion?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(ControllerType, { each: true })
  compatibleControllerTypes?: ControllerType[];

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resultSummary?: string;
}

export class UpdateDeploymentDraftDto {
  @IsOptional()
  @IsEnum(DeploymentTargetType)
  targetType?: DeploymentTargetType;

  @IsOptional()
  @IsEnum(OperatingEnvironment)
  targetEnvironment?: OperatingEnvironment;

  @IsOptional()
  @IsEnum(IntersectionControlMode)
  operatingMode?: IntersectionControlMode;

  @IsOptional()
  @IsUUID()
  intersectionId?: string;

  @IsOptional()
  @IsUUID()
  controllerId?: string | null;

  @IsOptional()
  @IsUUID()
  timingPlanId?: string | null;

  @IsOptional()
  @IsUUID()
  scenarioId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  requiredRuntimeVersion?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(ControllerType, { each: true })
  compatibleControllerTypes?: ControllerType[];

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resultSummary?: string | null;
}

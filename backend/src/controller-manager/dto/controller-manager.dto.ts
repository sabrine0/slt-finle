import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

import {
  AlarmSeverity,
  ControllerConnectionState,
  ControllerDeploymentState,
  ControllerType,
  OperatingEnvironment,
} from '../../database/entities';

export class RegisterControllerDto {
  @IsString()
  @Length(3, 80)
  code!: string;

  @IsString()
  @Length(1, 64)
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

export class UpdateManagedControllerDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
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

export class IssueControllerCredentialDto {
  @IsString()
  @Length(3, 120)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}

export class ControllerBootstrapDto {
  @IsString()
  @Length(6, 80)
  clientId!: string;

  @IsString()
  @Length(12, 255)
  clientSecret!: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  controllerCode?: string;
}

export class ControllerHeartbeatDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  runtimeVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  softwareVersion?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  packageVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  uptimeHours?: number;

  @IsOptional()
  @IsObject()
  telemetrySummary?: Record<string, unknown>;
}

export class ControllerTelemetryUploadDto {
  @IsString()
  @Length(3, 160)
  summary!: string;

  @IsOptional()
  @IsEnum(AlarmSeverity)
  severity?: AlarmSeverity;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ControllerAlarmUploadDto {
  @IsEnum(AlarmSeverity)
  severity!: AlarmSeverity;

  @IsString()
  @Length(3, 160)
  title!: string;

  @IsString()
  @Length(3, 500)
  detail!: string;

  @IsOptional()
  @IsString()
  triggeredAt?: string;
}

export class ControllerAcknowledgeDeploymentDto {
  @IsString()
  @Length(1, 80)
  packageVersion!: string;

  @IsString()
  @Length(32, 128)
  packageDigest!: string;

  @IsBoolean()
  signatureVerified!: boolean;

  @IsIn(['acknowledged', 'applied', 'rejected'])
  state!: 'acknowledged' | 'applied' | 'rejected';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  runtimeVersion?: string;
}

export class ControllerInventoryQueryDto {
  @IsOptional()
  @IsUUID()
  intersectionId?: string;
}

export function mapAckStateToDeploymentState(
  state: ControllerAcknowledgeDeploymentDto['state'],
) {
  switch (state) {
    case 'acknowledged':
      return ControllerDeploymentState.ACKNOWLEDGED;
    case 'applied':
      return ControllerDeploymentState.APPLIED;
    case 'rejected':
      return ControllerDeploymentState.REJECTED;
  }
}

import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const BEARINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export class ConfigSignalGroupDto {
  @IsString()
  id!: string;

  @IsIn(BEARINGS)
  approachBearing!: (typeof BEARINGS)[number];

  @IsOptional()
  @IsString()
  label?: string;
}

export class ConfigDetectorDto {
  @IsString()
  id!: string;

  @IsIn(BEARINGS)
  approachBearing!: (typeof BEARINGS)[number];

  @IsOptional()
  @IsString()
  label?: string;
}

export class ConfigPhaseDto {
  @IsString()
  id!: string;

  @IsString()
  label!: string;

  @IsArray()
  @IsString({ each: true })
  greenSignalGroupIds!: string[];

  @IsInt()
  @Min(0)
  @Max(600)
  minGreenSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(15)
  yellowSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(15)
  redClearanceSeconds!: number;
}

export class ConfigStageDto {
  @IsString()
  id!: string;

  @IsString()
  phaseId!: string;

  @IsInt()
  @Min(1)
  order!: number;
}

export class ConfigConflictDto {
  @IsString()
  a!: string;

  @IsString()
  b!: string;
}

export class SetIntersectionConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigSignalGroupDto)
  signalGroups!: ConfigSignalGroupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigDetectorDto)
  detectors!: ConfigDetectorDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConfigPhaseDto)
  phases!: ConfigPhaseDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ConfigStageDto)
  stages!: ConfigStageDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfigConflictDto)
  conflicts!: ConfigConflictDto[];
}

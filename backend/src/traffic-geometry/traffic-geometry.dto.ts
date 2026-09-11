import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export class LaneInputDto {
  @IsInt()
  @Min(0)
  laneIndex!: number;

  @IsOptional()
  @IsNumber()
  widthMetres?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMovements?: string[];

  @IsOptional()
  @IsString()
  reservedMode?: string;

  @IsOptional()
  @IsInt()
  hourlyCapacity?: number;
}

export class UpsertBranchDto {
  @IsIn(DIRECTIONS)
  direction!: (typeof DIRECTIONS)[number];

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isIncoming?: boolean;

  @IsOptional()
  @IsBoolean()
  isOutgoing?: boolean;

  @IsOptional()
  @IsInt()
  laneCount?: number;

  @IsOptional()
  @IsNumber()
  widthMetres?: number;

  @IsOptional()
  @IsNumber()
  lengthMetres?: number;

  @IsOptional()
  @IsNumber()
  storageLengthMetres?: number;

  @IsOptional()
  @IsString()
  branchClass?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LaneInputDto)
  lanes?: LaneInputDto[];
}

export class UpsertConnectionDto {
  @IsString()
  @IsUUID()
  fromCarrefourId!: string;

  @IsString()
  @IsUUID()
  toCarrefourId!: string;

  @IsOptional()
  @IsIn(['upstream', 'downstream', 'corridor', 'parallel'])
  relationKind?: 'upstream' | 'downstream' | 'corridor' | 'parallel';

  @IsOptional()
  @IsNumber()
  distanceMetres?: number;

  @IsOptional()
  @IsNumber()
  travelTimeSeconds?: number;

  @IsOptional()
  @IsNumber()
  queueSpillbackRisk?: number;
}

import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CORRIDOR_CONTROL_KINDS,
  CORRIDOR_REASON_CODES,
  type CorridorReasonCode,
} from '../corridors.types';
import type { CorridorControlKind } from '../../database/entities';

const BEARINGS = ['N', 'E', 'S', 'W'] as const;

export class CorridorOverrideDto {
  @IsIn(CORRIDOR_CONTROL_KINDS)
  controlKind!: CorridorControlKind;

  @IsIn(CORRIDOR_REASON_CODES)
  reasonCode!: CorridorReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetIntersectionCode?: string;

  @IsOptional()
  @IsIn(BEARINGS)
  targetBearing?: (typeof BEARINGS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  operatorUserId?: string;
}

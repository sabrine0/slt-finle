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
  CORRIDOR_REASON_CODES,
  CORRIDOR_SCENARIO_CODES,
  type CorridorReasonCode,
} from '../corridors.types';
import type { CorridorScenarioCode } from '../../database/entities';

export class ActivateCorridorScenarioDto {
  @IsIn(CORRIDOR_SCENARIO_CODES)
  scenarioCode!: CorridorScenarioCode;

  @IsIn(CORRIDOR_REASON_CODES)
  reasonCode!: CorridorReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(7200)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  operatorUserId?: string;
}

import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { OverrideAction, OverrideReasonCode } from '../../database/entities';

export class LogOverrideDto {
  @IsEnum(OverrideAction)
  action!: OverrideAction;

  @IsEnum(OverrideReasonCode)
  reasonCode!: OverrideReasonCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetReference?: string;
}

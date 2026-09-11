import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional hints from the operator to focus the AI. Nothing in this
 * DTO grants the AI any real-mode apply capability — `allowAutoApply`
 * is ignored unless the server is configured with AI_AUTO_APPLY_REAL
 * AND the mode is non-real.
 */
export class AnalyzeTrafficDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonHint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  operatorGoal?: string;

  @IsOptional()
  @IsBoolean()
  allowAutoApply?: boolean;
}

import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export const PREDICTION_HORIZONS = ['H+15', 'H+60', 'H+24'] as const;
export type PredictionHorizon = (typeof PREDICTION_HORIZONS)[number];

export function normalizePredictionHorizon(
  horizon?: string | null,
): PredictionHorizon | undefined {
  if (!horizon) return undefined;
  const trimmed = horizon.trim();
  if ((PREDICTION_HORIZONS as readonly string[]).includes(trimmed)) {
    return trimmed as PredictionHorizon;
  }
  const normalized = trimmed.replace(/\s+/g, '+').toUpperCase();
  if ((PREDICTION_HORIZONS as readonly string[]).includes(normalized)) {
    return normalized as PredictionHorizon;
  }
  return undefined;
}

export class RunPredictionDto {
  @IsString()
  @IsUUID()
  carrefourId!: string;

  @IsOptional()
  @IsIn(PREDICTION_HORIZONS)
  horizon?: PredictionHorizon;
}

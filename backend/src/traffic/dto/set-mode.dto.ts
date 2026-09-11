import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import type { IntersectionMode } from '../traffic.types';

const modes = [
  'adaptive',
  'manual',
  'fixed',
  'emergency',
  'flash',
  'fail-safe',
] as const;

export class SetModeDto {
  @IsIn(modes)
  mode!: IntersectionMode;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

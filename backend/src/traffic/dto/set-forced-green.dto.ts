import { IsIn, IsOptional } from 'class-validator';

import type { OperatorDirection } from '../traffic.types';

const directions = ['N', 'E', 'S', 'W'] as const;

export class SetForcedGreenDto {
  @IsOptional()
  @IsIn(directions)
  direction?: OperatorDirection | null;
}

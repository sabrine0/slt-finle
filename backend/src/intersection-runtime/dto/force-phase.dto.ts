import { IsOptional, IsString } from 'class-validator';

export class ForcePhaseDto {
  @IsOptional()
  @IsString()
  phaseId?: string | null;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReleaseCorridorControlDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  operatorUserId?: string;
}

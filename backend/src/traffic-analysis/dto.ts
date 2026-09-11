import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CalculateForCarrefourDto {
  @IsString()
  @IsUUID()
  carrefourId!: string;
}

export class TravelTimeQueryDto {
  @IsString()
  @IsUUID()
  fromCarrefourId!: string;

  @IsString()
  @IsUUID()
  toCarrefourId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const BEARINGS = ['N', 'E', 'S', 'W'] as const;

export class CorridorIntersectionInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  intersectionCode!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  plannedOffsetSeconds?: number;

  @IsOptional()
  @IsIn(BEARINGS)
  primaryBearing?: (typeof BEARINGS)[number];
}

export class CreateCorridorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CorridorIntersectionInputDto)
  intersections!: CorridorIntersectionInputDto[];
}

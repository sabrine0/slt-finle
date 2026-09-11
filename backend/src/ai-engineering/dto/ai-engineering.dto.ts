import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const INTERSECTION_CODE_RE = /^INT-[A-Z]{2,4}-[A-Z0-9]{2,8}$/;
const CONTROLLER_CODE_RE = /^CTRL-[A-Z]{2,4}-[A-Z0-9]{2,8}$/;

export class GenerateProposalsDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsEnum(['standard', 'tram', 'cablage'])
  scope!: 'standard' | 'tram' | 'cablage';

  @IsOptional()
  @IsEnum(['cruciform', 't-junction', 'y-junction', 'mini-roundabout', 'plaza'])
  shapeHint?:
    | 'cruciform'
    | 't-junction'
    | 'y-junction'
    | 'mini-roundabout'
    | 'plaza';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  /**
   * When present, the proposals are filtered to the variants the
   * study endorses (curated set). Without studyId the legacy
   * full-catalogue path is used.
   */
  @IsOptional()
  @IsString()
  @Length(5, 50)
  studyId?: string;
}

/**
 * Geometry payload supplied by the frontend (OSM Overpass query
 * result). Loosely validated — full structural validation lives in
 * the analyzer which gracefully degrades on bad input. New
 * enrichment fields stay optional so older clients keep working
 * and the analyzer can run with partial input.
 */
export class ObservedGeometryDto {
  @IsArray()
  approaches!: unknown[];

  @IsOptional()
  @IsArray()
  pedestrianCrossings?: unknown[];

  @IsOptional()
  @IsArray()
  tramLines?: unknown[];

  @IsOptional()
  @IsArray()
  nearbyPoi?: unknown[];

  @IsOptional()
  @IsArray()
  landUses?: unknown[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  nearestSignalDistanceMeters?: number;

  @IsOptional()
  @IsBoolean()
  hasRoundabout?: boolean;

  @IsOptional()
  @IsString()
  source?: string;
}

export class AnalyzeStudyDto {
  @IsString()
  @Length(2, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsEnum(['standard', 'tram', 'cablage'])
  scope!: 'standard' | 'tram' | 'cablage';

  @IsOptional()
  @IsEnum(['cruciform', 't-junction', 'y-junction', 'mini-roundabout', 'plaza'])
  shapeHint?:
    | 'cruciform'
    | 't-junction'
    | 'y-junction'
    | 'mini-roundabout'
    | 'plaza';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ObservedGeometryDto)
  geometry?: ObservedGeometryDto;
}

export class ApproveProposalDto {
  @IsString()
  @Length(8, 32)
  @Matches(INTERSECTION_CODE_RE, {
    message:
      'code doit suivre le format INT-{REGION}-{IDENT} (ex. INT-RBA-001).',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(2, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(9, 32)
  @Matches(CONTROLLER_CODE_RE, {
    message:
      'controllerCode doit suivre le format CTRL-{REGION}-{IDENT} (ex. CTRL-RBA-001).',
  })
  controllerCode?: string;
}

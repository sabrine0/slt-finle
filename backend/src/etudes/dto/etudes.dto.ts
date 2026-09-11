import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * Runtime-validated DTOs for the étude carrefour endpoints. Keep
 * these in lockstep with `EtudesService.CreateEtudeInput` /
 * `PatchSectionInput` (structural compatibility — NestJS infers the
 * service signature from these classes).
 */
// Accept the historical INT-{REG}-{ID} convention (e.g. INT-TNG-001) AND
// the broader carrefour-code formats actually used in production
// catalogues (CAR-0001, CAR-XX-007, GIRA-04, etc.).  The étude service
// only does a `findUnique({ where: { code } })` lookup so anything that
// is a plausible reference-quality code passes.
const INTERSECTION_CODE_RE = /^[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,8}){0,3}$/;

export class CreateEtudeDto {
  @IsOptional()
  @IsString()
  @Matches(INTERSECTION_CODE_RE, {
    message:
      "intersectionCode doit être un code carrefour valide (ex. CAR-0001, INT-TNG-001, GIRA-04).",
  })
  intersectionCode?: string | null;

  @IsString()
  @Length(2, 200)
  intersectionLabel!: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @IsLongitude()
  longitude?: number | null;

  @IsOptional()
  @IsEnum(['standard', 'tram', 'cablage'])
  scope?: 'standard' | 'tram' | 'cablage';
}

export class PatchSectionDto {
  @IsObject()
  content!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsBoolean()
  lock?: boolean;
}

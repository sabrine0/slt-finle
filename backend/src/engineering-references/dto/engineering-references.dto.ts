import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

import type { EngineeringDocumentType } from '../../database/entities/engineering-document.entity';

const DOCUMENT_TYPES: EngineeringDocumentType[] = [
  'plan_rs',
  'dossier_regulation',
  'plan_filaire',
];

export class ListReferencesQueryDto {
  @IsOptional()
  @IsEnum(DOCUMENT_TYPES)
  documentType?: EngineeringDocumentType;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  shortCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  corridor?: string;

  @IsOptional()
  @IsUUID()
  intersectionId?: string;

  @IsOptional()
  @IsUUID()
  controllerId?: string;

  @IsOptional()
  @IsIn(['linked', 'unlinked'])
  linked?: 'linked' | 'unlinked';
}

export class LinkReferenceDto {
  @IsOptional()
  intersectionId?: string | null;

  @IsOptional()
  controllerId?: string | null;
}

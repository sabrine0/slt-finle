import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { ControllerEntity, IntersectionEntity } from './traffic.entities';

/**
 * Document types this reference layer handles. Programme archives
 * live in a separate table (ProgrammePackageEntity) because they
 * have ZIP-specific metadata, but their kind is mirrored here so
 * callers can filter uniformly when needed.
 */
export type EngineeringDocumentType =
  | 'plan_rs'
  | 'dossier_regulation'
  | 'plan_filaire';

/**
 * Cities are stored as free-form strings so the engineering team
 * can add a new city without a schema change. The values used
 * today by the ingest service are: 'Fès', 'Marrakech', 'Casablanca',
 * 'Rabat', 'Temara', 'unknown'.
 */
export type EngineeringDocumentCity = string;

/**
 * Indexed metadata record for a real-world engineering PDF stored
 * on disk under STLS_ENGINEERING_REFERENCES_ROOT. The actual file
 * stays on disk — STLS only carries the index + parsed metadata +
 * (optional) link to a STLS intersection/controller.
 *
 * The reference layer is strictly read-only relative to live
 * runtime: nothing in this entity is ever pushed to a controller.
 */
@Entity('engineering_documents')
@Unique('uq_engineering_doc_source_path', ['sourcePath'])
@Index('ix_engineering_doc_short_code', ['shortCode'])
@Index('ix_engineering_doc_intersection', ['intersectionId'])
@Index('ix_engineering_doc_controller', ['controllerId'])
@Index('ix_engineering_doc_type', ['documentType'])
export class EngineeringDocumentEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 32 })
  documentType!: EngineeringDocumentType;

  @Column({ type: 'varchar', length: 64, default: 'unknown' })
  city!: EngineeringDocumentCity;

  /**
   * Local human label for the corridor / zone the document lives
   * on (e.g. "Chaouki", "Sefrou", "Imouzzer"). Parsed from filename
   * when present, else 'unknown'.
   */
  @Column({ type: 'varchar', length: 120, default: 'unknown' })
  corridor!: string;

  /**
   * Short code shared across Dossier de Régulation and Plan Filaire
   * (AL3, AL4, ANO, AUX, BAR, BIS, ESS, HA3, HA4, MES, MVI, OQB,
   * PUI, SMI, ZIA, ...). Used as the primary join key to link
   * cross-folder documents together and to a STLS intersection.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  shortCode!: string | null;

  /**
   * Per-document carrefour label as embedded in the file
   * (e.g. "C01", "C02"). Useful for ordering within a corridor.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  carrefourLabel!: string | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  revision!: string | null;

  /** Absolute path on disk. Never exposed to the browser. */
  @Column({ type: 'varchar', length: 1024 })
  sourcePath!: string;

  @Column({ type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'bigint', default: 0 })
  fileSizeBytes!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sha256!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sourceLastModified!: Date | null;

  @Column({ type: 'timestamptz' })
  ingestedAt!: Date;

  // Optional links to existing STLS entities — populated when the
  // ingest service finds an unambiguous match (or set manually
  // by an operator via POST /engineering-references/:id/link).
  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection?: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  controllerId!: string | null;

  @ManyToOne(() => ControllerEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'controllerId' })
  controller?: ControllerEntity | null;

  /**
   * Free-form parse notes — kept for operator debugging when the
   * filename didn't match any known pattern.
   */
  @Column({ type: 'text', nullable: true })
  parseNotes!: string | null;
}

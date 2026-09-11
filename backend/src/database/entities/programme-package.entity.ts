import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { ControllerEntity, IntersectionEntity } from './traffic.entities';

/**
 * Kind of file found inside a programme ZIP. Used to summarise
 * contents in the UI without forcing the operator to unpack the
 * archive.
 */
export type ProgrammeInnerKind = 'clp9' | 'wpr' | 'pdf' | 'other';

export interface ProgrammeInnerFile {
  innerPath: string;
  kind: ProgrammeInnerKind;
  sizeBytes: number;
}

/**
 * A controller programme archive (typically a ZIP shipping
 * .clp9_9_* + .wpr + accompanying PDFs). These archives are
 * REFERENCE-ONLY in STLS — they are never auto-deployed to a live
 * controller. Deployment, if it ever happens, must go through the
 * existing engineering deployment pipeline and is gated by an
 * explicit operator action.
 */
@Entity('programme_packages')
@Unique('uq_programme_pkg_source_path', ['sourceZipPath'])
@Index('ix_programme_pkg_short_code', ['shortCode'])
@Index('ix_programme_pkg_controller', ['controllerId'])
@Index('ix_programme_pkg_intersection', ['intersectionId'])
export class ProgrammePackageEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 255 })
  packageName!: string;

  @Column({ type: 'varchar', length: 64, default: 'unknown' })
  city!: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  shortCode!: string | null;

  @Column({ type: 'varchar', length: 1024 })
  sourceZipPath!: string;

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

  /**
   * Inner-file index produced at ingest time. We store the list as
   * JSONB so the API can show contents without re-opening the ZIP,
   * but never the file bytes themselves.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  contents!: ProgrammeInnerFile[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  detectedVersion!: string | null;

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
   * Hard guard against accidental deployment from this layer.
   * Reference packages stay false. If a future workflow ever wants
   * to promote one of these to a real deployment, it must go
   * through engineering.service / deployments — not flip this
   * boolean directly.
   */
  @Column({ type: 'boolean', default: false })
  isReferenceOnly!: boolean;
}

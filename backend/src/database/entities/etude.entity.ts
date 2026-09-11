import { Column, Entity, Index } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export type EtudeScope = 'standard' | 'tram' | 'cablage';
export type EtudeStatus = 'draft' | 'in_review' | 'approved';
export type EtudeGenerationMode = 'offline' | 'claude';

/**
 * "Étude carrefour" — engineering study generated for an
 * intersection. Mirrors the structure of the Casablanca tramway and
 * Fès dossiers: a fixed list of sections (plan de situation, matrice
 * de conflit, plans de feux, phasage, affectation des entrées …),
 * each filled in by the AI generator and editable by the operator.
 *
 * The intersection link is intentionally soft: an étude can be
 * started from a raw Google Maps point that doesn't yet correspond to
 * a known intersection. We always keep `intersectionLabel` and
 * coordinates so the dossier renders even before the intersection is
 * persisted in the catalog.
 */
@Entity({ name: 'etudes' })
@Index('IDX_etudes_intersection_code', ['intersectionCode'])
@Index('IDX_etudes_status', ['status'])
export class EtudeEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 80, nullable: true })
  intersectionCode!: string | null;

  @Column({ type: 'varchar', length: 200 })
  intersectionLabel!: string;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'standard' })
  scope!: EtudeScope;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status!: EtudeStatus;

  @Column({ type: 'varchar', length: 16, default: 'offline' })
  generationMode!: EtudeGenerationMode;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  sections!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  meta!: Record<string, unknown>;
}

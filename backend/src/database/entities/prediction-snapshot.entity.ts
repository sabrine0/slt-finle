import { Column, Entity, Index } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export type PredictionSnapshotScopeType =
  | 'city'
  | 'zone'
  | 'intersection'
  | 'carrefour';

export type PredictionSnapshotLevel = 'smooth' | 'pressure' | 'congestion';

@Entity({ name: 'prediction_snapshots' })
@Index('IDX_prediction_snapshots_scope_time', [
  'scopeType',
  'scopeRef',
  'generatedAt',
])
export class PredictionSnapshotEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 24 })
  scopeType!: PredictionSnapshotScopeType;

  @Column({ type: 'varchar', length: 80 })
  scopeRef!: string;

  @Column({ type: 'varchar', length: 160 })
  label!: string;

  @Column({ type: 'varchar', length: 8 })
  horizon!: string;

  @Column({ type: 'int', default: 0 })
  nodeCount!: number;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true })
  averageSaturation!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  totalQueueMetres!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  averageDelaySeconds!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: true })
  averageConfidence!: number | null;

  @Column({ type: 'varchar', length: 24, default: 'smooth' })
  congestionLevel!: PredictionSnapshotLevel;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metrics!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  generatedAt!: Date;
}

import { Column, Entity, Index } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export interface IntersectionRuntimeConfigPayloadShape {
  signalGroups: Array<{
    id: string;
    approachBearing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
    label?: string;
  }>;
  detectors: Array<{
    id: string;
    approachBearing: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
    label?: string;
  }>;
  phases: Array<{
    id: string;
    label: string;
    greenSignalGroupIds: string[];
    minGreenSeconds: number;
    yellowSeconds: number;
    redClearanceSeconds: number;
  }>;
  stages: Array<{
    id: string;
    phaseId: string;
    order: number;
  }>;
  conflicts: Array<{ a: string; b: string }>;
}

@Entity({ name: 'intersection_runtime_configs' })
export class IntersectionRuntimeConfigEntity extends AppBaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  intersectionCode!: string;

  @Column({ type: 'jsonb' })
  payload!: IntersectionRuntimeConfigPayloadShape;

  @Column({ type: 'integer', default: 1 })
  schemaVersion!: number;

  @Column({ type: 'timestamptz' })
  appliedAt!: Date;

  @Column({ type: 'varchar', length: 128, nullable: true })
  appliedBy!: string | null;
}

import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { IntersectionEntity } from './traffic.entities';
import { UserEntity } from './user.entities';

export type CorridorScenarioCode =
  | 'normal_traffic'
  | 'peak_traffic'
  | 'police_diversion'
  | 'event_egress'
  | 'emergency_clear_path';

export type CorridorControlKind =
  | 'single_intersection'
  | 'full_corridor'
  | 'direction_priority'
  | 'emergency_green_corridor';

export type CorridorControlStatus = 'active' | 'released' | 'expired';

@Entity({ name: 'corridors' })
export class CorridorEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region!: string | null;

  @Column({ type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'normal_traffic' })
  activeScenarioCode!: CorridorScenarioCode;

  @Column({ type: 'timestamptz', nullable: true })
  activeScenarioActivatedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  activeScenarioActivatedByUserId!: string | null;

  @OneToMany(
    () => CorridorIntersectionEntity,
    (intersection) => intersection.corridor,
  )
  intersections!: CorridorIntersectionEntity[];

  @OneToMany(
    () => CorridorScenarioAssignmentEntity,
    (assignment) => assignment.corridor,
  )
  scenarioAssignments!: CorridorScenarioAssignmentEntity[];

  @OneToMany(() => CorridorControlSessionEntity, (session) => session.corridor)
  controlSessions!: CorridorControlSessionEntity[];
}

@Entity({ name: 'corridor_intersections' })
@Unique('UQ_corridor_intersections_corridor_order', [
  'corridorId',
  'orderIndex',
])
@Unique('UQ_corridor_intersections_corridor_code', [
  'corridorId',
  'intersectionCode',
])
@Index('IDX_corridor_intersections_corridor', ['corridorId'])
export class CorridorIntersectionEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  corridorId!: string;

  @ManyToOne(() => CorridorEntity, (corridor) => corridor.intersections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'corridorId' })
  corridor!: CorridorEntity;

  @Column({ type: 'int' })
  orderIndex!: number;

  @Column({ type: 'varchar', length: 64 })
  intersectionCode!: string;

  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity | null;

  @Column({ type: 'int', default: 0 })
  plannedOffsetSeconds!: number;

  @Column({ type: 'varchar', length: 1, nullable: true })
  primaryBearing!: 'N' | 'E' | 'S' | 'W' | null;
}

@Entity({ name: 'corridor_scenario_assignments' })
@Unique('UQ_corridor_scenario_assignments_code', ['corridorId', 'scenarioCode'])
@Index('IDX_corridor_scenario_assignments_corridor', ['corridorId'])
export class CorridorScenarioAssignmentEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  corridorId!: string;

  @ManyToOne(() => CorridorEntity, (corridor) => corridor.scenarioAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'corridorId' })
  corridor!: CorridorEntity;

  @Column({ type: 'varchar', length: 64 })
  scenarioCode!: CorridorScenarioCode;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivatedAt!: Date | null;
}

@Entity({ name: 'corridor_control_sessions' })
@Index('IDX_corridor_control_sessions_corridor', ['corridorId'])
@Index('IDX_corridor_control_sessions_status', ['status'])
@Index('IDX_corridor_control_sessions_started_at', ['startedAt'])
export class CorridorControlSessionEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  corridorId!: string;

  @ManyToOne(() => CorridorEntity, (corridor) => corridor.controlSessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'corridorId' })
  corridor!: CorridorEntity;

  @Column({ type: 'varchar', length: 64 })
  controlKind!: CorridorControlKind;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetIntersectionCode!: string | null;

  @Column({ type: 'varchar', length: 1, nullable: true })
  targetBearing!: 'N' | 'E' | 'S' | 'W' | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  scenarioCode!: CorridorScenarioCode | null;

  @Column({ type: 'varchar', length: 64 })
  reasonCode!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  releaseNote!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'active' })
  status!: CorridorControlStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  dispatchLog!: Array<{
    intersectionCode: string;
    action: string;
    at: string;
    success: boolean;
    error?: string;
  }>;

  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expectedEndAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'boolean', default: false })
  outranksAi!: boolean;

  @Column({ type: 'uuid', nullable: true })
  operatorUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'operatorUserId' })
  operatorUser!: UserEntity | null;

  @Column({ type: 'uuid', nullable: true })
  releasedByUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'releasedByUserId' })
  releasedByUser!: UserEntity | null;
}

/**
 * Traffic Intelligence Platform — graph foundation entities.
 *
 * Mirrors the document data model:
 *   intersections, intersection_branches, lane_details, movements,
 *   connected_intersections, traffic_observations,
 *   mirofish_agent_outputs.
 *
 * Each Carrefour bridges to the existing engineering IntersectionEntity
 * (when one exists) so the new graph layer never duplicates the
 * controller/phase/timing-plan truth that already lives upstream.
 */

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
import { ControllerEntity, IntersectionEntity } from './traffic.entities';

export type BranchDirection = 'N' | 'S' | 'E' | 'O' | 'NE' | 'NO' | 'SE' | 'SO';

export type IntersectionRegulationType =
  | 'signalized'
  | 'roundabout'
  | 'priority'
  | 'unregulated';

export type MovementStatus = 'allowed' | 'forbidden' | 'conditional';

export type ObservationSourceType =
  | 'simulation'
  | 'detector'
  | 'video'
  | 'gps'
  | 'manual'
  | 'derived';

export type ConnectedRelationKind =
  | 'upstream'
  | 'downstream'
  | 'corridor'
  | 'parallel';

@Entity({ name: 'cities' })
export class CityEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 8, default: 'MA' })
  countryIso!: string;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  centroidLat!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  centroidLng!: number | null;

  @OneToMany(() => CarrefourEntity, (carrefour) => carrefour.city)
  carrefours!: CarrefourEntity[];
}

@Entity({ name: 'carrefours' })
@Index('IDX_carrefours_city', ['cityId'])
export class CarrefourEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'uuid', nullable: true })
  cityId!: string | null;

  @ManyToOne(() => CityEntity, (city) => city.carrefours, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cityId' })
  city!: CityEntity | null;

  /** Bridge to the existing engineering IntersectionEntity (when the
   *  carrefour has been promoted to the engineering side). */
  @Column({ type: 'uuid', nullable: true })
  engineeringIntersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'engineeringIntersectionId' })
  engineeringIntersection!: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  primaryControllerId!: string | null;

  @ManyToOne(() => ControllerEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'primaryControllerId' })
  primaryController!: ControllerEntity | null;

  @Column({ type: 'numeric', precision: 10, scale: 6 })
  lat!: number;

  @Column({ type: 'numeric', precision: 10, scale: 6 })
  lng!: number;

  @Column({ type: 'varchar', length: 64, default: 'cross' })
  intersectionType!: string;

  @Column({ type: 'varchar', length: 32, default: 'signalized' })
  regulationType!: IntersectionRegulationType;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true })
  saturationScore!: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true })
  criticalityScore!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @OneToMany(() => IntersectionBranchEntity, (branch) => branch.carrefour)
  branches!: IntersectionBranchEntity[];

  @OneToMany(() => MovementEntity, (movement) => movement.carrefour)
  movements!: MovementEntity[];

  @OneToMany(() => ConnectedIntersectionEntity, (link) => link.fromCarrefour)
  connectionsOut!: ConnectedIntersectionEntity[];

  @OneToMany(() => ConnectedIntersectionEntity, (link) => link.toCarrefour)
  connectionsIn!: ConnectedIntersectionEntity[];
}

@Entity({ name: 'intersection_branches' })
@Unique('UQ_branches_carrefour_direction', ['carrefourId', 'direction'])
@Index('IDX_branches_carrefour', ['carrefourId'])
export class IntersectionBranchEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  carrefourId!: string;

  @ManyToOne(() => CarrefourEntity, (carrefour) => carrefour.branches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrefourId' })
  carrefour!: CarrefourEntity;

  @Column({ type: 'varchar', length: 4 })
  direction!: BranchDirection;

  @Column({ type: 'varchar', length: 200, nullable: true })
  label!: string | null;

  @Column({ type: 'boolean', default: true })
  isIncoming!: boolean;

  @Column({ type: 'boolean', default: true })
  isOutgoing!: boolean;

  @Column({ type: 'int', nullable: true })
  laneCount!: number | null;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
  widthMetres!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  lengthMetres!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  storageLengthMetres!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  branchClass!: string | null;

  @OneToMany(() => LaneDetailEntity, (lane) => lane.branch)
  lanes!: LaneDetailEntity[];
}

@Entity({ name: 'lane_details' })
@Unique('UQ_lanes_branch_index', ['branchId', 'laneIndex'])
@Index('IDX_lanes_branch', ['branchId'])
export class LaneDetailEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  branchId!: string;

  @ManyToOne(() => IntersectionBranchEntity, (branch) => branch.lanes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'branchId' })
  branch!: IntersectionBranchEntity;

  @Column({ type: 'int' })
  laneIndex!: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  widthMetres!: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  allowedMovements!: string[];

  @Column({ type: 'varchar', length: 32, nullable: true })
  reservedMode!: string | null;

  @Column({ type: 'int', nullable: true })
  hourlyCapacity!: number | null;
}

@Entity({ name: 'movements' })
@Unique('UQ_movements_carrefour_pair', [
  'carrefourId',
  'fromDirection',
  'toDirection',
])
@Index('IDX_movements_carrefour', ['carrefourId'])
export class MovementEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  carrefourId!: string;

  @ManyToOne(() => CarrefourEntity, (carrefour) => carrefour.movements, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrefourId' })
  carrefour!: CarrefourEntity;

  @Column({ type: 'varchar', length: 4 })
  fromDirection!: BranchDirection;

  @Column({ type: 'varchar', length: 4 })
  toDirection!: BranchDirection;

  @Column({ type: 'varchar', length: 32, default: 'allowed' })
  status!: MovementStatus;

  @Column({ type: 'boolean', default: false })
  protected!: boolean;

  @Column({ type: 'int', nullable: true })
  priorityLevel!: number | null;

  @Column({ type: 'boolean', default: false })
  hasConflict!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  conflictMovementIds!: string[];
}

@Entity({ name: 'connected_intersections' })
@Unique('UQ_connected_pair_kind', [
  'fromCarrefourId',
  'toCarrefourId',
  'relationKind',
])
@Index('IDX_connected_from', ['fromCarrefourId'])
@Index('IDX_connected_to', ['toCarrefourId'])
export class ConnectedIntersectionEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  fromCarrefourId!: string;

  @ManyToOne(() => CarrefourEntity, (carrefour) => carrefour.connectionsOut, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fromCarrefourId' })
  fromCarrefour!: CarrefourEntity;

  @Column({ type: 'uuid' })
  toCarrefourId!: string;

  @ManyToOne(() => CarrefourEntity, (carrefour) => carrefour.connectionsIn, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'toCarrefourId' })
  toCarrefour!: CarrefourEntity;

  @Column({ type: 'varchar', length: 32, default: 'corridor' })
  relationKind!: ConnectedRelationKind;

  @Column({ type: 'numeric', precision: 9, scale: 2, nullable: true })
  distanceMetres!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  travelTimeSeconds!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: true })
  queueSpillbackRisk!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  geometry!: Record<string, unknown>;
}

@Entity({ name: 'traffic_observations' })
@Index('IDX_observations_carrefour_time', ['carrefourId', 'observedAt'])
@Index('IDX_observations_branch_time', ['branchId', 'observedAt'])
export class TrafficObservationEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  carrefourId!: string;

  @ManyToOne(() => CarrefourEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrefourId' })
  carrefour!: CarrefourEntity;

  @Column({ type: 'uuid', nullable: true })
  branchId!: string | null;

  @ManyToOne(() => IntersectionBranchEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'branchId' })
  branch!: IntersectionBranchEntity | null;

  @Column({ type: 'timestamptz' })
  observedAt!: Date;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  flowVehiclesPerHour!: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  averageSpeedKph!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  queueLengthMetres!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  delaySeconds!: number | null;

  @Column({ type: 'varchar', length: 32, default: 'derived' })
  sourceType!: ObservationSourceType;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: true })
  confidence!: number | null;
}

@Entity({ name: 'mirofish_agent_outputs' })
@Index('IDX_mirofish_carrefour_time', ['carrefourId', 'producedAt'])
@Index('IDX_mirofish_agent_time', ['agentName', 'producedAt'])
export class MirofishAgentOutputEntity extends AppBaseEntity {
  @Column({ type: 'uuid' })
  carrefourId!: string;

  @ManyToOne(() => CarrefourEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'carrefourId' })
  carrefour!: CarrefourEntity;

  @Column({ type: 'uuid', nullable: true })
  branchId!: string | null;

  @ManyToOne(() => IntersectionBranchEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'branchId' })
  branch!: IntersectionBranchEntity | null;

  @Column({ type: 'varchar', length: 80 })
  agentName!: string;

  @Column({ type: 'numeric', precision: 6, scale: 3 })
  impactScore!: number;

  @Column({ type: 'numeric', precision: 5, scale: 3 })
  confidence!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  detectedIssue!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  affectedMovements!: string[];

  @Column({ type: 'text', nullable: true })
  recommendation!: string | null;

  @Column({ type: 'timestamptz' })
  producedAt!: Date;
}

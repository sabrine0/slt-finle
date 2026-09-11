import { Column, Entity, Index } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export type TrafficCommandStatus =
  | 'queued'
  | 'dispatched'
  | 'acknowledged'
  | 'failed'
  | 'superseded';

export type TrafficCommandKind =
  | 'modify_phase_timing'
  | 'force_phase'
  | 'block_automatic_control'
  | 'release_block'
  | 'advisory';

export type TrafficCommandSeverity =
  | 'info'
  | 'advisory'
  | 'warning'
  | 'critical';

/**
 * Persisted control command derived from an agent decision. Each
 * command targets exactly one intersection (or, for advisories, a
 * zone/city). The runtime/controller-runtime is the consumer that
 * picks up `queued` commands and dispatches them to the field; this
 * entity is the durable contract between the decision layer and the
 * execution layer.
 */
@Entity({ name: 'traffic_commands' })
@Index('IDX_traffic_commands_target_time', ['intersectionCode', 'issuedAt'])
@Index('IDX_traffic_commands_status_time', ['status', 'issuedAt'])
@Index('IDX_traffic_commands_run_id', ['agentRunId'])
export class TrafficCommandEntity extends AppBaseEntity {
  /** Engineering intersection code (e.g. INT-CAS-001) when known. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  intersectionCode!: string | null;

  /** Wider scope for advisories that don't target one intersection. */
  @Column({ type: 'varchar', length: 16 })
  scope!: 'intersection' | 'zone' | 'city';

  @Column({ type: 'varchar', length: 80 })
  scopeRef!: string;

  @Column({ type: 'uuid', nullable: true })
  agentRunId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  agentId!: string;

  @Column({ type: 'varchar', length: 64 })
  decisionKind!: string;

  @Column({ type: 'varchar', length: 32 })
  kind!: TrafficCommandKind;

  @Column({ type: 'varchar', length: 16, default: 'info' })
  severity!: TrafficCommandSeverity;

  @Column({ type: 'boolean', default: false })
  override!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status!: TrafficCommandStatus;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rationale!: string[];

  @Column({ type: 'timestamptz' })
  issuedAt!: Date;

  /** Set when an operator acknowledges or the runtime confirms. */
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  resolutionNote!: string | null;
}

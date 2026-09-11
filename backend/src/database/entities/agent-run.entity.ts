import { Column, Entity, Index } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export type AgentRunScope = 'intersection' | 'zone' | 'city';
export type AgentRunSeverity = 'info' | 'advisory' | 'warning' | 'critical';

/**
 * Persisted record of a single AgentRuntime execution. The full
 * structured AgentRunResult lives in `payload`; the columns above
 * are denormalised projections for fast indexing and "latest run"
 * lookups.
 */
@Entity({ name: 'agent_runs' })
@Index('IDX_agent_runs_scope_time', ['scope', 'scopeRef', 'generatedAt'])
@Index('IDX_agent_runs_severity_time', ['aggregatedSeverity', 'generatedAt'])
export class AgentRunEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 16 })
  scope!: AgentRunScope;

  @Column({ type: 'varchar', length: 80 })
  scopeRef!: string;

  @Column({ type: 'varchar', length: 8 })
  horizon!: string;

  @Column({ type: 'timestamptz' })
  generatedAt!: Date;

  @Column({ type: 'int', default: 0 })
  durationMs!: number;

  @Column({ type: 'int', default: 0 })
  agentCount!: number;

  @Column({ type: 'varchar', length: 16, default: 'info' })
  aggregatedSeverity!: AgentRunSeverity;

  @Column({ type: 'varchar', length: 64, nullable: true })
  finalKind!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  finalSeverity!: AgentRunSeverity | null;

  @Column({ type: 'boolean', default: false })
  finalOverride!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  trigger!: 'scheduled' | 'manual';

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentRunEntity } from '../database/entities';
import type { AgentRunResult, AgentScope, AgentSeverity } from './agent.types';

export interface AgentRunRecord extends AgentRunResult {
  id: string;
  trigger: 'scheduled' | 'manual';
  persistedAt: string;
}

@Injectable()
export class AgentRunsService {
  constructor(
    @InjectRepository(AgentRunEntity)
    private readonly repository: Repository<AgentRunEntity>,
  ) {}

  /**
   * Persist an AgentRunResult. Denormalises the headline fields for
   * indexing; keeps the full structured result inside `payload`.
   */
  async record(
    result: AgentRunResult,
    trigger: 'scheduled' | 'manual',
  ): Promise<AgentRunRecord> {
    const final = result.finalRecommendation;
    const entity = await this.repository.save(
      this.repository.create({
        scope: result.scope,
        scopeRef: result.scopeRef,
        horizon: result.horizon,
        generatedAt: new Date(result.generatedAt),
        durationMs: result.durationMs,
        agentCount: result.agentCount,
        aggregatedSeverity: result.aggregatedSeverity,
        finalKind: final?.kind ?? null,
        finalSeverity: final?.severity ?? null,
        finalOverride: final?.override === true,
        trigger,
        payload: result as unknown as Record<string, unknown>,
      }),
    );
    return this.toRecord(entity);
  }

  /**
   * Fetch the latest persisted run for a given scope/ref. Returns
   * null when no run has been recorded yet.
   */
  async findLatest(
    scope: AgentScope,
    scopeRef: string,
  ): Promise<AgentRunRecord | null> {
    const row = await this.repository.findOne({
      where: { scope, scopeRef },
      order: { generatedAt: 'DESC' },
    });
    return row ? this.toRecord(row) : null;
  }

  /** Latest N runs filtered by severity floor (info / advisory / warning / critical). */
  async listLatest(
    filters: {
      severityAtLeast?: AgentSeverity;
      scope?: AgentScope;
      limit?: number;
    } = {},
  ): Promise<AgentRunRecord[]> {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const query = this.repository
      .createQueryBuilder('run')
      .orderBy('run.generatedAt', 'DESC')
      .take(limit);

    if (filters.scope) {
      query.andWhere('run.scope = :scope', { scope: filters.scope });
    }
    if (filters.severityAtLeast) {
      const allowed = severitiesAtLeast(filters.severityAtLeast);
      query.andWhere('run.aggregatedSeverity IN (:...allowed)', { allowed });
    }
    const rows = await query.getMany();
    return rows.map((row) => this.toRecord(row));
  }

  private toRecord(row: AgentRunEntity): AgentRunRecord {
    const payload = (row.payload ?? {}) as Partial<AgentRunResult>;
    return {
      ...(payload as AgentRunResult),
      id: row.id,
      scope: row.scope,
      scopeRef: row.scopeRef,
      horizon: row.horizon as AgentRunResult['horizon'],
      generatedAt: payload.generatedAt ?? row.generatedAt.toISOString(),
      durationMs: row.durationMs,
      agentCount: row.agentCount,
      aggregatedSeverity: row.aggregatedSeverity,
      trigger: row.trigger,
      persistedAt: row.createdAt.toISOString(),
    };
  }
}

function severitiesAtLeast(floor: AgentSeverity): AgentSeverity[] {
  const order: AgentSeverity[] = ['info', 'advisory', 'warning', 'critical'];
  return order.slice(order.indexOf(floor));
}

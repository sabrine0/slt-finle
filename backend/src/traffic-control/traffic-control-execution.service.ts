import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  AgentDecision,
  AgentOutput,
  AgentRunResult,
  AgentScope,
  AgentSeverity,
} from '../agents/agent.types';
import {
  TrafficCommandEntity,
  type TrafficCommandKind,
  type TrafficCommandSeverity,
  type TrafficCommandStatus,
} from '../database/entities';

export interface TrafficCommandView {
  id: string;
  intersectionCode: string | null;
  scope: AgentScope;
  scopeRef: string;
  agentRunId: string | null;
  agentId: string;
  decisionKind: string;
  kind: TrafficCommandKind;
  severity: TrafficCommandSeverity;
  override: boolean;
  status: TrafficCommandStatus;
  lifecycleStage: 'queued' | 'dispatched' | 'applied' | 'failed' | 'superseded';
  payload: Record<string, unknown>;
  rationale: string[];
  issuedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/**
 * Mapping from agent-decision `kind` to a control-command `kind`.
 * Decisions whose kind is not in this map produce no command (e.g.
 * `maintain_plan`, `monitor_plan`, `control_suppressed`, advisories
 * from the city-traffic-manager that don't trigger field action).
 */
const DECISION_TO_COMMAND: Record<string, TrafficCommandKind> = {
  // BusPriorityAgent
  extend_green: 'modify_phase_timing',
  // EmergencyVehicleAgent
  force_green_corridor: 'force_phase',
  // PoliceOperatorAgent
  manual_control: 'block_automatic_control',
  manual_control_recommended: 'block_automatic_control',
  release_manual_control: 'release_block',
  // IntersectionManagerAgent
  increase_green_dominant: 'modify_phase_timing',
  extend_cycle: 'modify_phase_timing',
  request_manual_control: 'block_automatic_control',
  // CityTrafficManagerAgent (advisories — no field action, but kept
  // in the audit trail so the operator UI can surface them).
  dispatch_global: 'advisory',
  coordinate_corridors: 'advisory',
};

@Injectable()
export class TrafficControlExecutionService {
  private readonly logger = new Logger(TrafficControlExecutionService.name);

  constructor(
    @InjectRepository(TrafficCommandEntity)
    private readonly repository: Repository<TrafficCommandEntity>,
  ) {}

  /**
   * Translate an AgentRunResult into one or more TrafficCommands and
   * persist them. Returns the persisted views in the order they were
   * generated. Decisions that don't map to a control kind are ignored.
   */
  async execute(
    result: AgentRunResult,
    options: { agentRunId?: string | null } = {},
  ): Promise<TrafficCommandView[]> {
    const issuedAt = new Date(result.generatedAt);
    const intersectionCode = pickIntersectionCode(result);

    // Mark previously-active block as superseded if this run starts
    // with a release decision or with a fresh manual_control.
    const blocking = result.outputs.some(
      (output) =>
        output.decision?.kind === 'manual_control' ||
        output.decision?.kind === 'release_manual_control',
    );
    if (blocking && intersectionCode) {
      await this.supersedeOpenBlocks(intersectionCode);
    }

    const rows: TrafficCommandEntity[] = [];
    for (const output of result.outputs) {
      const command = this.commandForOutput(
        output,
        result,
        intersectionCode,
        issuedAt,
        options.agentRunId ?? null,
      );
      if (!command) continue;
      rows.push(this.repository.create(command));
    }

    if (rows.length === 0) {
      return [];
    }
    const saved = await this.repository.save(rows);
    this.logger.log(
      `Executed ${result.scope}/${result.scopeRef} → ${saved.length} command(s).`,
    );
    return saved.map((row) => this.toView(row));
  }

  /** Latest command for an intersection (any kind). */
  async findLatestForIntersection(
    intersectionCode: string,
  ): Promise<TrafficCommandView | null> {
    const row = await this.repository.findOne({
      where: { intersectionCode },
      order: { issuedAt: 'DESC' },
    });
    return row ? this.toView(row) : null;
  }

  async findById(id: string): Promise<TrafficCommandView | null> {
    const row = await this.repository.findOne({ where: { id } });
    return row ? this.toView(row) : null;
  }

  /** Latest commands across all intersections, optional scope filter. */
  async listLatest(
    filters: {
      intersectionCode?: string;
      status?: TrafficCommandStatus;
      severityAtLeast?: AgentSeverity;
      limit?: number;
    } = {},
  ): Promise<TrafficCommandView[]> {
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
    const query = this.repository
      .createQueryBuilder('cmd')
      .orderBy('cmd.issuedAt', 'DESC')
      .take(limit);

    if (filters.intersectionCode) {
      query.andWhere('cmd.intersectionCode = :code', {
        code: filters.intersectionCode,
      });
    }
    if (filters.status) {
      query.andWhere('cmd.status = :status', { status: filters.status });
    }
    if (filters.severityAtLeast) {
      const allowed = severitiesAtLeast(filters.severityAtLeast);
      query.andWhere('cmd.severity IN (:...allowed)', { allowed });
    }
    const rows = await query.getMany();
    return rows.map((row) => this.toView(row));
  }

  /** True when the intersection currently has an active block. */
  async isBlocked(intersectionCode: string): Promise<boolean> {
    const blocking = await this.repository.findOne({
      where: {
        intersectionCode,
        kind: 'block_automatic_control',
      },
      order: { issuedAt: 'DESC' },
    });
    if (!blocking) return false;
    if (blocking.status === 'superseded') return false;
    if (blocking.resolvedAt != null) return false;
    return true;
  }

  /** Operator/runtime confirms a command was applied. */
  async acknowledge(id: string, note?: string): Promise<TrafficCommandView> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Traffic command "${id}" not found.`);
    }
    row.status = 'acknowledged';
    row.resolvedAt = new Date();
    if (note) row.resolutionNote = note;
    const saved = await this.repository.save(row);
    const view = this.toView(saved);
    this.logger.log(
      `Command ${id} applied → ${view.intersectionCode ?? `${view.scope}/${view.scopeRef}`} :: ${note ?? 'acknowledged'}`,
    );
    return view;
  }

  /**
   * Mark a command as in-flight. The poll loop calls this before
   * the simulated dispatch so a second poll tick can never pick up
   * the same row twice. Returns the row, or null if the command was
   * already past `queued` (race with another worker).
   */
  async markDispatched(id: string): Promise<TrafficCommandView | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(TrafficCommandEntity)
      .set({ status: 'dispatched' })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: 'queued' })
      .returning('*')
      .execute();
    const row = (result.raw as TrafficCommandEntity[] | undefined)?.[0];
    const view = row ? this.toView(this.normaliseRow(row)) : null;
    if (view) {
      this.logger.log(
        `Command ${id} dispatched → ${view.intersectionCode ?? `${view.scope}/${view.scopeRef}`}`,
      );
    }
    return view;
  }

  /** Persist a failure with a note. */
  async markFailed(
    id: string,
    note: string,
  ): Promise<TrafficCommandView | null> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) return null;
    row.status = 'failed';
    row.resolvedAt = new Date();
    row.resolutionNote = note;
    const saved = await this.repository.save(row);
    const view = this.toView(saved);
    this.logger.warn(
      `Command ${id} failed → ${view.intersectionCode ?? `${view.scope}/${view.scopeRef}`} :: ${note}`,
    );
    return view;
  }

  async waitForSettlement(
    ids: string[],
    options: { timeoutMs?: number; pollMs?: number } = {},
  ): Promise<TrafficCommandView[]> {
    if (ids.length === 0) return [];
    const timeoutMs = options.timeoutMs ?? 5_000;
    const pollMs = options.pollMs ?? 150;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const rows = await Promise.all(ids.map((id) => this.findById(id)));
      const views = rows.filter(
        (row): row is TrafficCommandView => row != null,
      );
      if (
        views.length === ids.length &&
        views.every((view) =>
          ['applied', 'failed', 'superseded'].includes(view.lifecycleStage),
        )
      ) {
        return views;
      }
      await delay(pollMs);
    }

    const rows = await Promise.all(ids.map((id) => this.findById(id)));
    return rows.filter((row): row is TrafficCommandView => row != null);
  }

  /**
   * Raw row coming back from RETURNING * has stringified timestamps;
   * normalise so toView gets a real Date object.
   */
  private normaliseRow(row: TrafficCommandEntity): TrafficCommandEntity {
    if (typeof row.issuedAt === 'string') {
      row.issuedAt = new Date(row.issuedAt);
    }
    if (typeof row.createdAt === 'string') {
      row.createdAt = new Date(row.createdAt);
    }
    if (typeof row.updatedAt === 'string') {
      row.updatedAt = new Date(row.updatedAt);
    }
    if (typeof row.resolvedAt === 'string') {
      row.resolvedAt = new Date(row.resolvedAt);
    }
    return row;
  }

  // ───────── private helpers ─────────

  private commandForOutput(
    output: AgentOutput,
    result: AgentRunResult,
    intersectionCode: string | null,
    issuedAt: Date,
    agentRunId: string | null,
  ): Partial<TrafficCommandEntity> | null {
    const decision = output.decision;
    if (!decision) return null;
    const commandKind = DECISION_TO_COMMAND[decision.kind];
    if (!commandKind) return null;

    return {
      intersectionCode:
        result.scope === 'intersection'
          ? (intersectionCode ?? result.scopeRef)
          : (intersectionCodeFromPayload(decision) ?? null),
      scope: result.scope,
      scopeRef: result.scopeRef,
      agentRunId,
      agentId: output.agentId,
      decisionKind: decision.kind,
      kind: commandKind,
      severity: decision.severity as TrafficCommandSeverity,
      override: decision.override === true,
      status: 'queued',
      payload: cleanPayload(decision),
      rationale: decision.rationale ?? [],
      issuedAt,
    };
  }

  private async supersedeOpenBlocks(intersectionCode: string) {
    await this.repository
      .createQueryBuilder()
      .update(TrafficCommandEntity)
      .set({ status: 'superseded', resolvedAt: () => 'NOW()' })
      .where('intersectionCode = :code', { code: intersectionCode })
      .andWhere('kind = :kind', { kind: 'block_automatic_control' })
      .andWhere('status IN (:...active)', {
        active: ['queued', 'dispatched'] as TrafficCommandStatus[],
      })
      .execute();
  }

  private toView(row: TrafficCommandEntity): TrafficCommandView {
    return {
      id: row.id,
      intersectionCode: row.intersectionCode,
      scope: row.scope,
      scopeRef: row.scopeRef,
      agentRunId: row.agentRunId,
      agentId: row.agentId,
      decisionKind: row.decisionKind,
      kind: row.kind,
      severity: row.severity,
      override: row.override,
      status: row.status,
      lifecycleStage: toLifecycleStage(row.status),
      payload: row.payload ?? {},
      rationale: Array.isArray(row.rationale) ? row.rationale : [],
      issuedAt: row.issuedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
    };
  }
}

function toLifecycleStage(
  status: TrafficCommandStatus,
): TrafficCommandView['lifecycleStage'] {
  if (status === 'acknowledged') return 'applied';
  return status;
}

function pickIntersectionCode(result: AgentRunResult): string | null {
  if (result.scope === 'intersection') return result.scopeRef;
  return null;
}

function intersectionCodeFromPayload(decision: AgentDecision): string | null {
  const candidate = decision.payload?.['intersectionCode'];
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  return null;
}

function cleanPayload(decision: AgentDecision): Record<string, unknown> {
  if (!decision.payload) return {};
  // Strip extremely large nested objects (e.g. metricsSummary inside
  // intersection-manager) to keep the row compact. Operators care
  // about the actionable fields, not the full snapshot.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decision.payload)) {
    if (key === 'analysis' || key === 'metricsSummary') continue;
    out[key] = value;
  }
  return out;
}

function severitiesAtLeast(floor: AgentSeverity): AgentSeverity[] {
  const order: AgentSeverity[] = ['info', 'advisory', 'warning', 'critical'];
  return order.slice(order.indexOf(floor));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

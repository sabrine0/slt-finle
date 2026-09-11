import { Injectable, Logger } from '@nestjs/common';

import { PredictionMetricsService } from '../prediction/prediction-metrics.service';
import {
  normalizePredictionHorizon,
  type PredictionHorizon,
} from '../prediction/prediction.dto';
import { PredictionSnapshotsService } from '../prediction-snapshots/prediction-snapshots.service';
import { TrafficPredictionAgentService } from '../traffic-intelligence/traffic-prediction-agent.service';
import {
  AgentExecutionContext,
  type AgentRuntimeServices,
} from './agent-execution.context';
import { AgentRegistryService, type Agent } from './agent-registry.service';
import {
  SEVERITY_RANK,
  type AgentDecision,
  type AgentOutput,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentScope,
  type AgentSeverity,
} from './agent.types';

/**
 * AgentRuntimeService — orchestrates agent execution for a given
 * scope. Builds an AgentExecutionContext, picks the applicable
 * agents from the registry, runs them sequentially (default) or in
 * parallel, and aggregates a final recommendation.
 */
@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);
  private readonly services: AgentRuntimeServices;

  constructor(
    private readonly registry: AgentRegistryService,
    private readonly metricsService: PredictionMetricsService,
    private readonly snapshotsService: PredictionSnapshotsService,
    private readonly predictionAgent: TrafficPredictionAgentService,
  ) {
    this.services = {
      metricsService: this.metricsService,
      snapshotsService: this.snapshotsService,
      predictionAgent: this.predictionAgent,
    };
  }

  async execute(
    scope: AgentScope,
    scopeRef: string,
    options: AgentRunOptions = {},
  ): Promise<AgentRunResult> {
    const horizon: PredictionHorizon =
      normalizePredictionHorizon(options.horizon) ?? 'H+15';
    const events = options.events ?? [];
    const start = Date.now();

    const context = new AgentExecutionContext(
      scope,
      scopeRef,
      horizon,
      events,
      this.services,
    );

    let agents = this.registry.forScope(scope);
    if (options.agentIds?.length) {
      const selected = new Set(options.agentIds);
      agents = agents.filter((agent) => selected.has(agent.id));
    }

    if (options.parallel) {
      await this.runParallel(agents, context);
    } else {
      await this.runSequential(agents, context);
    }

    const outputs = context.outputs;
    const decisions = outputs
      .map((output) => output.decision)
      .filter((decision): decision is AgentDecision => decision != null);
    const aggregatedSeverity = decisions.reduce<AgentSeverity>(
      (worst, decision) =>
        SEVERITY_RANK[decision.severity] > SEVERITY_RANK[worst]
          ? decision.severity
          : worst,
      'info',
    );
    const finalRecommendation = pickFinalDecision(decisions);

    return {
      scope,
      scopeRef,
      horizon,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      agentCount: outputs.length,
      outputs,
      decisions,
      aggregatedSeverity,
      finalRecommendation,
    };
  }

  // ───────── private execution paths ─────────

  private async runSequential(
    agents: Agent[],
    context: AgentExecutionContext,
  ): Promise<void> {
    for (const agent of agents) {
      const output = await this.runOne(agent, context);
      context.outputs.push(output);
    }
  }

  private async runParallel(
    agents: Agent[],
    context: AgentExecutionContext,
  ): Promise<void> {
    const outputs = await Promise.all(
      agents.map((agent) => this.runOne(agent, context)),
    );
    context.outputs.push(...outputs);
  }

  private async runOne(
    agent: Agent,
    context: AgentExecutionContext,
  ): Promise<AgentOutput> {
    const startedAt = new Date();
    let decision: AgentDecision | null = null;
    let status: AgentOutput['status'] = 'running';
    let error: string | undefined;

    try {
      decision = await agent.run(context);
      status = decision == null ? 'skipped' : 'success';
    } catch (caught) {
      status = 'failed';
      error = caught instanceof Error ? caught.message : String(caught);
      this.logger.warn(`Agent "${agent.id}" failed: ${error}`);
    }

    const finishedAt = new Date();
    return {
      agentId: agent.id,
      agentType: agent.type,
      scope: context.scope,
      scopeRef: context.scopeRef,
      status,
      decision,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error,
    };
  }
}

/**
 * Pick the final recommendation: highest severity wins; ties broken
 * by override flag, then by run order (first one keeps it).
 */
function pickFinalDecision(decisions: AgentDecision[]): AgentDecision | null {
  if (decisions.length === 0) return null;
  let winner: AgentDecision | null = null;
  let winnerScore = -1;
  for (const decision of decisions) {
    const score =
      SEVERITY_RANK[decision.severity] * 10 + (decision.override ? 1 : 0);
    if (score > winnerScore) {
      winnerScore = score;
      winner = decision;
    }
  }
  return winner;
}

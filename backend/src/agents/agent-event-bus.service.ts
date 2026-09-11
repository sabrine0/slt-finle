import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import type { AgentDecision, AgentRunResult } from './agent.types';

export interface AgentRunEventPayload {
  result: AgentRunResult;
  trigger: 'scheduled' | 'manual';
}

export interface AgentCriticalEventPayload {
  decision: AgentDecision;
  agentId: string;
  scope: AgentRunResult['scope'];
  scopeRef: string;
  generatedAt: string;
}

export type AgentOverrideEventPayload = AgentCriticalEventPayload;

export type AgentEventName =
  | 'agent.run.completed'
  | 'agent.decision.critical'
  | 'agent.decision.override';

/**
 * AgentEventBusService — single in-process event bus for the agent
 * runtime. Emits structured events that can be consumed by future
 * websocket gateways, audit pipelines, or alarm bridges. Always logs
 * critical / override decisions so they appear in the operational
 * log even if no other listener is attached.
 */
@Injectable()
export class AgentEventBusService {
  private readonly logger = new Logger(AgentEventBusService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);

    this.emitter.on(
      'agent.decision.critical',
      ({ agentId, scope, scopeRef, decision }: AgentCriticalEventPayload) => {
        this.logger.warn(
          `CRITICAL [${agentId}] ${scope}/${scopeRef} → ${decision.kind} :: ${decision.rationale[0] ?? ''}`,
        );
      },
    );
    this.emitter.on(
      'agent.decision.override',
      ({ agentId, scope, scopeRef, decision }: AgentOverrideEventPayload) => {
        this.logger.warn(
          `OVERRIDE [${agentId}] ${scope}/${scopeRef} → ${decision.kind} :: ${decision.rationale[0] ?? ''}`,
        );
      },
    );
  }

  /** Distribute a single AgentRunResult to subscribers. */
  publishRun(payload: AgentRunEventPayload): void {
    this.emitter.emit('agent.run.completed', payload);

    for (const output of payload.result.outputs) {
      const decision = output.decision;
      if (!decision) continue;
      const base: AgentCriticalEventPayload = {
        decision,
        agentId: output.agentId,
        scope: payload.result.scope,
        scopeRef: payload.result.scopeRef,
        generatedAt: payload.result.generatedAt,
      };
      if (decision.severity === 'critical') {
        this.emitter.emit('agent.decision.critical', base);
      }
      if (decision.override) {
        this.emitter.emit('agent.decision.override', base);
      }
    }
  }

  on<T = unknown>(event: AgentEventName, listener: (payload: T) => void): void {
    this.emitter.on(event, listener);
  }

  off<T = unknown>(
    event: AgentEventName,
    listener: (payload: T) => void,
  ): void {
    this.emitter.off(event, listener);
  }
}

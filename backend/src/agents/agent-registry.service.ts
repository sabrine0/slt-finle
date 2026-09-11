import { Injectable, Logger } from '@nestjs/common';

import type { AgentExecutionContext } from './agent-execution.context';
import type { AgentDecision, AgentScope } from './agent.types';

/**
 * Contract every concrete agent implements. Pure, no DI boilerplate
 * required; if the agent needs services it reads them off the
 * AgentExecutionContext (which already has them cached).
 */
export interface Agent {
  /** Stable, unique id (used as URL filter and audit key). */
  readonly id: string;
  /** Logical type — e.g. 'intersection-manager'. */
  readonly type: string;
  /** Scopes this agent applies to. */
  readonly scopes: AgentScope[];
  /** Operator-readable description, surfaced in /agents listing. */
  readonly description: string;
  /**
   * Optional priority — lower numbers run first when sequential.
   * Override agents (police, emergency) should pick low numbers so
   * their decisions land in the context before advisory agents.
   */
  readonly priority?: number;
  /**
   * Run the agent against the given context. Return null when the
   * agent has nothing to say for this scope (it will be marked
   * `skipped` in the trace).
   */
  run(context: AgentExecutionContext): Promise<AgentDecision | null>;
}

/**
 * Holds all known agents. Other modules push into the registry on
 * application bootstrap (see AgentsModule.onModuleInit).
 */
@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly byId = new Map<string, Agent>();

  register(agent: Agent): void {
    if (this.byId.has(agent.id)) {
      this.logger.warn(`Agent "${agent.id}" already registered, replacing.`);
    }
    this.byId.set(agent.id, agent);
    this.logger.log(
      `Registered agent "${agent.id}" (${agent.type}) — scopes [${agent.scopes.join(', ')}]`,
    );
  }

  list(): Agent[] {
    return [...this.byId.values()];
  }

  byIdOrUndefined(id: string): Agent | undefined {
    return this.byId.get(id);
  }

  /** Agents that apply to a given scope, sorted by priority asc. */
  forScope(scope: AgentScope): Agent[] {
    return this.list()
      .filter((agent) => agent.scopes.includes(scope))
      .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
  }
}

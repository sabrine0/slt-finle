/**
 * Core typing for the multi-agent traffic system.
 *
 * Every agent — current and future — implements the Agent interface
 * and runs inside an AgentExecutionContext. Agents emit a structured
 * AgentDecision so downstream consumers (operators, runtime, audit
 * pipeline) can act on the result without parsing free-form text.
 */

import type { PredictionHorizon } from '../prediction/prediction.dto';

/** Operational scope an agent can act on. */
export type AgentScope = 'intersection' | 'zone' | 'city';

/** Lifecycle of a single agent invocation. */
export type AgentStatus = 'idle' | 'running' | 'success' | 'skipped' | 'failed';

/** Severity ladder used by decisions and the aggregated result. */
export type AgentSeverity = 'info' | 'advisory' | 'warning' | 'critical';

/**
 * External event flag fed into the runtime (emergency vehicle near
 * intersection, bus approach, police taking control). For now these
 * are passed in by the caller to simulate; later they will come from
 * sensors / dispatch / mobile clients.
 */
export interface AgentEvent {
  type:
    | 'emergency_vehicle'
    | 'bus_approach'
    | 'police_override'
    | 'manual_release'
    | 'sensor_anomaly';
  /** Optional scoping hint — when omitted the event applies to the run scope. */
  scope?: AgentScope;
  scopeRef?: string;
  payload?: Record<string, unknown>;
}

/** Structured decision an agent emits. */
export interface AgentDecision {
  /** Stable code consumed by UI and runtime, e.g. `extend_green`. */
  kind: string;
  /** Free-form numeric / structural payload. */
  payload?: Record<string, unknown>;
  severity: AgentSeverity;
  /** Plain-language reasons, one bullet per fired rule. */
  rationale: string[];
  /**
   * If true, the runtime treats this as an override that suspends
   * subsequent advisory agents (police taking control, emergency
   * pre-emption). Cleared by `manual_release`.
   */
  override?: boolean;
}

/** Trace of a single agent run. */
export interface AgentOutput {
  agentId: string;
  agentType: string;
  scope: AgentScope;
  scopeRef: string;
  status: AgentStatus;
  decision: AgentDecision | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error?: string;
}

/** Full result of one runtime invocation. */
export interface AgentRunResult {
  scope: AgentScope;
  scopeRef: string;
  horizon: PredictionHorizon;
  generatedAt: string;
  durationMs: number;
  agentCount: number;
  outputs: AgentOutput[];
  decisions: AgentDecision[];
  /** Aggregated severity across decisions (worst wins). */
  aggregatedSeverity: AgentSeverity;
  /**
   * Final recommendation — single, distilled action the operator
   * should consider. The runtime picks it from the highest-severity
   * decision; ties are broken by override flag, then run order.
   */
  finalRecommendation: AgentDecision | null;
}

/** Options accepted by the runtime per execution. */
export interface AgentRunOptions {
  horizon?: PredictionHorizon;
  events?: AgentEvent[];
  /** Run agents concurrently (no shared mutation between agents). */
  parallel?: boolean;
  /** Restrict execution to specific agent IDs. */
  agentIds?: string[];
}

/** Severity ranking — used to pick the final recommendation. */
export const SEVERITY_RANK: Record<AgentSeverity, number> = {
  info: 0,
  advisory: 1,
  warning: 2,
  critical: 3,
};

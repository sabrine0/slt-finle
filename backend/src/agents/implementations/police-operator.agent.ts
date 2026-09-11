import { Injectable } from '@nestjs/common';

import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope } from '../agent.types';

/**
 * PoliceOperatorAgent — explicit manual control by a police operator.
 *
 * Runs first (priority 0). When a `police_override` event is in the
 * input or the prediction agent has already escalated to
 * `recommendedAction === 'police_action'`, this agent emits a
 * critical override that suspends downstream advisory agents.
 *
 * A `manual_release` event clears the override and lets the rest of
 * the pipeline continue.
 */
@Injectable()
export class PoliceOperatorAgent implements Agent {
  readonly id = 'police-operator';
  readonly type = 'operator-control';
  readonly scopes: AgentScope[] = ['intersection', 'zone', 'city'];
  readonly description =
    'Hands signal control to a police operator on demand. Acts as override.';
  readonly priority = 0;

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    if (context.hasReleaseSignal()) {
      return {
        kind: 'release_manual_control',
        severity: 'info',
        rationale: [
          'manual_release event received — operator returns control to runtime.',
        ],
        override: false,
      };
    }

    const explicitOverride = context.hasEvent('police_override');
    if (explicitOverride) {
      const events = context.getEvents('police_override');
      return {
        kind: 'manual_control',
        severity: 'critical',
        rationale: [
          'police_override event received — operator takes manual control of the signal.',
        ],
        payload: {
          source: 'event',
          eventCount: events.length,
        },
        override: true,
      };
    }

    if (context.scope !== 'intersection') {
      return null;
    }

    // Auto-escalate when the prediction agent has already asked for
    // police action — keep the human in the loop, but flag it.
    const analysis = await context.getPredictionAnalysis();
    if (analysis.recommendedAction === 'police_action') {
      return {
        kind: 'manual_control_recommended',
        severity: 'critical',
        rationale: [
          `Prediction agent escalated: risk ${analysis.riskScore}/100, ` +
            `congestion=${analysis.predictedCongestionLevel}, trend=${analysis.predictedTrend}.`,
          'Auto-suggesting manual control — operator confirmation still required.',
        ],
        payload: {
          source: 'prediction-agent',
          riskScore: analysis.riskScore,
          predictedTrend: analysis.predictedTrend,
        },
        override: true,
      };
    }

    return null;
  }
}

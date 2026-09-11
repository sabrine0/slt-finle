import { Injectable } from '@nestjs/common';

import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope, AgentSeverity } from '../agent.types';

/**
 * IntersectionManagerAgent — base controller for one intersection.
 *
 * Reads the engineering metrics + the rule-based prediction analysis
 * (level / trend / risk) and translates them into a concrete control
 * decision: maintain, monitor, increase green to dominant approach,
 * or extend cycle. Skips when an override is already active.
 *
 * This is the "default brain" that runs at every intersection-scope
 * tick. Emergency / bus / police agents take precedence.
 */
@Injectable()
export class IntersectionManagerAgent implements Agent {
  readonly id = 'intersection-manager';
  readonly type = 'intersection-control';
  readonly scopes: AgentScope[] = ['intersection'];
  readonly description =
    'Translates predicted congestion into a timing-plan adjustment.';
  readonly priority = 30;

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    if (context.hasOverride()) {
      return {
        kind: 'control_suppressed',
        severity: 'info',
        rationale: [
          'Intersection control suppressed — manual or emergency override is active.',
        ],
      };
    }

    const analysis = await context.getPredictionAnalysis();
    const metrics = await context.getIntersectionMetrics();

    const severity: AgentSeverity =
      analysis.predictedCongestionLevel === 'congestion'
        ? 'warning'
        : analysis.predictedCongestionLevel === 'pressure'
          ? 'advisory'
          : 'info';

    const rationale = [
      `Predicted level: ${analysis.predictedCongestionLevel} ` +
        `(saturation X≈${(metrics.saturation ?? 0).toFixed(2)}, queue ` +
        `${metrics.queueLengthMetres ?? 0}m).`,
      `Trend: ${analysis.predictedTrend}, risk ${analysis.riskScore}/100.`,
    ];

    let kind: string;
    const payload: Record<string, unknown> = {
      riskScore: analysis.riskScore,
      predictedTrend: analysis.predictedTrend,
      predictedCongestionLevel: analysis.predictedCongestionLevel,
    };

    switch (analysis.recommendedAction) {
      case 'maintain':
        kind = 'maintain_plan';
        rationale.push('Smooth flow → keep current timing plan.');
        break;
      case 'monitor':
        kind = 'monitor_plan';
        rationale.push('Pressure stable → monitor before intervening.');
        break;
      case 'increase_green':
        kind = 'increase_green_dominant';
        rationale.push(
          'Pressure rising → bias green towards dominant approach.',
        );
        payload['biasFactor'] = 0.4;
        break;
      case 'extend_cycle':
        kind = 'extend_cycle';
        rationale.push(
          'Sustained congestion → extend cycle and re-balance phase splits.',
        );
        payload['cycleExtensionSeconds'] = 20;
        payload['biasFactor'] = 0.65;
        break;
      case 'police_action':
        // Police agent should already have raised an override —
        // mirror the recommendation here as well so the operator
        // sees consistent advice if police agent was filtered out.
        kind = 'request_manual_control';
        rationale.push(
          'Risk severe → ask for police / manual control. Verify with Police agent output.',
        );
        break;
      case 'no_data':
      default:
        kind = 'no_data';
        rationale.push(
          'No engineering metrics — keep fixed-time plan until detectors report.',
        );
        break;
    }

    return {
      kind,
      severity,
      rationale: [...rationale, ...analysis.rationale.slice(0, 3)],
      payload: {
        ...payload,
        analysis: {
          riskScore: analysis.riskScore,
          predictedCongestionLevel: analysis.predictedCongestionLevel,
          predictedTrend: analysis.predictedTrend,
          recommendedAction: analysis.recommendedAction,
        },
        metricsSummary: {
          flowVehiclesPerHour: metrics.flowVehiclesPerHour,
          saturation: metrics.saturation,
          queueLengthMetres: metrics.queueLengthMetres,
          delaySeconds: metrics.delaySeconds,
          confidence: metrics.confidence,
        },
      },
    };
  }
}

import { Injectable } from '@nestjs/common';

import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope } from '../agent.types';

/**
 * BusPriorityAgent — extends green for an approaching bus on a
 * priority corridor (BHNS L5/L6, tram T3/T4, etc.).
 *
 * Triggered by a `bus_approach` event. Emits an advisory extension
 * (typically 5–10 s) that the operator/runtime can apply unless an
 * override is already in place.
 */
@Injectable()
export class BusPriorityAgent implements Agent {
  readonly id = 'bus-priority';
  readonly type = 'priority';
  readonly scopes: AgentScope[] = ['intersection'];
  readonly description =
    'Extends green for an approaching priority bus / tram.';
  readonly priority = 20;

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    if (!context.hasEvent('bus_approach')) {
      return null;
    }

    if (context.hasOverride()) {
      return {
        kind: 'bus_priority_suppressed',
        severity: 'info',
        rationale: [
          'Bus priority request suppressed because a higher-severity override is active.',
        ],
      };
    }

    const events = context.getEvents('bus_approach');
    const direction = pickDirection(events);

    const analysis = await context.getPredictionAnalysis().catch(() => null);
    let extensionSeconds = 6;
    const rationale = [
      `bus_approach event received${direction ? ` on ${direction}` : ''} — extend green by ${extensionSeconds}s.`,
    ];
    if (analysis) {
      if (analysis.predictedCongestionLevel === 'congestion') {
        extensionSeconds = 4;
        rationale.push(
          `Congestion detected (X high) — cap extension at ${extensionSeconds}s to avoid starving cross-traffic.`,
        );
      } else if (analysis.predictedCongestionLevel === 'smooth') {
        extensionSeconds = 10;
        rationale.push(
          'Smooth flow on cross-traffic — extension widened to 10s.',
        );
      }
    }

    return {
      kind: 'extend_green',
      severity: 'advisory',
      rationale,
      payload: {
        direction: direction ?? null,
        extensionSeconds,
        eventCount: events.length,
      },
    };
  }
}

function pickDirection(events: ReturnType<AgentExecutionContext['getEvents']>) {
  for (const event of events) {
    const direction = event.payload?.['direction'];
    if (typeof direction === 'string' && direction.length > 0) {
      return direction.toUpperCase();
    }
  }
  return null;
}

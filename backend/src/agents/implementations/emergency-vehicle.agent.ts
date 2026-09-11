import { Injectable } from '@nestjs/common';

import type { AgentExecutionContext } from '../agent-execution.context';
import type { Agent } from '../agent-registry.service';
import type { AgentDecision, AgentScope } from '../agent.types';

/**
 * EmergencyVehicleAgent — preempts the signal for an approaching
 * emergency vehicle (ambulance / firetruck / police).
 *
 * Triggered by an `emergency_vehicle` event. Emits a critical
 * override that asks the runtime to force-green the corridor in the
 * vehicle's direction and suspend regular advisory decisions.
 *
 * The optional `direction` payload field on the event becomes the
 * forced corridor; if absent we fall back to the dominant approach
 * from the engineering snapshot.
 */
@Injectable()
export class EmergencyVehicleAgent implements Agent {
  readonly id = 'emergency-vehicle';
  readonly type = 'preemption';
  readonly scopes: AgentScope[] = ['intersection', 'zone', 'city'];
  readonly description =
    'Forces a green corridor for an approaching emergency vehicle.';
  readonly priority = 5;

  async run(context: AgentExecutionContext): Promise<AgentDecision | null> {
    if (!context.hasEvent('emergency_vehicle')) {
      return null;
    }

    if (context.hasOverride()) {
      // Police already in manual control — emergency request becomes
      // a notification, not an override.
      return {
        kind: 'emergency_acknowledged',
        severity: 'warning',
        rationale: [
          'Emergency vehicle inbound, but a manual-control override is already active.',
          'Operator must coordinate signal manually.',
        ],
        override: false,
      };
    }

    const events = context.getEvents('emergency_vehicle');
    const direction = pickDirection(events);
    const corridor = direction ? `${direction}-bound corridor` : 'corridor';

    const rationale = [
      `${events.length} emergency_vehicle event${events.length === 1 ? '' : 's'} received — preempt signal in favour of the ${corridor}.`,
    ];

    let recommendedHoldSeconds = 25;
    if (context.scope === 'intersection') {
      const analysis = await context.getPredictionAnalysis().catch(() => null);
      if (analysis && analysis.predictedCongestionLevel === 'congestion') {
        recommendedHoldSeconds = 35;
        rationale.push(
          `Underlying congestion (risk ${analysis.riskScore}/100) — hold green longer (${recommendedHoldSeconds}s) to clear queue first.`,
        );
      }
    }

    return {
      kind: 'force_green_corridor',
      severity: 'critical',
      rationale,
      payload: {
        direction: direction ?? null,
        recommendedHoldSeconds,
        eventCount: events.length,
      },
      override: true,
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

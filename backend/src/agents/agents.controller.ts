import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import { TrafficControlExecutionService } from '../traffic-control/traffic-control-execution.service';
import { AgentEventBusService } from './agent-event-bus.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRunsService } from './agent-runs.service';
import { AgentRuntimeService } from './agent-runtime.service';
import type { AgentEvent, AgentScope, AgentSeverity } from './agent.types';

const VALID_SCOPES: AgentScope[] = ['intersection', 'zone', 'city'];
const VALID_SEVERITIES: AgentSeverity[] = [
  'info',
  'advisory',
  'warning',
  'critical',
];

const KNOWN_EVENT_TYPES: AgentEvent['type'][] = [
  'emergency_vehicle',
  'bus_approach',
  'police_override',
  'manual_release',
  'sensor_anomaly',
];

@DevPublic()
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly registry: AgentRegistryService,
    private readonly runs: AgentRunsService,
    private readonly events: AgentEventBusService,
    private readonly execution: TrafficControlExecutionService,
  ) {}

  /** Listing of all registered agents — useful for UI inventory. */
  @RequirePermissions('command-platform.read')
  @Get()
  list() {
    return {
      agents: this.registry.list().map((agent) => ({
        id: agent.id,
        type: agent.type,
        scopes: agent.scopes,
        priority: agent.priority ?? 100,
        description: agent.description,
      })),
    };
  }

  @RequirePermissions('command-platform.read')
  @Get('intersection/:intersectionId/run')
  async runIntersection(
    @Param('intersectionId') intersectionId: string,
    @Query('horizon') horizon?: PredictionHorizon,
    @Query('events') events?: string,
    @Query('parallel') parallel?: string,
    @Query('awaitCommands') awaitCommands?: string,
  ) {
    return this.runAndPersist('intersection', intersectionId, {
      horizon,
      events: parseEvents(events, 'intersection', intersectionId),
      parallel: parallel === 'true' || parallel === '1',
      awaitCommands: awaitCommands === 'true' || awaitCommands === '1',
    });
  }

  @RequirePermissions('command-platform.read')
  @Get('zone/:zoneId/run')
  async runZone(
    @Param('zoneId') zoneId: string,
    @Query('horizon') horizon?: PredictionHorizon,
    @Query('events') events?: string,
    @Query('parallel') parallel?: string,
    @Query('awaitCommands') awaitCommands?: string,
  ) {
    return this.runAndPersist('zone', zoneId, {
      horizon,
      events: parseEvents(events, 'zone', zoneId),
      parallel: parallel === 'true' || parallel === '1',
      awaitCommands: awaitCommands === 'true' || awaitCommands === '1',
    });
  }

  @RequirePermissions('command-platform.read')
  @Get('city/:cityId/run')
  async runCity(
    @Param('cityId') cityId: string,
    @Query('horizon') horizon?: PredictionHorizon,
    @Query('events') events?: string,
    @Query('parallel') parallel?: string,
    @Query('awaitCommands') awaitCommands?: string,
  ) {
    return this.runAndPersist('city', cityId, {
      horizon,
      events: parseEvents(events, 'city', cityId),
      parallel: parallel === 'true' || parallel === '1',
      awaitCommands: awaitCommands === 'true' || awaitCommands === '1',
    });
  }

  /**
   * Read-only visualization layers (heatmap + anticipation) for a
   * city/zone. Runs ONLY the two visualization agents and returns their
   * payloads — no persistence, no runtime commands. Safe to poll from
   * the operator map.
   */
  @RequirePermissions('command-platform.read')
  @Get('visualization/:scope/:id')
  async visualization(
    @Param('scope') scope: string,
    @Param('id') id: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    if (scope !== 'city' && scope !== 'zone') {
      throw new NotFoundException(
        `Visualization layers are only available for city or zone scope (got "${scope}").`,
      );
    }
    const result = await this.runtime.execute(scope, id, {
      horizon,
      agentIds: ['traffic-heatmap', 'traffic-anticipation'],
      parallel: true,
    });
    const payloadFor = (agentId: string) =>
      result.outputs.find((output) => output.agentId === agentId)?.decision
        ?.payload ?? null;
    return {
      scope: result.scope,
      scopeRef: result.scopeRef,
      horizon: result.horizon,
      generatedAt: result.generatedAt,
      heatmap: payloadFor('traffic-heatmap'),
      anticipation: payloadFor('traffic-anticipation'),
    };
  }

  /** Latest persisted run for a given scope/ref. */
  @RequirePermissions('command-platform.read')
  @Get('latest/:scope/:id')
  async latest(@Param('scope') scope: string, @Param('id') id: string) {
    if (!VALID_SCOPES.includes(scope as AgentScope)) {
      throw new NotFoundException(
        `Unknown scope "${scope}" — expected one of ${VALID_SCOPES.join(', ')}.`,
      );
    }
    const record = await this.runs.findLatest(scope as AgentScope, id);
    if (!record) {
      throw new NotFoundException(
        `No persisted agent run found for ${scope}/${id}.`,
      );
    }
    return record;
  }

  /** Recent runs filtered by severity floor — feeds an alert feed. */
  @RequirePermissions('command-platform.read')
  @Get('runs/recent')
  async recent(
    @Query('severity') severity?: string,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ) {
    const severityAtLeast =
      severity && VALID_SEVERITIES.includes(severity as AgentSeverity)
        ? (severity as AgentSeverity)
        : undefined;
    const scopeFilter =
      scope && VALID_SCOPES.includes(scope as AgentScope)
        ? (scope as AgentScope)
        : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.runs.listLatest({
      severityAtLeast,
      scope: scopeFilter,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  private async runAndPersist(
    scope: AgentScope,
    scopeRef: string,
    options: Parameters<AgentRuntimeService['execute']>[2] & {
      awaitCommands?: boolean;
    },
  ) {
    const result = await this.runtime.execute(scope, scopeRef, options);
    const record = await this.runs.record(result, 'manual');
    this.events.publishRun({ result, trigger: 'manual' });
    let commands = await this.execution.execute(result, {
      agentRunId: record.id,
    });
    if (options.awaitCommands && commands.length > 0) {
      commands = await this.execution.waitForSettlement(
        commands.map((command) => command.id),
      );
    }
    return { ...record, commands };
  }
}

/**
 * Parse `?events=emergency_vehicle,bus_approach` (or with payloads
 * `?events=emergency_vehicle:direction=N`). Unknown event types are
 * silently dropped so callers can't smuggle arbitrary tokens.
 */
function parseEvents(
  raw: string | undefined,
  scope: AgentEvent['scope'],
  scopeRef: string,
): AgentEvent[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map<AgentEvent | null>((entry) => {
      const [typeRaw, ...rest] = entry.split(':');
      const type = (typeRaw ?? '').trim() as AgentEvent['type'];
      if (!KNOWN_EVENT_TYPES.includes(type)) return null;
      const payload: Record<string, unknown> = {};
      for (const segment of rest.join(':').split(';')) {
        const [keyRaw, ...valueRest] = segment.split('=');
        const key = (keyRaw ?? '').trim();
        const value = valueRest.join('=').trim();
        if (key.length > 0 && value.length > 0) {
          payload[key] = value;
        }
      }
      return {
        type,
        scope,
        scopeRef,
        payload: Object.keys(payload).length > 0 ? payload : undefined,
      };
    })
    .filter((entry): entry is AgentEvent => entry != null);
}

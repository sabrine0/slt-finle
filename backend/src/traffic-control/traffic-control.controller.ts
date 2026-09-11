import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import type { TrafficCommandStatus } from '../database/entities/traffic-command.entity';
import type { AgentSeverity } from '../agents/agent.types';
import { TrafficControlExecutionService } from './traffic-control-execution.service';
import { TrafficControlService } from './traffic-control.service';

const VALID_STATUSES: TrafficCommandStatus[] = [
  'queued',
  'dispatched',
  'acknowledged',
  'failed',
  'superseded',
];
const VALID_SEVERITIES: AgentSeverity[] = [
  'info',
  'advisory',
  'warning',
  'critical',
];

/**
 * Active-control endpoints. Recommendations are advisory: they do
 * not push timing changes to the runtime — the operator still has to
 * apply via the existing /intersections/:id/config endpoint. This
 * boundary is deliberate so every change is auditable.
 */
@DevPublic()
@Controller('traffic-control')
export class TrafficControlController {
  constructor(
    private readonly service: TrafficControlService,
    private readonly execution: TrafficControlExecutionService,
  ) {}

  @RequirePermissions('command-platform.read')
  @AuditAction({
    action: 'traffic-control.optimize',
    resourceType: 'intersection',
  })
  @Post('intersection/:id/optimize')
  optimize(
    @Param('id') intersectionId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.service.optimizeIntersection(intersectionId, horizon);
  }

  /** Latest persisted control command for an intersection. */
  @RequirePermissions('command-platform.read')
  @Get('latest/:intersectionId')
  async latest(@Param('intersectionId') intersectionId: string) {
    const command =
      await this.execution.findLatestForIntersection(intersectionId);
    if (!command) {
      throw new NotFoundException(
        `No command issued yet for intersection "${intersectionId}".`,
      );
    }
    return command;
  }

  /** Recent command feed — used by the operator UI for the live log. */
  @RequirePermissions('command-platform.read')
  @Get('commands/recent')
  async recent(
    @Query('intersection') intersectionCode?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
  ) {
    const statusFilter =
      status && VALID_STATUSES.includes(status as TrafficCommandStatus)
        ? (status as TrafficCommandStatus)
        : undefined;
    const severityFilter =
      severity && VALID_SEVERITIES.includes(severity as AgentSeverity)
        ? (severity as AgentSeverity)
        : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.execution.listLatest({
      intersectionCode,
      status: statusFilter,
      severityAtLeast: severityFilter,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @RequirePermissions('command-platform.read')
  @Get('commands/:commandId')
  async getCommand(@Param('commandId') commandId: string) {
    const command = await this.execution.findById(commandId);
    if (!command) {
      throw new NotFoundException(`Traffic command "${commandId}" not found.`);
    }
    return command;
  }

  /** Operator / runtime acknowledges a command was applied. */
  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'traffic-control.acknowledge-command',
    resourceType: 'traffic-command',
  })
  @Post('commands/:commandId/acknowledge')
  acknowledge(
    @Param('commandId') commandId: string,
    @Query('note') note?: string,
  ) {
    return this.execution.acknowledge(commandId, note);
  }
}

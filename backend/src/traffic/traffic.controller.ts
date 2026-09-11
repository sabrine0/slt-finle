import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RunScenarioDto } from './dto/run-scenario.dto';
import { SetForcedGreenDto } from './dto/set-forced-green.dto';
import { SetModeDto } from './dto/set-mode.dto';
import { SetOverrideDto } from './dto/set-override.dto';
import { TrafficService } from './traffic.service';

@DevPublic()
@Controller('command-platform')
export class TrafficController {
  constructor(private readonly trafficService: TrafficService) {}

  @RequirePermissions('command-platform.read')
  @Get('bootstrap')
  getBootstrap() {
    return this.trafficService.getSnapshot();
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'command-platform.run-scenario',
    resourceType: 'scenario',
  })
  @Post('scenarios/run')
  runScenario(@Body() runScenarioDto: RunScenarioDto) {
    return this.trafficService.runScenario(runScenarioDto.scenarioId);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'command-platform.stop-system',
    resourceType: 'command-platform',
  })
  @Post('system/stop')
  stopSystem() {
    return this.trafficService.stopSystem();
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'command-platform.intersection.override',
    resourceType: 'intersection',
  })
  @Post('intersections/:id/override')
  setOverride(
    @Param('id') intersectionId: string,
    @Body() body: SetOverrideDto,
  ) {
    return this.trafficService.setIntersectionOverride(
      intersectionId,
      body.engaged,
    );
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'command-platform.intersection.force-green',
    resourceType: 'intersection',
  })
  @Post('intersections/:id/force-green')
  setForcedGreen(
    @Param('id') intersectionId: string,
    @Body() body: SetForcedGreenDto,
  ) {
    return this.trafficService.setIntersectionForcedGreen(
      intersectionId,
      body.direction ?? null,
    );
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'command-platform.intersection.mode',
    resourceType: 'intersection',
  })
  @Post('intersections/:id/mode')
  setMode(@Param('id') intersectionId: string, @Body() body: SetModeDto) {
    return this.trafficService.setIntersectionMode(
      intersectionId,
      body.mode,
      body.confirmed,
    );
  }
}

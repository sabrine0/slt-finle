import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ForcePhaseDto } from './dto/force-phase.dto';
import { SetIntersectionConfigDto } from './dto/set-intersection-config.dto';
import { IntersectionRuntimeService } from './intersection-runtime.service';

@DevPublic()
@Controller('intersections')
export class IntersectionRuntimeController {
  constructor(private readonly runtime: IntersectionRuntimeService) {}

  @RequirePermissions('command-platform.read')
  @Get(':id/state')
  getState(@Param('id') intersectionId: string) {
    return this.runtime.getState(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get(':id/config')
  getConfig(@Param('id') intersectionId: string) {
    return this.runtime.getConfig(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get()
  listIntersections() {
    return {
      intersectionIds: this.runtime.listKnownIds(),
    };
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'intersection-runtime.apply-config',
    resourceType: 'intersection',
  })
  @Post(':id/config')
  applyConfig(
    @Param('id') intersectionId: string,
    @Body() body: SetIntersectionConfigDto,
  ) {
    return this.runtime.applyConfig(intersectionId, body);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'intersection-runtime.force-phase',
    resourceType: 'intersection',
  })
  @Post(':id/phase')
  forcePhase(@Param('id') intersectionId: string, @Body() body: ForcePhaseDto) {
    return this.runtime.setForcedPhase(intersectionId, body.phaseId ?? null);
  }
}

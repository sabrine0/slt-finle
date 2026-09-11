import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CorridorsService } from './corridors.service';
import { ActivateCorridorScenarioDto } from './dto/activate-scenario.dto';
import { AddCorridorIntersectionsDto } from './dto/add-corridor-intersections.dto';
import { CorridorOverrideDto } from './dto/corridor-override.dto';
import { CreateCorridorDto } from './dto/create-corridor.dto';
import { ReleaseCorridorControlDto } from './dto/release-corridor.dto';

interface RequestWithUser extends Request {
  user?: { sub?: string };
}

function resolveIpAddress(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded;
  if (Array.isArray(forwarded) && forwarded.length) return forwarded[0];
  return request.ip ?? null;
}

@DevPublic()
@Controller('corridors')
export class CorridorsController {
  constructor(private readonly corridors: CorridorsService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  listCorridors() {
    return this.corridors.listCorridors();
  }

  @RequirePermissions('command-platform.read')
  @Get(':id')
  getCorridor(@Param('id') corridorId: string) {
    return this.corridors.getCorridor(corridorId);
  }

  @RequirePermissions('command-platform.read')
  @Get(':id/runtime')
  getRuntime(@Param('id') corridorId: string) {
    return this.corridors.getRuntimeSnapshot(corridorId);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'corridors.create',
    resourceType: 'corridor',
  })
  @Post()
  createCorridor(@Body() body: CreateCorridorDto) {
    return this.corridors.createCorridor(body);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'corridors.add-intersections',
    resourceType: 'corridor',
  })
  @Post(':id/intersections')
  addIntersections(
    @Param('id') corridorId: string,
    @Body() body: AddCorridorIntersectionsDto,
  ) {
    return this.corridors.addIntersections(corridorId, body);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'corridors.scenarios.activate',
    resourceType: 'corridor',
  })
  @Post(':id/scenarios/activate')
  activateScenario(
    @Param('id') corridorId: string,
    @Body() body: ActivateCorridorScenarioDto,
    @Req() request: RequestWithUser,
  ) {
    const payload: ActivateCorridorScenarioDto = {
      ...body,
      operatorUserId: body.operatorUserId ?? request.user?.sub,
    };
    return this.corridors.activateScenario(
      corridorId,
      payload,
      resolveIpAddress(request),
    );
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'corridors.control.override',
    resourceType: 'corridor',
  })
  @Post(':id/control/override')
  override(
    @Param('id') corridorId: string,
    @Body() body: CorridorOverrideDto,
    @Req() request: RequestWithUser,
  ) {
    const payload: CorridorOverrideDto = {
      ...body,
      operatorUserId: body.operatorUserId ?? request.user?.sub,
    };
    return this.corridors.override(
      corridorId,
      payload,
      resolveIpAddress(request),
    );
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'corridors.control.release',
    resourceType: 'corridor',
  })
  @Post(':id/control/release')
  release(
    @Param('id') corridorId: string,
    @Body() body: ReleaseCorridorControlDto,
    @Req() request: RequestWithUser,
  ) {
    const payload: ReleaseCorridorControlDto = {
      ...body,
      operatorUserId: body.operatorUserId ?? request.user?.sub,
    };
    return this.corridors.releaseControl(
      corridorId,
      payload,
      resolveIpAddress(request),
    );
  }
}

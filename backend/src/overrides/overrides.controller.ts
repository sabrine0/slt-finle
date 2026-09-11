import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { LogOverrideDto } from './dto/log-override.dto';
import { OverridesService } from './overrides.service';

interface RequestWithUser extends Request {
  user?: { sub?: string };
}

@DevPublic()
@Controller('overrides')
export class OverridesController {
  constructor(private readonly overridesService: OverridesService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  listRecent(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.overridesService.listRecent(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @RequirePermissions('command-platform.read')
  @Get(':intersectionCode')
  listForIntersection(
    @Param('intersectionCode') intersectionCode: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number(limit) : 25;
    return this.overridesService.listRecentForIntersection(
      intersectionCode,
      Number.isFinite(parsed) ? parsed : 25,
    );
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'overrides.log',
    resourceType: 'intersection',
  })
  @Post(':intersectionCode')
  logOverride(
    @Param('intersectionCode') intersectionCode: string,
    @Body() dto: LogOverrideDto,
    @Req() request: RequestWithUser,
  ) {
    const ipAddress =
      request.ip ??
      (request.headers['x-forwarded-for'] as string | undefined) ??
      null;
    const operatorUserId = request.user?.sub ?? null;
    return this.overridesService.logOverride(intersectionCode, dto, {
      ipAddress,
      operatorUserId,
    });
  }
}

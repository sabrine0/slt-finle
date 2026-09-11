import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RoadLinksService } from './road-links.service';

@DevPublic()
@Controller('road-links')
export class RoadLinksController {
  constructor(private readonly roadLinksService: RoadLinksService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(@Query('cityId') cityId?: string, @Query('zoneId') zoneId?: string) {
    return this.roadLinksService.list({ cityId, zoneId });
  }
}

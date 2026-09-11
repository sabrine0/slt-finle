import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { IntersectionsService } from './intersections.service';

@DevPublic()
@Controller('catalog/intersections')
export class IntersectionsController {
  constructor(private readonly intersectionsService: IntersectionsService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(@Query('cityId') cityId?: string, @Query('zoneId') zoneId?: string) {
    return this.intersectionsService.list({ cityId, zoneId });
  }
}

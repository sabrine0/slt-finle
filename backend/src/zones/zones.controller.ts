import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZonesService } from './zones.service';

@DevPublic()
@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(@Query('cityId') cityId?: string) {
    return this.zonesService.list(cityId);
  }
}

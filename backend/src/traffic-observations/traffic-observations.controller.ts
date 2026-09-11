import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { TrafficObservationsService } from './traffic-observations.service';

@DevPublic()
@Controller('traffic-observations')
export class TrafficObservationsController {
  constructor(
    private readonly trafficObservationsService: TrafficObservationsService,
  ) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(
    @Query('cityId') cityId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('intersectionId') intersectionId?: string,
  ) {
    return this.trafficObservationsService.list({
      cityId,
      zoneId,
      intersectionId,
    });
  }
}

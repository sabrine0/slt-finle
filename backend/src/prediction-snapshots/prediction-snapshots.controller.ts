import { Controller, Get, Param, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import { PredictionSnapshotsService } from './prediction-snapshots.service';

@DevPublic()
@Controller('prediction-snapshots')
export class PredictionSnapshotsController {
  constructor(
    private readonly predictionSnapshotsService: PredictionSnapshotsService,
  ) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(
    @Query('scopeType') scopeType?: 'city' | 'zone',
    @Query('scopeRef') scopeRef?: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.predictionSnapshotsService.listLatest(
      scopeType,
      scopeRef,
      horizon,
    );
  }

  @RequirePermissions('command-platform.read')
  @Get('cities/:cityId')
  city(
    @Param('cityId') cityId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.predictionSnapshotsService.getCitySnapshot(cityId, horizon);
  }

  @RequirePermissions('command-platform.read')
  @Get('zones/:zoneId')
  zone(
    @Param('zoneId') zoneId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.predictionSnapshotsService.getZoneSnapshot(zoneId, horizon);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:intersectionId')
  intersection(
    @Param('intersectionId') intersectionId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.predictionSnapshotsService.getIntersectionSnapshot(
      intersectionId,
      horizon,
    );
  }
}

import { Body, Controller, Post } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CapacityEstimatorService } from './capacity-estimator.service';
import { CriticalityScoringService } from './criticality-scoring.service';
import { CalculateForCarrefourDto, TravelTimeQueryDto } from './dto';
import { QueueEstimatorService } from './queue-estimator.service';
import { SaturationEstimatorService } from './saturation-estimator.service';
import { TravelTimeEstimatorService } from './travel-time-estimator.service';

@DevPublic()
@Controller('traffic-analysis')
export class TrafficAnalysisController {
  constructor(
    private readonly capacityService: CapacityEstimatorService,
    private readonly saturationService: SaturationEstimatorService,
    private readonly queueService: QueueEstimatorService,
    private readonly travelTimeService: TravelTimeEstimatorService,
    private readonly criticalityService: CriticalityScoringService,
  ) {}

  @RequirePermissions('command-platform.read')
  @Post('capacity/calculate')
  capacity(@Body() body: CalculateForCarrefourDto) {
    return this.capacityService.estimateForCarrefour(body.carrefourId);
  }

  @RequirePermissions('command-platform.read')
  @Post('saturation/estimate')
  saturation(@Body() body: CalculateForCarrefourDto) {
    return this.saturationService.estimateForCarrefour(body.carrefourId);
  }

  @RequirePermissions('command-platform.read')
  @Post('queues/estimate')
  queue(@Body() body: CalculateForCarrefourDto) {
    return this.queueService.estimateForCarrefour(body.carrefourId);
  }

  @RequirePermissions('command-platform.read')
  @Post('travel-time/estimate')
  travelTime(@Body() body: TravelTimeQueryDto) {
    return this.travelTimeService.estimateBetween(
      body.fromCarrefourId,
      body.toCarrefourId,
    );
  }

  @RequirePermissions('command-platform.read')
  @Post('criticality/score')
  criticality(@Body() body: CalculateForCarrefourDto) {
    return this.criticalityService.scoreCarrefour(body.carrefourId);
  }
}

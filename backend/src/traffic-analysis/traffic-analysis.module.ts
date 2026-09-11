import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
  IntersectionBranchEntity,
  LaneDetailEntity,
  TrafficObservationEntity,
} from '../database/entities';
import { CapacityEstimatorService } from './capacity-estimator.service';
import { CriticalityScoringService } from './criticality-scoring.service';
import { QueueEstimatorService } from './queue-estimator.service';
import { SaturationEstimatorService } from './saturation-estimator.service';
import { TrafficAnalysisController } from './traffic-analysis.controller';
import { TravelTimeEstimatorService } from './travel-time-estimator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CarrefourEntity,
      IntersectionBranchEntity,
      LaneDetailEntity,
      ConnectedIntersectionEntity,
      TrafficObservationEntity,
    ]),
  ],
  controllers: [TrafficAnalysisController],
  providers: [
    CapacityEstimatorService,
    SaturationEstimatorService,
    QueueEstimatorService,
    TravelTimeEstimatorService,
    CriticalityScoringService,
  ],
  exports: [
    CapacityEstimatorService,
    SaturationEstimatorService,
    QueueEstimatorService,
    TravelTimeEstimatorService,
    CriticalityScoringService,
  ],
})
export class TrafficAnalysisModule {}

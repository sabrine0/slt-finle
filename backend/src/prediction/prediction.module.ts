import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CarrefourEntity,
  MirofishAgentOutputEntity,
  TrafficObservationEntity,
} from '../database/entities';
import { TrafficAnalysisModule } from '../traffic-analysis/traffic-analysis.module';
import { PredictionController } from './prediction.controller';
import { PredictionMetricsService } from './prediction-metrics.service';
import { PredictionService } from './prediction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CarrefourEntity,
      MirofishAgentOutputEntity,
      TrafficObservationEntity,
    ]),
    TrafficAnalysisModule,
  ],
  controllers: [PredictionController],
  providers: [PredictionService, PredictionMetricsService],
  exports: [PredictionService, PredictionMetricsService],
})
export class PredictionModule {}

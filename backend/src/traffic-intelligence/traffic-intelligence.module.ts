import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from '../config/app.config';
import { IntersectionRuntimeModule } from '../intersection-runtime/intersection-runtime.module';
import { PredictionSnapshotsModule } from '../prediction-snapshots/prediction-snapshots.module';
import { TrafficModule } from '../traffic/traffic.module';
import { AiRecommendationService } from './ai-recommendation.service';
import { AiSafetyValidatorService } from './ai-safety-validator.service';
import { GoogleTrafficService } from './google-traffic.service';
import { TrafficIntelligenceController } from './traffic-intelligence.controller';
import { TrafficIntelligenceService } from './traffic-intelligence.service';
import { TrafficPredictionAgentService } from './traffic-prediction-agent.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TrafficModule,
    IntersectionRuntimeModule,
    PredictionSnapshotsModule,
  ],
  controllers: [TrafficIntelligenceController],
  providers: [
    TrafficIntelligenceService,
    TrafficPredictionAgentService,
    GoogleTrafficService,
    AiRecommendationService,
    AiSafetyValidatorService,
  ],
  exports: [TrafficIntelligenceService, TrafficPredictionAgentService],
})
export class TrafficIntelligenceModule {}

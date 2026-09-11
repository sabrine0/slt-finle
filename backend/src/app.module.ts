import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CitiesModule } from './cities/cities.module';
import { ControllerManagerModule } from './controller-manager/controller-manager.module';
import appConfig, { validateEnvironment } from './config/app.config';
import { ControllersModule } from './controllers/controllers.module';
import { CorridorsModule } from './corridors/corridors.module';
import { DatabaseModule } from './database/database.module';
import { DocumentIngestModule } from './document-ingest/document-ingest.module';
import { DocumentsModule } from './documents/documents.module';
import { EngineeringModule } from './engineering/engineering.module';
import { EngineeringReferencesModule } from './engineering-references/engineering-references.module';
import { ProgrammePackagesModule } from './programme-packages/programme-packages.module';
import { EtudesModule } from './etudes/etudes.module';
import { IntersectionRuntimeModule } from './intersection-runtime/intersection-runtime.module';
import { IntersectionsModule } from './intersections/intersections.module';
import { OperatorActionsModule } from './operator-actions/operator-actions.module';
import { OverridesModule } from './overrides/overrides.module';
import { ProjectsModule } from './projects/projects.module';
import { PredictionSnapshotsModule } from './prediction-snapshots/prediction-snapshots.module';
import { SecurityModule } from './security/security.module';
import { RoadLinksModule } from './road-links/road-links.module';
import { SignalPlansModule } from './signal-plans/signal-plans.module';
import { PredictionModule } from './prediction/prediction.module';
import { TrafficAnalysisModule } from './traffic-analysis/traffic-analysis.module';
import { TrafficGeometryModule } from './traffic-geometry/traffic-geometry.module';
import { TrafficGraphModule } from './traffic-graph/traffic-graph.module';
import { AgentsModule } from './agents/agents.module';
import { AiEngineeringModule } from './ai-engineering/ai-engineering.module';
import { TrafficControlModule } from './traffic-control/traffic-control.module';
import { TrafficIntelligenceModule } from './traffic-intelligence/traffic-intelligence.module';
import { TrafficObservationsModule } from './traffic-observations/traffic-observations.module';
import { TrafficModule } from './traffic/traffic.module';
import { ZonesModule } from './zones/zones.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
      load: [appConfig],
    }),
    DatabaseModule,
    AuditModule,
    AuthModule,
    CitiesModule,
    ControllerManagerModule,
    ControllersModule,
    EngineeringModule,
    AiEngineeringModule,
    EtudesModule,
    IntersectionsModule,
    // Engineering reference layer — additive; never touches live runtime.
    DocumentsModule,
    EngineeringReferencesModule,
    ProgrammePackagesModule,
    DocumentIngestModule,
    OperatorActionsModule,
    OverridesModule,
    PredictionSnapshotsModule,
    ProjectsModule,
    RoadLinksModule,
    SecurityModule,
    SignalPlansModule,
    TrafficModule,
    IntersectionRuntimeModule,
    TrafficIntelligenceModule,
    TrafficControlModule,
    AgentsModule,
    CorridorsModule,
    TrafficGraphModule,
    TrafficGeometryModule,
    TrafficAnalysisModule,
    TrafficObservationsModule,
    PredictionModule,
    ZonesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

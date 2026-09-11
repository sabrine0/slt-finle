import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import appConfig from '../config/app.config';
import { AgentRunEntity } from '../database/entities';
import { IntersectionsModule } from '../intersections/intersections.module';
import { PredictionModule } from '../prediction/prediction.module';
import { PredictionSnapshotsModule } from '../prediction-snapshots/prediction-snapshots.module';
import { RoadLinksModule } from '../road-links/road-links.module';
import { TrafficControlModule } from '../traffic-control/traffic-control.module';
import { TrafficIntelligenceModule } from '../traffic-intelligence/traffic-intelligence.module';
import { ZonesModule } from '../zones/zones.module';
import { AgentEventBusService } from './agent-event-bus.service';
import { AgentRegistryService } from './agent-registry.service';
import { AgentRunsService } from './agent-runs.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { AgentsController } from './agents.controller';
import { ContextSignalsProvider } from './context-signals.provider';
import { BusPriorityAgent } from './implementations/bus-priority.agent';
import { CityTrafficManagerAgent } from './implementations/city-traffic-manager.agent';
import { EmergencyVehicleAgent } from './implementations/emergency-vehicle.agent';
import { IntersectionManagerAgent } from './implementations/intersection-manager.agent';
import { PoliceOperatorAgent } from './implementations/police-operator.agent';
import { TrafficAnticipationAgent } from './implementations/traffic-anticipation.agent';
import { TrafficHeatmapAgent } from './implementations/traffic-heatmap.agent';

/**
 * AgentsModule — registers the runtime, registry and concrete
 * agents. Concrete agents are instantiated by Nest, then auto-pushed
 * into the registry on `onModuleInit`. New agents are added by
 * importing their class and listing them in `AGENT_PROVIDERS` below.
 */
const AGENT_PROVIDERS = [
  PoliceOperatorAgent,
  EmergencyVehicleAgent,
  BusPriorityAgent,
  IntersectionManagerAgent,
  CityTrafficManagerAgent,
  TrafficHeatmapAgent,
  TrafficAnticipationAgent,
] as const;

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forFeature([AgentRunEntity]),
    PredictionModule,
    PredictionSnapshotsModule,
    TrafficIntelligenceModule,
    TrafficControlModule,
    CitiesModule,
    ZonesModule,
    IntersectionsModule,
    RoadLinksModule,
  ],
  controllers: [AgentsController],
  providers: [
    AgentRegistryService,
    AgentRuntimeService,
    AgentRunsService,
    AgentEventBusService,
    AgentSchedulerService,
    ContextSignalsProvider,
    ...AGENT_PROVIDERS,
  ],
  exports: [
    AgentRuntimeService,
    AgentRegistryService,
    AgentRunsService,
    AgentEventBusService,
  ],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly registry: AgentRegistryService,
    private readonly police: PoliceOperatorAgent,
    private readonly emergency: EmergencyVehicleAgent,
    private readonly bus: BusPriorityAgent,
    private readonly manager: IntersectionManagerAgent,
    private readonly city: CityTrafficManagerAgent,
    private readonly heatmap: TrafficHeatmapAgent,
    private readonly anticipation: TrafficAnticipationAgent,
  ) {}

  onModuleInit() {
    // Order is informational — runtime sorts by `priority`.
    this.registry.register(this.police);
    this.registry.register(this.emergency);
    this.registry.register(this.bus);
    this.registry.register(this.manager);
    this.registry.register(this.city);
    this.registry.register(this.heatmap);
    this.registry.register(this.anticipation);
  }
}

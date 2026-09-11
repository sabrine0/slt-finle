import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TrafficCommandEntity } from '../database/entities';
import { IntersectionsModule } from '../intersections/intersections.module';
import { PredictionSnapshotsModule } from '../prediction-snapshots/prediction-snapshots.module';
import { SignalPlansModule } from '../signal-plans/signal-plans.module';
import { TrafficAnalysisModule } from '../traffic-analysis/traffic-analysis.module';
import { TrafficIntelligenceModule } from '../traffic-intelligence/traffic-intelligence.module';
import { ControllerDriverRegistry } from './drivers/controller-driver-registry.service';
import { EspHttpControllerDriver } from './drivers/esp-http-controller-driver';
import { MockControllerDriver } from './drivers/mock-controller-driver';
import { Rs485ControllerDriver } from './drivers/rs485-controller-driver';
import { TcpControllerDriver } from './drivers/tcp-controller-driver';
import { SignalOptimizationAgentService } from './signal-optimization-agent.service';
import { TrafficControlController } from './traffic-control.controller';
import { TrafficControlExecutionService } from './traffic-control-execution.service';
import { TrafficControlService } from './traffic-control.service';
import { TrafficControllerHardwareService } from './traffic-controller-hardware.service';
import { TrafficControllerRuntimeService } from './traffic-controller-runtime.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TrafficCommandEntity]),
    PredictionSnapshotsModule,
    TrafficIntelligenceModule,
    TrafficAnalysisModule,
    IntersectionsModule,
    SignalPlansModule,
  ],
  controllers: [TrafficControlController],
  providers: [
    TrafficControlService,
    SignalOptimizationAgentService,
    TrafficControlExecutionService,
    TrafficControllerHardwareService,
    TrafficControllerRuntimeService,
    MockControllerDriver,
    Rs485ControllerDriver,
    TcpControllerDriver,
    EspHttpControllerDriver,
    ControllerDriverRegistry,
  ],
  exports: [
    TrafficControlService,
    SignalOptimizationAgentService,
    TrafficControlExecutionService,
    TrafficControllerHardwareService,
    TrafficControllerRuntimeService,
    ControllerDriverRegistry,
  ],
})
export class TrafficControlModule {}

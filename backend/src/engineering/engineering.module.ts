import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import appConfig from '../config/app.config';
import { ControllerManagerModule } from '../controller-manager/controller-manager.module';
import {
  ControllerEntity,
  DeploymentEntity,
  DetectorEntity,
  EventEntity,
  IntersectionEntity,
  PhaseEntity,
  ScenarioEntity,
  TimingPlanEntity,
} from '../database/entities';
import { DeploymentPackageService } from './deployment-package.service';
import { EngineeringController } from './engineering.controller';
import { EngineeringSafetyService } from './engineering-safety.service';
import { EngineeringService } from './engineering.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ControllerManagerModule,
    TypeOrmModule.forFeature([
      IntersectionEntity,
      ControllerEntity,
      DetectorEntity,
      PhaseEntity,
      TimingPlanEntity,
      ScenarioEntity,
      DeploymentEntity,
      EventEntity,
    ]),
  ],
  controllers: [EngineeringController],
  providers: [
    EngineeringService,
    EngineeringSafetyService,
    DeploymentPackageService,
  ],
  exports: [EngineeringService],
})
export class EngineeringModule {}

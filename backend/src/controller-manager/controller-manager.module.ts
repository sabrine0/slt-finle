import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import appConfig from '../config/app.config';
import {
  AlarmEntity,
  ControllerCredentialEntity,
  ControllerEntity,
  ControllerEventEntity,
  DeploymentEntity,
  DetectorEntity,
  IntersectionEntity,
  PhaseEntity,
  TimingPlanEntity,
} from '../database/entities';
import { ControllerManagerController } from './controller-manager.controller';
import { ControllerManagerService } from './controller-manager.service';
import { ControllerRuntimeController } from './controller-runtime.controller';
import { ControllerRuntimeJwtStrategy } from './controller-runtime-jwt.strategy';
import { ControllerRuntimeGuard } from './guards/controller-runtime.guard';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    PassportModule.register({ defaultStrategy: 'controller-jwt' }),
    JwtModule.register({}),
    TypeOrmModule.forFeature([
      AlarmEntity,
      IntersectionEntity,
      ControllerEntity,
      ControllerCredentialEntity,
      ControllerEventEntity,
      DetectorEntity,
      PhaseEntity,
      TimingPlanEntity,
      DeploymentEntity,
    ]),
  ],
  controllers: [ControllerManagerController, ControllerRuntimeController],
  providers: [
    ControllerManagerService,
    ControllerRuntimeJwtStrategy,
    ControllerRuntimeGuard,
  ],
  exports: [ControllerManagerService],
})
export class ControllerManagerModule {}

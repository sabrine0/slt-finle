import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ControllerEntity, TimingPlanEntity } from '../database/entities';
import { SignalPlansController } from './signal-plans.controller';
import { SignalPlansService } from './signal-plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimingPlanEntity, ControllerEntity])],
  controllers: [SignalPlansController],
  providers: [SignalPlansService],
  exports: [SignalPlansService],
})
export class SignalPlansModule {}

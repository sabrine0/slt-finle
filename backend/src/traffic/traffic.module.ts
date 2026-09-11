import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import {
  AlarmEntity,
  ControllerEntity,
  EventEntity,
  IntersectionEntity,
  ScenarioEntity,
} from '../database/entities';
import { TrafficController } from './traffic.controller';
import { TrafficGateway } from './traffic.gateway';
import { TrafficService } from './traffic.service';

@Module({
  imports: [
    CitiesModule,
    TypeOrmModule.forFeature([
      ScenarioEntity,
      IntersectionEntity,
      ControllerEntity,
      AlarmEntity,
      EventEntity,
    ]),
  ],
  controllers: [TrafficController],
  providers: [TrafficService, TrafficGateway],
  exports: [TrafficService],
})
export class TrafficModule {}

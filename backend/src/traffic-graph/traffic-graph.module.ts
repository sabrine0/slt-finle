import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import {
  CarrefourEntity,
  CityEntity,
  ConnectedIntersectionEntity,
  ControllerEntity,
  IntersectionBranchEntity,
  IntersectionEntity,
  LaneDetailEntity,
  MovementEntity,
} from '../database/entities';
import { TrafficGraphController } from './traffic-graph.controller';
import { TrafficGraphService } from './traffic-graph.service';

@Module({
  imports: [
    CitiesModule,
    TypeOrmModule.forFeature([
      CityEntity,
      CarrefourEntity,
      IntersectionBranchEntity,
      LaneDetailEntity,
      MovementEntity,
      ConnectedIntersectionEntity,
      IntersectionEntity,
      ControllerEntity,
    ]),
  ],
  controllers: [TrafficGraphController],
  providers: [TrafficGraphService],
  exports: [TrafficGraphService],
})
export class TrafficGraphModule implements OnApplicationBootstrap {
  constructor(private readonly graph: TrafficGraphService) {}

  async onApplicationBootstrap() {
    try {
      await this.graph.seedFromEngineeringIntersections();
    } catch {
      /* DB may not be ready yet — non-fatal for dev boot */
    }
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
  IntersectionBranchEntity,
  LaneDetailEntity,
} from '../database/entities';
import { TrafficGeometryController } from './traffic-geometry.controller';
import { TrafficGeometryService } from './traffic-geometry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CarrefourEntity,
      IntersectionBranchEntity,
      LaneDetailEntity,
      ConnectedIntersectionEntity,
    ]),
  ],
  controllers: [TrafficGeometryController],
  providers: [TrafficGeometryService],
  exports: [TrafficGeometryService],
})
export class TrafficGeometryModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ControllerEntity, IntersectionEntity } from '../database/entities';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';
import { TopologyReferenceService } from './topology-reference.service';

@Module({
  imports: [TypeOrmModule.forFeature([IntersectionEntity, ControllerEntity])],
  controllers: [CitiesController],
  providers: [TopologyReferenceService, CitiesService],
  exports: [TopologyReferenceService, CitiesService],
})
export class CitiesModule {}

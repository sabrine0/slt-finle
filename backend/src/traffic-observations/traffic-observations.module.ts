import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import { TrafficObservationEntity } from '../database/entities';
import { TrafficObservationsController } from './traffic-observations.controller';
import { TrafficObservationsService } from './traffic-observations.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrafficObservationEntity]), CitiesModule],
  controllers: [TrafficObservationsController],
  providers: [TrafficObservationsService],
  exports: [TrafficObservationsService],
})
export class TrafficObservationsModule {}

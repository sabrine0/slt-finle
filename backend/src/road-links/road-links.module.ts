import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import { ConnectedIntersectionEntity } from '../database/entities';
import { RoadLinksController } from './road-links.controller';
import { RoadLinksService } from './road-links.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConnectedIntersectionEntity]),
    CitiesModule,
  ],
  controllers: [RoadLinksController],
  providers: [RoadLinksService],
  exports: [RoadLinksService],
})
export class RoadLinksModule {}

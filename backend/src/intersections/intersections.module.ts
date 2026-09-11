import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import { IntersectionEntity } from '../database/entities';
import { IntersectionsController } from './intersections.controller';
import { IntersectionsService } from './intersections.service';

@Module({
  imports: [TypeOrmModule.forFeature([IntersectionEntity]), CitiesModule],
  controllers: [IntersectionsController],
  providers: [IntersectionsService],
  exports: [IntersectionsService],
})
export class IntersectionsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import {
  CarrefourEntity,
  PredictionSnapshotEntity,
} from '../database/entities';
import { IntersectionsModule } from '../intersections/intersections.module';
import { IntersectionRuntimeModule } from '../intersection-runtime/intersection-runtime.module';
import { PredictionModule } from '../prediction/prediction.module';
import { ZonesModule } from '../zones/zones.module';
import { PredictionSnapshotsController } from './prediction-snapshots.controller';
import { PredictionSnapshotsService } from './prediction-snapshots.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PredictionSnapshotEntity, CarrefourEntity]),
    CitiesModule,
    ZonesModule,
    IntersectionsModule,
    IntersectionRuntimeModule,
    PredictionModule,
  ],
  controllers: [PredictionSnapshotsController],
  providers: [PredictionSnapshotsService],
  exports: [PredictionSnapshotsService],
})
export class PredictionSnapshotsModule {}

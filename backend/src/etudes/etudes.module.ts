import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EtudeEntity, IntersectionEntity } from '../database/entities';
import { IntersectionsModule } from '../intersections/intersections.module';
import { ETUDE_GENERATOR } from './etude-generator.token';
import { EtudesController } from './etudes.controller';
import { EtudesService } from './etudes.service';
import { OfflineEtudeGenerator } from './offline-etude-generator';

@Module({
  imports: [
    TypeOrmModule.forFeature([EtudeEntity, IntersectionEntity]),
    IntersectionsModule,
  ],
  controllers: [EtudesController],
  providers: [
    EtudesService,
    OfflineEtudeGenerator,
    { provide: ETUDE_GENERATOR, useExisting: OfflineEtudeGenerator },
  ],
  exports: [EtudesService],
})
export class EtudesModule {}

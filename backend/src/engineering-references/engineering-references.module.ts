import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ControllerEntity,
  DetectorEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  PhaseEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { BenchmarkCompareService } from './benchmark-compare.service';
import { EngineeringReferencesController } from './engineering-references.controller';
import { EngineeringReferencesService } from './engineering-references.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EngineeringDocumentEntity,
      ProgrammePackageEntity,
      IntersectionEntity,
      ControllerEntity,
      PhaseEntity,
      DetectorEntity,
    ]),
  ],
  controllers: [EngineeringReferencesController],
  providers: [EngineeringReferencesService, BenchmarkCompareService],
  exports: [EngineeringReferencesService],
})
export class EngineeringReferencesModule {}

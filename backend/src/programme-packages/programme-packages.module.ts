import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ControllerEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { EngineeringReferencesModule } from '../engineering-references/engineering-references.module';
import { ProgrammePackagesController } from './programme-packages.controller';
import { ProgrammePackagesService } from './programme-packages.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProgrammePackageEntity,
      IntersectionEntity,
      ControllerEntity,
    ]),
    EngineeringReferencesModule,
  ],
  controllers: [ProgrammePackagesController],
  providers: [ProgrammePackagesService],
  exports: [ProgrammePackagesService],
})
export class ProgrammePackagesModule {}

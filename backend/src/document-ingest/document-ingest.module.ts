import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ControllerEntity,
  DocumentIngestRunEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { DocumentIngestController } from './document-ingest.controller';
import { DocumentIngestService } from './document-ingest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EngineeringDocumentEntity,
      ProgrammePackageEntity,
      DocumentIngestRunEntity,
      IntersectionEntity,
      ControllerEntity,
    ]),
  ],
  controllers: [DocumentIngestController],
  providers: [DocumentIngestService],
  exports: [DocumentIngestService],
})
export class DocumentIngestModule {}

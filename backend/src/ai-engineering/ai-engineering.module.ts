import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ControllerEntity, IntersectionEntity } from '../database/entities';
import { EngineeringModule } from '../engineering/engineering.module';
import { AiEngineeringController } from './ai-engineering.controller';
import { AiEngineeringService } from './ai-engineering.service';
import { OfflineProposalGenerator } from './offline-proposal-generator';
import { OfflineStudyAnalyzer } from './offline-study-analyzer';
import { PROPOSAL_GENERATOR } from './proposal-generator.adapter';
import { ProposalStoreService } from './proposal-store.service';
import { STUDY_ANALYZER } from './study-analyzer.adapter';
import { StudyStoreService } from './study-store.service';

/**
 * AI Engineering Assistant — additive module on top of the existing
 * manual engineering workflow. Generates engineering proposals from
 * operator input (location / scope / hints) and materialises an
 * approved proposal as a real STLS intersection via the existing
 * EngineeringService.
 *
 * Adapter-based : the default `OfflineProposalGenerator` produces
 * heuristic templates today. Phase 2 will register additional
 * adapters (Claude SDK, DXF parser, PDF parser, satellite geometry
 * extractor) without touching this module.
 */
@Module({
  imports: [
    EngineeringModule,
    TypeOrmModule.forFeature([IntersectionEntity, ControllerEntity]),
  ],
  controllers: [AiEngineeringController],
  providers: [
    AiEngineeringService,
    ProposalStoreService,
    StudyStoreService,
    OfflineProposalGenerator,
    OfflineStudyAnalyzer,
    { provide: PROPOSAL_GENERATOR, useExisting: OfflineProposalGenerator },
    { provide: STUDY_ANALYZER, useExisting: OfflineStudyAnalyzer },
  ],
  exports: [AiEngineeringService],
})
export class AiEngineeringModule {}

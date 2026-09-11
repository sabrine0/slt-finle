import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { AiEngineeringService } from './ai-engineering.service';
import {
  AnalyzeStudyDto,
  ApproveProposalDto,
  GenerateProposalsDto,
} from './dto/ai-engineering.dto';
import type { ObservedGeometry } from './study-types';

/**
 * AI Engineering Assistant — REST surface.
 *
 * Production : real permissions enforced. Dev : @DevPublic allows
 * unauthenticated calls so the studio runs without an auth chain.
 */
@DevPublic()
@Controller('ai-engineering')
export class AiEngineeringController {
  constructor(private readonly ai: AiEngineeringService) {}

  /**
   * Run an intersection study : analyse geometry + classification +
   * constraints + complexity, return the engineering analysis. This
   * is step 1 of the new wizard ; proposals come later via /proposals
   * with the resulting `studyId`.
   */
  @RequirePermissions('engineering.read')
  @Post('study')
  analyze(@Body() body: AnalyzeStudyDto) {
    const { geometry, ...input } = body;
    return this.ai.analyzeIntersection(
      input,
      geometry as ObservedGeometry | undefined,
    );
  }

  /** Re-read a study (e.g. after refresh). */
  @RequirePermissions('engineering.read')
  @Get('study/:studyId')
  getStudy(@Param('studyId') studyId: string) {
    return this.ai.getStudy(studyId);
  }

  /**
   * Generate a proposal set. When `studyId` is provided, the
   * catalogue is filtered to the variants the study endorses.
   * Otherwise the full template catalogue is returned.
   */
  @RequirePermissions('engineering.read')
  @Post('proposals')
  generate(@Body() body: GenerateProposalsDto) {
    const { studyId, ...input } = body;
    return this.ai.generateProposals(input, { studyId });
  }

  /** Re-read a proposal set (e.g. after refresh). */
  @RequirePermissions('engineering.read')
  @Get('proposals/:setId')
  getSet(@Param('setId') setId: string) {
    return this.ai.getProposalSet(setId);
  }

  /**
   * Approve a proposal. Materialises a real STLS intersection with
   * controller, phases, detectors and timing plans by calling the
   * existing EngineeringService. The result is indistinguishable from
   * a manually-created intersection.
   */
  @RequirePermissions('intersections.manage')
  @Post('proposals/:proposalId/approve')
  approve(
    @Param('proposalId') proposalId: string,
    @Body() body: ApproveProposalDto,
  ) {
    return this.ai.approveProposal(proposalId, body);
  }
}

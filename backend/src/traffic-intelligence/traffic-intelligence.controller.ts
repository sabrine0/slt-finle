import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import type { PredictionHorizon } from '../prediction/prediction.dto';
import { AnalyzeTrafficDto } from './dto/analyze-traffic.dto';
import { TrafficIntelligenceService } from './traffic-intelligence.service';

/**
 * Traffic-intelligence endpoints. All three routes are read-only or
 * advisory — none of them apply runtime commands. Permission gate is
 * the existing `command-platform.read` / `.control` taxonomy so an
 * operator who can see live state can also see AI advice.
 */
@DevPublic()
@Controller('traffic-intelligence')
export class TrafficIntelligenceController {
  constructor(private readonly service: TrafficIntelligenceService) {}

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id/context')
  getContext(@Param('id') intersectionId: string) {
    return this.service.getContext(intersectionId);
  }

  @RequirePermissions('command-platform.control')
  @AuditAction({
    action: 'traffic-intelligence.analyze',
    resourceType: 'intersection',
  })
  @Post('intersections/:id/analyze')
  analyze(@Param('id') intersectionId: string, @Body() dto: AnalyzeTrafficDto) {
    return this.service.analyze(intersectionId, dto);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id/recommendations')
  getRecommendations(@Param('id') intersectionId: string) {
    return this.service.getRecommendations(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersection/:id')
  getIntersectionPrediction(
    @Param('id') intersectionId: string,
    @Query('horizon') horizon?: PredictionHorizon,
  ) {
    return this.service.getIntersectionPrediction(intersectionId, horizon);
  }
}

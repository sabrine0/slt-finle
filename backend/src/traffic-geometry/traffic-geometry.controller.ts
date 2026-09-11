import { Body, Controller, Param, Post } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { UpsertBranchDto, UpsertConnectionDto } from './traffic-geometry.dto';
import { TrafficGeometryService } from './traffic-geometry.service';

@DevPublic()
@Controller('traffic-geometry')
export class TrafficGeometryController {
  constructor(private readonly geometry: TrafficGeometryService) {}

  @RequirePermissions('command-platform.control')
  @Post('intersections/:id/branches')
  upsertBranch(
    @Param('id') carrefourId: string,
    @Body() body: UpsertBranchDto,
  ) {
    return this.geometry.upsertBranch(carrefourId, body);
  }

  @RequirePermissions('command-platform.control')
  @Post('connected-intersections')
  upsertConnection(@Body() body: UpsertConnectionDto) {
    return this.geometry.upsertConnection(body);
  }
}

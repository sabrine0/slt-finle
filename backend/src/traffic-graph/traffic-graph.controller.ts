import { Controller, Get, Param, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { TrafficGraphService } from './traffic-graph.service';

/**
 * Document-aligned traffic-graph endpoints.  The route names mirror
 * the CCTP wording (`intersections`, `branches`, `movements`,
 * `connected`) while staying compatible with the rest of the STLS
 * controller surface.
 */
@DevPublic()
@Controller('traffic-graph')
export class TrafficGraphController {
  constructor(private readonly graph: TrafficGraphService) {}

  @RequirePermissions('command-platform.read')
  @Get('cities')
  listCities() {
    return this.graph.listCities();
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections')
  listIntersections(@Query('cityId') cityId?: string) {
    return this.graph.listCarrefours(cityId);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id')
  getIntersection(@Param('id') intersectionId: string) {
    return this.graph.getCarrefour(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id/branches')
  listBranches(@Param('id') intersectionId: string) {
    return this.graph.listBranches(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id/movements')
  listMovements(@Param('id') intersectionId: string) {
    return this.graph.listMovements(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get('intersections/:id/connected')
  listConnected(@Param('id') intersectionId: string) {
    return this.graph.listConnections(intersectionId);
  }

  @RequirePermissions('command-platform.read')
  @Get('connected-intersections')
  listAllConnections() {
    return this.graph.listAllConnections();
  }
}

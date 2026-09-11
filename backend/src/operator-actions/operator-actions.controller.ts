import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { OperatorActionsService } from './operator-actions.service';

@DevPublic()
@Controller('operator-actions')
export class OperatorActionsController {
  constructor(
    private readonly operatorActionsService: OperatorActionsService,
  ) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(
    @Query('cityId') cityId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('intersectionId') intersectionId?: string,
  ) {
    return this.operatorActionsService.list({
      cityId,
      zoneId,
      intersectionId,
    });
  }
}

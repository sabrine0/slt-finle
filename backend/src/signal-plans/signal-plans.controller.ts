import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { SignalPlansService } from './signal-plans.service';

@DevPublic()
@Controller('signal-plans')
export class SignalPlansController {
  constructor(private readonly signalPlansService: SignalPlansService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(
    @Query('intersectionId') intersectionId?: string,
    @Query('controllerId') controllerId?: string,
  ) {
    return this.signalPlansService.list({ intersectionId, controllerId });
  }
}

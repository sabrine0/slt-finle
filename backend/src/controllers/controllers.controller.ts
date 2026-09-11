import { Controller, Get, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ControllersService } from './controllers.service';

@DevPublic()
@Controller('controllers')
export class ControllersController {
  constructor(private readonly controllersService: ControllersService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list(@Query('cityId') cityId?: string, @Query('zoneId') zoneId?: string) {
    return this.controllersService.list({ cityId, zoneId });
  }
}

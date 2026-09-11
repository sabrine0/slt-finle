import { Controller, Get } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CitiesService } from './cities.service';

@DevPublic()
@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  list() {
    return this.citiesService.list();
  }
}

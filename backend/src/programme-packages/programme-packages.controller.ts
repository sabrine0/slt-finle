import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { LinkReferenceDto } from '../engineering-references/dto/engineering-references.dto';
import { ProgrammePackagesService } from './programme-packages.service';

@Controller('programme-packages')
@DevPublic()
export class ProgrammePackagesController {
  constructor(private readonly service: ProgrammePackagesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('by-controller/:codeOrId')
  byController(@Param('codeOrId') codeOrId: string) {
    return this.service.byController(codeOrId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/link')
  link(@Param('id') id: string, @Body() body: LinkReferenceDto) {
    return this.service.link(id, body);
  }

  @Post(':id/unlink')
  unlink(@Param('id') id: string) {
    return this.service.link(id, {
      intersectionId: null,
      controllerId: null,
    });
  }
}

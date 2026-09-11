import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateEtudeDto, PatchSectionDto } from './dto/etudes.dto';
import { EtudesService } from './etudes.service';
import type { EtudeSectionId } from './etude-sections';

@DevPublic()
@Controller('etudes')
export class EtudesController {
  constructor(private readonly etudes: EtudesService) {}

  @RequirePermissions('engineering.read')
  @Get()
  list() {
    return this.etudes.list();
  }

  @RequirePermissions('intersections.manage')
  @Post()
  create(@Body() body: CreateEtudeDto) {
    return this.etudes.create(body);
  }

  @RequirePermissions('engineering.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.etudes.get(id);
  }

  @RequirePermissions('intersections.manage')
  @Post(':id/sections/:sectionId/generate')
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId') sectionId: EtudeSectionId,
  ) {
    return this.etudes.generateSection(id, sectionId);
  }

  @RequirePermissions('intersections.manage')
  @Patch(':id/sections/:sectionId')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId') sectionId: EtudeSectionId,
    @Body() body: PatchSectionDto,
  ) {
    return this.etudes.patchSection(id, sectionId, body);
  }

  @RequirePermissions('intersections.manage')
  @Post(':id/sections/:sectionId/unlock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId') sectionId: EtudeSectionId,
  ) {
    return this.etudes.unlockSection(id, sectionId);
  }

  @RequirePermissions('intersections.manage')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.etudes.remove(id);
  }
}

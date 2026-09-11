import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { BenchmarkCompareService } from './benchmark-compare.service';
import {
  LinkReferenceDto,
  ListReferencesQueryDto,
} from './dto/engineering-references.dto';
import { EngineeringReferencesService } from './engineering-references.service';

/**
 * Read-only / metadata endpoints for the engineering reference
 * layer. Reference content is never deployed to live controllers
 * from this controller — see programme-packages module for the
 * package metadata and document-ingest for the ingest trigger.
 *
 * In dev mode the routes are @DevPublic so the UI works without
 * the user juggling JWTs. In production, the gateway / proxy
 * tier owns auth.
 */
@Controller('engineering-references')
@DevPublic()
export class EngineeringReferencesController {
  constructor(
    private readonly service: EngineeringReferencesService,
    private readonly benchmark: BenchmarkCompareService,
  ) {}

  @Get('short-codes')
  listShortCodes() {
    return this.service.listShortCodes();
  }

  @Get('counts')
  counts() {
    return this.service.counts();
  }

  @Get()
  list(@Query() query: ListReferencesQueryDto) {
    return this.service.list(query);
  }

  @Get('by-intersection/:codeOrId')
  byIntersection(@Param('codeOrId') codeOrId: string) {
    return this.service.listForIntersection(codeOrId);
  }

  @Get('by-controller/:codeOrId')
  byController(@Param('codeOrId') codeOrId: string) {
    return this.service.listForController(codeOrId);
  }

  @Get('benchmark/:codeOrId')
  benchmarkSummary(@Param('codeOrId') codeOrId: string) {
    return this.benchmark.compare(codeOrId);
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

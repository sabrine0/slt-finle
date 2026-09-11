import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';

import { DevPublic } from '../common/decorators/public.decorator';
import { DocumentIngestService } from './document-ingest.service';

class ScanDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@Controller('document-ingest')
@DevPublic()
export class DocumentIngestController {
  constructor(private readonly service: DocumentIngestService) {}

  @Get('status')
  status() {
    return {
      configured: this.service.isConfigured(),
      root: this.service.getRoot(),
    };
  }

  @Get('runs')
  listRuns(@Query('limit') limit?: string) {
    return this.service.listRuns(limit ? Number(limit) : undefined);
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const [run] = await this.service
      .listRuns(100)
      .then((runs) => runs.filter((r) => r.id === id));
    return run ?? null;
  }

  @Post('scan')
  scan(@Body() body: ScanDto) {
    return this.service.scan({ force: body?.force === true });
  }
}

import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';

import { DevPublic } from '../common/decorators/public.decorator';
import {
  EngineeringDocumentEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { DocumentsService } from './documents.service';

/**
 * File-streaming controller for the engineering reference layer.
 * Lookup goes via the DB id (engineering document or programme
 * package); the underlying path is then opened by DocumentsService
 * which enforces the root containment check.
 */
@Controller('documents')
@DevPublic()
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    @InjectRepository(EngineeringDocumentEntity)
    private readonly documents: Repository<EngineeringDocumentEntity>,
    @InjectRepository(ProgrammePackageEntity)
    private readonly packages: Repository<ProgrammePackageEntity>,
  ) {}

  @Get('engineering/:id/file')
  @Header('Cache-Control', 'private, max-age=300')
  async streamEngineeringDocument(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('Engineering document not found.');
    const opened = this.service.open(doc.sourcePath);
    res.setHeader('Content-Type', opened.contentType);
    res.setHeader('Content-Length', String(opened.fileSizeBytes));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(opened.fileName)}"`,
    );
    opened.stream.pipe(res);
  }

  @Get('programme/:id/file')
  @Header('Cache-Control', 'private, max-age=300')
  async streamProgrammePackage(@Param('id') id: string, @Res() res: Response) {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Programme package not found.');
    const opened = this.service.open(pkg.sourceZipPath);
    res.setHeader('Content-Type', opened.contentType);
    res.setHeader('Content-Length', String(opened.fileSizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(opened.fileName)}"`,
    );
    opened.stream.pipe(res);
  }
}

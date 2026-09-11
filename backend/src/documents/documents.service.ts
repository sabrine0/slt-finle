import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';

import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import appConfig from '../config/app.config';

interface ResolvedFile {
  absolutePath: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  stream: ReturnType<typeof createReadStream>;
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.dwg': 'application/acad',
  '.dxf': 'application/dxf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Open a streamable handle to a file on disk after asserting the
   * path is inside the configured engineering-references root. This
   * guards against path-traversal: any request that resolves
   * outside the root is rejected, regardless of how the DB record
   * was created.
   */
  open(sourcePath: string): ResolvedFile {
    const root = this.config.engineeringReferencesRoot;
    if (!root) {
      throw new InternalServerErrorException(
        'STLS_ENGINEERING_REFERENCES_ROOT is not configured — document streaming disabled.',
      );
    }
    const absRoot = normalize(resolve(root));
    const absTarget = normalize(resolve(sourcePath));
    const rootWithSep = absRoot.endsWith(sep) ? absRoot : absRoot + sep;
    if (absTarget !== absRoot && !absTarget.startsWith(rootWithSep)) {
      this.logger.warn(
        `Refused to serve "${absTarget}" — outside references root "${absRoot}".`,
      );
      throw new NotFoundException('Document not found.');
    }
    if (!existsSync(absTarget)) {
      throw new NotFoundException('Document file is missing on disk.');
    }
    const stat = statSync(absTarget);
    if (!stat.isFile()) {
      throw new NotFoundException('Document path is not a file.');
    }
    const ext = extname(absTarget).toLowerCase();
    return {
      absolutePath: absTarget,
      fileName: absTarget.split(/[\\/]/).pop() ?? 'document',
      fileSizeBytes: stat.size,
      contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      stream: createReadStream(absTarget),
    };
  }
}

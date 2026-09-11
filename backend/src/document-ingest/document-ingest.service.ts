import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, type Stats } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import appConfig from '../config/app.config';
import {
  ControllerEntity,
  DocumentIngestRunEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import type { EngineeringDocumentType } from '../database/entities/engineering-document.entity';
import type { ProgrammeInnerFile } from '../database/entities/programme-package.entity';
import {
  classifyProgrammeInner,
  parseDossierRegulation,
  parsePlanFilaire,
  parsePlanRsFès,
  parseProgrammeArchive,
} from './filename-parsers';

/**
 * Subfolders we know how to ingest. Stays in the service (not in
 * config) because the layout under D:\sabrine is engineering-team
 * convention rather than runtime configuration.
 */
const SUBFOLDERS: Array<{
  relativePath: string;
  kind: EngineeringDocumentType | 'programme_archive';
  city: string;
}> = [
  {
    relativePath: 'OneDrive_2026-04-14/PLans RS Fès',
    kind: 'plan_rs',
    city: 'Fès',
  },
  {
    relativePath: 'Dossier de Régulation',
    kind: 'dossier_regulation',
    city: 'unknown',
  },
  {
    relativePath: 'Plan Filaire',
    kind: 'plan_filaire',
    city: 'unknown',
  },
  {
    relativePath: 'Programme',
    kind: 'programme_archive',
    city: 'unknown',
  },
  {
    relativePath: 'Dossiers_Régulation_Marrakech',
    kind: 'dossier_regulation',
    city: 'Marrakech',
  },
];

const MAX_ERROR_LOG = 200;
const MAX_INNER_FILES = 200;

/**
 * Minimal subset of `unzipper`'s surface that we actually use. Kept
 * here as a structural type so the import can be dynamic and the
 * dependency stays optional.
 */
interface UnzipperLike {
  Open: {
    file(path: string): Promise<{
      files: Array<{
        path: string;
        type: string;
        uncompressedSize?: number | bigint;
      }>;
    }>;
  };
}

@Injectable()
export class DocumentIngestService {
  private readonly logger = new Logger(DocumentIngestService.name);
  private running = false;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectRepository(EngineeringDocumentEntity)
    private readonly documents: Repository<EngineeringDocumentEntity>,
    @InjectRepository(ProgrammePackageEntity)
    private readonly packages: Repository<ProgrammePackageEntity>,
    @InjectRepository(DocumentIngestRunEntity)
    private readonly runs: Repository<DocumentIngestRunEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersections: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllers: Repository<ControllerEntity>,
  ) {}

  isConfigured(): boolean {
    const root = this.config.engineeringReferencesRoot;
    return !!root && existsSync(root);
  }

  getRoot(): string | null {
    return this.config.engineeringReferencesRoot ?? null;
  }

  listRuns(limit = 25) {
    return this.runs.find({
      order: { startedAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  /**
   * Run a full scan over the configured root. Safe to call multiple
   * times — every record is keyed by (sourcePath) so a re-run updates
   * existing rows in place.
   */
  async scan(opts: { force?: boolean } = {}): Promise<DocumentIngestRunEntity> {
    const root = this.config.engineeringReferencesRoot;
    if (!root) {
      throw new BadRequestException(
        'STLS_ENGINEERING_REFERENCES_ROOT is not configured.',
      );
    }
    if (!existsSync(root)) {
      throw new BadRequestException(
        `Engineering references root does not exist: ${root}.`,
      );
    }
    if (this.running) {
      throw new BadRequestException(
        'A document-ingest scan is already running.',
      );
    }
    this.running = true;
    let run: DocumentIngestRunEntity;
    try {
      run = await this.runs.save(
        this.runs.create({
          startedAt: new Date(),
          finishedAt: null,
          status: 'running',
          rootPath: root,
          filesScanned: 0,
          documentsCreated: 0,
          documentsUpdated: 0,
          programmePackagesCreated: 0,
          programmePackagesUpdated: 0,
          skipped: 0,
          errored: 0,
          errors: [],
        }),
      );
    } catch (err) {
      // Initial save failed (e.g. migration missing) — release the
      // in-memory flag so the next request is not falsely blocked.
      this.running = false;
      throw err;
    }
    try {
      for (const folder of SUBFOLDERS) {
        const absFolder = resolve(root, folder.relativePath);
        if (!existsSync(absFolder)) {
          this.logger.warn(
            `[document-ingest] subfolder missing: ${absFolder} — skipping.`,
          );
          continue;
        }
        await this.scanFolder(run, absFolder, folder, opts);
      }
      run.status = 'completed';
    } catch (err) {
      this.logger.error(
        `[document-ingest] scan failed`,
        err instanceof Error ? err.stack : String(err),
      );
      run.status = 'failed';
      run.notes = err instanceof Error ? err.message : String(err);
    } finally {
      run.finishedAt = new Date();
      try {
        await this.runs.save(run);
      } catch (err) {
        this.logger.error(
          `[document-ingest] failed to persist final run status`,
          err instanceof Error ? err.stack : String(err),
        );
      }
      this.running = false;
    }
    return run;
  }

  private async scanFolder(
    run: DocumentIngestRunEntity,
    absFolder: string,
    folder: {
      kind: EngineeringDocumentType | 'programme_archive';
      city: string;
    },
    opts: { force?: boolean },
  ) {
    let entries: string[] = [];
    try {
      entries = await readdir(absFolder);
    } catch (err) {
      this.recordError(
        run,
        absFolder,
        `Failed to read folder: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    for (const entry of entries) {
      const full = join(absFolder, entry);
      let stat: Stats | null = null;
      try {
        stat = statSync(full);
      } catch (err) {
        this.recordError(
          run,
          full,
          `Stat failed: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }
      if (!stat || !stat.isFile()) continue;
      // Capture narrowed value into a const — `let` + `await`
      // breaks TS narrowing inside the loop body.
      const fileStat = stat;
      run.filesScanned += 1;
      try {
        if (folder.kind === 'programme_archive') {
          await this.ingestProgramme(run, full, entry, fileStat, opts);
        } else {
          await this.ingestDocument(
            run,
            full,
            entry,
            fileStat,
            { kind: folder.kind, city: folder.city },
            opts,
          );
        }
      } catch (err) {
        this.recordError(
          run,
          full,
          `Ingest failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    await this.runs.save(run);
  }

  private async ingestDocument(
    run: DocumentIngestRunEntity,
    full: string,
    fileName: string,
    stat: Stats,
    folder: { kind: EngineeringDocumentType; city: string },
    opts: { force?: boolean },
  ) {
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      run.skipped += 1;
      return;
    }
    const existing = await this.documents.findOne({
      where: { sourcePath: full },
    });
    if (
      existing &&
      !opts.force &&
      existing.sourceLastModified &&
      existing.sourceLastModified.getTime() >= Number(stat.mtimeMs)
    ) {
      run.skipped += 1;
      return;
    }
    const parsed =
      folder.kind === 'plan_rs'
        ? parsePlanRsFès(fileName)
        : folder.kind === 'plan_filaire'
          ? parsePlanFilaire(fileName, folder.city)
          : parseDossierRegulation(fileName, folder.city);

    const sha256 = await this.hashFile(full);
    const linked = await this.resolveLinks(
      parsed.shortCode,
      parsed.carrefourLabel,
    );

    const payload: Partial<EngineeringDocumentEntity> = {
      documentType: folder.kind,
      city: parsed.city || folder.city,
      corridor: parsed.corridor,
      shortCode: parsed.shortCode,
      carrefourLabel: parsed.carrefourLabel,
      title: parsed.title,
      revision: parsed.revision,
      sourcePath: full,
      fileName,
      fileSizeBytes: String(stat.size),
      sha256,
      sourceLastModified: new Date(Number(stat.mtimeMs)),
      ingestedAt: new Date(),
      intersectionId: linked.intersectionId,
      controllerId: linked.controllerId,
      parseNotes: parsed.parseNotes,
    };

    if (existing) {
      Object.assign(existing, payload);
      await this.documents.save(existing);
      run.documentsUpdated += 1;
    } else {
      await this.documents.save(this.documents.create(payload));
      run.documentsCreated += 1;
    }
  }

  private async ingestProgramme(
    run: DocumentIngestRunEntity,
    full: string,
    fileName: string,
    stat: Stats,
    opts: { force?: boolean },
  ) {
    if (!fileName.toLowerCase().endsWith('.zip')) {
      run.skipped += 1;
      return;
    }
    const existing = await this.packages.findOne({
      where: { sourceZipPath: full },
    });
    if (
      existing &&
      !opts.force &&
      existing.sourceLastModified &&
      existing.sourceLastModified.getTime() >= Number(stat.mtimeMs)
    ) {
      run.skipped += 1;
      return;
    }
    const parsed = parseProgrammeArchive(fileName);
    const sha256 = await this.hashFile(full);
    const contents = await this.inspectZip(full);
    const linked = await this.resolveLinks(parsed.shortCode, null);

    const payload: Partial<ProgrammePackageEntity> = {
      packageName: parsed.title,
      city: parsed.city,
      shortCode: parsed.shortCode,
      sourceZipPath: full,
      fileName,
      fileSizeBytes: String(stat.size),
      sha256,
      sourceLastModified: new Date(Number(stat.mtimeMs)),
      ingestedAt: new Date(),
      contents,
      detectedVersion: parsed.revision,
      intersectionId: linked.intersectionId,
      controllerId: linked.controllerId,
      isReferenceOnly: true,
    };
    if (existing) {
      Object.assign(existing, payload);
      await this.packages.save(existing);
      run.programmePackagesUpdated += 1;
    } else {
      await this.packages.save(this.packages.create(payload));
      run.programmePackagesCreated += 1;
    }
  }

  private async resolveLinks(
    shortCode: string | null,
    carrefourLabel: string | null,
  ): Promise<{ intersectionId: string | null; controllerId: string | null }> {
    if (!shortCode && !carrefourLabel) {
      return { intersectionId: null, controllerId: null };
    }
    // Search intersections whose code/name/address mentions the
    // short code or the carrefour label. We don't auto-link on
    // ambiguous matches: only when exactly one candidate is found.
    const candidates = await this.intersections
      .createQueryBuilder('i')
      .where(
        shortCode
          ? '(i.code ILIKE :s OR i.name ILIKE :s OR i.address ILIKE :s)'
          : 'FALSE',
        { s: shortCode ? `%${shortCode}%` : '' },
      )
      .orWhere(
        carrefourLabel ? '(i.code ILIKE :l OR i.name ILIKE :l)' : 'FALSE',
        { l: carrefourLabel ? `%${carrefourLabel}%` : '' },
      )
      .take(2)
      .getMany();
    if (candidates.length !== 1) {
      return { intersectionId: null, controllerId: null };
    }
    const intersection = candidates[0];
    const controller = await this.controllers.findOne({
      where: { intersectionId: intersection.id },
      order: { uptimeHours: 'DESC' },
    });
    return {
      intersectionId: intersection.id,
      controllerId: controller?.id ?? null,
    };
  }

  private async hashFile(path: string): Promise<string> {
    return new Promise<string>((res, rej) => {
      const hash = createHash('sha256');
      const stream = createReadStream(path);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => res(hash.digest('hex')));
      stream.on('error', (err) => rej(err));
    });
  }

  /**
   * Inner-file inventory using `unzipper` if installed. The module
   * is optional — when it isn't present we still index the ZIP
   * itself, we just leave `contents` empty. Operators can install
   * the optional peer dep to enable the inventory:
   *   cd backend && npm install unzipper @types/unzipper
   */
  private async inspectZip(path: string): Promise<ProgrammeInnerFile[]> {
    const files: ProgrammeInnerFile[] = [];
    const lib = this.loadUnzipper();
    if (!lib) return files;
    try {
      const directory = await lib.Open.file(path);
      for (const entry of directory.files) {
        if (entry.type !== 'File') continue;
        files.push({
          innerPath: entry.path,
          kind: classifyProgrammeInner(entry.path),
          sizeBytes: Number(entry.uncompressedSize ?? 0),
        });
        if (files.length >= MAX_INNER_FILES) break;
      }
    } catch (err) {
      this.logger.warn(
        `[document-ingest] failed to read ZIP ${path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return files;
  }

  private unzipperWarned = false;
  private cachedUnzipper: UnzipperLike | null | undefined = undefined;
  // Returns synchronously despite being awaited at the call site —
  // declaring it `async`-aware lets `inspectZip` keep its plain
  // `await this.loadUnzipper()` shape and stay easy to swap for a
  // proper dynamic import once the optional dep is installed.
  private loadUnzipper(): UnzipperLike | null {
    if (this.cachedUnzipper !== undefined) return this.cachedUnzipper;
    try {
      // Resolved through a runtime indirection so TS does not try to
      // statically resolve the optional peer dependency.
      const moduleName = 'unzipper';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(moduleName) as UnzipperLike;
      this.cachedUnzipper = mod;
      return mod;
    } catch {
      if (!this.unzipperWarned) {
        this.logger.warn(
          '[document-ingest] optional dep `unzipper` is not installed — programme package inner-file inventory will be empty. Install with `npm install unzipper @types/unzipper` to enable.',
        );
        this.unzipperWarned = true;
      }
      this.cachedUnzipper = null;
      return null;
    }
  }

  private recordError(
    run: DocumentIngestRunEntity,
    path: string,
    message: string,
  ) {
    run.errored += 1;
    if (run.errors.length < MAX_ERROR_LOG) {
      run.errors.push({ path, message });
    }
    this.logger.warn(`[document-ingest] ${path}: ${message}`);
  }
}

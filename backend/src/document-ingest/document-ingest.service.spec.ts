import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ConfigType } from '@nestjs/config';
import type { Repository } from 'typeorm';

import type appConfig from '../config/app.config';
import type {
  ControllerEntity,
  DocumentIngestRunEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { DocumentIngestService } from './document-ingest.service';

/**
 * Smoke test for the document-ingest service against a real temp
 * folder that mirrors the D:\sabrine layout. The service is wired
 * with in-memory repositories so we don't touch the DB. PDF parsing
 * is intentionally out of scope — we only verify the scanner
 * indexes files correctly, picks up the right `documentType`, and
 * is idempotent on a second run.
 */

interface InMemoryStore<T extends { id?: string }> {
  byId: Map<string, T>;
  bySourcePath: Map<string, T>;
}

function makeStore<T extends { id?: string }>(): InMemoryStore<T> {
  return { byId: new Map(), bySourcePath: new Map() };
}

function makeRepoLike<T extends { id?: string }>(
  store: InMemoryStore<T>,
  pathKey: keyof T,
): Partial<Repository<T>> & { __store: InMemoryStore<T> } {
  return {
    __store: store,
    create: jest.fn((input: Partial<T>) => {
      const id = input.id ?? `id-${store.byId.size + 1}`;
      const row = { ...(input as object), id } as T;
      return row;
    }) as unknown as Repository<T>['create'],
    save: jest.fn((input: T | T[]) => {
      const rows = Array.isArray(input) ? input : [input];
      for (const row of rows) {
        const id = (row.id as string) ?? `id-${store.byId.size + 1}`;
        const stored: T = { ...(row as object), id } as T;
        store.byId.set(id, stored);
        const key = stored[pathKey];
        if (typeof key === 'string') store.bySourcePath.set(key, stored);
      }
      return Promise.resolve(Array.isArray(input) ? rows : rows[0]);
    }) as unknown as Repository<T>['save'],
    findOne: jest.fn(({ where }: { where: Partial<T> }) => {
      for (const row of store.byId.values()) {
        if (
          Object.entries(where).every(
            ([k, v]) => (row as Record<string, unknown>)[k] === v,
          )
        ) {
          return Promise.resolve(row);
        }
      }
      return Promise.resolve(null);
    }) as unknown as Repository<T>['findOne'],
    count: jest.fn(() =>
      Promise.resolve(store.byId.size),
    ) as unknown as Repository<T>['count'],
    find: jest.fn(() =>
      Promise.resolve(Array.from(store.byId.values())),
    ) as unknown as Repository<T>['find'],
    createQueryBuilder: jest.fn(() => ({
      where: () => ({
        orWhere: () => ({
          take: () => ({
            getMany: () => Promise.resolve([] as T[]),
          }),
        }),
      }),
    })) as unknown as Repository<T>['createQueryBuilder'],
  };
}

async function makeTempLayout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'stls-ingest-'));
  const planRs = join(root, 'OneDrive_2026-04-14', 'PLans RS Fès');
  const dossier = join(root, 'Dossier de Régulation');
  const filaire = join(root, 'Plan Filaire');
  const programme = join(root, 'Programme');
  const dossierMarrakech = join(root, 'Dossiers_Régulation_Marrakech');
  for (const dir of [planRs, dossier, filaire, programme, dossierMarrakech]) {
    await mkdir(dir, { recursive: true });
  }
  // Plan RS — should parse carrefourLabel C01 + revision A
  await writeFile(
    join(planRs, 'Plan_RS_SLT_Car01_Chaouki_Far_A.pdf'),
    'fake-pdf-bytes-1',
  );
  // Plan RS — C04 revision B
  await writeFile(
    join(planRs, 'Plan_RS_SLT_Car04_Imouzzer-Hicham_B.pdf'),
    'fake-pdf-bytes-2',
  );
  // Dossier Régulation — short code AL3
  await writeFile(
    join(dossier, 'Dossier_Regulation_AL3_v2025-03_B.pdf'),
    'fake-pdf-bytes-3',
  );
  // Plan Filaire — short code BAR
  await writeFile(join(filaire, 'Plan_Filaire_BAR_C.pdf'), 'fake-pdf-bytes-4');
  // Marrakech dossier
  await writeFile(
    join(dossierMarrakech, 'Dossier_Regulation_MVI_A.pdf'),
    'fake-pdf-bytes-5',
  );
  // Non-PDF in a PDF folder → should be skipped
  await writeFile(join(planRs, 'README.txt'), 'ignore me');
  // Programme ZIP — opaque blob is fine, inner inventory needs the
  // optional `unzipper` dep so we just verify the metadata row.
  await writeFile(
    join(programme, 'Programme_MVI_v2025-04.zip'),
    'fake-zip-bytes',
  );
  return root;
}

describe('DocumentIngestService', () => {
  let tempRoot: string;
  let service: DocumentIngestService;
  let docs: InMemoryStore<EngineeringDocumentEntity>;
  let pkgs: InMemoryStore<ProgrammePackageEntity>;
  let runs: InMemoryStore<DocumentIngestRunEntity>;

  beforeEach(async () => {
    tempRoot = await makeTempLayout();
    docs = makeStore<EngineeringDocumentEntity>();
    pkgs = makeStore<ProgrammePackageEntity>();
    runs = makeStore<DocumentIngestRunEntity>();
    const intersections = makeStore<IntersectionEntity>();
    const controllers = makeStore<ControllerEntity>();
    const config = {
      engineeringReferencesRoot: tempRoot,
    } as ConfigType<typeof appConfig>;
    service = new DocumentIngestService(
      config,
      makeRepoLike(
        docs,
        'sourcePath',
      ) as unknown as Repository<EngineeringDocumentEntity>,
      makeRepoLike(
        pkgs,
        'sourceZipPath',
      ) as unknown as Repository<ProgrammePackageEntity>,
      makeRepoLike(
        runs,
        'id',
      ) as unknown as Repository<DocumentIngestRunEntity>,
      makeRepoLike(
        intersections,
        'id',
      ) as unknown as Repository<IntersectionEntity>,
      makeRepoLike(
        controllers,
        'id',
      ) as unknown as Repository<ControllerEntity>,
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('reports configured=true when the root exists', () => {
    expect(service.isConfigured()).toBe(true);
    expect(service.getRoot()).toBe(tempRoot);
  });

  it('indexes Plan RS / Dossier / Filaire PDFs and the Programme ZIP on first scan', async () => {
    const run = await service.scan();
    expect(run.status).toBe('completed');
    // 2 Plan RS PDFs + 1 README.txt in Plan RS folder + 1 Dossier PDF
    // + 1 Filaire PDF + 1 Marrakech dossier PDF + 1 Programme ZIP = 7.
    expect(run.filesScanned).toBe(7);
    // 4 PDFs sit in document folders (excluding Marrakech, which is
    // a separate folder also classified as dossier_regulation):
    // 2 Plan RS + 1 Dossier + 1 Filaire + 1 Marrakech = 5.
    expect(run.documentsCreated).toBe(5);
    expect(run.programmePackagesCreated).toBe(1);
    expect(run.errored).toBe(0);
    // README.txt in Plan RS folder is skipped (non-PDF).
    expect(run.skipped).toBe(1);

    const allDocs = Array.from(docs.byId.values());
    const byType = (kind: string) =>
      allDocs.filter((d) => d.documentType === kind);
    expect(byType('plan_rs')).toHaveLength(2);
    expect(byType('dossier_regulation')).toHaveLength(2); // 1 normal + 1 Marrakech
    expect(byType('plan_filaire')).toHaveLength(1);

    const c01 = byType('plan_rs').find((d) => d.carrefourLabel === 'C01');
    expect(c01).toBeDefined();
    expect(c01!.revision).toBe('A');
    expect(c01!.city).toBe('Fès');

    const al3 = byType('dossier_regulation').find((d) => d.shortCode === 'AL3');
    expect(al3).toBeDefined();
    expect(al3!.revision).toBe('B');

    const bar = byType('plan_filaire')[0];
    expect(bar.shortCode).toBe('BAR');
    expect(bar.revision).toBe('C');

    const marrakech = byType('dossier_regulation').find(
      (d) => d.city === 'Marrakech',
    );
    expect(marrakech).toBeDefined();
    expect(marrakech!.shortCode).toBe('MVI');

    const pkgRow = Array.from(pkgs.byId.values())[0];
    expect(pkgRow.shortCode).toBe('MVI');
    expect(pkgRow.isReferenceOnly).toBe(true);
  });

  it('is idempotent — a second scan does not re-create rows', async () => {
    await service.scan();
    const firstCount = docs.byId.size + pkgs.byId.size;
    const run = await service.scan();
    expect(docs.byId.size + pkgs.byId.size).toBe(firstCount);
    // Everything either skipped or updated, nothing newly created.
    expect(run.documentsCreated + run.programmePackagesCreated).toBe(0);
    expect(run.skipped).toBeGreaterThan(0);
  });

  it('refuses to scan when the root is unconfigured', async () => {
    const config = {
      engineeringReferencesRoot: null,
    } as unknown as ConfigType<typeof appConfig>;
    const noRoot = new DocumentIngestService(
      config,
      makeRepoLike(
        docs,
        'sourcePath',
      ) as unknown as Repository<EngineeringDocumentEntity>,
      makeRepoLike(
        pkgs,
        'sourceZipPath',
      ) as unknown as Repository<ProgrammePackageEntity>,
      makeRepoLike(
        runs,
        'id',
      ) as unknown as Repository<DocumentIngestRunEntity>,
      makeRepoLike(
        makeStore<IntersectionEntity>(),
        'id',
      ) as unknown as Repository<IntersectionEntity>,
      makeRepoLike(
        makeStore<ControllerEntity>(),
        'id',
      ) as unknown as Repository<ControllerEntity>,
    );
    expect(noRoot.isConfigured()).toBe(false);
    await expect(noRoot.scan()).rejects.toThrow(/not configured/i);
  });
});

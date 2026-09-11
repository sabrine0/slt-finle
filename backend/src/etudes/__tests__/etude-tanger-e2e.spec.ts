import type { EtudeEntity, IntersectionEntity } from '../../database/entities';
import type { IntersectionsService } from '../../intersections/intersections.service';
import { EtudesService } from '../etudes.service';
import { OfflineEtudeGenerator } from '../offline-etude-generator';
import type { EtudeSectionRecord } from '../etude-sections';

/**
 * End-to-end smoke test for the étude carrefour generator targeting
 * the live Tanger carrefour `INT-TNG-001` — Bd Mohammed VI / Av.
 * d'Espagne, Marshan. Wires the real OfflineEtudeGenerator (which
 * uses the dossier templates) into a real EtudesService backed by an
 * in-memory repo + an IntersectionsService stub. Walks the full
 * operator lifecycle:
 *
 *   1. Create an étude bound to INT-TNG-001
 *   2. Generate `plan_de_situation` — verifies real metadata is
 *      injected (label, code, district, address, coordinates)
 *   3. Generate `affectation_lignes_de_feux` — verifies the dossier
 *      mapping table (10 rows)
 *   4. Generate `phasage` + `matrice_conflit` — verifies prescriptive
 *      fallback when no phases are declared at catalog
 *   5. Patch a section, lock, unlock, regen rejection
 *   6. Verify version + edit history
 */

const TANGER_INTERSECTION_CODE = 'INT-TNG-001';
const TANGER_LABEL = 'Bd Mohammed VI / Av. d’Espagne';
const TANGER_DISTRICT = 'Marshan';
const TANGER_LAT = 35.7849;
const TANGER_LNG = -5.8136;

interface InMemoryState {
  rows: Map<string, EtudeEntity>;
}

function makeRepo(state: InMemoryState) {
  return {
    create: jest.fn((input: Partial<EtudeEntity>): EtudeEntity => {
      const id = input.id ?? `etude-${state.rows.size + 1}`;
      const now = new Date('2026-05-11T09:00:00Z');
      return {
        id,
        createdAt: now,
        updatedAt: now,
        sections: {},
        meta: {},
        ...input,
      } as EtudeEntity;
    }),
    save: jest.fn((row: EtudeEntity) => {
      state.rows.set(row.id, row);
      return Promise.resolve(row);
    }),
    findOne: jest.fn(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(state.rows.get(id) ?? null),
    ),
    find: jest.fn(() => Promise.resolve(Array.from(state.rows.values()))),
    delete: jest.fn((id: string) => {
      state.rows.delete(id);
      return Promise.resolve({ affected: 1 });
    }),
  } as const;
}

function makeIntersectionEntity(): Partial<IntersectionEntity> {
  return {
    id: 'intersection-tng-001',
    code: TANGER_INTERSECTION_CODE,
    name: TANGER_LABEL,
    district: TANGER_DISTRICT,
    address: 'Bd Mohammed VI x Av. d’Espagne, Marshan, Tanger',
    latitude: TANGER_LAT,
    longitude: TANGER_LNG,
    controlMode: 'adaptive' as IntersectionEntity['controlMode'],
    status: 'healthy' as IntersectionEntity['status'],
    queueLength: 0,
    incidents: 0,
    averageDelaySeconds: 0,
    controllers: [
      {
        code: 'CTRL-TNG-001',
        controllerType: 'atc',
        firmwareVersion: '1.0.0',
        operatingEnvironment: 'real',
        connectionState: 'online',
        batteryBacked: false,
        isPrimary: true,
      } as IntersectionEntity['controllers'][number],
    ],
    detectors: [],
    phases: [],
    timingPlans: [],
  };
}

function buildTangerHarness() {
  const state: InMemoryState = { rows: new Map() };
  const repo = makeRepo(state);
  const intersectionEntity = makeIntersectionEntity();
  const intersectionRepo = {
    findOne: jest.fn(() => Promise.resolve(intersectionEntity)),
  } as unknown as never;
  const generator = new OfflineEtudeGenerator();
  const intersections = {
    list: jest.fn(() =>
      Promise.resolve([
        {
          id: 'intersection-tng-001',
          code: TANGER_INTERSECTION_CODE,
          name: TANGER_LABEL,
          regionId: 'region-tng',
          cityId: 'city-tng',
          zoneId: 'zone-tng-marshan',
          district: TANGER_DISTRICT,
          address: 'Bd Mohammed VI x Av. d’Espagne, Marshan, Tanger',
          latitude: TANGER_LAT,
          longitude: TANGER_LNG,
          status: 'healthy',
          controlMode: 'adaptive',
          queueLength: 0,
          incidents: 0,
          averageDelaySeconds: 0,
          controllerId: 'CTRL-TNG-001',
          controllerType: 'atc',
          controllerConnectionState: 'online',
          systemMode: 'real',
          lastHeartbeat: '2026-05-11T08:55:00.000Z',
        },
      ]),
    ),
  } as unknown as IntersectionsService;
  const service = new EtudesService(
    repo as never,
    intersectionRepo,
    intersections,
    generator,
  );
  return { service, state };
}

describe('Étude carrefour — end-to-end smoke test (Tanger INT-TNG-001)', () => {
  it('walks create → generate (multiple) → patch → lock → unlock with the dossier generator', async () => {
    const { service } = buildTangerHarness();

    // ---------- 1. Create ----------
    const created = await service.create({
      intersectionCode: TANGER_INTERSECTION_CODE,
      intersectionLabel: TANGER_LABEL,
      latitude: TANGER_LAT,
      longitude: TANGER_LNG,
      scope: 'standard',
    });
    expect(created.intersectionLabel).toBe(TANGER_LABEL);
    expect(created.intersectionCode).toBe(TANGER_INTERSECTION_CODE);
    expect(created.scope).toBe('standard');
    expect(created.status).toBe('draft');
    // Catalog should not include the tram-only sigfer section.
    expect(
      created.catalog.find(
        (entry) => entry.id === 'affectation_entrees_sigfer',
      ),
    ).toBeUndefined();

    // ---------- 2. Generate plan_de_situation ----------
    const afterPlan = await service.generateSection(
      created.id,
      'plan_de_situation',
    );
    const plan = afterPlan.sections.plan_de_situation;
    expect(plan.status).toBe('generated');
    expect(plan.version).toBe(1);
    const planContent = plan.content as { kind: string; blocks: unknown[] };
    expect(planContent.kind).toBe('blocks');
    const planJson = JSON.stringify(planContent.blocks);
    expect(planJson).toContain(TANGER_INTERSECTION_CODE);
    expect(planJson).toContain(TANGER_DISTRICT);
    expect(planJson).toContain('35.784900');

    // ---------- 3. Generate affectation_lignes_de_feux ----------
    const afterAffect = await service.generateSection(
      created.id,
      'affectation_lignes_de_feux',
    );
    const affect = afterAffect.sections.affectation_lignes_de_feux;
    expect(affect.status).toBe('generated');
    const affectContent = affect.content as {
      kind: string;
      blocks: Array<{ kind: string; rows?: Array<Record<string, unknown>> }>;
    };
    const tableBlock = affectContent.blocks.find((b) => b.kind === 'table');
    expect(tableBlock?.rows).toHaveLength(10);
    expect((tableBlock?.rows ?? []).map((row) => row.code)).toEqual([
      'V1',
      'V2',
      'V3',
      'V4',
      'V5',
      'V6',
      'P1',
      'P2',
      'P3',
      'P4',
    ]);
    // plan_de_situation must still be present (no clobber).
    expect(afterAffect.sections.plan_de_situation.status).toBe('generated');

    // ---------- 4. Generate matrice_conflit + phasage ----------
    const afterMatrix = await service.generateSection(
      created.id,
      'matrice_conflit',
    );
    expect(
      JSON.stringify(afterMatrix.sections.matrice_conflit.content),
    ).toContain('prescriptive');
    const afterPhasage = await service.generateSection(created.id, 'phasage');
    const phJson = JSON.stringify(afterPhasage.sections.phasage.content);
    expect(phJson).toMatch(/Vert min/i);

    // ---------- 5. Patch + lock + regen rejection + unlock ----------
    const manualBlocks = {
      kind: 'blocks',
      blocks: [
        { kind: 'heading', level: 2, text: '3.4 Note opérateur' },
        {
          kind: 'paragraph',
          text: 'Point de repère : gare de Tanger Ville à 1.2 km au sud.',
        },
      ],
    };
    const afterPatch = await service.patchSection(
      created.id,
      'plan_de_situation',
      {
        content: manualBlocks,
        note: 'ajout repère gare Tanger Ville',
      },
    );
    expect(afterPatch.sections.plan_de_situation.status).toBe('edited');
    expect(afterPatch.sections.plan_de_situation.version).toBe(2);

    const afterLock = await service.patchSection(
      created.id,
      'plan_de_situation',
      { content: manualBlocks, lock: true },
    );
    expect(afterLock.sections.plan_de_situation.status).toBe('locked');

    await expect(
      service.generateSection(created.id, 'plan_de_situation'),
    ).rejects.toThrow(/verrouillée/i);

    const afterUnlock = await service.unlockSection(
      created.id,
      'plan_de_situation',
    );
    expect(afterUnlock.sections.plan_de_situation.status).toBe('edited');

    // ---------- 6. Final state checks ----------
    const finalView = await service.get(created.id);
    expect(finalView.sections.plan_de_situation.version).toBe(3);
    expect(finalView.sections.affectation_lignes_de_feux.version).toBe(1);
    const history: Array<EtudeSectionRecord['edits'][number]> =
      finalView.sections.plan_de_situation.edits;
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a tram-only section on a standard étude', async () => {
    const { service } = buildTangerHarness();
    const created = await service.create({
      intersectionCode: TANGER_INTERSECTION_CODE,
      intersectionLabel: TANGER_LABEL,
      latitude: TANGER_LAT,
      longitude: TANGER_LNG,
      scope: 'standard',
    });
    await expect(
      service.generateSection(created.id, 'affectation_entrees_sigfer'),
    ).rejects.toThrow(/non applicable/i);
  });
});

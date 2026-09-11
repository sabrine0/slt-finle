import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { EtudeEntity } from '../database/entities';
import type { IntersectionsService } from '../intersections/intersections.service';
import type {
  EtudeGenerationContext,
  EtudeGenerationResult,
  EtudeGeneratorAdapter,
} from './etude-generator.adapter';
import type { EtudeSectionId, EtudeSectionRecord } from './etude-sections';
import { EtudesService } from './etudes.service';

class StubGenerator implements EtudeGeneratorAdapter {
  readonly mode = 'offline' as const;
  generated: EtudeSectionId[] = [];

  generateSection(
    sectionId: EtudeSectionId,
    context: EtudeGenerationContext,
  ): Promise<EtudeGenerationResult> {
    void context;
    this.generated.push(sectionId);
    return Promise.resolve({
      sectionId,
      source: 'stub',
      content: { kind: 'markdown', markdown: `# ${sectionId}` },
    });
  }
}

function makeRow(overrides: Partial<EtudeEntity> = {}): EtudeEntity {
  return {
    id: 'etude-1',
    createdAt: new Date('2026-05-04T00:00:00Z'),
    updatedAt: new Date('2026-05-04T00:00:00Z'),
    intersectionCode: 'INT-CAS-001',
    intersectionLabel: 'Hassan II / Résistance',
    latitude: null,
    longitude: null,
    scope: 'standard',
    status: 'draft',
    generationMode: 'offline',
    sections: {},
    meta: {},
    ...overrides,
  } as EtudeEntity;
}

interface StubRepoState {
  rows: Map<string, EtudeEntity>;
}

function makeRepo(state: StubRepoState) {
  return {
    create: jest.fn((input: Partial<EtudeEntity>): EtudeEntity => {
      const id = input.id ?? `etude-${state.rows.size + 1}`;
      const now = new Date('2026-05-04T00:00:00Z');
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

function buildService(seed: EtudeEntity[] = []): {
  service: EtudesService;
  generator: StubGenerator;
  state: StubRepoState;
} {
  const state: StubRepoState = { rows: new Map() };
  for (const row of seed) state.rows.set(row.id, row);
  const repo = makeRepo(state);
  const intersectionRepo = {
    findOne: jest.fn(() => Promise.resolve(null)),
  } as unknown as never;
  const generator = new StubGenerator();
  const intersections = {
    list: jest.fn(() => Promise.resolve([])),
  } as unknown as IntersectionsService;
  const service = new EtudesService(
    repo as never,
    intersectionRepo,
    intersections,
    generator,
  );
  return { service, generator, state };
}

describe('EtudesService', () => {
  it('seeds every applicable section as pending on create', async () => {
    const { service } = buildService();
    const view = await service.create({
      intersectionLabel: 'Test',
      scope: 'standard',
    });

    const ids = Object.keys(view.sections);
    expect(ids).toContain('plan_de_situation');
    expect(ids).toContain('affectation_lignes_de_feux');
    // sigfer is tram-only, must NOT appear on a standard scope.
    expect(ids).not.toContain('affectation_entrees_sigfer');
    expect(view.sections.plan_de_situation.status).toBe('pending');
    expect(view.sections.plan_de_situation.version).toBe(0);
  });

  it('rejects empty intersectionLabel', async () => {
    const { service } = buildService();
    await expect(service.create({ intersectionLabel: '   ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('generates a section, marks it generated, and bumps the version', async () => {
    const { service, generator } = buildService();
    const created = await service.create({ intersectionLabel: 'Test' });

    const updated = await service.generateSection(
      created.id,
      'plan_de_situation',
    );

    expect(generator.generated).toEqual(['plan_de_situation']);
    expect(updated.sections.plan_de_situation.status).toBe('generated');
    expect(updated.sections.plan_de_situation.version).toBe(1);
    expect(updated.sections.plan_de_situation.content).toBeTruthy();
  });

  it('refuses to regenerate a locked section', async () => {
    const { service } = buildService();
    const created = await service.create({ intersectionLabel: 'Test' });
    await service.generateSection(created.id, 'plan_de_situation');
    await service.patchSection(created.id, 'plan_de_situation', {
      content: { kind: 'markdown', markdown: 'edited' },
      lock: true,
    });

    await expect(
      service.generateSection(created.id, 'plan_de_situation'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects sections that do not apply to the current scope', async () => {
    const { service } = buildService();
    const created = await service.create({
      intersectionLabel: 'Test',
      scope: 'standard',
    });

    await expect(
      service.generateSection(created.id, 'affectation_entrees_sigfer'),
    ).rejects.toThrow(BadRequestException);
  });

  it('records a patch with edit history and toggles to edited / locked status', async () => {
    const { service } = buildService();
    const created = await service.create({ intersectionLabel: 'Test' });

    const edited = await service.patchSection(created.id, 'plan_de_situation', {
      content: { kind: 'markdown', markdown: 'manual' },
      note: 'corrigé',
    });
    expect(edited.sections.plan_de_situation.status).toBe('edited');
    expect(edited.sections.plan_de_situation.edits).toHaveLength(1);

    const locked = await service.patchSection(created.id, 'plan_de_situation', {
      content: { kind: 'markdown', markdown: 'final' },
      lock: true,
    });
    expect(locked.sections.plan_de_situation.status).toBe('locked');
    expect(locked.sections.plan_de_situation.lockedAt).not.toBeNull();
  });

  it('unlocks a locked section back to edited state', async () => {
    const { service } = buildService();
    const created = await service.create({ intersectionLabel: 'Test' });
    await service.patchSection(created.id, 'plan_de_situation', {
      content: { kind: 'markdown', markdown: 'final' },
      lock: true,
    });

    const unlocked = await service.unlockSection(
      created.id,
      'plan_de_situation',
    );
    expect(unlocked.sections.plan_de_situation.status).toBe('edited');
    expect(unlocked.sections.plan_de_situation.lockedAt).toBeNull();
  });

  it('throws NotFound for unknown ids', async () => {
    const { service } = buildService();
    await expect(service.get('missing')).rejects.toThrow(NotFoundException);
  });

  it('keeps catalog ordered and includes only descriptors for the current scope', async () => {
    const { service } = buildService();
    const view = await service.create({
      intersectionLabel: 'Tram',
      scope: 'tram',
    });
    const orders = view.catalog.map((entry) => entry.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
    // tram includes sigfer
    expect(
      view.catalog.find((entry) => entry.id === 'affectation_entrees_sigfer'),
    ).toBeTruthy();
  });

  it('preserves a previously seeded section record on toView and never clobbers history', async () => {
    const seed = makeRow({
      sections: {
        plan_de_situation: {
          id: 'plan_de_situation',
          status: 'edited',
          version: 3,
          content: { kind: 'markdown', markdown: 'kept' },
          generatedAt: '2026-05-04T00:00:00.000Z',
          lockedAt: null,
          edits: [{ at: '2026-05-04T00:00:00.000Z', note: 'first' }],
        } satisfies EtudeSectionRecord,
      },
    });
    const { service } = buildService([seed]);

    const view = await service.get(seed.id);

    expect(view.sections.plan_de_situation.version).toBe(3);
    expect(view.sections.plan_de_situation.edits).toHaveLength(1);
  });
});

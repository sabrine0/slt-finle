import type { EtudeEntity } from '../database/entities';
import type {
  EtudeGenerationContext,
  ResolvedIntersection,
} from './etude-generator.adapter';
import { ETUDE_SECTION_CATALOGUE } from './etude-sections';
import { OfflineEtudeGenerator } from './offline-etude-generator';

function makeEtude(overrides: Partial<EtudeEntity> = {}): EtudeEntity {
  return {
    id: 'etude-1',
    createdAt: new Date('2026-05-04T00:00:00Z'),
    updatedAt: new Date('2026-05-04T00:00:00Z'),
    intersectionCode: 'INT-TNG-001',
    intersectionLabel: 'Bd Mohammed VI / Av. d’Espagne',
    latitude: '35.7849000',
    longitude: '-5.8136000',
    scope: 'standard',
    status: 'draft',
    generationMode: 'offline',
    sections: {},
    meta: {},
    ...overrides,
  } as EtudeEntity;
}

function makeIntersection(
  overrides: Partial<ResolvedIntersection> = {},
): ResolvedIntersection {
  return {
    code: 'INT-TNG-001',
    name: 'Bd Mohammed VI / Av. d’Espagne',
    district: 'Marshan',
    address: 'Bd Mohammed VI x Av. d’Espagne, Marshan, Tanger',
    latitude: 35.7849,
    longitude: -5.8136,
    cityId: 'city-tng',
    zoneId: null,
    controlMode: 'adaptive',
    status: 'healthy',
    queueLength: 0,
    averageDelaySeconds: 0,
    incidents: 0,
    controllers: [
      {
        code: 'CTRL-TNG-001',
        controllerType: 'atc',
        firmwareVersion: '1.0.0',
        operatingEnvironment: 'real',
        connectionState: 'online',
        batteryBacked: false,
        isPrimary: true,
      },
    ],
    detectors: [],
    phases: [],
    timingPlans: [],
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<EtudeGenerationContext> = {},
): EtudeGenerationContext {
  return {
    etude: makeEtude(),
    intersection: makeIntersection(),
    ...overrides,
  };
}

describe('OfflineEtudeGenerator', () => {
  const generator = new OfflineEtudeGenerator();

  it('declares offline mode', () => {
    expect(generator.mode).toBe('offline');
  });

  it('produces structured blocks for plan_de_situation seeded with real metadata', async () => {
    const result = await generator.generateSection(
      'plan_de_situation',
      makeContext(),
    );
    expect(result.sectionId).toBe('plan_de_situation');
    expect(result.source).toBe('offline:dossier-v1');
    const content = result.content as { kind: string; blocks: unknown[] };
    expect(content.kind).toBe('blocks');
    expect(Array.isArray(content.blocks)).toBe(true);
    // Should reference the carrefour metadata (district + code in a keyvalue block).
    const json = JSON.stringify(content.blocks);
    expect(json).toContain('Marshan');
    expect(json).toContain('INT-TNG-001');
    expect(json).toContain('35.784900');
  });

  it('renders the lignes-de-feux mapping as a table block', async () => {
    const result = await generator.generateSection(
      'affectation_lignes_de_feux',
      makeContext(),
    );
    const content = result.content as {
      kind: string;
      blocks: Array<{ kind: string; rows?: unknown[] }>;
    };
    expect(content.kind).toBe('blocks');
    const tableBlock = content.blocks.find((b) => b.kind === 'table');
    expect(tableBlock).toBeDefined();
    expect((tableBlock?.rows ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('builds matrice_conflit from catalog phases when present', async () => {
    const intersection = makeIntersection({
      phases: [
        {
          sequenceNumber: 1,
          name: 'Phase 1',
          approach: 'E+W',
          movementGroup: 'TD',
          phaseType: 'vehicle',
          minGreenSeconds: 18,
          yellowSeconds: 3,
          redClearanceSeconds: 2,
          pedestrianWalkSeconds: null,
          pedestrianClearSeconds: null,
          conflictingPhaseSequenceNumbers: [2, 3],
        },
        {
          sequenceNumber: 2,
          name: 'Phase 2',
          approach: 'E+W left',
          movementGroup: 'L',
          phaseType: 'vehicle',
          minGreenSeconds: 8,
          yellowSeconds: 3,
          redClearanceSeconds: 2,
          pedestrianWalkSeconds: null,
          pedestrianClearSeconds: null,
          conflictingPhaseSequenceNumbers: [1, 3],
        },
        {
          sequenceNumber: 3,
          name: 'Phase 3',
          approach: 'N+S',
          movementGroup: 'TD',
          phaseType: 'vehicle',
          minGreenSeconds: 14,
          yellowSeconds: 3,
          redClearanceSeconds: 2,
          pedestrianWalkSeconds: null,
          pedestrianClearSeconds: null,
          conflictingPhaseSequenceNumbers: [1, 2],
        },
      ],
    });

    const result = await generator.generateSection(
      'matrice_conflit',
      makeContext({ intersection }),
    );
    const json = JSON.stringify(result.content);
    expect(json).toContain('catalogue');
    // Three phases each conflict with the other two → 6 ✕ in the matrix.
    expect(json.split('✕').length - 1).toBeGreaterThanOrEqual(6);
  });

  it('exposes detector catalog rows when available, falls back to prescription otherwise', async () => {
    const empty = await generator.generateSection(
      'presentation_carrefour',
      makeContext(),
    );
    expect(JSON.stringify(empty.content)).toContain('prescriptif');

    const withDetectors = await generator.generateSection(
      'presentation_carrefour',
      makeContext({
        intersection: makeIntersection({
          detectors: [
            {
              code: 'BCL-LOCAL-01',
              name: 'Boucle entrée Est',
              type: 'inductive_loop',
              laneReference: 'E1',
              isActive: true,
            },
          ],
        }),
      }),
    );
    expect(JSON.stringify(withDetectors.content)).toContain('BCL-LOCAL-01');
  });

  it('SigFer section is noted as non applicable on standard scope', async () => {
    const result = await generator.generateSection(
      'affectation_entrees_sigfer',
      makeContext(),
    );
    expect(JSON.stringify(result.content)).toMatch(/non applicable/i);
  });

  it('emits a structured-block result for every section in the catalogue', async () => {
    for (const descriptor of ETUDE_SECTION_CATALOGUE) {
      const result = await generator.generateSection(
        descriptor.id,
        makeContext(),
      );
      const content = result.content as { kind: string; blocks: unknown[] };
      expect(content.kind).toBe('blocks');
      expect(Array.isArray(content.blocks)).toBe(true);
      expect(content.blocks.length).toBeGreaterThan(0);
    }
  });
});

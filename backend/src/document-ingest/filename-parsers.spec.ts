import {
  classifyProgrammeInner,
  parseDossierRegulation,
  parsePlanFilaire,
  parsePlanRsFès,
  parseProgrammeArchive,
} from './filename-parsers';

describe('filename-parsers', () => {
  describe('parsePlanRsFès', () => {
    it.each([
      [
        'Plan_RS_SLT_Car01_Chaouki_Far_A.pdf',
        { carrefourLabel: 'C01', revision: 'A', city: 'Fès' },
      ],
      [
        'Plan_RS_SLT_Car04_Imouzzer-Hicham_B.pdf',
        { carrefourLabel: 'C04', revision: 'B', city: 'Fès' },
      ],
      [
        'Plan_RS_SLT_Car09_Imouzzer-Khattib_C.pdf',
        { carrefourLabel: 'C09', revision: 'C', city: 'Fès' },
      ],
    ])('parses %s', (input, expected) => {
      const parsed = parsePlanRsFès(input);
      expect(parsed.kind).toBe('plan_rs');
      expect(parsed.carrefourLabel).toBe(expected.carrefourLabel);
      expect(parsed.revision).toBe(expected.revision);
      expect(parsed.city).toBe(expected.city);
      expect(parsed.title).toContain(expected.carrefourLabel);
      expect(parsed.parseNotes).toBeNull();
    });

    it('degrades gracefully on unexpected names', () => {
      const parsed = parsePlanRsFès('random-leftover.pdf');
      expect(parsed.kind).toBe('plan_rs');
      expect(parsed.carrefourLabel).toBeNull();
      expect(parsed.parseNotes).toMatch(/did not match/);
    });
  });

  describe('parseDossierRegulation', () => {
    it('lifts known short codes', () => {
      const parsed = parseDossierRegulation(
        'Dossier_Regulation_AL3_v2025-03_B.pdf',
        'Marrakech',
      );
      expect(parsed.shortCode).toBe('AL3');
      expect(parsed.revision).toBe('B');
      expect(parsed.city).toBe('Marrakech');
      expect(parsed.parseNotes).toBeNull();
    });

    it('records a parse note when no short code is found', () => {
      const parsed = parseDossierRegulation('random-doc.pdf', 'Fès');
      expect(parsed.shortCode).toBeNull();
      expect(parsed.parseNotes).toMatch(/short code/);
    });
  });

  describe('parsePlanFilaire', () => {
    it('lifts known short codes + revision', () => {
      const parsed = parsePlanFilaire('Plan_Filaire_BAR_C.pdf', 'Fès');
      expect(parsed.shortCode).toBe('BAR');
      expect(parsed.revision).toBe('C');
      expect(parsed.kind).toBe('plan_filaire');
    });
  });

  describe('parseProgrammeArchive', () => {
    it('lifts version fragment when present', () => {
      const parsed = parseProgrammeArchive('Programme_MVI_v2025-04.zip');
      expect(parsed.shortCode).toBe('MVI');
      expect(parsed.revision).toContain('2025');
      expect(parsed.kind).toBe('programme_archive');
    });
  });

  describe('classifyProgrammeInner', () => {
    it.each([
      ['Carrefour.clp9_9_1', 'clp9'],
      ['Plan.clp9_9_05', 'clp9'],
      ['Plan.wpr', 'wpr'],
      ['Notice.pdf', 'pdf'],
      ['Notes.txt', 'other'],
    ])('classifies %s -> %s', (inner, expected) => {
      expect(classifyProgrammeInner(inner)).toBe(expected);
    });
  });
});

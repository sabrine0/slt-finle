import {
  ETUDE_SECTION_CATALOGUE,
  emptySectionRecord,
  findSection,
  listSectionsForScope,
} from './etude-sections';

describe('etude-sections catalogue', () => {
  it('is sorted by `order` and contains no duplicates', () => {
    const ids = ETUDE_SECTION_CATALOGUE.map((entry) => entry.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);

    const orders = ETUDE_SECTION_CATALOGUE.map((entry) => entry.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('listSectionsForScope filters by applicable scope', () => {
    const standard = listSectionsForScope('standard').map((entry) => entry.id);
    const tram = listSectionsForScope('tram').map((entry) => entry.id);
    const cablage = listSectionsForScope('cablage').map((entry) => entry.id);

    // Tram-only section never appears on standard scope.
    expect(standard).not.toContain('affectation_entrees_sigfer');
    expect(tram).toContain('affectation_entrees_sigfer');

    // Cablage scope is reduced to wiring-relevant sections.
    expect(cablage).toContain('affectation_lignes_de_feux');
    expect(cablage).not.toContain('plan_feux_hpm');
  });

  it('findSection returns the descriptor for a known id', () => {
    expect(findSection('plan_de_situation')?.title).toBe('Plan de situation');
  });

  it('findSection returns undefined for an unknown id', () => {
    expect(findSection('not-a-section' as never)).toBeUndefined();
  });

  it('emptySectionRecord initialises to pending / version 0 / no edits', () => {
    const record = emptySectionRecord('plan_de_situation');
    expect(record).toEqual({
      id: 'plan_de_situation',
      status: 'pending',
      version: 0,
      content: null,
      generatedAt: null,
      lockedAt: null,
      edits: [],
    });
  });
});

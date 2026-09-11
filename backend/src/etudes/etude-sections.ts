/**
 * Section catalogue for the étude carrefour generator.
 *
 * The list mirrors the structure of the reference dossiers (Casablanca
 * tramway dossiers + Fès Imouzzer/Hicham). Each section has a stable
 * id, a human title, an order, and a flag for which scopes apply
 * ('standard' = simple VP intersection, 'tram' adds SigFer +
 * tramway-specific blocks, 'cablage' is the wiring dossier).
 *
 * Section content is typed loosely as `Record<string, unknown>` —
 * each generator implementation produces its own shape, validated at
 * generation time. Two sections are fully implemented in Phase 1:
 *
 *   - `plan_de_situation`        (template + map context)
 *   - `affectation_lignes_de_feux` (table of signal-group → output
 *                                   line, derived from the catalog)
 *
 * The remaining sections ship with placeholder templates that the
 * operator can edit inline; once the offline templates prove useful
 * we plug a real Claude generator into the adapter without changing
 * the public surface.
 */

export type EtudeSectionScope = 'standard' | 'tram' | 'cablage';

export type EtudeSectionId =
  | 'plan_de_situation'
  | 'presentation_carrefour'
  | 'matrice_conflit'
  | 'tableau_degagement'
  | 'micro_regulation'
  | 'plan_feux_hpm'
  | 'plan_feux_hps'
  | 'plan_feux_hc'
  | 'plan_feux_hm'
  | 'phasage'
  | 'fonctionnements_manuels'
  | 'affectation_lignes_de_feux'
  | 'affectation_entrees_diaser'
  | 'affectation_entrees_sigfer'
  | 'cahier_recettes'
  | 'annexes';

export interface EtudeSectionDescriptor {
  id: EtudeSectionId;
  title: string;
  order: number;
  /** Which dossier scopes include this section. */
  scopes: EtudeSectionScope[];
  /** Short hint shown in the UI under the title. */
  description: string;
}

export const ETUDE_SECTION_CATALOGUE: readonly EtudeSectionDescriptor[] = [
  {
    id: 'plan_de_situation',
    title: 'Plan de situation',
    order: 10,
    scopes: ['standard', 'tram', 'cablage'],
    description:
      'Localisation du carrefour, accès, contexte urbain et coordonnées.',
  },
  {
    id: 'presentation_carrefour',
    title: 'Présentation du carrefour',
    order: 20,
    scopes: ['standard', 'tram'],
    description:
      'Géométrie, branches, mouvements VP / TC / piéton, équipements existants.',
  },
  {
    id: 'matrice_conflit',
    title: 'Matrice de conflit',
    order: 30,
    scopes: ['standard', 'tram'],
    description:
      'Croisements interdits entre groupes de signaux, en lecture directe.',
  },
  {
    id: 'tableau_degagement',
    title: 'Tableau de dégagement',
    order: 40,
    scopes: ['standard', 'tram'],
    description:
      'Temps de dégagement (jaune + rouge) entre couples de phases conflictuelles.',
  },
  {
    id: 'micro_regulation',
    title: 'Micro-régulation',
    order: 50,
    scopes: ['standard', 'tram'],
    description:
      'Règles de prolongation / extension par détection, contraintes mini/maxi.',
  },
  {
    id: 'plan_feux_hpm',
    title: 'Plan de feux — Heure de Pointe Matin',
    order: 60,
    scopes: ['standard', 'tram'],
    description: 'Cycle, splits et offsets — créneau HPM.',
  },
  {
    id: 'plan_feux_hps',
    title: 'Plan de feux — Heure de Pointe Soir',
    order: 70,
    scopes: ['standard', 'tram'],
    description: 'Cycle, splits et offsets — créneau HPS.',
  },
  {
    id: 'plan_feux_hc',
    title: 'Plan de feux — Heures Creuses',
    order: 80,
    scopes: ['standard', 'tram'],
    description: 'Cycle réduit pour les périodes de faible demande.',
  },
  {
    id: 'plan_feux_hm',
    title: 'Plan de feux — Heures de Mi-journée',
    order: 90,
    scopes: ['standard', 'tram'],
    description: 'Cycle intermédiaire HM.',
  },
  {
    id: 'phasage',
    title: 'Phasage',
    order: 100,
    scopes: ['standard', 'tram'],
    description: 'Découpage des phases, ordres autorisés et transitions.',
  },
  {
    id: 'fonctionnements_manuels',
    title: 'Fonctionnements manuels',
    order: 110,
    scopes: ['standard', 'tram'],
    description: 'Modes manuel / forçage / clignotant — séquences acceptées.',
  },
  {
    id: 'affectation_lignes_de_feux',
    title: 'Affectation des lignes de feux',
    order: 120,
    scopes: ['standard', 'tram', 'cablage'],
    description:
      'Mapping groupe de signaux → numéro de sortie sur le contrôleur.',
  },
  {
    id: 'affectation_entrees_diaser',
    title: 'Affectation des entrées DIASER',
    order: 130,
    scopes: ['standard', 'tram'],
    description: 'Lignes d’entrée DIASER (boucles, BP, détecteurs).',
  },
  {
    id: 'affectation_entrees_sigfer',
    title: 'Affectation des entrées SigFer',
    order: 140,
    scopes: ['tram'],
    description:
      'Demandes de priorité tramway (annonces SigFer entrée / sortie).',
  },
  {
    id: 'cahier_recettes',
    title: 'Cahier de recettes',
    order: 150,
    scopes: ['standard', 'tram', 'cablage'],
    description: 'Procédures de recette sur site, points à vérifier.',
  },
  {
    id: 'annexes',
    title: 'Annexes',
    order: 160,
    scopes: ['standard', 'tram', 'cablage'],
    description: 'Schémas additionnels, références et validations.',
  },
] as const;

export function listSectionsForScope(
  scope: EtudeSectionScope,
): EtudeSectionDescriptor[] {
  return ETUDE_SECTION_CATALOGUE.filter((descriptor) =>
    descriptor.scopes.includes(scope),
  ).sort((a, b) => a.order - b.order);
}

export function findSection(
  id: EtudeSectionId,
): EtudeSectionDescriptor | undefined {
  return ETUDE_SECTION_CATALOGUE.find((descriptor) => descriptor.id === id);
}

export type EtudeSectionStatus = 'pending' | 'generated' | 'edited' | 'locked';

/**
 * Persisted shape of one section inside `EtudeEntity.sections`.
 * `content` is intentionally unstructured at the type level so each
 * generator can return its own shape; validation is handled at the
 * service boundary.
 */
export interface EtudeSectionRecord {
  id: EtudeSectionId;
  status: EtudeSectionStatus;
  version: number;
  content: Record<string, unknown> | null;
  generatedAt: string | null;
  lockedAt: string | null;
  edits: Array<{ at: string; note: string }>;
}

export function emptySectionRecord(id: EtudeSectionId): EtudeSectionRecord {
  return {
    id,
    status: 'pending',
    version: 0,
    content: null,
    generatedAt: null,
    lockedAt: null,
    edits: [],
  };
}

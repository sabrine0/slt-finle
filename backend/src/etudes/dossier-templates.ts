/**
 * Dossier templates for the offline étude generator.
 *
 * Each template takes the generation context and returns a list of
 * structured content blocks (see `etude-content.ts`) that mirror the
 * DOE / dossier de régulation style of the Casablanca tramway and
 * Fès reference dossiers. When the catalog already has phases /
 * detectors / timing plans, they are surfaced; when not, a typical
 * 4-branch urban carrefour layout is prescribed (à valider terrain).
 */

import {
  EtudeContentBlock,
  blocks,
  h,
  kv,
  list,
  note,
  p,
  placeholder,
  table,
  type EtudeStructuredContent,
} from './etude-content';
import type {
  EtudeGenerationContext,
  ResolvedIntersection,
} from './etude-generator.adapter';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function carrefourLabel(context: EtudeGenerationContext): string {
  return (
    context.intersection?.name ?? context.etude.intersectionLabel ?? 'Carrefour'
  );
}

function carrefourCode(context: EtudeGenerationContext): string {
  return (
    context.intersection?.code ??
    context.etude.intersectionCode ??
    'CARREFOUR-XXX'
  );
}

function coords(context: EtudeGenerationContext): {
  lat: number | null;
  lng: number | null;
} {
  const lat =
    context.intersection?.latitude ??
    (context.etude.latitude == null ? null : Number(context.etude.latitude));
  const lng =
    context.intersection?.longitude ??
    (context.etude.longitude == null ? null : Number(context.etude.longitude));
  return {
    lat: Number.isFinite(lat) ? (lat as number) : null,
    lng: Number.isFinite(lng) ? (lng as number) : null,
  };
}

function primaryController(intersection: ResolvedIntersection | null) {
  if (!intersection) return null;
  return (
    intersection.controllers.find((entry) => entry.isPrimary) ??
    intersection.controllers[0] ??
    null
  );
}

// ---------------------------------------------------------------
// §3 Plan de situation
// ---------------------------------------------------------------

export function planDeSituation(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  const label = carrefourLabel(context);
  const code = carrefourCode(context);
  const intersection = context.intersection;
  const { lat, lng } = coords(context);

  const meta: Array<{ key: string; value: string }> = [
    { key: 'Carrefour', value: label },
    { key: 'Code', value: code },
  ];
  if (intersection?.district) {
    meta.push({ key: 'Quartier', value: intersection.district });
  }
  if (intersection?.address) {
    meta.push({ key: 'Adresse', value: intersection.address });
  }
  if (lat != null && lng != null) {
    meta.push({
      key: 'Coordonnées WGS 84',
      value: `${lat.toFixed(6)} N, ${lng.toFixed(6)} E`,
    });
  }
  if (intersection?.controlMode) {
    meta.push({ key: 'Mode de contrôle', value: intersection.controlMode });
  }

  return blocks(
    h(2, '3.1 Localisation'),
    p(
      `Le carrefour ${code} — ${label} est implanté ${intersection?.district ? `dans le quartier de ${intersection.district}` : 'dans le périmètre urbain défini par le maître d’ouvrage'}. Le présent dossier décrit l’aménagement, les équipements de signalisation, les modes de régulation et les conditions d’exploitation associées.`,
    ),
    kv(meta, 'Identification carrefour'),
    h(2, '3.2 Carrefours et contrôleurs voisins'),
    p(
      'Les carrefours voisins et les contrôleurs adjacents sont à identifier dans le cadre du plan de coordination du corridor. Sans coordination active, les paramètres d’offset sont fixés à 0 s.',
    ),
    note(
      'Tableau à compléter à partir du relevé terrain — distance, type d’intersection, plan de coordination associé.',
    ),
    h(2, '3.3 Contexte trafic'),
    p(
      'Carrefour à dominante urbaine, supportant un trafic mixte (véhicules particuliers, transports collectifs, piétons). Les hypothèses de trafic détaillées sont consignées au §10 (Capacité).',
    ),
    placeholder(
      'Plan de situation',
      'Capture Google Maps (vue satellite + vue plan) avec repérage des carrefours voisins et orientation Nord.',
      `dossiers/${code}/plan-situation.svg`,
    ),
  );
}

// ---------------------------------------------------------------
// §4 + §5 Plan d'aménagement + Détection
// ---------------------------------------------------------------

export function presentationCarrefour(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  const code = carrefourCode(context);
  const intersection = context.intersection;
  const hasDetectors = (intersection?.detectors.length ?? 0) > 0;

  const branchesTable = table({
    caption: 'Branches d’accès — gabarit (à valider terrain)',
    columns: [
      { key: 'branche', label: 'Branche', align: 'center' },
      { key: 'direction', label: 'Direction' },
      { key: 'fonction', label: 'Fonction' },
      { key: 'largeur', label: 'Chaussée (m)', align: 'right' },
      { key: 'voies', label: 'Voies (entrée + sortie)', align: 'center' },
    ],
    rows: [
      {
        branche: 'N',
        direction: 'Axe secondaire — Nord',
        fonction: 'Entrée + sortie',
        largeur: 7.0,
        voies: '1 + 1',
      },
      {
        branche: 'S',
        direction: 'Axe secondaire — Sud',
        fonction: 'Entrée + sortie',
        largeur: 7.0,
        voies: '1 + 1',
      },
      {
        branche: 'E',
        direction: 'Axe principal — Est',
        fonction: 'Entrée + sortie',
        largeur: 10.5,
        voies: '2 + 2',
      },
      {
        branche: 'W',
        direction: 'Axe principal — Ouest',
        fonction: 'Entrée + sortie',
        largeur: 10.5,
        voies: '2 + 2',
      },
    ],
  });

  const lanesTable = table({
    caption: 'Voies de circulation par approche',
    columns: [
      { key: 'approche', label: 'Approche' },
      { key: 'code', label: 'Code voie', align: 'center' },
      { key: 'mouvements', label: 'Mouvements autorisés' },
    ],
    rows: [
      {
        approche: 'Est (entrée)',
        code: 'E1',
        mouvements: 'Tout droit + tourne-à-droite',
      },
      { approche: 'Est (entrée)', code: 'E2', mouvements: 'Tourne-à-gauche' },
      {
        approche: 'Ouest (entrée)',
        code: 'W1',
        mouvements: 'Tout droit + tourne-à-droite',
      },
      { approche: 'Ouest (entrée)', code: 'W2', mouvements: 'Tourne-à-gauche' },
      {
        approche: 'Nord (entrée)',
        code: 'N1',
        mouvements: 'Tout droit + tourne-à-droite',
      },
      {
        approche: 'Sud (entrée)',
        code: 'S1',
        mouvements: 'Tout droit + tourne-à-droite',
      },
    ],
  });

  const crossingsTable = table({
    caption: 'Traversées piétonnes',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'branche', label: 'Branche traversée' },
      { key: 'type', label: 'Type' },
      { key: 'distance', label: 'Distance (m)', align: 'right' },
      { key: 'refuge', label: 'Refuge central', align: 'center' },
    ],
    rows: [
      {
        code: 'P-NS',
        branche: 'Av. secondaire (S)',
        type: 'Marquée 2 + 2 zébrures',
        distance: 7.0,
        refuge: 'Non',
      },
      {
        code: 'P-EW',
        branche: 'Av. principale (W)',
        type: 'Marquée 2 + 2 zébrures',
        distance: 10.5,
        refuge: 'Oui (1.50 m)',
      },
      {
        code: 'P-NS2',
        branche: 'Av. secondaire (N)',
        type: 'Marquée 2 + 2 zébrures',
        distance: 7.0,
        refuge: 'Non',
      },
      {
        code: 'P-EW2',
        branche: 'Av. principale (E)',
        type: 'Marquée 2 + 2 zébrures',
        distance: 10.5,
        refuge: 'Oui (1.50 m)',
      },
    ],
  });

  const signalHeadsTable = table({
    caption: 'Inventaire des feux',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'type', label: 'Type' },
      { key: 'approche', label: 'Approche', align: 'center' },
      { key: 'mouvement', label: 'Mouvements desservis' },
      { key: 'hauteur', label: 'Hauteur (m)', align: 'right' },
      { key: 'support', label: 'Support' },
    ],
    rows: [
      {
        code: 'V1',
        type: 'Tricolore Ø200',
        approche: 'E',
        mouvement: 'Tout droit + droite',
        hauteur: 3.5,
        support: 'Potence',
      },
      {
        code: 'V2',
        type: 'Tricolore Ø200',
        approche: 'E',
        mouvement: 'Tourne-à-gauche',
        hauteur: 3.5,
        support: 'Potence',
      },
      {
        code: 'V3',
        type: 'Tricolore Ø200',
        approche: 'W',
        mouvement: 'Tout droit + droite',
        hauteur: 3.5,
        support: 'Potence',
      },
      {
        code: 'V4',
        type: 'Tricolore Ø200',
        approche: 'W',
        mouvement: 'Tourne-à-gauche',
        hauteur: 3.5,
        support: 'Potence',
      },
      {
        code: 'V5',
        type: 'Tricolore Ø200',
        approche: 'N',
        mouvement: 'Tout droit + droite',
        hauteur: 3.5,
        support: 'Mât simple',
      },
      {
        code: 'V6',
        type: 'Tricolore Ø200',
        approche: 'S',
        mouvement: 'Tout droit + droite',
        hauteur: 3.5,
        support: 'Mât simple',
      },
      {
        code: 'P1',
        type: 'Piéton Ø200 + son',
        approche: 'P-NS',
        mouvement: '—',
        hauteur: 2.5,
        support: 'Mât simple',
      },
      {
        code: 'P2',
        type: 'Piéton Ø200 + son',
        approche: 'P-EW',
        mouvement: '—',
        hauteur: 2.5,
        support: 'Mât simple',
      },
      {
        code: 'P3',
        type: 'Piéton Ø200 + son',
        approche: 'P-NS2',
        mouvement: '—',
        hauteur: 2.5,
        support: 'Mât simple',
      },
      {
        code: 'P4',
        type: 'Piéton Ø200 + son',
        approche: 'P-EW2',
        mouvement: '—',
        hauteur: 2.5,
        support: 'Mât simple',
      },
    ],
  });

  // Détection : si le catalogue contient déjà des détecteurs, on les
  // affiche, sinon on prescrit le gabarit standard.
  const detectionTable = hasDetectors
    ? table({
        caption: 'Détection véhicules — données catalogue',
        columns: [
          { key: 'code', label: 'Code', align: 'center' },
          { key: 'name', label: 'Nom' },
          { key: 'type', label: 'Type' },
          { key: 'lane', label: 'Voie' },
          { key: 'actif', label: 'Actif', align: 'center' },
        ],
        rows: (intersection?.detectors ?? []).map((detector) => ({
          code: detector.code,
          name: detector.name,
          type: detector.type,
          lane: detector.laneReference ?? '—',
          actif: detector.isActive ? 'oui' : 'non',
        })),
      })
    : table({
        caption:
          'Détection véhicules — gabarit prescriptif (boucles inductives, à scellement)',
        columns: [
          { key: 'code', label: 'Code', align: 'center' },
          { key: 'voie', label: 'Voie', align: 'center' },
          { key: 'type', label: 'Type' },
          { key: 'position', label: 'Position' },
          { key: 'fonction', label: 'Fonction principale' },
        ],
        rows: [
          {
            code: 'BCL-E1',
            voie: 'E1',
            type: '1.5 × 2.0 m',
            position: 'Présence + 25 m amont',
            fonction: 'Présence + prolongation vert',
          },
          {
            code: 'BCL-E2',
            voie: 'E2',
            type: '1.5 × 2.0 m',
            position: 'Présence + 25 m amont',
            fonction: 'Présence (tourne-à-gauche)',
          },
          {
            code: 'BCL-W1',
            voie: 'W1',
            type: '1.5 × 2.0 m',
            position: 'Présence + 25 m amont',
            fonction: 'Présence + prolongation vert',
          },
          {
            code: 'BCL-W2',
            voie: 'W2',
            type: '1.5 × 2.0 m',
            position: 'Présence + 25 m amont',
            fonction: 'Présence (tourne-à-gauche)',
          },
          {
            code: 'BCL-N1',
            voie: 'N1',
            type: '1.5 × 2.0 m',
            position: 'Présence + 15 m amont',
            fonction: 'Présence + appel de phase',
          },
          {
            code: 'BCL-S1',
            voie: 'S1',
            type: '1.5 × 2.0 m',
            position: 'Présence + 15 m amont',
            fonction: 'Présence + appel de phase',
          },
        ],
      });

  const bpTable = table({
    caption: 'Détection piétons',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'branche', label: 'Branche' },
      { key: 'type', label: 'Type' },
      { key: 'mode', label: 'Mode d’appel' },
    ],
    rows: [
      {
        code: 'BP-P1',
        branche: 'P-NS',
        type: 'Bouton-poussoir illuminé',
        mode: 'Appel manuel',
      },
      {
        code: 'BP-P2',
        branche: 'P-EW',
        type: 'Bouton-poussoir illuminé',
        mode: 'Appel manuel',
      },
      {
        code: 'BP-P3',
        branche: 'P-NS2',
        type: 'Bouton-poussoir illuminé',
        mode: 'Appel manuel',
      },
      {
        code: 'BP-P4',
        branche: 'P-EW2',
        type: 'Bouton-poussoir illuminé',
        mode: 'Appel manuel',
      },
    ],
  });

  return blocks(
    h(2, '4.1 Géométrie générale'),
    p(
      'Le carrefour est de type + (cruciforme) à quatre branches d’accès, raccordement classique sans îlot central. Les branches sont notées N, S, E, W dans le sens trigonométrique en partant du Nord.',
    ),
    branchesTable,
    h(2, '4.2 Voies de circulation par approche'),
    lanesTable,
    h(2, '4.3 Traversées piétonnes'),
    crossingsTable,
    h(2, '4.4 Inventaire des feux'),
    signalHeadsTable,
    placeholder(
      'Plan d’aménagement',
      'Plan échelle 1/200 (DXF + PDF) avec couches voirie, marquage, traversées piétonnes, supports de feux, chambres et fourreaux.',
      `dossiers/${code}/plan-amenagement.dxf`,
    ),
    h(1, '5. Détection'),
    h(2, '5.1 Détection véhicules'),
    p(
      hasDetectors
        ? `Le catalogue STLS référence ${intersection?.detectors.length} détecteur(s) sur ce carrefour. Le tableau ci-dessous reprend les données enregistrées.`
        : 'La détection véhicules est assurée par boucles inductives noyées dans la chaussée, dimensionnées pour les sollicitations de prolongation de phase et le comptage entrant requis par les modes adaptatif et IA.',
    ),
    detectionTable,
    h(2, '5.2 Détection piétons'),
    p(
      'Chaque bouton-poussoir est doté d’un retour visuel "appel enregistré" conforme aux préconisations d’accessibilité PMR ; la durée minimale de vert piéton est dimensionnée pour une vitesse de marche de 1.0 m/s.',
    ),
    bpTable,
    h(2, '5.3 Priorité véhicules d’urgence'),
    p(
      'L’intégration des véhicules prioritaires (police, SAMU, protection civile) s’effectue par l’agent IA `EmergencyVehicleAgent` du moteur STLS, lequel peut forcer un couloir vert sur réception d’un évènement signé par la centrale opérateur. Aucune détection physique (gyrophare optique, RFID embarqué) n’est requise au présent indice ; l’appel transite par l’API d’override sécurisée par signature HMAC.',
    ),
    h(2, '5.4 Priorité tramway / bus'),
    p(
      context.etude.scope === 'tram'
        ? 'Le carrefour intègre une priorité tramway via le module SigFer. Les codifications d’entrée et de sortie sont consignées au §14.'
        : 'Non applicable au présent indice (scope standard, sans transport en commun en site propre). Une réserve de codification SigFer est néanmoins maintenue pour une éventuelle évolution.',
    ),
  );
}

// ---------------------------------------------------------------
// §7.3 Affectation des lignes de feux
// ---------------------------------------------------------------

export function affectationLignesDeFeux(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  void context;
  // Default mapping mirroring the dossier signal head inventory.
  const defaultRows = [
    { line: 1, code: 'V1', type: 'VP', mouvement: 'E — tout droit + droite' },
    { line: 2, code: 'V2', type: 'VP', mouvement: 'E — gauche' },
    { line: 3, code: 'V3', type: 'VP', mouvement: 'W — tout droit + droite' },
    { line: 4, code: 'V4', type: 'VP', mouvement: 'W — gauche' },
    { line: 5, code: 'V5', type: 'VP', mouvement: 'N — tout droit + droite' },
    { line: 6, code: 'V6', type: 'VP', mouvement: 'S — tout droit + droite' },
    { line: 7, code: 'P1', type: 'PIE', mouvement: 'Traversée P-NS' },
    { line: 8, code: 'P2', type: 'PIE', mouvement: 'Traversée P-EW' },
    { line: 9, code: 'P3', type: 'PIE', mouvement: 'Traversée P-NS2' },
    { line: 10, code: 'P4', type: 'PIE', mouvement: 'Traversée P-EW2' },
  ];

  return blocks(
    p(
      'Mapping lampe ↔ ligne ↔ feu, utilisé pour la maintenance et la vérification au cahier de recettes. Le numéro de ligne correspond à l’ordre d’allocation sur le contrôleur.',
    ),
    table({
      caption: 'Affectation des lignes de feux',
      columns: [
        { key: 'line', label: 'Ligne n°', align: 'center' },
        { key: 'code', label: 'Code feu', align: 'center' },
        { key: 'type', label: 'Type' },
        { key: 'mouvement', label: 'Mouvement' },
      ],
      rows: defaultRows,
    }),
  );
}

// ---------------------------------------------------------------
// §7.1 + §7.2 + §14 Affectation entrées / sorties / DIASER
// ---------------------------------------------------------------

export function affectationEntreesDiaser(
  _context: EtudeGenerationContext,
): EtudeStructuredContent {
  void _context;
  const inputsTable = table({
    caption:
      '7.1 — Affectation des entrées contrôleur (24 entrées disponibles)',
    columns: [
      { key: 'in', label: 'Entrée', align: 'center' },
      { key: 'source', label: 'Code source', align: 'center' },
      { key: 'type', label: 'Type signal' },
      { key: 'niveau', label: 'Niveau actif', align: 'center' },
      { key: 'fonction', label: 'Fonction' },
      { key: 'filtre', label: 'Filtrage', align: 'right' },
    ],
    rows: [
      {
        in: 'IN-01',
        source: 'BCL-E1',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle E1',
        filtre: '50 ms',
      },
      {
        in: 'IN-02',
        source: 'BCL-E2',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle E2',
        filtre: '50 ms',
      },
      {
        in: 'IN-03',
        source: 'BCL-W1',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle W1',
        filtre: '50 ms',
      },
      {
        in: 'IN-04',
        source: 'BCL-W2',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle W2',
        filtre: '50 ms',
      },
      {
        in: 'IN-05',
        source: 'BCL-N1',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle N1',
        filtre: '50 ms',
      },
      {
        in: 'IN-06',
        source: 'BCL-S1',
        type: 'TOR',
        niveau: 'NF',
        fonction: 'Présence boucle S1',
        filtre: '50 ms',
      },
      {
        in: 'IN-07',
        source: 'BP-P1',
        type: 'Impulsion',
        niveau: 'NO',
        fonction: 'Appel piéton P-NS',
        filtre: '100 ms',
      },
      {
        in: 'IN-08',
        source: 'BP-P2',
        type: 'Impulsion',
        niveau: 'NO',
        fonction: 'Appel piéton P-EW',
        filtre: '100 ms',
      },
      {
        in: 'IN-09',
        source: 'BP-P3',
        type: 'Impulsion',
        niveau: 'NO',
        fonction: 'Appel piéton P-NS2',
        filtre: '100 ms',
      },
      {
        in: 'IN-10',
        source: 'BP-P4',
        type: 'Impulsion',
        niveau: 'NO',
        fonction: 'Appel piéton P-EW2',
        filtre: '100 ms',
      },
      {
        in: 'IN-11',
        source: 'SEL-MAN',
        type: 'TOR',
        niveau: 'NO',
        fonction: 'Sélecteur mode manuel armoire',
        filtre: '—',
      },
      {
        in: 'IN-12',
        source: 'WDG-IN',
        type: 'Front',
        niveau: '—',
        fonction: 'Retour watchdog',
        filtre: '—',
      },
      {
        in: 'IN-13 … IN-24',
        source: 'RÉSERVE',
        type: '—',
        niveau: '—',
        fonction: 'Réserve d’évolution',
        filtre: '—',
      },
    ],
  });

  const outputsTable = table({
    caption: '7.2 — Affectation des sorties contrôleur (24 sorties relais SSR)',
    columns: [
      { key: 'out', label: 'Sortie', align: 'center' },
      { key: 'lampe', label: 'Lampe', align: 'center' },
      { key: 'feu', label: 'Feu', align: 'center' },
      { key: 'couleur', label: 'Couleur' },
      { key: 'charge', label: 'Charge (W)', align: 'right' },
    ],
    rows: [
      {
        out: 'OUT-01..03',
        lampe: 'L1..L3',
        feu: 'V1',
        couleur: 'Rouge / Jaune / Vert',
        charge: 60,
      },
      {
        out: 'OUT-04..06',
        lampe: 'L4..L6',
        feu: 'V2',
        couleur: 'Rouge / Jaune / Vert + flèche gauche',
        charge: 60,
      },
      {
        out: 'OUT-07..09',
        lampe: 'L7..L9',
        feu: 'V3',
        couleur: 'Rouge / Jaune / Vert',
        charge: 60,
      },
      {
        out: 'OUT-10..12',
        lampe: 'L10..L12',
        feu: 'V4',
        couleur: 'Rouge / Jaune / Vert + flèche gauche',
        charge: 60,
      },
      {
        out: 'OUT-13..15',
        lampe: 'L13..L15',
        feu: 'V5',
        couleur: 'Rouge / Jaune / Vert',
        charge: 60,
      },
      {
        out: 'OUT-16',
        lampe: 'L16',
        feu: 'V6',
        couleur: 'Multiplex R/J/V',
        charge: 60,
      },
      {
        out: 'OUT-17..18',
        lampe: 'LP1..LP2',
        feu: 'P1',
        couleur: 'Rouge / Vert piéton',
        charge: 25,
      },
      {
        out: 'OUT-19..20',
        lampe: 'LP3..LP4',
        feu: 'P2',
        couleur: 'Rouge / Vert piéton',
        charge: 25,
      },
      {
        out: 'OUT-21',
        lampe: '—',
        feu: '—',
        couleur: 'Retour défaut centrale',
        charge: 5,
      },
      {
        out: 'OUT-22',
        lampe: '—',
        feu: '—',
        couleur: 'Voyant "manuel armé"',
        charge: 5,
      },
      {
        out: 'OUT-23',
        lampe: '—',
        feu: '—',
        couleur: 'Test lampes (toutes rouges)',
        charge: '—',
      },
      {
        out: 'OUT-24',
        lampe: 'RÉS',
        feu: '—',
        couleur: 'Réserve',
        charge: '—',
      },
    ],
  });

  const diaserInputs = table({
    caption: '14.1 — Variables d’entrée DIASER (I_*)',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'src', label: 'Source physique', align: 'center' },
      { key: 'type', label: 'Type', align: 'center' },
      { key: 'desc', label: 'Description' },
    ],
    rows: [
      {
        code: 'I_BCL_E1',
        src: 'IN-01',
        type: 'BOOL',
        desc: 'Présence boucle E1',
      },
      {
        code: 'I_BCL_E2',
        src: 'IN-02',
        type: 'BOOL',
        desc: 'Présence boucle E2',
      },
      {
        code: 'I_BCL_W1',
        src: 'IN-03',
        type: 'BOOL',
        desc: 'Présence boucle W1',
      },
      {
        code: 'I_BCL_W2',
        src: 'IN-04',
        type: 'BOOL',
        desc: 'Présence boucle W2',
      },
      {
        code: 'I_BCL_N1',
        src: 'IN-05',
        type: 'BOOL',
        desc: 'Présence boucle N1',
      },
      {
        code: 'I_BCL_S1',
        src: 'IN-06',
        type: 'BOOL',
        desc: 'Présence boucle S1',
      },
      {
        code: 'I_BP_P1',
        src: 'IN-07',
        type: 'BOOL imp.',
        desc: 'Appel piéton P-NS',
      },
      {
        code: 'I_BP_P2',
        src: 'IN-08',
        type: 'BOOL imp.',
        desc: 'Appel piéton P-EW',
      },
      {
        code: 'I_BP_P3',
        src: 'IN-09',
        type: 'BOOL imp.',
        desc: 'Appel piéton P-NS2',
      },
      {
        code: 'I_BP_P4',
        src: 'IN-10',
        type: 'BOOL imp.',
        desc: 'Appel piéton P-EW2',
      },
      {
        code: 'I_SEL_MAN',
        src: 'IN-11',
        type: 'BOOL',
        desc: 'Sélecteur manuel armoire',
      },
      {
        code: 'I_WDG_RET',
        src: 'IN-12',
        type: 'BOOL',
        desc: 'Retour watchdog',
      },
    ],
  });

  const diaserOutputs = table({
    caption: '14.2 — Variables de sortie DIASER (O_*)',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'dst', label: 'Destination', align: 'center' },
      { key: 'type', label: 'Type', align: 'center' },
      { key: 'desc', label: 'Description' },
    ],
    rows: [
      {
        code: 'O_V1_*',
        dst: 'OUT-01..03',
        type: 'BOOL',
        desc: 'Feu V1 (Rouge / Jaune / Vert)',
      },
      {
        code: 'O_V2_*',
        dst: 'OUT-04..06',
        type: 'BOOL',
        desc: 'Feu V2 (R / J / V + flèche gauche)',
      },
      { code: 'O_V3_*', dst: 'OUT-07..09', type: 'BOOL', desc: 'Feu V3' },
      { code: 'O_V4_*', dst: 'OUT-10..12', type: 'BOOL', desc: 'Feu V4' },
      { code: 'O_V5_*', dst: 'OUT-13..15', type: 'BOOL', desc: 'Feu V5' },
      {
        code: 'O_V6_*',
        dst: 'OUT-16',
        type: 'BYTE',
        desc: 'Feu V6 multiplexé',
      },
      { code: 'O_P1_*', dst: 'OUT-17..18', type: 'BOOL', desc: 'Piéton P1' },
      { code: 'O_P2_*', dst: 'OUT-19..20', type: 'BOOL', desc: 'Piéton P2' },
      {
        code: 'O_DEF',
        dst: 'OUT-21',
        type: 'BOOL',
        desc: 'Retour défaut centrale',
      },
      {
        code: 'O_MAN_VOY',
        dst: 'OUT-22',
        type: 'BOOL',
        desc: 'Voyant manuel armé',
      },
      { code: 'O_TEST', dst: 'OUT-23', type: 'BOOL', desc: 'Test lampes' },
    ],
  });

  const diaserInternal = table({
    caption: '14.3 — Variables internes (V_*)',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'type', label: 'Type', align: 'center' },
      { key: 'desc', label: 'Description' },
    ],
    rows: [
      {
        code: 'V_PHASE_ACT',
        type: 'INT',
        desc: 'Numéro de phase en cours (1, 2, 3, ou 0 = transition)',
      },
      {
        code: 'V_VERT_RESTANT',
        type: 'INT',
        desc: 'Temps de vert restant (s)',
      },
      {
        code: 'V_CYCLE_NUM',
        type: 'INT',
        desc: 'Numéro de cycle depuis dernier reset',
      },
      {
        code: 'V_PLAN_ACTIF',
        type: 'STRING',
        desc: 'Code plan actif (HC / HPM / HPS / HM / MAN / URG / DGR)',
      },
      {
        code: 'V_DEMANDE_PIE',
        type: 'BITMAP',
        desc: 'Bitmap d’appels piétons (P1..P4)',
      },
      {
        code: 'V_OVERRIDE_ID',
        type: 'UUID',
        desc: 'ID d’override en cours, null si automatique',
      },
    ],
  });

  const diaserCommands = table({
    caption: '14.4 — Variables de commande (C_*)',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'type', label: 'Type', align: 'center' },
      { key: 'desc', label: 'Description' },
    ],
    rows: [
      {
        code: 'C_FORCE_PHASE',
        type: 'INT',
        desc: 'Force phase 1, 2 ou 3 (interphase incluse)',
      },
      { code: 'C_PROLONG', type: 'INT', desc: 'Prolongation en secondes' },
      { code: 'C_LIBERE', type: 'BOOL', desc: 'Libère l’override courant' },
      {
        code: 'C_BASCULE_PLAN',
        type: 'STRING',
        desc: 'Bascule de plan (HPM/HPS/HC/HM)',
      },
      {
        code: 'C_TEST_LAMPES',
        type: 'BOOL',
        desc: 'Lance un cycle de test des lampes',
      },
    ],
  });

  const diaserStatus = table({
    caption: '14.5 — Variables d’état (S_*) — diffusées vers le backend',
    columns: [
      { key: 'code', label: 'Code', align: 'center' },
      { key: 'type', label: 'Type', align: 'center' },
      { key: 'periode', label: 'Période', align: 'center' },
      { key: 'desc', label: 'Description' },
    ],
    rows: [
      {
        code: 'S_HEARTBEAT',
        type: 'TIMESTAMP',
        periode: '1 s',
        desc: 'Date du dernier heartbeat',
      },
      {
        code: 'S_PHASE_HISTO',
        type: 'ARRAY[10]',
        periode: 'sur évènement',
        desc: 'Historique des 10 dernières transitions',
      },
      {
        code: 'S_DEFAUTS',
        type: 'BITMAP',
        periode: 'sur évènement',
        desc: 'Bitmap des défauts actifs (lampe, boucle, watchdog)',
      },
      {
        code: 'S_TELEMETRIE',
        type: 'OBJECT',
        periode: '5 s',
        desc: 'File, débit, saturation par branche',
      },
    ],
  });

  return blocks(
    h(2, '7.1 Affectation des entrées contrôleur'),
    inputsTable,
    h(2, '7.2 Affectation des sorties contrôleur'),
    outputsTable,
    h(1, '14. Affectation DIASER / variables API'),
    p(
      'L’organisation des variables suit la convention DIASER (Description Intégrée des Asservissements Signalisation Et Régulation) adaptée au modèle STLS, avec une mappe directe vers les variables API du backend.',
    ),
    diaserInputs,
    diaserOutputs,
    diaserInternal,
    diaserCommands,
    diaserStatus,
    note(
      'Toutes les variables S_* sont transmises au backend STLS via l’API REST + WebSocket, et conservées en base pour l’apprentissage des agents IA.',
    ),
  );
}

// ---------------------------------------------------------------
// §9.4 Matrice de conflit
// ---------------------------------------------------------------

export function matriceConflit(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  const phases = context.intersection?.phases ?? [];

  // Real catalog data ? render a matrix derived from
  // `conflictingPhaseSequenceNumbers`.
  if (phases.length > 0) {
    const seqList = phases
      .map((phase) => phase.sequenceNumber)
      .sort((a, b) => a - b);
    const matrix = seqList.map((row) => {
      const phase = phases.find((entry) => entry.sequenceNumber === row);
      const conflicts = new Set(phase?.conflictingPhaseSequenceNumbers ?? []);
      const cells: Record<string, string | number> = { phase: `Ph.${row}` };
      for (const col of seqList) {
        cells[`p${col}`] = col === row ? '–' : conflicts.has(col) ? '✕' : '●';
      }
      return cells;
    });
    return blocks(
      p(
        `La matrice ci-dessous est dérivée des ${phases.length} phase(s) déclarée(s) dans le catalogue STLS pour ce carrefour. Lecture : ✕ = phases incompatibles (jamais simultanées), ● = phases compatibles, – = sans objet.`,
      ),
      table({
        caption: 'Matrice de conflit (catalogue)',
        columns: [
          { key: 'phase', label: '', align: 'center' },
          ...seqList.map((col) => ({
            key: `p${col}`,
            label: `Ph.${col}`,
            align: 'center' as const,
          })),
        ],
        rows: matrix,
      }),
    );
  }

  // Pas de phases catalogue → matrice prescrite.
  return blocks(
    p(
      'Lecture : ✕ = phases incompatibles (jamais simultanées), ● = phases compatibles, – = sans objet.',
    ),
    table({
      caption:
        'Matrice de conflit prescriptive — gabarit 3 phases véhicules + 2 phases piétons',
      columns: [
        { key: 'phase', label: '', align: 'center' },
        { key: 'p1', label: 'Ph.1', align: 'center' },
        { key: 'p2', label: 'Ph.2', align: 'center' },
        { key: 'p3', label: 'Ph.3', align: 'center' },
        { key: 'pEW', label: 'P-EW', align: 'center' },
        { key: 'pNS', label: 'P-NS', align: 'center' },
      ],
      rows: [
        { phase: 'Ph.1', p1: '–', p2: '✕', p3: '✕', pEW: '●', pNS: '✕' },
        { phase: 'Ph.2', p1: '✕', p2: '–', p3: '✕', pEW: '✕', pNS: '✕' },
        { phase: 'Ph.3', p1: '✕', p2: '✕', p3: '–', pEW: '✕', pNS: '●' },
        { phase: 'P-EW', p1: '●', p2: '✕', p3: '✕', pEW: '–', pNS: '✕' },
        { phase: 'P-NS', p1: '✕', p2: '✕', p3: '●', pEW: '✕', pNS: '–' },
      ],
    }),
    note(
      'Référence légende : Ph.1 = E + W tout droit + droite (avec P-EW concomitant), Ph.2 = E + W tourne-à-gauche (protégé), Ph.3 = N + S tout droit + droite (avec P-NS concomitant).',
    ),
  );
}

// ---------------------------------------------------------------
// §9.2 Tableau de dégagement
// ---------------------------------------------------------------

export function tableauDegagement(
  _context: EtudeGenerationContext,
): EtudeStructuredContent {
  void _context;
  return blocks(
    p(
      'Les temps de dégagement (jaune + rouge intégral) garantissent l’évacuation complète des véhicules engagés à la vitesse de référence de 50 km/h, en tenant compte de la longueur la plus défavorable du carrefour.',
    ),
    table({
      caption: 'Tableau de dégagement entre phases',
      columns: [
        { key: 'transition', label: 'Transition', align: 'center' },
        { key: 'jaune', label: 'Jaune (s)', align: 'right' },
        { key: 'allRed', label: 'All-red (s)', align: 'right' },
        { key: 'total', label: 'Total interphase (s)', align: 'right' },
      ],
      rows: [
        { transition: 'Ph.1 → Ph.2', jaune: 3, allRed: 2, total: 5 },
        { transition: 'Ph.2 → Ph.3', jaune: 3, allRed: 2, total: 5 },
        { transition: 'Ph.3 → Ph.1', jaune: 3, allRed: 2, total: 5 },
      ],
    }),
    note(
      'Vérification : 12.5 m / (50 km/h ÷ 3.6) = 0.9 s effectif. La valeur retenue de 2 s d’all-red offre une marge de sécurité confortable.',
    ),
  );
}

// ---------------------------------------------------------------
// §9.1 + §9.3 + §9.5 Phasage
// ---------------------------------------------------------------

export function phasage(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  const phases = context.intersection?.phases ?? [];
  const phasesTable = phases.length
    ? table({
        caption: 'Phases déclarées au catalogue',
        columns: [
          { key: 'seq', label: '#', align: 'center' },
          { key: 'name', label: 'Nom' },
          { key: 'approche', label: 'Approche' },
          { key: 'type', label: 'Type', align: 'center' },
          { key: 'min', label: 'Vert min (s)', align: 'right' },
          { key: 'jaune', label: 'Jaune (s)', align: 'right' },
          { key: 'red', label: 'All-red (s)', align: 'right' },
        ],
        rows: phases
          .slice()
          .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
          .map((phase) => ({
            seq: phase.sequenceNumber,
            name: phase.name,
            approche: phase.approach,
            type: phase.phaseType,
            min: phase.minGreenSeconds,
            jaune: phase.yellowSeconds,
            red: phase.redClearanceSeconds,
          })),
      })
    : table({
        caption: '9.1 — Définition des phases (gabarit)',
        columns: [
          { key: 'phase', label: 'Phase', align: 'center' },
          { key: 'vp', label: 'Mouvements véhicules' },
          { key: 'pie', label: 'Mouvements piétons concomitants' },
        ],
        rows: [
          {
            phase: 'Phase 1',
            vp: 'E + W tout droit + droite',
            pie: 'P-EW + P-EW2 (vert piéton)',
          },
          { phase: 'Phase 2', vp: 'E + W tourne-à-gauche (protégé)', pie: '—' },
          {
            phase: 'Phase 3',
            vp: 'N + S tout droit + droite',
            pie: 'P-NS + P-NS2 (vert piéton)',
          },
        ],
      });

  return blocks(
    h(2, '9.1 Définition des phases'),
    p(
      phases.length
        ? `Le catalogue STLS référence ${phases.length} phase(s) pour ce carrefour. Le tableau ci-dessous reprend leurs paramètres temporels.`
        : 'Le carrefour comporte 3 phases véhicules et 2 phases piétons concomitantes. Les phases véhicules conflictuelles sont séparées par une interphase complète (jaune + all-red).',
    ),
    phasesTable,
    h(2, '9.3 Temps de vert mini / maxi'),
    table({
      caption: 'Plages temporelles par phase',
      columns: [
        { key: 'phase', label: 'Phase', align: 'center' },
        { key: 'min', label: 'Vert min (s)', align: 'right' },
        { key: 'max', label: 'Vert max (s)', align: 'right' },
        { key: 'hc', label: 'Recommandé HC (s)', align: 'right' },
        { key: 'hpm', label: 'Recommandé HPM (s)', align: 'right' },
      ],
      rows: [
        { phase: 'Phase 1', min: 18, max: 50, hc: 32, hpm: 45 },
        { phase: 'Phase 2', min: 8, max: 25, hc: 12, hpm: 18 },
        { phase: 'Phase 3', min: 14, max: 40, hc: 26, hpm: 35 },
      ],
    }),
    h(2, '9.5 Règles de sécurité'),
    list([
      'Jamais deux phases véhicules conflictuelles allumées en vert simultanément.',
      'Vert piéton interdit conjointement à une phase véhicule traversant le passage piéton concerné.',
      'Tout passage entre deux phases conflictuelles passe obligatoirement par l’interphase complète (jaune + all-red).',
      'En cas d’incohérence détectée (deux verts conflictuels), bascule clignotant orange et alerte critique.',
    ]),
  );
}

// ---------------------------------------------------------------
// Placeholders polis (dossier-style) pour les sections restantes
// ---------------------------------------------------------------

export function microRegulation(
  _context: EtudeGenerationContext,
): EtudeStructuredContent {
  void _context;
  return blocks(
    h(2, '12.1 Prolongation de vert'),
    p(
      'Une phase peut être prolongée tant que (i) une boucle de présence est active dans la voie concernée, (ii) le vert courant est strictement inférieur au vert maximum, et (iii) aucun appel piéton ne fait passer le temps d’attente piéton au-delà de la consigne (60 s en HPM, 45 s en HC).',
    ),
    p(
      'Pas d’incrément : 2 s par activation de boucle, jusqu’au plafond `maxGreen`.',
    ),
    h(2, '12.2 Raccourcissement de vert'),
    list([
      'Aucune activation de boucle pendant 4 s consécutives sur les voies concernées, ET',
      'Vert minimum déjà dépassé, ET',
      'Au moins un appel piéton ou véhicule en attente sur une autre branche.',
    ]),
    h(2, '12.3 Conditions d’application des commandes IA'),
    table({
      caption: 'Grille de validation pour une recommandation agent',
      columns: [
        { key: 'check', label: 'Vérification' },
        { key: 'critere', label: 'Critère' },
      ],
      rows: [
        {
          check: 'Authentification',
          critere: 'Décision portée par un agent enregistré (ID + horodatage)',
        },
        {
          check: 'Périmètre',
          critere: 'Scope de la décision ⊆ scope du carrefour',
        },
        {
          check: 'Cohérence matrice',
          critere: 'Phase recommandée ∈ matrice de conflit §9.4',
        },
        {
          check: 'Borne temporelle',
          critere: 'Durée recommandée ∈ [vert_min, vert_max] de la phase',
        },
        {
          check: 'Verrou opérateur',
          critere: 'Aucun mode `manual` ou `emergency` actif',
        },
        {
          check: 'Disponibilité contrôleur',
          critere: 'connectionState ≠ offline',
        },
        {
          check: 'Fenêtre TTL',
          critere: 'Commande appliquée dans les 30 s suivant émission',
        },
      ],
    }),
    h(2, '12.4 Contraintes de sécurité non négociables'),
    list([
      'Vert minimum véhicule : 8 s (jamais raccourci, même sur commande IA ou opérateur).',
      'Vert piéton minimum : dimensionné sur 1.0 m/s + 4 s d’avertissement clignotant.',
      'Interphase complète obligatoire entre toute paire de phases conflictuelles.',
      'Pas de saut de phase autorisé entre deux phases véhicules sans passage par all-red.',
    ]),
  );
}

export function planFeux(
  context: EtudeGenerationContext,
  variant: 'hpm' | 'hps' | 'hc' | 'hm',
): EtudeStructuredContent {
  const variantLabel = {
    hpm: 'Heure de Pointe Matin (HPM)',
    hps: 'Heure de Pointe Soir (HPS)',
    hc: 'Heures Creuses (HC)',
    hm: 'Heures de Mi-journée (HM)',
  }[variant];
  const cycle = {
    hpm: 120,
    hps: 120,
    hc: 90,
    hm: 100,
  }[variant];
  const splits = {
    hpm: { p1: 45, p2: 18, p3: 35 },
    hps: { p1: 42, p2: 18, p3: 38 },
    hc: { p1: 32, p2: 12, p3: 26 },
    hm: { p1: 36, p2: 14, p3: 30 },
  }[variant];

  // Si un plan terrain existe, on l’affiche en complément.
  const catalogPlan = context.intersection?.timingPlans.find((plan) =>
    plan.code.toLowerCase().includes(variant),
  );

  return blocks(
    p(
      `Plan de feux dédié au créneau ${variantLabel}. Les valeurs ci-dessous sont nominales et adaptables ±20 % par le mode adaptatif.`,
    ),
    table({
      caption: `Paramètres plan ${variant.toUpperCase()}`,
      columns: [
        { key: 'param', label: 'Paramètre' },
        { key: 'val', label: 'Valeur', align: 'right' },
      ],
      rows: [
        { param: 'Durée cycle', val: `${cycle} s` },
        { param: 'Vert Phase 1 (E/W TD)', val: `${splits.p1} s` },
        { param: 'Vert Phase 2 (E/W gauche)', val: `${splits.p2} s` },
        { param: 'Vert Phase 3 (N/S)', val: `${splits.p3} s` },
        { param: 'Interphase (×3)', val: '5 s chacune' },
        { param: 'Offset', val: `${catalogPlan?.offsetSeconds ?? 0} s` },
      ],
    }),
    catalogPlan
      ? note(
          `Plan catalogue détecté (${catalogPlan.code} — ${catalogPlan.name}, statut ${catalogPlan.status}). Cycle déclaré : ${catalogPlan.cycleLengthSeconds} s.`,
        )
      : note(
          'Aucun plan correspondant déclaré au catalogue. Les valeurs ci-dessus sont prescriptives et seront éditables après recette terrain.',
        ),
  );
}

export function fonctionnementsManuels(
  _context: EtudeGenerationContext,
): EtudeStructuredContent {
  void _context;
  return blocks(
    h(2, '13.1 Sélection manuelle de phase (police)'),
    p(
      'L’opérateur dispose des actions suivantes depuis le panneau "Operator Control" du dashboard. Toute action est inscrite en audit avec auteur, durée et motif.',
    ),
    table({
      caption: 'Actions opérateur disponibles',
      columns: [
        { key: 'action', label: 'Action', align: 'center' },
        { key: 'effet', label: 'Effet' },
        { key: 'audit', label: 'Audit' },
      ],
      rows: [
        {
          action: 'Force phase ph-1',
          effet: 'Bascule en Phase 1 (E/W tout droit) après interphase',
          audit: 'override-command',
        },
        {
          action: 'Force phase ph-2',
          effet: 'Bascule en Phase 2 (E/W gauche) après interphase',
          audit: 'override-command',
        },
        {
          action: 'Force phase ph-3',
          effet: 'Bascule en Phase 3 (N/S) après interphase',
          audit: 'override-command',
        },
        {
          action: 'Force green',
          effet: 'Vert sur direction désignée pour 30 s par défaut',
          audit: 'override-command + motif',
        },
        {
          action: 'Release override',
          effet: 'Libère le contrôle manuel ; reprise progressive du mode auto',
          audit: 'release-override',
        },
      ],
    }),
    h(2, '13.2 Couloir d’urgence'),
    p(
      'Activable par opérateur autorisé (permission `emergency.override`) ou par l’agent IA `EmergencyVehicleAgent`. Force le vert sur la branche désignée, durée bornée 60 s maximum. Une notification est diffusée à toute la chaîne de supervision.',
    ),
    h(2, '13.3 Comportement de repli'),
    table({
      caption: 'Comportements en cas d’évènement particulier',
      columns: [
        { key: 'event', label: 'Évènement' },
        { key: 'behavior', label: 'Comportement' },
      ],
      rows: [
        {
          event: 'Perte télécommande > 30 s',
          behavior: 'Reprise du dernier plan automatique sain',
        },
        {
          event: 'Refus d’override par le contrôleur',
          behavior: 'Retour mode adaptatif + alerte critique opérateur',
        },
        {
          event: 'Override expiré (TTL atteint)',
          behavior: 'Retour automatique au plan en cours, journalisation',
        },
        {
          event: 'Conflit détecté en run-time',
          behavior: 'Bascule clignotant orange, alerte critique, blocage auto',
        },
      ],
    }),
  );
}

export function affectationSigfer(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  if (context.etude.scope !== 'tram') {
    return blocks(
      note(
        'Section non applicable au présent indice (scope standard). Conservée vide pour évolution éventuelle vers un scope tramway.',
      ),
    );
  }
  return blocks(
    p(
      'Affectation des entrées et codes SigFer pour la gestion de la priorité tramway. Les codes ci-dessous sont à confirmer avec le gestionnaire de la ligne TC.',
    ),
    table({
      caption: 'Codes SigFer attendus',
      columns: [
        { key: 'code', label: 'Code SigFer', align: 'center' },
        { key: 'evt', label: 'Évènement' },
        { key: 'action', label: 'Action contrôleur' },
      ],
      rows: [
        {
          code: 'AT-IN',
          evt: 'Annonce entrée tramway',
          action: 'Verrouille la phase tram en cours, prépare la phase TC',
        },
        {
          code: 'AT-OUT',
          evt: 'Annonce sortie tramway',
          action: 'Libère la phase TC, reprise du cycle nominal',
        },
      ],
    }),
    note('Compléter la liste avec les codes spécifiques au site.'),
  );
}

export function cahierRecettes(
  _context: EtudeGenerationContext,
): EtudeStructuredContent {
  void _context;
  return blocks(
    p(
      'Procédures de recette à exécuter à l’issue des travaux et avant mise en service du carrefour.',
    ),
    h(2, 'Recette équipement'),
    list([
      'Vérification des connexions électriques et de la mise à la terre (< 5 Ω).',
      'Test individuel de chaque ligne de feux (test lampes via OUT-23).',
      'Vérification de la signature des firmware contrôleur et runtime.',
      'Vérification du watchdog et du repli automatique.',
    ]),
    h(2, 'Recette fonctionnelle'),
    list([
      'Exécution d’un cycle complet sur chaque plan (HC / HPM / HPS / HM).',
      'Test de chacun des boutons-poussoirs piétons (appel + retour visuel).',
      'Test de chaque détecteur véhicule (prolongation de vert observée).',
      'Test de bascule manuelle police + retour automatique.',
      'Test d’override d’urgence depuis le dashboard + reprise.',
      'Test de perte secteur (bascule clignotant orange autonome).',
      'Test de perte réseau backend (fallback offline du runtime).',
    ]),
    h(2, 'PV de recette'),
    p(
      'À l’issue des essais, signature conjointe du PV par le maître d’œuvre, l’entrepreneur et le maître d’ouvrage. Tout point bloquant fait l’objet d’une reprise avant mise en service.',
    ),
  );
}

export function annexes(
  context: EtudeGenerationContext,
): EtudeStructuredContent {
  const ctrl = primaryController(context.intersection);
  const equipmentRows: Array<Record<string, string | number>> = [
    {
      element: 'Contrôleur de feux',
      ref: ctrl?.controllerType
        ? `${ctrl.controllerType.toUpperCase()} ${ctrl.code} (firmware ${ctrl.firmwareVersion})`
        : 'ATC (firmware à valider)',
      qty: 1,
      loc: 'Armoire trottoir',
    },
    { element: 'Carte E/S TOR', ref: 'ATC-IO-24', qty: 1, loc: 'Armoire' },
    {
      element: 'Hôte controller-runtime',
      ref: 'Raspberry Pi 4 8 Go ou PC industriel équivalent',
      qty: 1,
      loc: 'Armoire',
    },
    {
      element: 'Relais de puissance SSR',
      ref: 'Finder 39.61 ou éq.',
      qty: 24,
      loc: 'Fond armoire',
    },
    {
      element: 'Feux véhicules tricolores',
      ref: 'LED 230 V Ø200',
      qty: 6,
      loc: 'Potences + mâts',
    },
    {
      element: 'Feux piétons',
      ref: 'LED 230 V Ø200 + module sonore PMR',
      qty: 4,
      loc: 'Mâts piétons',
    },
    {
      element: 'Boucles inductives',
      ref: 'Cuivre émaillé 1.5 mm², 1.5 × 2.0 m, 3 tours scellées résine',
      qty: 6,
      loc: 'Chaussée',
    },
    {
      element: 'Boutons-poussoirs piétons',
      ref: 'BP NF illuminé',
      qty: 4,
      loc: 'Mâts piétons',
    },
    {
      element: 'Onduleur (UPS)',
      ref: '1500 VA on-line, autonomie ≥ 30 min',
      qty: 1,
      loc: 'Armoire',
    },
    {
      element: 'Disjoncteur tête',
      ref: '32 A courbe C + différentiel 30 mA',
      qty: 1,
      loc: 'Armoire',
    },
    {
      element: 'Switch industriel',
      ref: '8 ports + 1 SFP, -40 °C / +75 °C',
      qty: 1,
      loc: 'Armoire',
    },
    {
      element: 'Modem 4G de secours',
      ref: 'Selon offre opérateur, tunnel WireGuard',
      qty: 1,
      loc: 'Armoire',
    },
    {
      element: 'Mise à la terre',
      ref: 'Piquets cuivre 1.5 m, < 5 Ω',
      qty: 2,
      loc: 'Pied armoire',
    },
  ];

  return blocks(
    h(2, 'Annexe A — Architecture système STLS'),
    p(
      'Architecture distribuée : Dashboard Next.js (supervision) → Backend NestJS (API + agents IA) → Controller-runtime Go (on-site) → Contrôleur de feux. Les communications entre le backend et le runtime sont signées HMAC SHA-256 ; le runtime conserve un fallback offline avec dernier plan validé.',
    ),
    h(2, 'Annexe B — Équipements'),
    table({
      caption: 'Nomenclature des équipements',
      columns: [
        { key: 'element', label: 'Élément' },
        { key: 'ref', label: 'Référence / Caractéristiques' },
        { key: 'qty', label: 'Quantité', align: 'right' },
        { key: 'loc', label: 'Localisation' },
      ],
      rows: equipmentRows,
    }),
    h(2, 'Annexe C — Conditions environnementales'),
    table({
      caption: 'Conditions de fonctionnement attendues',
      columns: [
        { key: 'param', label: 'Paramètre' },
        { key: 'val', label: 'Plage', align: 'right' },
      ],
      rows: [
        { param: 'Température armoire', val: '−10 °C à +50 °C' },
        { param: 'Humidité relative', val: '≤ 95 % sans condensation' },
        { param: 'Tenue IP armoire', val: 'IP54' },
        { param: 'Tenue IK', val: 'IK10' },
        { param: 'Plage tension secteur', val: '187 – 253 V AC' },
      ],
    }),
    placeholder(
      'Schéma armoire',
      'Schéma armoire détaillé (DXF + nomenclature) à insérer.',
      `dossiers/${carrefourCode(context)}/armoire.dxf`,
    ),
  );
}

// ---------------------------------------------------------------
// Aiguillage central — appelé par OfflineEtudeGenerator
// ---------------------------------------------------------------

export interface DossierSectionEnvelope {
  content: EtudeStructuredContent;
  source: string;
  rationale: string;
}

export function dossierFor(
  sectionId: string,
  context: EtudeGenerationContext,
): DossierSectionEnvelope {
  const source = 'offline:dossier-v1';
  switch (sectionId) {
    case 'plan_de_situation':
      return {
        content: planDeSituation(context),
        source,
        rationale:
          'Synthèse §3 du dossier de régulation à partir des métadonnées catalogue.',
      };
    case 'presentation_carrefour':
      return {
        content: presentationCarrefour(context),
        source,
        rationale:
          'Synthèse §4 + §5 (géométrie, voies, traversées, détection) à partir des données catalogue.',
      };
    case 'matrice_conflit':
      return {
        content: matriceConflit(context),
        source,
        rationale:
          'Matrice §9.4 dérivée des phases catalogue, sinon gabarit 3 phases prescrit.',
      };
    case 'tableau_degagement':
      return {
        content: tableauDegagement(context),
        source,
        rationale:
          'Tableau de dégagement §9.2 — interphases dimensionnées à 50 km/h.',
      };
    case 'micro_regulation':
      return {
        content: microRegulation(context),
        source,
        rationale:
          'Règles §12 de prolongation/raccourcissement et grille de validation IA.',
      };
    case 'phasage':
      return {
        content: phasage(context),
        source,
        rationale:
          'Phasage §9 — définition, plages temporelles, règles de sécurité.',
      };
    case 'fonctionnements_manuels':
      return {
        content: fonctionnementsManuels(context),
        source,
        rationale:
          'Modes manuels §13 — actions opérateur, couloir d’urgence, repli.',
      };
    case 'affectation_lignes_de_feux':
      return {
        content: affectationLignesDeFeux(context),
        source,
        rationale: 'Mapping lignes de feux §7.3.',
      };
    case 'affectation_entrees_diaser':
      return {
        content: affectationEntreesDiaser(context),
        source,
        rationale:
          'Affectation entrées/sorties contrôleur §7.1 + §7.2 + variables DIASER §14.',
      };
    case 'affectation_entrees_sigfer':
      return {
        content: affectationSigfer(context),
        source,
        rationale:
          context.etude.scope === 'tram'
            ? 'Affectation SigFer pour gestion priorité tramway.'
            : 'Section non applicable au scope standard.',
      };
    case 'plan_feux_hpm':
      return {
        content: planFeux(context, 'hpm'),
        source,
        rationale:
          'Plan de feux HPM §11.2 — cycle 120 s avec coordination corridor.',
      };
    case 'plan_feux_hps':
      return {
        content: planFeux(context, 'hps'),
        source,
        rationale: 'Plan de feux HPS — cycle 120 s avec poids axe principal.',
      };
    case 'plan_feux_hc':
      return {
        content: planFeux(context, 'hc'),
        source,
        rationale:
          'Plan de feux HC §8.2 — cycle 90 s, plan de référence recette.',
      };
    case 'plan_feux_hm':
      return {
        content: planFeux(context, 'hm'),
        source,
        rationale: 'Plan de feux HM — cycle 100 s intermédiaire.',
      };
    case 'cahier_recettes':
      return {
        content: cahierRecettes(context),
        source,
        rationale: 'Cahier de recettes — équipements + fonctionnel + PV.',
      };
    case 'annexes':
      return {
        content: annexes(context),
        source,
        rationale:
          'Annexes — architecture système, nomenclature équipements, conditions environnementales.',
      };
    default:
      return {
        content: blocks(
          note(`Section non couverte par le moteur offline : ${sectionId}.`),
        ),
        source,
        rationale: 'Section sans gabarit dédié.',
      };
  }
}

// silence unused-import warning if a section never uses a helper
export const _internal: ReadonlyArray<EtudeContentBlock> = [];

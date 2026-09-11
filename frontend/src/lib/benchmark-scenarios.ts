/**
 * Benchmark engineering scenarios for the AI Engineering Assistant.
 *
 * These are real Moroccan urban intersections chosen to stress-test
 * the full pipeline: OSM extraction, geometry interpretation,
 * topology classification, conflict analysis, proposal engine,
 * tramway/SigFer logic, pedestrian/refuge logic, corridor
 * coordination and adaptive strategy.
 *
 * Coordinates are approximate (~50 m) — close enough for OSM
 * Overpass to return the right road network; the engineer can
 * fine-tune by clicking on the satellite map.
 *
 * The flagship scenario is intentionally extreme so the AI should
 * surface uncertainty, degradation, and engineering warnings —
 * that is the expected, desired behaviour.
 */

import type { IntersectionShape, ScopeKind } from "./ai-engineering-api";

export type BenchmarkDifficulty =
  | "simple"
  | "medium"
  | "advanced"
  | "tramway"
  | "multi-branch"
  | "flagship";

export type BenchmarkCategory =
  | "crossroad"
  | "tramway"
  | "boulevard"
  | "roundabout"
  | "multi-branch"
  | "corridor";

export interface BenchmarkScenario {
  id: string;
  title: string;
  city: "Casablanca" | "Rabat" | "Temara";
  difficulty: BenchmarkDifficulty;
  category: BenchmarkCategory;
  // Pre-filled study form values:
  name: string;
  district: string;
  address?: string;
  latitude: number;
  longitude: number;
  scope: ScopeKind;
  shapeHint?: IntersectionShape;
  notes: string;
  // Engineering metadata (for the picker UI + later eval):
  challenges: string[];
}

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  // -------------------------------------------------------------
  // SIMPLE — baseline regression tests.
  // -------------------------------------------------------------
  {
    id: "simple-temara-quartier",
    title: "Carrefour résidentiel · Temara Centre",
    city: "Temara",
    difficulty: "simple",
    category: "crossroad",
    name: "Av. Hay Andalous × Rue de Marrakech",
    district: "Hay Andalous",
    latitude: 33.9276,
    longitude: -6.9135,
    scope: "standard",
    shapeHint: "cruciform",
    notes:
      "Carrefour résidentiel calme — référence simple pour valider le mode bas-trafic. Demande piétonne sporadique, pas de bus.",
    challenges: ["bas trafic", "asymétrie modérée", "demande piétonne sporadique"],
  },

  // -------------------------------------------------------------
  // MEDIUM — typical urban work.
  // -------------------------------------------------------------
  {
    id: "medium-temara-boulevard",
    title: "Av. Hassan II × Av. Mohamed VI · Temara",
    city: "Temara",
    difficulty: "medium",
    category: "boulevard",
    name: "Av. Hassan II × Av. Mohamed VI",
    district: "Centre",
    latitude: 33.9282,
    longitude: -6.9118,
    scope: "standard",
    shapeHint: "cruciform",
    notes:
      "Carrefour de boulevard urbain — flux directionnels asymétriques (radiale entrante forte le matin), traversées piétonnes structurantes, présence de taxis.",
    challenges: [
      "asymétrie horaire",
      "taxis stationnés",
      "TAG gauche modéré",
      "exposition piétonne moyenne",
    ],
  },
  {
    id: "medium-casa-anfa",
    title: "Bd d'Anfa × Bd Zerktouni · Casablanca",
    city: "Casablanca",
    difficulty: "medium",
    category: "boulevard",
    name: "Bd d'Anfa × Bd Zerktouni",
    district: "Anfa",
    latitude: 33.5876,
    longitude: -7.6332,
    scope: "standard",
    shapeHint: "cruciform",
    notes:
      "Croisement de boulevards en quartier d'affaires — 2 axes 2×2 voies, fortes pointes matin/soir, demande de tourne-à-gauche soutenue.",
    challenges: [
      "double 2×2 voies",
      "TAG soutenu sur les 4 branches",
      "coordination corridor souhaitable",
    ],
  },

  // -------------------------------------------------------------
  // ADVANCED — bigger boulevard crossings + skew.
  // -------------------------------------------------------------
  {
    id: "advanced-rabat-bab-rouah",
    title: "Bab Rouah · Rabat",
    city: "Rabat",
    difficulty: "advanced",
    category: "multi-branch",
    name: "Place Bab Rouah",
    district: "Hassan",
    latitude: 34.0058,
    longitude: -6.84,
    scope: "standard",
    shapeHint: "plaza",
    notes:
      "Place historique multi-branches au pied des remparts almohades — 5+ branches asymétriques, flux radial entrant fort, traversées piétonnes longues, présence touristique.",
    challenges: [
      "5+ branches",
      "géométrie asymétrique",
      "traversées longues",
      "demande piétonne hétérogène",
      "remontée de file possible",
    ],
  },
  {
    id: "advanced-casa-sidi-maarouf",
    title: "Rond-point Sidi Maârouf · Casablanca",
    city: "Casablanca",
    difficulty: "advanced",
    category: "roundabout",
    name: "Rond-point Sidi Maârouf",
    district: "Sidi Maârouf",
    latitude: 33.531,
    longitude: -7.628,
    scope: "standard",
    shapeHint: "mini-roundabout",
    notes:
      "Giratoire d'entrée d'autoroute saturé — fort trafic VL + PL, demande pendulaire massive, écoulement giratoire défaillant en HP. Candidat à signalisation partielle / metering.",
    challenges: [
      "saturation HP",
      "PL fréquents",
      "metering possible",
      "remontée de file vers autoroute",
    ],
  },

  // -------------------------------------------------------------
  // TRAMWAY — SigFer + priority logic.
  // -------------------------------------------------------------
  {
    id: "tramway-casa-mers-sultan",
    title: "Bd Mers Sultan × Bd Hassan II · Casablanca (T1)",
    city: "Casablanca",
    difficulty: "tramway",
    category: "tramway",
    name: "Bd Mers Sultan × Bd Hassan II",
    district: "Mers Sultan",
    latitude: 33.5849,
    longitude: -7.6112,
    scope: "tram",
    shapeHint: "cruciform",
    notes:
      "Carrefour avec voie de tramway T1 en site propre — priorité TC via SigFer AT-IN/AT-OUT obligatoire, phases véhicules à neutraliser à l'approche du tram.",
    challenges: [
      "tramway site propre",
      "SigFer AT-IN/AT-OUT",
      "neutralisation phase VL",
      "exposition piétonne forte",
    ],
  },
  {
    id: "tramway-rabat-pietri",
    title: "Place Pietri · Rabat (T2)",
    city: "Rabat",
    difficulty: "tramway",
    category: "tramway",
    name: "Place Pietri / Av. Mohammed V",
    district: "Hassan",
    latitude: 34.0179,
    longitude: -6.8344,
    scope: "tram",
    shapeHint: "plaza",
    notes:
      "Place urbaine traversée par la ligne T2 — 5 branches, traversées multiples, demande piétonne très forte (axe administratif), interférences taxi / arrêt bus.",
    challenges: [
      "tramway T2",
      "5 branches",
      "piétons très exposés",
      "arrêts bus à proximité",
      "interférence taxi",
    ],
  },

  // -------------------------------------------------------------
  // FLAGSHIP — the reference stress test.
  // -------------------------------------------------------------
  {
    id: "flagship-casa-place-nations-unies",
    title:
      "★ Place des Nations Unies · Casablanca — flagship",
    city: "Casablanca",
    difficulty: "flagship",
    category: "multi-branch",
    name: "Place des Nations Unies",
    district: "Centre-ville",
    address: "Bd Mohammed V × Av. Hassan II × Av. des FAR × Bd Houphouët-Boigny",
    latitude: 33.5933,
    longitude: -7.6181,
    scope: "tram",
    shapeHint: "plaza",
    notes:
      "Scénario benchmark de référence : place urbaine majeure de Casablanca au point de convergence de 6+ axes, traversée par la ligne T1 du tramway, fort trafic bus (gare routière proche), exposition piétonne extrême (médina, marché central), demande de tourne-à-gauche cumulée, taxis blancs en attente, hiérarchie de boulevards asymétrique, coordination de corridor obligatoire avec Bd Mohammed V. L'IA doit produire une réponse engineering crédible MAIS avec incertitudes affichées, contraintes critiques signalées et stratégie adaptative recommandée.",
    challenges: [
      "★ 6+ branches asymétriques",
      "★ tramway T1 + priorité SigFer",
      "★ piétons critiques (médina + marché)",
      "★ bus + taxis en interférence",
      "★ TAG cumulés sur 3 axes",
      "★ coordination corridor obligatoire",
      "★ remontée de file longue vers Bd Mohammed V",
      "★ stratégie adaptative requise",
      "★ refuges piétons indispensables",
    ],
  },
];

export function getBenchmarksByDifficulty(): Record<
  BenchmarkDifficulty,
  BenchmarkScenario[]
> {
  const out: Record<BenchmarkDifficulty, BenchmarkScenario[]> = {
    simple: [],
    medium: [],
    advanced: [],
    tramway: [],
    "multi-branch": [],
    flagship: [],
  };
  for (const s of BENCHMARK_SCENARIOS) {
    out[s.difficulty].push(s);
  }
  return out;
}

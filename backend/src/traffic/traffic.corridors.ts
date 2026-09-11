import { carfmapTagIndex } from '../database/seed-data';
import type {
  CorridorSnapshot,
  IntersectionSnapshot,
  ScenarioId,
  TrafficFlowState,
} from './traffic.types';

interface CorridorDefinition {
  id: string;
  label: string;
  intersectionIds: string[];
}

// Corridor definitions are derived directly from the carfmap tag set
// (Tram T3, T4, BHNS L5/L6, …) so every tagged carrefour is rendered
// as part of its corridor without anyone having to maintain a hand-
// curated id list.  The first time `buildCorridors` runs it ranks the
// carrefours west→east; corridor membership is otherwise data-driven.
const corridorDefinitions: CorridorDefinition[] = [
  {
    id: 'cor-tram-t3',
    label: 'Tramway — Ligne T3',
    intersectionIds: carfmapTagIndex.get('T3') ?? [],
  },
  {
    id: 'cor-tram-t4',
    label: 'Tramway — Ligne T4',
    intersectionIds: carfmapTagIndex.get('T4') ?? [],
  },
  {
    id: 'cor-bhns-l5',
    label: 'BHNS — Ligne L5',
    intersectionIds: carfmapTagIndex.get('L5') ?? [],
  },
  {
    id: 'cor-bhns-l6',
    label: 'BHNS — Ligne L6',
    intersectionIds: carfmapTagIndex.get('L6') ?? [],
  },
  {
    id: 'cor-zerktouni',
    label: 'Axe Zerktouni',
    intersectionIds: carfmapTagIndex.get('Zerktouni') ?? [],
  },
];

const scenarioBiasByCode: Record<ScenarioId, number> = {
  normal_traffic: -4,
  peak_traffic: 8,
  emergency: 12,
};

export function buildCorridors(
  intersections: IntersectionSnapshot[],
  activeScenario: ScenarioId,
): CorridorSnapshot[] {
  const intersectionsById = new Map(
    intersections.map((intersection) => [intersection.id, intersection]),
  );

  return corridorDefinitions
    .map((corridorDefinition) => {
      const points = corridorDefinition.intersectionIds
        .map((intersectionId) => intersectionsById.get(intersectionId))
        .filter((intersection): intersection is IntersectionSnapshot =>
          Boolean(intersection),
        )
        // Order west→east so the rendered polyline traces the line of
        // intersections instead of zig-zagging in tag-iteration order.
        .sort((a, b) => a.location.lng - b.location.lng);

      if (points.length < 2) {
        return null;
      }

      const averageQueue =
        points.reduce((sum, point) => sum + point.queueLength, 0) /
        points.length;
      const averageDelay =
        points.reduce((sum, point) => sum + point.averageDelaySeconds, 0) /
        points.length;
      const pressureScore =
        averageQueue + averageDelay / 6 + scenarioBiasByCode[activeScenario];
      const state = deriveCorridorState(pressureScore);

      return {
        id: corridorDefinition.id,
        label: corridorDefinition.label,
        state,
        volumeKph: clamp(
          Math.round(54 - pressureScore + (state === 'smooth' ? 6 : 0)),
          10,
          58,
        ),
        travelTimeMinutes: clamp(
          Math.round(6 + averageDelay / 10 + (state === 'congestion' ? 5 : 0)),
          5,
          22,
        ),
        path: points.map((point) => point.location),
      };
    })
    .filter((corridor): corridor is CorridorSnapshot => Boolean(corridor));
}

function deriveCorridorState(score: number): TrafficFlowState {
  if (score >= 34) {
    return 'congestion';
  }

  if (score >= 20) {
    return 'pressure';
  }

  return 'smooth';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

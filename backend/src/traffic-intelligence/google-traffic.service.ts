import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import appConfig from '../config/app.config';
import type { IntersectionSnapshot } from '../traffic/traffic.types';
import type {
  GoogleTrafficCorridor,
  GoogleTrafficSnapshot,
} from './traffic-intelligence.types';

/**
 * Wraps Google's Distance Matrix API to estimate live traffic pressure
 * around an intersection. Every public method is safe to call without
 * a key — it returns a `fallback`/`disabled` snapshot so the caller
 * never has to branch on "do I have an API key today?".
 */
@Injectable()
export class GoogleTrafficService {
  private readonly logger = new Logger(GoogleTrafficService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  get hasKey(): boolean {
    return Boolean(this.config.googleMapsApiKey);
  }

  async snapshotForIntersection(
    intersection: IntersectionSnapshot | null,
    intersectionId: string,
  ): Promise<GoogleTrafficSnapshot> {
    const capturedAt = new Date().toISOString();
    if (!intersection) {
      return {
        intersectionId,
        capturedAt,
        source: 'fallback',
        corridors: [],
        note: 'Intersection not found in snapshot — traffic context unavailable.',
      };
    }

    if (!this.hasKey) {
      return {
        intersectionId,
        capturedAt,
        source: 'disabled',
        corridors: this.heuristicCorridors(intersection),
        note: 'GOOGLE_MAPS_API_KEY not configured — returning heuristic context.',
      };
    }

    try {
      const corridors = await this.queryLiveCorridors(intersection);
      return {
        intersectionId,
        capturedAt,
        source: 'google',
        corridors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Google traffic lookup failed for ${intersectionId}: ${message}`,
      );
      return {
        intersectionId,
        capturedAt,
        source: 'fallback',
        corridors: this.heuristicCorridors(intersection),
        note: `Google traffic API error — heuristic context used (${message}).`,
      };
    }
  }

  private async queryLiveCorridors(
    intersection: IntersectionSnapshot,
  ): Promise<GoogleTrafficCorridor[]> {
    const apiKey = this.config.googleMapsApiKey;
    if (!apiKey) {
      // Defensive — the caller already checks hasKey but the type
      // system still needs to see the guard.
      throw new Error('GOOGLE_MAPS_API_KEY missing');
    }

    // Probe four short straight-line corridors around the intersection
    // (~500 m north/east/south/west). Google's Distance Matrix returns
    // a `duration_in_traffic` for each, which gives us a crude
    // per-approach pressure signal we can feed to the AI.
    const offsetDeg = 0.004; // roughly 450 m at Casablanca latitude
    const origin = `${intersection.location.lat},${intersection.location.lng}`;
    const destinations = [
      {
        label: 'N',
        lat: intersection.location.lat + offsetDeg,
        lng: intersection.location.lng,
      },
      {
        label: 'E',
        lat: intersection.location.lat,
        lng: intersection.location.lng + offsetDeg,
      },
      {
        label: 'S',
        lat: intersection.location.lat - offsetDeg,
        lng: intersection.location.lng,
      },
      {
        label: 'W',
        lat: intersection.location.lat,
        lng: intersection.location.lng - offsetDeg,
      },
    ];

    const destParam = destinations.map((d) => `${d.lat},${d.lng}`).join('|');
    const url = new URL(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
    );
    url.searchParams.set('origins', origin);
    url.searchParams.set('destinations', destParam);
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('traffic_model', 'best_guess');
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`distance-matrix HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      status?: string;
      rows?: Array<{
        elements?: Array<{
          status?: string;
          duration?: { value?: number };
          duration_in_traffic?: { value?: number };
        }>;
      }>;
    };
    if (payload.status && payload.status !== 'OK') {
      throw new Error(`distance-matrix status ${payload.status}`);
    }

    const elements = payload.rows?.[0]?.elements ?? [];
    const corridors: GoogleTrafficCorridor[] = [];
    for (let i = 0; i < destinations.length; i += 1) {
      const dest = destinations[i];
      const element = elements[i];
      const duration = element?.duration?.value;
      const durationInTraffic =
        element?.duration_in_traffic?.value ?? duration ?? 0;
      if (element?.status !== 'OK' || !duration) {
        corridors.push({
          label: dest.label,
          durationSeconds: 0,
          durationInTrafficSeconds: 0,
          delayFactor: 1,
          congestionLevel: 'free',
        });
        continue;
      }
      const delayFactor = duration > 0 ? durationInTraffic / duration : 1;
      corridors.push({
        label: dest.label,
        durationSeconds: duration,
        durationInTrafficSeconds: durationInTraffic,
        delayFactor,
        congestionLevel: classifyDelay(delayFactor),
      });
    }
    return corridors;
  }

  private heuristicCorridors(
    intersection: IntersectionSnapshot,
  ): GoogleTrafficCorridor[] {
    // Fall back to internal metrics: bigger queues / worse status map
    // to heavier congestion on each synthetic corridor.
    const base = Math.max(1, intersection.averageDelaySeconds / 20);
    const statusBoost =
      intersection.status === 'critical'
        ? 1.6
        : intersection.status === 'watch'
          ? 1.25
          : 1.0;
    const delayFactor = Math.min(3, base * statusBoost);
    const congestion = classifyDelay(delayFactor);
    return (['N', 'E', 'S', 'W'] as const).map((label) => ({
      label,
      durationSeconds: 60,
      durationInTrafficSeconds: Math.round(60 * delayFactor),
      delayFactor,
      congestionLevel: congestion,
    }));
  }
}

function classifyDelay(
  factor: number,
): GoogleTrafficCorridor['congestionLevel'] {
  if (factor < 1.15) return 'free';
  if (factor < 1.4) return 'light';
  if (factor < 1.8) return 'moderate';
  if (factor < 2.5) return 'heavy';
  return 'severe';
}

import { Injectable } from '@nestjs/common';

import type { GeoPoint } from './agent-visualization.types';

/**
 * External "ambient" signals the anticipation agent layers on top of
 * its internal forecast: special events (matches, concerts) and
 * weather. These are the only two causes that need a data source the
 * platform does not own yet.
 *
 * Until a real event calendar / weather feed is wired, this provider
 * returns a deliberately small, clearly-flagged HEURISTIC: a match/
 * event watch for the big football cities on weekend or late evenings,
 * mirroring the placeholder the frontend used to compute client-side.
 * No weather signal is fabricated — `weather` stays null so the agent
 * simply never attributes weather until a feed exists.
 *
 * Replace the body of `getSignals` with a real integration and flip
 * `source` to 'live'; the agent code does not need to change.
 */

export type SpecialEventCategory = 'sports' | 'concert' | 'public' | 'other';

export interface SpecialEventSignal {
  id: string;
  title: string;
  venue?: string;
  category: SpecialEventCategory;
  location: GeoPoint;
  startsAt: string;
  endsAt?: string;
  /** How much extra demand this event is expected to add, 0..1. */
  expectedImpact: number;
}

export type WeatherCondition =
  | 'clear'
  | 'rain'
  | 'heavy_rain'
  | 'fog'
  | 'snow';

export interface WeatherSignal {
  condition: WeatherCondition;
  description: string;
  impact: 'none' | 'minor' | 'major';
}

export interface ContextSignals {
  events: SpecialEventSignal[];
  weather: WeatherSignal | null;
  /** 'heuristic' = synthesised here; 'live' = real feed. */
  source: 'heuristic' | 'live';
}

export interface ContextSignalsInput {
  cityId: string;
  cityName: string;
  now: Date;
  /** Map centre used to place a synthesised event marker. */
  center?: GeoPoint | null;
}

const EVENT_CITY_KEYS = ['casablanca', 'rabat'];

@Injectable()
export class ContextSignalsProvider {
  // eslint-disable-next-line @typescript-eslint/require-await -- async to keep the contract stable when a real feed is wired.
  async getSignals(input: ContextSignalsInput): Promise<ContextSignals> {
    const events = this.heuristicEvents(input);
    return { events, weather: null, source: 'heuristic' };
  }

  /**
   * Stand-in event watch. Fires only for the big football cities on
   * Friday/Saturday or weekday evenings — the windows where a stadium
   * event most plausibly reshapes demand. Clearly synthetic: no team,
   * stadium, or kickoff time, because we have no calendar yet.
   */
  private heuristicEvents(input: ContextSignalsInput): SpecialEventSignal[] {
    const { cityName, now, center } = input;
    if (!center) return [];

    const cityKey = cityName.toLowerCase();
    const isEventCity = EVENT_CITY_KEYS.some((key) => cityKey.includes(key));
    if (!isEventCity) return [];

    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();
    const weekendEvening = (day === 5 || day === 6) && hour >= 17 && hour < 23;
    const weekdayEvening = day >= 1 && day <= 4 && hour >= 19 && hour < 23;
    if (!weekendEvening && !weekdayEvening) return [];

    return [
      {
        id: `event-watch-${cityKey}`,
        title: 'Veille événement / match',
        category: 'sports',
        // Offset slightly from centre so it does not stack on a node.
        location: { lat: center.lat + 0.012, lng: center.lng + 0.022 },
        startsAt: now.toISOString(),
        expectedImpact: weekendEvening ? 0.6 : 0.4,
      },
    ];
  }
}

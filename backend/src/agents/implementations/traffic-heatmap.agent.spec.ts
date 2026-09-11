import type { IntersectionsService } from '../../intersections/intersections.service';
import type { RoadLinksService } from '../../road-links/road-links.service';
import {
  makeContext,
  makeHotspot,
  makeScopeSnapshot,
} from '../__tests__/agent-test-helpers';
import type { HeatmapPayload } from '../agent-visualization.types';
import { TrafficHeatmapAgent } from './traffic-heatmap.agent';

function stubIntersections(
  rows: Array<{ code: string; latitude: number; longitude: number }>,
): IntersectionsService {
  return {
    list: jest.fn(async () => rows),
  } as unknown as IntersectionsService;
}

function stubRoadLinks(rows: unknown[]): RoadLinksService {
  return {
    list: jest.fn(async () => rows),
  } as unknown as RoadLinksService;
}

describe('TrafficHeatmapAgent', () => {
  describe('metadata', () => {
    it('runs at city/zone scope with priority 70', () => {
      const agent = new TrafficHeatmapAgent(
        stubIntersections([]),
        stubRoadLinks([]),
      );
      expect(agent.id).toBe('traffic-heatmap');
      expect(agent.type).toBe('visualization');
      expect(agent.scopes).toEqual(['city', 'zone']);
      expect(agent.priority).toBe(70);
    });
  });

  it('builds heat points for hotspots that have coordinates', async () => {
    const agent = new TrafficHeatmapAgent(
      stubIntersections([
        { code: 'INT-CAS-002', latitude: 33.59, longitude: -7.61 },
      ]),
      stubRoadLinks([]),
    );
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        hotspots: [
          makeHotspot({
            intersectionId: 'INT-CAS-002',
            trafficState: 'congestion',
            saturationForecast: 1.05,
            queueLengthForecast: 160,
            delaySecondsForecast: 95,
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const payload = decision?.payload as unknown as HeatmapPayload;

    expect(decision?.kind).toBe('heatmap');
    expect(decision?.severity).toBe('warning');
    expect(payload.pointCount).toBe(1);
    expect(payload.points[0].location).toEqual({ lat: 33.59, lng: -7.61 });
    expect(payload.points[0].intensity).toBeGreaterThan(0.5);
    expect(payload.hottest?.intersectionId).toBe('INT-CAS-002');
  });

  it('drops hotspots with no matching coordinates', async () => {
    const agent = new TrafficHeatmapAgent(
      stubIntersections([]), // directory empty → no coordinates
      stubRoadLinks([]),
    );
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        hotspots: [makeHotspot({ intersectionId: 'INT-CAS-002' })],
      }),
    });

    const decision = await agent.run(context);
    const payload = decision?.payload as unknown as HeatmapPayload;

    expect(payload.pointCount).toBe(0);
    expect(decision?.severity).toBe('info');
  });

  it('builds a road-link segment when at least one endpoint is a hotspot', async () => {
    const agent = new TrafficHeatmapAgent(
      stubIntersections([
        { code: 'A', latitude: 33.6, longitude: -7.6 },
        { code: 'B', latitude: 33.61, longitude: -7.59 },
      ]),
      stubRoadLinks([
        {
          id: 'link-1',
          fromIntersectionId: 'A',
          toIntersectionId: 'B',
          fromLat: 33.6,
          fromLng: -7.6,
          toLat: 33.61,
          toLng: -7.59,
          queueSpillbackRisk: 0.5,
          distanceMetres: 400,
        },
      ]),
    );
    const context = makeContext({
      scope: 'city',
      scopeRef: 'city-001',
      scopeSnapshot: makeScopeSnapshot({
        hotspots: [
          makeHotspot({
            intersectionId: 'A',
            trafficState: 'pressure',
            saturationForecast: 0.8,
            queueLengthForecast: 90,
            delaySecondsForecast: 50,
          }),
        ],
      }),
    });

    const decision = await agent.run(context);
    const payload = decision?.payload as unknown as HeatmapPayload;

    expect(payload.segmentCount).toBe(1);
    expect(payload.segments[0].fromIntersectionId).toBe('A');
    expect(payload.segments[0].intensity).toBeGreaterThan(0);
    expect(decision?.severity).toBe('advisory');
  });
});

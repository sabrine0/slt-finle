import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CitiesService, type CityView } from '../cities/cities.service';
import { TopologyReferenceService } from '../cities/topology-reference.service';
import {
  CarrefourEntity,
  PredictionSnapshotEntity,
} from '../database/entities';
import {
  IntersectionsService,
  type IntersectionView,
} from '../intersections/intersections.service';
import { IntersectionRuntimeService } from '../intersection-runtime/intersection-runtime.service';
import {
  PredictionMetricsService,
  type AggregatedTrafficMetrics,
  type IntersectionTrafficMetrics,
} from '../prediction/prediction-metrics.service';
import { PredictionService } from '../prediction/prediction.service';
import {
  normalizePredictionHorizon,
  type PredictionHorizon,
} from '../prediction/prediction.dto';
import { ZonesService, type ZoneView } from '../zones/zones.service';

const DEFAULT_SCOPE_TARGET_CAP = 24;
const QUEUE_METRES_PER_VEHICLE = 6.5;

interface ScopeSignalSummary {
  scopeRef: string;
  incidentCount: number;
  averageDelaySeconds: number;
  tone: 'healthy' | 'watch' | 'critical';
  intersectionCount: number;
}

interface RuntimeSignalSummary {
  modeOverride: string | null;
  manualOverride: boolean;
  forcedPhaseId: string | null;
}

interface EnrichedHotspotRow {
  intersection: IntersectionView;
  metrics: IntersectionTrafficMetrics;
  trafficState: 'smooth' | 'pressure' | 'congestion';
  horizon: PredictionHorizon;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  reasons: string[];
}

export interface ScopePredictionHotspot {
  intersectionId: string;
  label: string;
  district: string;
  equipmentStatus: string;
  trafficState: 'smooth' | 'pressure' | 'congestion';
  horizon: PredictionHorizon;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  metrics: IntersectionTrafficMetrics;
}

export interface ScopePredictionSnapshotView {
  id: string;
  scopeType: 'city' | 'zone';
  scopeRef: string;
  label: string;
  horizon: PredictionHorizon;
  generatedAt: string;
  nodeCount: number;
  averageSaturation: number | null;
  totalQueueMetres: number | null;
  averageDelaySeconds: number | null;
  averageConfidence: number | null;
  congestionLevel: 'smooth' | 'pressure' | 'congestion';
  aggregatedMetrics: AggregatedTrafficMetrics;
  hotspots: ScopePredictionHotspot[];
}

export interface IntersectionPredictionSnapshotView {
  scopeType: 'intersection';
  intersectionId: string;
  carrefourId: string;
  label: string;
  district: string;
  equipmentStatus: string;
  horizon: PredictionHorizon;
  generatedAt: string;
  trafficState: 'smooth' | 'pressure' | 'congestion';
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  metrics: IntersectionTrafficMetrics;
}

@Injectable()
export class PredictionSnapshotsService {
  constructor(
    @InjectRepository(PredictionSnapshotEntity)
    private readonly snapshotRepository: Repository<PredictionSnapshotEntity>,
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    private readonly intersectionsService: IntersectionsService,
    private readonly predictionService: PredictionService,
    private readonly metricsService: PredictionMetricsService,
    private readonly citiesService: CitiesService,
    private readonly zonesService: ZonesService,
    private readonly intersectionRuntime: IntersectionRuntimeService,
    private readonly topology: TopologyReferenceService,
  ) {}

  async getCitySnapshot(
    cityId: string,
    horizon: PredictionHorizon = 'H+15',
  ): Promise<ScopePredictionSnapshotView> {
    const normalizedHorizon = normalizePredictionHorizon(horizon) ?? 'H+15';
    const city = this.topology.findCity(cityId);
    if (!city) {
      throw new NotFoundException(`City "${cityId}" not found.`);
    }
    const intersections = await this.intersectionsService.list({ cityId });
    const citySummary = await this.findCitySummary(cityId);
    return this.buildAndPersistScopeSnapshot(
      'city',
      cityId,
      city.name,
      intersections,
      normalizedHorizon,
      citySummary,
    );
  }

  async getZoneSnapshot(
    zoneId: string,
    horizon: PredictionHorizon = 'H+15',
  ): Promise<ScopePredictionSnapshotView> {
    const normalizedHorizon = normalizePredictionHorizon(horizon) ?? 'H+15';
    const zone = this.topology.findZone(zoneId);
    if (!zone) {
      throw new NotFoundException(`Zone "${zoneId}" not found.`);
    }
    const intersections = await this.intersectionsService.list({ zoneId });
    const zoneSummary = await this.findZoneSummary(zoneId);
    return this.buildAndPersistScopeSnapshot(
      'zone',
      zoneId,
      zone.name,
      intersections,
      normalizedHorizon,
      zoneSummary,
    );
  }

  async getIntersectionSnapshot(
    intersectionCode: string,
    horizon: PredictionHorizon = 'H+15',
  ): Promise<IntersectionPredictionSnapshotView> {
    const normalizedHorizon = normalizePredictionHorizon(horizon) ?? 'H+15';
    const intersections = await this.intersectionsService.list();
    const intersection = intersections.find(
      (entry) =>
        entry.code === intersectionCode || entry.id === intersectionCode,
    );
    if (!intersection) {
      throw new NotFoundException(
        `Intersection "${intersectionCode}" not found.`,
      );
    }
    const carrefourMap = await this.loadCarrefourMap();
    const carrefour = carrefourMap.get(intersection.code);
    if (!carrefour) {
      throw new NotFoundException(
        `No carrefour mapped to intersection "${intersection.code}".`,
      );
    }

    const [prediction, metrics] = await Promise.all([
      this.predictionService.run(carrefour.id, normalizedHorizon),
      this.metricsService.computeForCarrefour(carrefour.id, intersection.code),
    ]);
    const forecast =
      prediction.forecasts.find((entry) => entry.horizon === normalizedHorizon) ??
      prediction.forecasts[0];
    if (!forecast) {
      throw new NotFoundException(
        `Prediction unavailable for intersection "${intersection.code}".`,
      );
    }

    const persisted = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        scopeType: 'intersection',
        scopeRef: intersection.code,
        label: intersection.name,
        horizon: normalizedHorizon,
        nodeCount: 1,
        averageSaturation: forecast.saturationForecast,
        totalQueueMetres: forecast.queueLengthForecast,
        averageDelaySeconds: forecast.delaySecondsForecast,
        averageConfidence: forecast.confidence,
        congestionLevel: saturationToFlowState(forecast.saturationForecast),
        metrics: { metrics, forecast },
        generatedAt: new Date(),
      }),
    );

    return {
      scopeType: 'intersection',
      intersectionId: intersection.code,
      carrefourId: carrefour.id,
      label: intersection.name,
      district: intersection.district,
      equipmentStatus: resolveEquipmentStatus(intersection),
      horizon: forecast.horizon,
      generatedAt: persisted.generatedAt.toISOString(),
      trafficState: saturationToFlowState(forecast.saturationForecast),
      saturationForecast: forecast.saturationForecast,
      queueLengthForecast: forecast.queueLengthForecast,
      delaySecondsForecast: forecast.delaySecondsForecast,
      confidence: forecast.confidence,
      metrics,
    };
  }

  async listLatest(
    scopeType?: 'city' | 'zone',
    scopeRef?: string,
    horizon?: PredictionHorizon,
  ): Promise<ScopePredictionSnapshotView[]> {
    const query = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .orderBy('snapshot.generatedAt', 'DESC')
      .take(100);

    if (scopeType) {
      query.andWhere('snapshot.scopeType = :scopeType', { scopeType });
    }
    if (scopeRef) {
      query.andWhere('snapshot.scopeRef = :scopeRef', { scopeRef });
    }
    if (horizon) {
      query.andWhere('snapshot.horizon = :horizon', { horizon });
    }

    const rows = await query.getMany();
    return rows
      .filter((row) => row.scopeType === 'city' || row.scopeType === 'zone')
      .map((row) => this.toView(row));
  }

  private async buildAndPersistScopeSnapshot(
    scopeType: 'city' | 'zone',
    scopeRef: string,
    label: string,
    intersections: IntersectionView[],
    horizon: PredictionHorizon,
    scopeSummary: ScopeSignalSummary | null,
  ): Promise<ScopePredictionSnapshotView> {
    const carrefourByIntersectionCode = await this.loadCarrefourMap();
    const targets = intersections
      .slice()
      .sort((left, right) => {
        const scoreDelta =
          scoreIntersectionOperationalPressure(right) -
          scoreIntersectionOperationalPressure(left);
        if (scoreDelta !== 0) return scoreDelta;
        return left.code.localeCompare(right.code);
      })
      .map((intersection) => ({
        intersection,
        carrefour: carrefourByIntersectionCode.get(intersection.code) ?? null,
      }))
      .filter(
        (
          item,
        ): item is {
          intersection: IntersectionView;
          carrefour: CarrefourEntity;
        } => item.carrefour != null,
      )
      .slice(0, DEFAULT_SCOPE_TARGET_CAP);

    const rows = await Promise.all(
      targets.map(async ({ intersection, carrefour }) => {
        const runtimeSignals = this.readRuntimeSignals(intersection.code);
        const [prediction, metrics] = await Promise.all([
          this.predictionService.run(carrefour.id, horizon),
          this.metricsService.computeForCarrefour(
            carrefour.id,
            intersection.code,
          ),
        ]);
        const forecast =
          prediction.forecasts.find((entry) => entry.horizon === horizon) ??
          prediction.forecasts[0];
        if (!forecast) return null;
        return this.enrichForecast(
          intersection,
          metrics,
          forecast,
          scopeSummary,
          runtimeSignals,
        );
      }),
    );

    const enrichedRows = rows.filter(
      (row): row is EnrichedHotspotRow => row != null,
    );
    const hotspots: ScopePredictionHotspot[] = enrichedRows
      .map((row) => ({
        intersectionId: row.intersection.code,
        label: row.intersection.name,
        district: row.intersection.district,
        equipmentStatus: resolveEquipmentStatus(row.intersection),
        trafficState: row.trafficState,
        horizon: row.horizon,
        saturationForecast: row.saturationForecast,
        queueLengthForecast: row.queueLengthForecast,
        delaySecondsForecast: row.delaySecondsForecast,
        confidence: row.confidence,
        metrics: row.metrics,
      }))
      .sort((left, right) => {
        const rightScore = hotspotUrgencyScore(right);
        const leftScore = hotspotUrgencyScore(left);
        return rightScore - leftScore;
      });

    const aggregatedMetrics = this.buildAggregatedMetrics(
      hotspots,
      enrichedRows,
      intersections,
      scopeSummary,
    );

    const averageSaturation =
      hotspots.length > 0
        ? Number(
            (
              hotspots.reduce((acc, item) => acc + item.saturationForecast, 0) /
              hotspots.length
            ).toFixed(3),
          )
        : deriveScopeSaturation(scopeSummary, aggregatedMetrics);
    const totalQueueMetres =
      hotspots.length > 0
        ? Math.round(
            hotspots.reduce((acc, item) => acc + item.queueLengthForecast, 0),
          )
        : aggregatedMetrics.totalQueueLengthMetres;
    const averageDelaySeconds =
      hotspots.length > 0
        ? Math.round(
            hotspots.reduce((acc, item) => acc + item.delaySecondsForecast, 0) /
              hotspots.length,
          )
        : aggregatedMetrics.averageDelaySeconds;
    const averageConfidence =
      hotspots.length > 0
        ? Number(
            (
              hotspots.reduce((acc, item) => acc + item.confidence, 0) /
              hotspots.length
            ).toFixed(3),
          )
        : aggregatedMetrics.averageConfidence;
    const congestionLevel = deriveScopeCongestionLevel(
      averageSaturation,
      averageDelaySeconds,
      scopeSummary,
    );

    const saved = await this.snapshotRepository.save(
      this.snapshotRepository.create({
        scopeType,
        scopeRef,
        label,
        horizon,
        nodeCount: intersections.length,
        averageSaturation,
        totalQueueMetres,
        averageDelaySeconds,
        averageConfidence,
        congestionLevel,
        metrics: {
          hotspots,
          aggregatedMetrics,
          scopeSignals: scopeSummary,
        },
        generatedAt: new Date(),
      }),
    );

    return this.toView(saved);
  }

  private async findCitySummary(
    cityId: string,
  ): Promise<ScopeSignalSummary | null> {
    const cities = await this.citiesService.list();
    const city = cities.find((entry) => entry.id === cityId);
    return city ? toScopeSignalSummary(city) : null;
  }

  private async findZoneSummary(
    zoneId: string,
  ): Promise<ScopeSignalSummary | null> {
    const zones = await this.zonesService.list();
    const zone = zones.find((entry) => entry.id === zoneId);
    return zone ? toScopeSignalSummary(zone) : null;
  }

  private readRuntimeSignals(
    intersectionCode: string,
  ): RuntimeSignalSummary | null {
    try {
      const runtime = this.intersectionRuntime.getState(intersectionCode);
      return {
        modeOverride: runtime.commands.modeOverride,
        manualOverride: runtime.commands.manualOverride,
        forcedPhaseId: runtime.commands.forcedPhaseId,
      };
    } catch {
      return null;
    }
  }

  private enrichForecast(
    intersection: IntersectionView,
    metrics: IntersectionTrafficMetrics,
    forecast: {
      horizon: PredictionHorizon;
      saturationForecast: number;
      queueLengthForecast: number;
      delaySecondsForecast: number;
      confidence: number;
      notes: string[];
    },
    scopeSummary: ScopeSignalSummary | null,
    runtimeSignals: RuntimeSignalSummary | null,
  ): EnrichedHotspotRow {
    const scopePressure = scoreScopeSummary(scopeSummary);
    const intersectionPressure =
      scoreIntersectionOperationalPressure(intersection);
    const runtimePressure = scoreRuntimePressure(runtimeSignals);
    const totalPressure = clamp(
      scopePressure + intersectionPressure + runtimePressure,
      0,
      0.95,
    );

    const saturationForecast = clamp(
      forecast.saturationForecast + totalPressure,
      0,
      1.5,
    );
    const queueLengthForecast = Math.round(
      forecast.queueLengthForecast * (1 + totalPressure * 1.4) +
        intersection.queueLength * (1 + scopePressure),
    );
    const delaySecondsForecast = Math.round(
      forecast.delaySecondsForecast +
        intersection.averageDelaySeconds * 0.6 +
        (scopeSummary?.averageDelaySeconds ?? 0) * 0.2 +
        intersection.incidents * 18 +
        runtimeDelayPenalty(runtimeSignals),
    );
    const confidence = clamp(
      forecast.confidence +
        (metrics.observationCount > 0 ? 0.03 : 0) +
        (intersection.incidents > 0 ? 0.04 : 0) +
        (scopeSummary?.incidentCount
          ? Math.min(0.05, scopeSummary.incidentCount * 0.01)
          : 0),
      0.45,
      0.95,
    );

    return {
      intersection,
      metrics,
      horizon: forecast.horizon,
      saturationForecast: Number(saturationForecast.toFixed(3)),
      queueLengthForecast,
      delaySecondsForecast,
      confidence: Number(confidence.toFixed(3)),
      trafficState: saturationToFlowState(saturationForecast),
      reasons: buildHotspotReasons(intersection, scopeSummary, runtimeSignals),
    };
  }

  private buildAggregatedMetrics(
    hotspots: ScopePredictionHotspot[],
    enrichedRows: EnrichedHotspotRow[],
    intersections: IntersectionView[],
    scopeSummary: ScopeSignalSummary | null,
  ): AggregatedTrafficMetrics {
    const aggregated = this.metricsService.aggregate(
      hotspots
        .map((hotspot) => hotspot.metrics)
        .filter((entry): entry is IntersectionTrafficMetrics => entry != null),
    );
    const totalQueueLengthMetres = Math.max(
      aggregated.totalQueueLengthMetres ?? 0,
      intersections.reduce(
        (sum, intersection) =>
          sum + intersection.queueLength * QUEUE_METRES_PER_VEHICLE,
        0,
      ),
    );
    const averageDelaySeconds = Math.max(
      aggregated.averageDelaySeconds ?? 0,
      averageOrZero(
        intersections.map((intersection) => intersection.averageDelaySeconds),
      ),
      scopeSummary?.averageDelaySeconds ?? 0,
    );
    const averageSaturation = Math.max(
      aggregated.averageSaturation ?? 0,
      averageOrZero(enrichedRows.map((row) => row.saturationForecast)),
      deriveScopeSaturation(scopeSummary, aggregated) ?? 0,
    );
    const averageConfidence =
      enrichedRows.length > 0
        ? Number(
            (
              enrichedRows.reduce((sum, row) => sum + row.confidence, 0) /
              enrichedRows.length
            ).toFixed(3),
          )
        : aggregated.averageConfidence;

    return {
      ...aggregated,
      totalQueueLengthMetres: Math.round(totalQueueLengthMetres),
      totalQueueLengthVehicles:
        totalQueueLengthMetres > 0
          ? Math.round(totalQueueLengthMetres / QUEUE_METRES_PER_VEHICLE)
          : null,
      averageDelaySeconds: Math.round(averageDelaySeconds),
      averageSaturation: Number(averageSaturation.toFixed(3)),
      averageConfidence,
      sampleCount: intersections.length,
    };
  }

  private async loadCarrefourMap() {
    const rows = await this.carrefourRepository.find({
      relations: { engineeringIntersection: true },
    });
    return new Map(
      rows
        .filter((row) => row.engineeringIntersection?.code)
        .map((row) => [row.engineeringIntersection!.code, row] as const),
    );
  }

  private toView(row: PredictionSnapshotEntity): ScopePredictionSnapshotView {
    const hotspotsRaw = Array.isArray(row.metrics?.['hotspots'])
      ? (row.metrics['hotspots'] as ScopePredictionHotspot[])
      : [];
    const aggregatedFromMetrics =
      (row.metrics?.['aggregatedMetrics'] as
        | AggregatedTrafficMetrics
        | undefined) ?? null;
    const aggregatedMetrics =
      aggregatedFromMetrics ??
      this.metricsService.aggregate(
        hotspotsRaw
          .map((hotspot) => hotspot.metrics)
          .filter(
            (entry): entry is IntersectionTrafficMetrics => entry != null,
          ),
      );

    return {
      id: row.id,
      scopeType: row.scopeType as 'city' | 'zone',
      scopeRef: row.scopeRef,
      label: row.label,
      horizon: row.horizon as PredictionHorizon,
      generatedAt: row.generatedAt.toISOString(),
      nodeCount: row.nodeCount,
      averageSaturation:
        row.averageSaturation != null ? Number(row.averageSaturation) : null,
      totalQueueMetres:
        row.totalQueueMetres != null ? Number(row.totalQueueMetres) : null,
      averageDelaySeconds:
        row.averageDelaySeconds != null
          ? Number(row.averageDelaySeconds)
          : null,
      averageConfidence:
        row.averageConfidence != null ? Number(row.averageConfidence) : null,
      congestionLevel: row.congestionLevel,
      aggregatedMetrics,
      hotspots: hotspotsRaw,
    };
  }
}

function toScopeSignalSummary(view: CityView | ZoneView): ScopeSignalSummary {
  return {
    scopeRef: view.id,
    incidentCount: view.incidentCount,
    averageDelaySeconds: view.averageDelaySeconds,
    tone: view.tone,
    intersectionCount: view.intersectionCount,
  };
}

function scoreScopeSummary(scopeSummary: ScopeSignalSummary | null) {
  if (!scopeSummary) return 0;
  let score = 0;
  score += Math.min(0.22, scopeSummary.incidentCount * 0.025);
  score += Math.min(0.22, scopeSummary.averageDelaySeconds / 420);
  if (scopeSummary.tone === 'critical') score += 0.18;
  else if (scopeSummary.tone === 'watch') score += 0.08;
  return score;
}

function scoreIntersectionOperationalPressure(intersection: IntersectionView) {
  let score = 0;
  score += Math.min(0.18, intersection.incidents * 0.06);
  score += Math.min(0.22, intersection.averageDelaySeconds / 520);
  score += Math.min(0.12, intersection.queueLength / 180);
  if (intersection.status === 'critical') score += 0.14;
  else if (intersection.status === 'watch') score += 0.06;
  if (
    intersection.controlMode === 'manual' ||
    intersection.controlMode === 'flash'
  ) {
    score += 0.08;
  }
  if (intersection.controllerConnectionState === 'offline') score += 0.12;
  else if (intersection.controllerConnectionState === 'degraded') score += 0.06;
  return score;
}

function scoreRuntimePressure(runtimeSignals: RuntimeSignalSummary | null) {
  if (!runtimeSignals) return 0;
  let score = 0;
  if (runtimeSignals.manualOverride) score += 0.08;
  if (runtimeSignals.forcedPhaseId) score += 0.05;
  if (runtimeSignals.modeOverride === 'emergency') score += 0.14;
  else if (runtimeSignals.modeOverride === 'fail-safe') score += 0.18;
  else if (runtimeSignals.modeOverride === 'flash') score += 0.1;
  return score;
}

function runtimeDelayPenalty(runtimeSignals: RuntimeSignalSummary | null) {
  if (!runtimeSignals) return 0;
  if (runtimeSignals.modeOverride === 'fail-safe') return 45;
  if (runtimeSignals.modeOverride === 'emergency') return 30;
  if (runtimeSignals.modeOverride === 'flash') return 20;
  if (runtimeSignals.manualOverride) return 12;
  return 0;
}

function buildHotspotReasons(
  intersection: IntersectionView,
  scopeSummary: ScopeSignalSummary | null,
  runtimeSignals: RuntimeSignalSummary | null,
) {
  const reasons: string[] = [];
  if (intersection.incidents > 0) {
    reasons.push(`${intersection.incidents} incident(s) actifs`);
  }
  if (intersection.averageDelaySeconds >= 60) {
    reasons.push(`${intersection.averageDelaySeconds}s de délai moyen`);
  }
  if (intersection.queueLength >= 12) {
    reasons.push(`${intersection.queueLength} véhicules en file`);
  }
  if (intersection.controllerConnectionState === 'offline') {
    reasons.push('contrôleur hors ligne');
  } else if (intersection.controllerConnectionState === 'degraded') {
    reasons.push('contrôleur dégradé');
  }
  if (
    runtimeSignals?.modeOverride &&
    runtimeSignals.modeOverride !== 'normal'
  ) {
    reasons.push(`mode runtime ${runtimeSignals.modeOverride}`);
  }
  if (scopeSummary?.incidentCount) {
    reasons.push(`${scopeSummary.incidentCount} incident(s) sur la zone`);
  }
  return reasons;
}

function hotspotUrgencyScore(hotspot: ScopePredictionHotspot) {
  return (
    hotspot.saturationForecast * 100 +
    hotspot.queueLengthForecast * 0.35 +
    hotspot.delaySecondsForecast +
    (hotspot.metrics.observationCount > 0 ? 6 : 0)
  );
}

function deriveScopeSaturation(
  scopeSummary: ScopeSignalSummary | null,
  aggregatedMetrics: AggregatedTrafficMetrics,
) {
  const baseline = aggregatedMetrics.averageSaturation ?? 0.55;
  const enriched = baseline + scoreScopeSummary(scopeSummary);
  return Number(clamp(enriched, 0, 1.5).toFixed(3));
}

function deriveScopeCongestionLevel(
  averageSaturation: number | null,
  averageDelaySeconds: number | null,
  scopeSummary: ScopeSignalSummary | null,
): 'smooth' | 'pressure' | 'congestion' {
  const saturation =
    averageSaturation ??
    deriveScopeSaturation(scopeSummary, {
      averageFlowVehiclesPerHour: null,
      averageDensityVehiclesPerKm: null,
      averageSpeedKph: null,
      totalQueueLengthMetres: null,
      totalQueueLengthVehicles: null,
      averageDelaySeconds: null,
      averageSaturation: null,
      averageConfidence: null,
      totalCapacityVehiclesPerHour: null,
      sampleCount: 0,
    });
  const delay = averageDelaySeconds ?? scopeSummary?.averageDelaySeconds ?? 0;
  if (scopeSummary?.tone === 'critical' || saturation >= 0.95 || delay >= 95) {
    return 'congestion';
  }
  if (scopeSummary?.tone === 'watch' || saturation >= 0.72 || delay >= 45) {
    return 'pressure';
  }
  return 'smooth';
}

function averageOrZero(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function saturationToFlowState(
  value: number,
): 'smooth' | 'pressure' | 'congestion' {
  if (value >= 0.95) return 'congestion';
  if (value >= 0.72) return 'pressure';
  return 'smooth';
}

function resolveEquipmentStatus(intersection: IntersectionView) {
  if (!intersection.controllerId) return 'Non spécifié';
  if (
    intersection.controlMode === 'flash' ||
    intersection.controlMode === 'manual'
  ) {
    return 'Non régulé';
  }
  if (intersection.controllerConnectionState === 'online') {
    return 'Équipé en service';
  }
  return 'Équipé hors service';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

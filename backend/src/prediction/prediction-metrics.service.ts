import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { TrafficObservationEntity } from '../database/entities';
import { CapacityEstimatorService } from '../traffic-analysis/capacity-estimator.service';
import { QueueEstimatorService } from '../traffic-analysis/queue-estimator.service';
import { SaturationEstimatorService } from '../traffic-analysis/saturation-estimator.service';

/**
 * Average bumper-to-bumper space a stopped vehicle occupies in the
 * queue: ~5 m vehicle + ~3 m gap. Used to convert queue metres into
 * an approximate vehicle count when the controller does not report
 * a vehicle count directly.
 */
const VEHICLE_LENGTH_METRES = 8;

/**
 * Sliding window we use to derive the "current" engineering metrics
 * from raw observations. One hour matches the unit of vehicles/hour,
 * keeps the sample large enough to be stable, and is short enough to
 * react to ramps/incidents within the next horizon.
 */
const OBSERVATION_WINDOW_MINUTES = 60;

const DEFAULT_CONFIDENCE = 0.6;
const FULL_CONFIDENCE = 0.85;

export interface IntersectionTrafficMetrics {
  /** Carrefour UUID. */
  carrefourId: string;
  /** Engineering intersection code (e.g. INT-CAS-001) when known. */
  intersectionCode: string | null;
  /** Demand: vehicles per hour (averaged over the observation window). */
  flowVehiclesPerHour: number | null;
  /** Density: vehicles per kilometre, derived from flow / averageSpeed. */
  densityVehiclesPerKm: number | null;
  /** Mean speed reported by detectors over the window (km/h). */
  averageSpeedKph: number | null;
  /** Total standing queue across all approaches (metres). */
  queueLengthMetres: number | null;
  /** Same queue expressed as an approximate vehicle count. */
  queueLengthVehicles: number | null;
  /** Average control delay for vehicles entering the intersection (s). */
  delaySeconds: number | null;
  /**
   * Saturation X of the CRITICAL (worst) approach = branch demand /
   * branch capacity. This is what governs whether the junction is
   * failing, so it drives congestion classification. Capped at 2.0.
   */
  saturation: number | null;
  /** Mean saturation across approaches — reporting only. */
  meanSaturation: number | null;
  /** Total intersection capacity in vehicles per hour. */
  capacityVehiclesPerHour: number | null;
  /**
   * 0..1 confidence in the metrics. Reflects how many observations
   * fed the window and whether the geometry is fully described.
   */
  confidence: number;
  /** Number of raw observations folded into this measurement. */
  observationCount: number;
}

export interface AggregatedTrafficMetrics {
  averageFlowVehiclesPerHour: number | null;
  averageDensityVehiclesPerKm: number | null;
  averageSpeedKph: number | null;
  totalQueueLengthMetres: number | null;
  totalQueueLengthVehicles: number | null;
  averageDelaySeconds: number | null;
  averageSaturation: number | null;
  averageConfidence: number | null;
  totalCapacityVehiclesPerHour: number | null;
  sampleCount: number;
}

@Injectable()
export class PredictionMetricsService {
  constructor(
    @InjectRepository(TrafficObservationEntity)
    private readonly observationRepository: Repository<TrafficObservationEntity>,
    private readonly capacityService: CapacityEstimatorService,
    private readonly queueService: QueueEstimatorService,
    private readonly saturationService: SaturationEstimatorService,
  ) {}

  /**
   * Compute the full engineering metric set for a single carrefour.
   * Combines real detector readings (flow, speed, delay) with
   * geometry-based estimators (capacity, queue, saturation).
   */
  async computeForCarrefour(
    carrefourId: string,
    intersectionCode: string | null = null,
  ): Promise<IntersectionTrafficMetrics> {
    const since = new Date(Date.now() - OBSERVATION_WINDOW_MINUTES * 60 * 1000);

    const [observations, capacity, queue, saturationEst] = await Promise.all([
      this.observationRepository.find({
        where: { carrefourId, observedAt: MoreThanOrEqual(since) },
        order: { observedAt: 'DESC' },
        take: 200,
      }),
      this.capacityService.estimateForCarrefour(carrefourId),
      this.queueService.estimateForCarrefour(carrefourId),
      this.saturationService.estimateForCarrefour(carrefourId),
    ]);

    const flowReadings = numericReadings(
      observations,
      (entry) => entry.flowVehiclesPerHour,
    );
    const speedReadings = numericReadings(
      observations,
      (entry) => entry.averageSpeedKph,
    );
    const delayReadings = numericReadings(
      observations,
      (entry) => entry.delaySeconds,
    );
    const queueReadings = numericReadings(
      observations,
      (entry) => entry.queueLengthMetres,
    );
    const obsConfidence = numericReadings(
      observations,
      (entry) => entry.confidence,
    );

    const flow = average(flowReadings);
    const speed = average(speedReadings);
    // density = flow / speed — Wardrop's fundamental relation
    const density =
      flow != null && speed != null && speed > 0 ? flow / speed : null;
    const delaySeconds = average(delayReadings);

    // Prefer geometry-derived queue (covers all approaches), fall back
    // to observed queue average if estimator returned nothing.
    const queueMetres =
      queue.totalQueueMetres > 0
        ? queue.totalQueueMetres
        : (average(queueReadings) ?? null);
    const queueVehicles =
      queueMetres != null && queueMetres > 0
        ? Math.round(queueMetres / VEHICLE_LENGTH_METRES)
        : null;

    const capacityVph =
      capacity.totalCapacityVph > 0 ? capacity.totalCapacityVph : null;

    // Saturation must be computed per approach: X = branch demand /
    // branch capacity. Dividing the AVERAGE branch flow by the TOTAL
    // junction capacity (as this once did) mixes a per-branch numerator
    // with a whole-junction denominator, so a junction with one approach
    // at X=0.97 reported X=0.14 and the AI never saw the congestion.
    //
    // The saturation estimator already does the per-branch division from
    // the same observations, so use its results directly.
    //
    // The headline `saturation` is the CRITICAL (worst) approach, not the
    // mean: in signal control a single oversaturated approach means its
    // queue grows without bound each cycle, which is a failing junction
    // however empty the other arms are. The mean is kept alongside it for
    // reporting.
    const branchSaturations = saturationEst.perBranch
      .map((branch) => branch.saturation)
      .filter((value): value is number => Number.isFinite(value));

    const criticalSaturation =
      branchSaturations.length > 0
        ? Math.max(...branchSaturations)
        : saturationEst.overallSaturation;
    const saturation = Number.isFinite(criticalSaturation)
      ? clamp(criticalSaturation, 0, 2)
      : null;

    const meanSaturationRaw =
      branchSaturations.length > 0
        ? branchSaturations.reduce((sum, value) => sum + value, 0) /
          branchSaturations.length
        : saturationEst.overallSaturation;
    const meanSaturation = Number.isFinite(meanSaturationRaw)
      ? clamp(meanSaturationRaw, 0, 2)
      : null;

    const observedConfidence = average(obsConfidence);
    const heuristicPenalty =
      (saturationEst.notes.length > 0 ? 0.1 : 0) +
      (queue.notes.length > 0 ? 0.05 : 0) +
      (capacity.notes.length > 0 ? 0.05 : 0);
    const confidenceBase =
      observedConfidence ??
      (observations.length > 0 ? FULL_CONFIDENCE : DEFAULT_CONFIDENCE);
    const confidence = clamp(confidenceBase - heuristicPenalty, 0, 1);

    return {
      carrefourId,
      intersectionCode,
      flowVehiclesPerHour: roundOrNull(flow, 1),
      densityVehiclesPerKm: roundOrNull(density, 2),
      averageSpeedKph: roundOrNull(speed, 1),
      queueLengthMetres: roundOrNull(queueMetres, 1),
      queueLengthVehicles: queueVehicles,
      delaySeconds: roundOrNull(delaySeconds, 0),
      saturation: roundOrNull(saturation, 3),
      meanSaturation: roundOrNull(meanSaturation, 3),
      capacityVehiclesPerHour: roundOrNull(capacityVph, 0),
      confidence: round(confidence, 3),
      observationCount: observations.length,
    };
  }

  /**
   * Aggregate per-intersection metrics into a zone- or city-level
   * snapshot. Flow / density / speed / delay / saturation are
   * averaged; queue and capacity are summed.
   */
  aggregate(metrics: IntersectionTrafficMetrics[]): AggregatedTrafficMetrics {
    const flows = pickNumeric(metrics, (m) => m.flowVehiclesPerHour);
    const densities = pickNumeric(metrics, (m) => m.densityVehiclesPerKm);
    const speeds = pickNumeric(metrics, (m) => m.averageSpeedKph);
    const queueMetres = pickNumeric(metrics, (m) => m.queueLengthMetres);
    const queueVehicles = pickNumeric(metrics, (m) => m.queueLengthVehicles);
    const delays = pickNumeric(metrics, (m) => m.delaySeconds);
    const saturations = pickNumeric(metrics, (m) => m.saturation);
    const capacities = pickNumeric(metrics, (m) => m.capacityVehiclesPerHour);
    const confidences = metrics.map((m) => m.confidence);

    return {
      averageFlowVehiclesPerHour: averageRounded(flows, 1),
      averageDensityVehiclesPerKm: averageRounded(densities, 2),
      averageSpeedKph: averageRounded(speeds, 1),
      totalQueueLengthMetres:
        queueMetres.length > 0 ? round(sum(queueMetres), 1) : null,
      totalQueueLengthVehicles:
        queueVehicles.length > 0 ? sum(queueVehicles) : null,
      averageDelaySeconds: averageRounded(delays, 0),
      averageSaturation: averageRounded(saturations, 3),
      averageConfidence:
        confidences.length > 0 ? averageRounded(confidences, 3) : null,
      totalCapacityVehiclesPerHour:
        capacities.length > 0 ? round(sum(capacities), 0) : null,
      sampleCount: metrics.length,
    };
  }
}

function numericReadings<T>(
  rows: T[],
  pick: (row: T) => number | string | null | undefined,
): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const raw = pick(row);
    if (raw == null) continue;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

function pickNumeric<T>(rows: T[], pick: (row: T) => number | null): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value != null && Number.isFinite(value)) out.push(value);
  }
  return out;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function averageRounded(values: number[], decimals: number): number | null {
  const value = average(values);
  return value == null ? null : round(value, decimals);
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundOrNull(value: number | null, decimals: number): number | null {
  return value == null ? null : round(value, decimals);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

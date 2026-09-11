import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CarrefourEntity,
  MirofishAgentOutputEntity,
} from '../database/entities';
import { CapacityEstimatorService } from '../traffic-analysis/capacity-estimator.service';
import { CriticalityScoringService } from '../traffic-analysis/criticality-scoring.service';
import { QueueEstimatorService } from '../traffic-analysis/queue-estimator.service';
import { SaturationEstimatorService } from '../traffic-analysis/saturation-estimator.service';
import {
  PREDICTION_HORIZONS,
  normalizePredictionHorizon,
  type PredictionHorizon,
} from './prediction.dto';

interface HorizonForecast {
  horizon: PredictionHorizon;
  saturationForecast: number;
  queueLengthForecast: number;
  delaySecondsForecast: number;
  confidence: number;
  notes: string[];
}

export interface PredictionRunResult {
  carrefourId: string;
  generatedAt: string;
  baseline: {
    saturation: number;
    queueMetres: number;
    capacityVph: number;
    criticality: number;
    criticalityLevel: string;
  };
  forecasts: HorizonForecast[];
  agentSlots: Array<{ agentName: string; pendingOutputs: number }>;
}

const HORIZON_FACTORS: Record<
  PredictionHorizon,
  { satMultiplier: number; queueMultiplier: number; baseConfidence: number }
> = {
  'H+15': { satMultiplier: 1.05, queueMultiplier: 1.1, baseConfidence: 0.85 },
  'H+60': { satMultiplier: 1.18, queueMultiplier: 1.4, baseConfidence: 0.7 },
  'H+24': { satMultiplier: 0.95, queueMultiplier: 1.0, baseConfidence: 0.55 },
};

@Injectable()
export class PredictionService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(MirofishAgentOutputEntity)
    private readonly mirofishRepository: Repository<MirofishAgentOutputEntity>,
    private readonly capacityService: CapacityEstimatorService,
    private readonly saturationService: SaturationEstimatorService,
    private readonly queueService: QueueEstimatorService,
    private readonly criticalityService: CriticalityScoringService,
  ) {}

  async run(
    carrefourId: string,
    horizon?: PredictionHorizon,
  ): Promise<PredictionRunResult> {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }

    const [capacity, saturation, queue, criticality] = await Promise.all([
      this.capacityService.estimateForCarrefour(carrefourId),
      this.saturationService.estimateForCarrefour(carrefourId),
      this.queueService.estimateForCarrefour(carrefourId),
      this.criticalityService.scoreCarrefour(carrefourId),
    ]);

    const normalizedHorizon = normalizePredictionHorizon(horizon);
    const horizons = normalizedHorizon
      ? [normalizedHorizon]
      : [...PREDICTION_HORIZONS];
    const forecasts: HorizonForecast[] = horizons.map((entry) => {
      const factor = HORIZON_FACTORS[entry];
      const baseSat = saturation.overallSaturation;
      const projectedSat = clamp(baseSat * factor.satMultiplier, 0, 1.5);
      const projectedQueue = Math.round(
        queue.totalQueueMetres * factor.queueMultiplier,
      );
      const baseDelay = saturation.perBranch.length
        ? saturation.perBranch.reduce(
            (sum, branch) => sum + branch.saturation,
            0,
          ) / saturation.perBranch.length
        : 0;
      const delaySeconds = Math.round(
        20 + 60 * Math.max(0, projectedSat - 0.5) + baseDelay * 8,
      );
      const noteBag = new Set<string>();
      if (saturation.notes.length > 0)
        noteBag.add('saturation_observations_partial');
      if (queue.notes.length > 0) noteBag.add('queue_observations_partial');
      if (entry === 'H+24') noteBag.add('long_horizon_low_confidence');
      return {
        horizon: entry,
        saturationForecast: Number(projectedSat.toFixed(3)),
        queueLengthForecast: projectedQueue,
        delaySecondsForecast: delaySeconds,
        confidence: factor.baseConfidence,
        notes: [...noteBag],
      };
    });

    const agentSlots = await this.collectAgentSlots(carrefourId);

    return {
      carrefourId,
      generatedAt: new Date().toISOString(),
      baseline: {
        saturation: saturation.overallSaturation,
        queueMetres: queue.totalQueueMetres,
        capacityVph: capacity.totalCapacityVph,
        criticality: criticality.criticalityScore,
        criticalityLevel: criticality.level,
      },
      forecasts,
      agentSlots,
    };
  }

  private async collectAgentSlots(
    carrefourId: string,
  ): Promise<Array<{ agentName: string; pendingOutputs: number }>> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.mirofishRepository
      .createQueryBuilder('mirofish')
      .select('mirofish.agentName', 'agentName')
      .addSelect('COUNT(*)', 'pending')
      .where('mirofish.carrefourId = :carrefourId', { carrefourId })
      .andWhere('mirofish.producedAt >= :since', { since })
      .groupBy('mirofish.agentName')
      .getRawMany<{ agentName: string; pending: string }>();
    return recent.map((row) => ({
      agentName: row.agentName,
      pendingOutputs: Number(row.pending),
    }));
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
} from '../database/entities';
import { QueueEstimatorService } from './queue-estimator.service';
import { SaturationEstimatorService } from './saturation-estimator.service';
import type {
  AnalysisHeuristicNote,
  CriticalityResult,
} from './traffic-analysis.types';

@Injectable()
export class CriticalityScoringService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(ConnectedIntersectionEntity)
    private readonly connectedRepository: Repository<ConnectedIntersectionEntity>,
    private readonly saturationService: SaturationEstimatorService,
    private readonly queueService: QueueEstimatorService,
  ) {}

  async scoreCarrefour(carrefourId: string): Promise<CriticalityResult> {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
      relations: { primaryController: true },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }
    const saturation =
      await this.saturationService.estimateForCarrefour(carrefourId);
    const queue = await this.queueService.estimateForCarrefour(carrefourId);

    const queueScore = clamp(queue.totalQueueMetres / 240, 0, 1);
    const links = await this.connectedRepository.find({
      where: [{ fromCarrefourId: carrefourId }, { toCarrefourId: carrefourId }],
    });
    const spillbackScore = links.length
      ? clamp(
          links.reduce(
            (sum, link) =>
              sum +
              (link.queueSpillbackRisk ? Number(link.queueSpillbackRisk) : 0),
            0,
          ) / links.length,
          0,
          1,
        )
      : 0;

    const controllerScore = (() => {
      const state = carrefour.primaryController?.connectionState;
      if (state === 'offline') return 1;
      if (state === 'degraded') return 0.6;
      if (carrefour.primaryControllerId == null) return 0.4;
      return 0.1;
    })();

    const criticality =
      0.45 * clamp(saturation.overallSaturation, 0, 1.5) +
      0.25 * queueScore +
      0.15 * spillbackScore +
      0.15 * controllerScore;

    const score = clamp(Number(criticality.toFixed(3)), 0, 1);
    const level = scoreToLevel(score);

    const notes: AnalysisHeuristicNote[] = [];
    if (saturation.notes.includes('no_observation'))
      notes.push('no_observation');
    if (
      queue.notes.includes('no_observation') &&
      !notes.includes('no_observation')
    )
      notes.push('no_observation');
    if (controllerScore >= 0.9) notes.push('fallback_default');

    await this.carrefourRepository.update(carrefour.id, {
      criticalityScore: score,
    });

    return {
      carrefourId,
      saturation: saturation.overallSaturation,
      queueScore: Number(queueScore.toFixed(3)),
      spillbackScore: Number(spillbackScore.toFixed(3)),
      controllerScore: Number(controllerScore.toFixed(3)),
      criticalityScore: score,
      level,
      notes,
    };
  }
}

function scoreToLevel(score: number): CriticalityResult['level'] {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.35) return 'moderate';
  return 'low';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

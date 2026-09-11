import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import {
  CarrefourEntity,
  IntersectionBranchEntity,
  TrafficObservationEntity,
} from '../database/entities';
import { SaturationEstimatorService } from './saturation-estimator.service';
import type {
  AnalysisHeuristicNote,
  QueueResult,
} from './traffic-analysis.types';

const VEHICLE_SPACING_METRES = 6.5;

@Injectable()
export class QueueEstimatorService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(IntersectionBranchEntity)
    private readonly branchRepository: Repository<IntersectionBranchEntity>,
    @InjectRepository(TrafficObservationEntity)
    private readonly observationRepository: Repository<TrafficObservationEntity>,
    private readonly saturationService: SaturationEstimatorService,
  ) {}

  async estimateForCarrefour(carrefourId: string): Promise<QueueResult> {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }

    const branches = await this.branchRepository.find({
      where: { carrefourId },
    });
    const saturation =
      await this.saturationService.estimateForCarrefour(carrefourId);

    const notes = new Set<AnalysisHeuristicNote>();
    const perBranch: QueueResult['perBranch'] = [];
    const since = new Date(Date.now() - 60 * 60 * 1000);

    for (const branch of branches) {
      const observation = await this.observationRepository.findOne({
        where: {
          branchId: branch.id,
          observedAt: MoreThanOrEqual(since),
        },
        order: { observedAt: 'DESC' },
      });
      const branchSat = saturation.perBranch.find(
        (entry) => entry.branchId === branch.id,
      );
      let queueMetres: number;
      if (observation?.queueLengthMetres != null) {
        queueMetres = Number(observation.queueLengthMetres);
      } else if (branchSat) {
        // Heuristic: scaled by saturation^2; capped to storage length.
        const cap = branch.storageLengthMetres
          ? Number(branch.storageLengthMetres)
          : 80;
        queueMetres = Math.min(
          cap,
          Math.round(60 * Math.pow(branchSat.saturation, 2)),
        );
        notes.add('fallback_default');
        if (observation == null) notes.add('no_observation');
      } else {
        queueMetres = 0;
        notes.add('no_observation');
      }
      const queueVehicles = Math.round(queueMetres / VEHICLE_SPACING_METRES);
      perBranch.push({
        branchId: branch.id,
        direction: branch.direction,
        queueLengthMetres: queueMetres,
        queueVehicles,
        note: observation == null ? 'no_observation' : undefined,
      });
    }

    const totalQueueMetres = perBranch.reduce(
      (sum, entry) => sum + entry.queueLengthMetres,
      0,
    );

    return {
      carrefourId: carrefour.id,
      perBranch,
      totalQueueMetres,
      notes: [...notes],
    };
  }
}

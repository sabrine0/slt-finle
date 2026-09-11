import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import {
  CarrefourEntity,
  IntersectionBranchEntity,
  TrafficObservationEntity,
} from '../database/entities';
import { CapacityEstimatorService } from './capacity-estimator.service';
import type {
  AnalysisHeuristicNote,
  SaturationResult,
} from './traffic-analysis.types';

@Injectable()
export class SaturationEstimatorService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(IntersectionBranchEntity)
    private readonly branchRepository: Repository<IntersectionBranchEntity>,
    @InjectRepository(TrafficObservationEntity)
    private readonly observationRepository: Repository<TrafficObservationEntity>,
    private readonly capacityService: CapacityEstimatorService,
  ) {}

  async estimateForCarrefour(carrefourId: string): Promise<SaturationResult> {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }
    const capacity =
      await this.capacityService.estimateForCarrefour(carrefourId);
    const branches = await this.branchRepository.find({
      where: { carrefourId },
    });

    const notes = new Set<AnalysisHeuristicNote>();
    const perBranch: SaturationResult['perBranch'] = [];
    const since = new Date(Date.now() - 60 * 60 * 1000);

    for (const branch of branches) {
      const branchCapacity =
        capacity.perBranch.find((entry) => entry.branchId === branch.id)
          ?.capacityVph ?? 0;
      const observation = await this.observationRepository.findOne({
        where: {
          branchId: branch.id,
          observedAt: MoreThanOrEqual(since),
        },
        order: { observedAt: 'DESC' },
      });
      const inflow =
        observation?.flowVehiclesPerHour != null
          ? Number(observation.flowVehiclesPerHour)
          : derivedFlowFromQueueOrFallback(observation, branchCapacity, notes);
      const saturation =
        branchCapacity > 0 ? clamp(inflow / branchCapacity, 0, 3) : 0;
      perBranch.push({
        branchId: branch.id,
        direction: branch.direction,
        inflowVph: Math.round(inflow),
        capacityVph: branchCapacity,
        saturation: Number(saturation.toFixed(3)),
        note: observation == null ? 'no_observation' : undefined,
      });
    }

    if (branches.length === 0) {
      return {
        carrefourId: carrefour.id,
        perBranch: [],
        overallSaturation: 0,
        worstBranch: null,
        notes: ['no_branch_geometry'],
      };
    }

    const overall = perBranch.length
      ? Number(
          (
            perBranch.reduce((sum, branch) => sum + branch.saturation, 0) /
            perBranch.length
          ).toFixed(3),
        )
      : 0;

    const worst = perBranch.reduce<{
      branchId: string;
      saturation: number;
    } | null>(
      (acc, entry) =>
        acc == null || entry.saturation > acc.saturation ? entry : acc,
      null,
    );

    // Persist the latest score so the graph layer can colour the map.
    await this.carrefourRepository.update(carrefour.id, {
      saturationScore: overall,
    });

    return {
      carrefourId: carrefour.id,
      perBranch,
      overallSaturation: overall,
      worstBranch: worst?.branchId ?? null,
      notes: [...notes],
    };
  }
}

function derivedFlowFromQueueOrFallback(
  observation: TrafficObservationEntity | null,
  branchCapacity: number,
  notes: Set<AnalysisHeuristicNote>,
): number {
  if (observation == null) {
    notes.add('no_observation');
    notes.add('fallback_default');
    return Math.round(branchCapacity * 0.55);
  }
  if (observation.queueLengthMetres != null) {
    notes.add('fallback_default');
    return Math.round(Number(observation.queueLengthMetres) * 24);
  }
  notes.add('fallback_default');
  return Math.round(branchCapacity * 0.55);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Keep this import-only ref so TypeORM ESM tree-shaking doesn't drop it.
void LessThanOrEqual;

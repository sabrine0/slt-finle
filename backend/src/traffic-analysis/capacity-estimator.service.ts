import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CarrefourEntity,
  IntersectionBranchEntity,
} from '../database/entities';
import type {
  AnalysisHeuristicNote,
  CapacityResult,
} from './traffic-analysis.types';

const DEFAULT_LANE_CAPACITY_VPH = 1800;

@Injectable()
export class CapacityEstimatorService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(IntersectionBranchEntity)
    private readonly branchRepository: Repository<IntersectionBranchEntity>,
  ) {}

  async estimateForCarrefour(carrefourId: string): Promise<CapacityResult> {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }
    const branches = await this.branchRepository.find({
      where: { carrefourId },
      relations: { lanes: true },
    });

    const notes = new Set<AnalysisHeuristicNote>();
    const perLane: CapacityResult['perLane'] = [];
    const perBranch: CapacityResult['perBranch'] = [];
    let totalCapacityVph = 0;

    for (const branch of branches) {
      const lanes = (branch.lanes ?? [])
        .slice()
        .sort((a, b) => a.laneIndex - b.laneIndex);
      const branchCapacities: number[] = [];
      const laneCount = branch.laneCount ?? lanes.length;
      if (lanes.length === 0) {
        notes.add('no_lane_capacity');
      }

      const fallbackPerLane =
        laneCount > 0 ? DEFAULT_LANE_CAPACITY_VPH : DEFAULT_LANE_CAPACITY_VPH;

      const effectiveLanes =
        lanes.length > 0
          ? lanes
          : Array.from({ length: Math.max(laneCount, 1) }, (_, idx) => ({
              id: `${branch.id}-virtual-${idx}`,
              laneIndex: idx,
              hourlyCapacity: fallbackPerLane,
            }));

      for (const lane of effectiveLanes) {
        const capacityVph = lane.hourlyCapacity ?? fallbackPerLane;
        if (lane.hourlyCapacity == null) notes.add('fallback_default');
        branchCapacities.push(capacityVph);
        perLane.push({
          branchId: branch.id,
          laneId: lane.id,
          laneIndex: lane.laneIndex,
          direction: branch.direction,
          capacityVph,
          note: lane.hourlyCapacity == null ? 'fallback_default' : undefined,
        });
      }

      const branchCapacity = branchCapacities.reduce(
        (sum, value) => sum + value,
        0,
      );
      perBranch.push({
        branchId: branch.id,
        direction: branch.direction,
        capacityVph: branchCapacity,
        laneCount: effectiveLanes.length,
        note: lanes.length === 0 ? 'no_lane_capacity' : undefined,
      });
      totalCapacityVph += branchCapacity;
    }

    if (branches.length === 0) {
      notes.add('no_branch_geometry');
    }

    return {
      carrefourId: carrefour.id,
      perLane,
      perBranch,
      totalCapacityVph,
      notes: [...notes],
    };
  }
}

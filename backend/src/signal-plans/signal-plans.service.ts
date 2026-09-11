import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ControllerEntity, TimingPlanEntity } from '../database/entities';

export interface SignalPlanView {
  id: string;
  code: string;
  name: string;
  intersectionId: string;
  intersectionCode: string;
  status: string;
  cycleLengthSeconds: number;
  offsetSeconds: number;
  simulationOnly: boolean;
  scheduleConfig: Record<string, unknown>;
  planData: Record<string, unknown>;
}

@Injectable()
export class SignalPlansService {
  constructor(
    @InjectRepository(TimingPlanEntity)
    private readonly timingPlanRepository: Repository<TimingPlanEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
  ) {}

  async list(filters?: {
    intersectionId?: string;
    controllerId?: string;
  }): Promise<SignalPlanView[]> {
    let scopedIntersectionId = filters?.intersectionId;
    if (!scopedIntersectionId && filters?.controllerId) {
      const controller = await this.controllerRepository.findOne({
        where: { id: filters.controllerId },
      });
      scopedIntersectionId = controller?.intersectionId;
    }

    const rows = await this.timingPlanRepository.find({
      relations: { intersection: true },
      order: { code: 'ASC' },
    });

    return rows
      .filter((row) => {
        if (
          scopedIntersectionId &&
          row.intersectionId !== scopedIntersectionId
        ) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        intersectionId: row.intersectionId,
        intersectionCode: row.intersection.code,
        status: row.status,
        cycleLengthSeconds: row.cycleLengthSeconds,
        offsetSeconds: row.offsetSeconds,
        simulationOnly: row.simulationOnly,
        scheduleConfig: row.scheduleConfig ?? {},
        planData: row.planData ?? {},
      }));
  }
}

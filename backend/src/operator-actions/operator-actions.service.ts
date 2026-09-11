import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import { OverrideCommandEntity } from '../database/entities';

export interface OperatorActionView {
  id: string;
  intersectionCode: string;
  regionId: string | null;
  cityId: string | null;
  zoneId: string | null;
  action: string;
  reasonCode: string;
  result: string;
  note: string | null;
  durationSeconds: number | null;
  issuedAt: string;
  expiresAt: string | null;
  operatorUserId: string | null;
}

@Injectable()
export class OperatorActionsService {
  constructor(
    @InjectRepository(OverrideCommandEntity)
    private readonly overrideRepository: Repository<OverrideCommandEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(filters?: {
    cityId?: string;
    zoneId?: string;
    intersectionId?: string;
  }): Promise<OperatorActionView[]> {
    const rows = await this.overrideRepository.find({
      relations: { intersection: true },
      order: { issuedAt: 'DESC' },
      take: 250,
    });

    return rows
      .map((row) => this.toView(row))
      .filter((row): row is OperatorActionView => row != null)
      .filter((row) => {
        if (filters?.cityId && row.cityId !== filters.cityId) return false;
        if (filters?.zoneId && row.zoneId !== filters.zoneId) return false;
        if (
          filters?.intersectionId &&
          row.intersectionCode !== filters.intersectionId
        ) {
          return false;
        }
        return true;
      });
  }

  private toView(row: OverrideCommandEntity): OperatorActionView | null {
    const intersection = row.intersection;
    const scope = intersection
      ? this.topology.resolveIntersection(intersection)
      : null;
    return {
      id: row.id,
      intersectionCode: row.intersectionCode,
      regionId: scope?.region.id ?? null,
      cityId: scope?.city.id ?? null,
      zoneId: scope?.zone?.id ?? null,
      action: row.action,
      reasonCode: row.reasonCode,
      result: row.result,
      note: row.note,
      durationSeconds: row.durationSeconds,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      operatorUserId: row.operatorUserId,
    };
  }
}

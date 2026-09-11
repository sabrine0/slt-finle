import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import { TrafficObservationEntity } from '../database/entities';

export interface TrafficObservationView {
  id: string;
  carrefourId: string;
  intersectionCode: string | null;
  regionId: string | null;
  cityId: string | null;
  zoneId: string | null;
  branchId: string | null;
  observedAt: string;
  flowVehiclesPerHour: number | null;
  averageSpeedKph: number | null;
  queueLengthMetres: number | null;
  delaySeconds: number | null;
  sourceType: string;
  confidence: number | null;
}

@Injectable()
export class TrafficObservationsService {
  constructor(
    @InjectRepository(TrafficObservationEntity)
    private readonly observationRepository: Repository<TrafficObservationEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(filters?: {
    cityId?: string;
    zoneId?: string;
    intersectionId?: string;
  }): Promise<TrafficObservationView[]> {
    const rows = await this.observationRepository.find({
      relations: {
        carrefour: { engineeringIntersection: true },
      },
      order: { observedAt: 'DESC' },
      take: 250,
    });

    return rows
      .map((row) => this.toView(row))
      .filter((row): row is TrafficObservationView => row != null)
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

  private toView(row: TrafficObservationEntity): TrafficObservationView | null {
    const intersection = row.carrefour.engineeringIntersection;
    if (!intersection) return null;
    const scope = this.topology.resolveIntersection(intersection);
    return {
      id: row.id,
      carrefourId: row.carrefourId,
      intersectionCode: intersection.code,
      regionId: scope.region.id,
      cityId: scope.city.id,
      zoneId: scope.zone?.id ?? null,
      branchId: row.branchId,
      observedAt: row.observedAt.toISOString(),
      flowVehiclesPerHour:
        row.flowVehiclesPerHour != null
          ? Number(row.flowVehiclesPerHour)
          : null,
      averageSpeedKph:
        row.averageSpeedKph != null ? Number(row.averageSpeedKph) : null,
      queueLengthMetres:
        row.queueLengthMetres != null ? Number(row.queueLengthMetres) : null,
      delaySeconds: row.delaySeconds != null ? Number(row.delaySeconds) : null,
      sourceType: row.sourceType,
      confidence: row.confidence != null ? Number(row.confidence) : null,
    };
  }
}

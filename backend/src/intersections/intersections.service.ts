import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import { ControllerEntity, IntersectionEntity } from '../database/entities';

export interface IntersectionView {
  id: string;
  code: string;
  name: string;
  regionId: string;
  cityId: string;
  zoneId: string | null;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  status: string;
  controlMode: string;
  queueLength: number;
  incidents: number;
  averageDelaySeconds: number;
  controllerId: string | null;
  controllerType: string | null;
  controllerConnectionState: string | null;
  systemMode: string | null;
  lastHeartbeat: string | null;
}

@Injectable()
export class IntersectionsService {
  constructor(
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(filters?: {
    cityId?: string;
    zoneId?: string;
  }): Promise<IntersectionView[]> {
    const rows = await this.intersectionRepository.find({
      relations: { controllers: true },
      order: { code: 'ASC' },
    });

    return rows
      .map((row) => this.toView(row))
      .filter((row) => {
        if (filters?.cityId && row.cityId !== filters.cityId) return false;
        if (filters?.zoneId && row.zoneId !== filters.zoneId) return false;
        return true;
      });
  }

  async listCodesByScope(filters?: { cityId?: string; zoneId?: string }) {
    const rows = await this.list(filters);
    return rows.map((row) => row.code);
  }

  private toView(intersection: IntersectionEntity): IntersectionView {
    const primaryController =
      intersection.controllers.find((controller) => controller.isPrimary) ??
      intersection.controllers[0] ??
      null;
    const scope = this.topology.resolveIntersection(intersection);
    return {
      id: intersection.id,
      code: intersection.code,
      name: intersection.name,
      regionId: scope.region.id,
      cityId: scope.city.id,
      zoneId: scope.zone?.id ?? null,
      district: intersection.district,
      address: intersection.address,
      latitude: Number(intersection.latitude),
      longitude: Number(intersection.longitude),
      status: intersection.status,
      controlMode: intersection.controlMode,
      queueLength: intersection.queueLength,
      incidents: intersection.incidents,
      averageDelaySeconds: intersection.averageDelaySeconds,
      controllerId: primaryController?.code ?? null,
      controllerType: primaryController?.controllerType ?? null,
      controllerConnectionState: primaryController?.connectionState ?? null,
      systemMode: primaryController?.operatingEnvironment ?? null,
      lastHeartbeat: intersection.lastHeartbeat?.toISOString() ?? null,
    };
  }
}

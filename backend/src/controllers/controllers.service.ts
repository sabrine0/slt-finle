import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import { ControllerEntity } from '../database/entities';

export interface ControllerView {
  id: string;
  code: string;
  intersectionId: string;
  intersectionCode: string;
  intersectionName: string;
  regionId: string;
  cityId: string;
  zoneId: string | null;
  controllerType: string;
  connectionState: string;
  operatingEnvironment: string;
  firmwareVersion: string;
  runtimeVersion: string;
  batteryBacked: boolean;
  uptimeHours: number;
  isPrimary: boolean;
  lastSeen: string | null;
}

@Injectable()
export class ControllersService {
  constructor(
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(filters?: {
    cityId?: string;
    zoneId?: string;
  }): Promise<ControllerView[]> {
    const rows = await this.controllerRepository.find({
      relations: { intersection: true },
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

  private toView(controller: ControllerEntity): ControllerView {
    const scope = this.topology.resolveIntersection(controller.intersection);
    return {
      id: controller.id,
      code: controller.code,
      intersectionId: controller.intersectionId,
      intersectionCode: controller.intersection.code,
      intersectionName: controller.intersection.name,
      regionId: scope.region.id,
      cityId: scope.city.id,
      zoneId: scope.zone?.id ?? null,
      controllerType: controller.controllerType,
      connectionState: controller.connectionState,
      operatingEnvironment: controller.operatingEnvironment,
      firmwareVersion: controller.firmwareVersion,
      runtimeVersion: controller.runtimeVersion,
      batteryBacked: controller.batteryBacked,
      uptimeHours: controller.uptimeHours,
      isPrimary: controller.isPrimary,
      lastSeen: controller.lastSeen?.toISOString() ?? null,
    };
  }
}

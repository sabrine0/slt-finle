import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
} from '../database/entities';

export interface RoadLinkView {
  id: string;
  fromIntersectionId: string;
  toIntersectionId: string;
  fromIntersectionCode: string;
  toIntersectionCode: string;
  fromCityId: string;
  toCityId: string;
  fromZoneId: string | null;
  toZoneId: string | null;
  relationKind: string;
  distanceMetres: number | null;
  travelTimeSeconds: number | null;
  queueSpillbackRisk: number | null;
  geometry: Record<string, unknown>;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}

@Injectable()
export class RoadLinksService {
  constructor(
    @InjectRepository(ConnectedIntersectionEntity)
    private readonly connectedRepository: Repository<ConnectedIntersectionEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(filters?: {
    cityId?: string;
    zoneId?: string;
  }): Promise<RoadLinkView[]> {
    const rows = await this.connectedRepository.find({
      relations: {
        fromCarrefour: { engineeringIntersection: true },
        toCarrefour: { engineeringIntersection: true },
      },
    });

    return rows
      .map((row) => this.toView(row))
      .filter((row): row is RoadLinkView => row != null)
      .filter((row) => {
        if (filters?.cityId) {
          const matchesCity =
            row.fromCityId === filters.cityId ||
            row.toCityId === filters.cityId;
          if (!matchesCity) return false;
        }
        if (filters?.zoneId) {
          const matchesZone =
            row.fromZoneId === filters.zoneId ||
            row.toZoneId === filters.zoneId;
          if (!matchesZone) return false;
        }
        return true;
      });
  }

  private toView(link: ConnectedIntersectionEntity): RoadLinkView | null {
    const fromIntersection = link.fromCarrefour.engineeringIntersection;
    const toIntersection = link.toCarrefour.engineeringIntersection;
    if (!fromIntersection || !toIntersection) return null;

    const fromScope = this.topology.resolveIntersection(fromIntersection);
    const toScope = this.topology.resolveIntersection(toIntersection);

    return {
      id: link.id,
      fromIntersectionId: fromIntersection.code,
      toIntersectionId: toIntersection.code,
      fromIntersectionCode: fromIntersection.code,
      toIntersectionCode: toIntersection.code,
      fromCityId: fromScope.city.id,
      toCityId: toScope.city.id,
      fromZoneId: fromScope.zone?.id ?? null,
      toZoneId: toScope.zone?.id ?? null,
      relationKind: link.relationKind,
      distanceMetres:
        link.distanceMetres != null ? Number(link.distanceMetres) : null,
      travelTimeSeconds:
        link.travelTimeSeconds != null ? Number(link.travelTimeSeconds) : null,
      queueSpillbackRisk:
        link.queueSpillbackRisk != null
          ? Number(link.queueSpillbackRisk)
          : null,
      geometry: link.geometry ?? {},
      fromLat: Number(link.fromCarrefour.lat),
      fromLng: Number(link.fromCarrefour.lng),
      toLat: Number(link.toCarrefour.lat),
      toLng: Number(link.toCarrefour.lng),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { IntersectionEntity } from '../database/entities';
import { TopologyReferenceService } from '../cities/topology-reference.service';

export interface ZoneView {
  id: string;
  cityId: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: { lat: number; lng: number };
  intersectionCount: number;
  incidentCount: number;
  averageDelaySeconds: number;
  tone: 'healthy' | 'watch' | 'critical';
}

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  async list(cityId?: string): Promise<ZoneView[]> {
    const intersections = await this.intersectionRepository.find({
      order: { code: 'ASC' },
    });
    const buckets = new Map<string, IntersectionEntity[]>();
    for (const intersection of intersections) {
      const scope = this.topology.resolveIntersection(intersection);
      if (cityId && scope.city.id !== cityId) continue;
      const zoneId = scope.zone?.id;
      if (!zoneId) continue;
      const list = buckets.get(zoneId) ?? [];
      list.push(intersection);
      buckets.set(zoneId, list);
    }

    const rows: ZoneView[] = [];
    for (const region of this.topology.regions) {
      for (const city of region.cities) {
        if (cityId && city.id !== cityId) continue;
        for (const zone of city.zones) {
          const scopedIntersections = buckets.get(zone.id) ?? [];
          rows.push({
            id: zone.id,
            cityId: city.id,
            regionId: region.id,
            name: zone.name,
            nameAr: zone.nameAr,
            center: zone.center,
            intersectionCount: scopedIntersections.length,
            incidentCount: scopedIntersections.reduce(
              (sum, item) => sum + item.incidents,
              0,
            ),
            averageDelaySeconds:
              scopedIntersections.length > 0
                ? Math.round(
                    scopedIntersections.reduce(
                      (sum, item) => sum + item.averageDelaySeconds,
                      0,
                    ) / scopedIntersections.length,
                  )
                : 0,
            tone: deriveTone(scopedIntersections),
          });
        }
      }
    }

    return rows;
  }
}

function deriveTone(intersections: IntersectionEntity[]) {
  if (
    intersections.some((intersection) => intersection.status === 'critical')
  ) {
    return 'critical';
  }
  if (intersections.some((intersection) => intersection.status === 'watch')) {
    return 'watch';
  }
  return 'healthy';
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ControllerEntity, IntersectionEntity } from '../database/entities';
import { TopologyReferenceService } from './topology-reference.service';

export interface CityView {
  id: string;
  regionId: string;
  name: string;
  nameAr: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  intersectionCount: number;
  controllerCount: number;
  incidentCount: number;
  averageDelaySeconds: number;
  tone: 'healthy' | 'watch' | 'critical';
}

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    readonly topology: TopologyReferenceService,
  ) {}

  async list(): Promise<CityView[]> {
    const [intersections, controllers] = await Promise.all([
      this.intersectionRepository.find({ order: { code: 'ASC' } }),
      this.controllerRepository.find({
        relations: { intersection: true },
        order: { code: 'ASC' },
      }),
    ]);

    const controllerCountByCity = new Map<string, number>();
    for (const controller of controllers) {
      const scope = this.topology.resolveIntersection(controller.intersection);
      controllerCountByCity.set(
        scope.city.id,
        (controllerCountByCity.get(scope.city.id) ?? 0) + 1,
      );
    }

    const intersectionBuckets = new Map<string, IntersectionEntity[]>();
    for (const intersection of intersections) {
      const scope = this.topology.resolveIntersection(intersection);
      const list = intersectionBuckets.get(scope.city.id) ?? [];
      list.push(intersection);
      intersectionBuckets.set(scope.city.id, list);
    }

    const rows: CityView[] = [];
    for (const region of this.topology.regions) {
      for (const city of region.cities) {
        const scopedIntersections = intersectionBuckets.get(city.id) ?? [];
        const averageDelaySeconds =
          scopedIntersections.length > 0
            ? Math.round(
                scopedIntersections.reduce(
                  (sum, item) => sum + item.averageDelaySeconds,
                  0,
                ) / scopedIntersections.length,
              )
            : 0;
        const incidentCount = scopedIntersections.reduce(
          (sum, item) => sum + item.incidents,
          0,
        );
        const tone = deriveTone(scopedIntersections);
        rows.push({
          id: city.id,
          regionId: city.regionId,
          name: city.name,
          nameAr: city.nameAr,
          center: city.center,
          defaultZoom: city.defaultZoom,
          intersectionCount: scopedIntersections.length,
          controllerCount: controllerCountByCity.get(city.id) ?? 0,
          incidentCount,
          averageDelaySeconds,
          tone,
        });
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

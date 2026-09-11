import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import {
  type BranchDirection,
  CarrefourEntity,
  CityEntity,
  ConnectedIntersectionEntity,
  ControllerEntity,
  IntersectionBranchEntity,
  IntersectionEntity,
  LaneDetailEntity,
  MovementEntity,
} from '../database/entities';
import type {
  BranchView,
  CarrefourSummary,
  CitySummary,
  ConnectedView,
  MovementView,
} from './traffic-graph.types';

const ALL_DIRECTIONS: BranchDirection[] = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SO',
  'O',
  'NO',
];

@Injectable()
export class TrafficGraphService {
  private readonly logger = new Logger(TrafficGraphService.name);

  constructor(
    @InjectRepository(CityEntity)
    private readonly cityRepository: Repository<CityEntity>,
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(IntersectionBranchEntity)
    private readonly branchRepository: Repository<IntersectionBranchEntity>,
    @InjectRepository(LaneDetailEntity)
    private readonly laneRepository: Repository<LaneDetailEntity>,
    @InjectRepository(MovementEntity)
    private readonly movementRepository: Repository<MovementEntity>,
    @InjectRepository(ConnectedIntersectionEntity)
    private readonly connectedRepository: Repository<ConnectedIntersectionEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  // ───────────── reads ─────────────

  async listCities(): Promise<CitySummary[]> {
    const rows = await this.cityRepository.find({
      relations: { carrefours: true },
      order: { name: 'ASC' },
    });
    return rows.map((row) => this.toCitySummary(row));
  }

  async listCarrefours(cityId?: string): Promise<CarrefourSummary[]> {
    const query = this.carrefourRepository
      .createQueryBuilder('carrefour')
      .leftJoinAndSelect('carrefour.city', 'city')
      .leftJoinAndSelect(
        'carrefour.engineeringIntersection',
        'engineeringIntersection',
      )
      .leftJoinAndSelect('carrefour.primaryController', 'primaryController')
      .loadRelationCountAndMap('carrefour.branchCount', 'carrefour.branches')
      .loadRelationCountAndMap('carrefour.movementCount', 'carrefour.movements')
      .loadRelationCountAndMap(
        'carrefour.inboundLinks',
        'carrefour.connectionsIn',
      )
      .loadRelationCountAndMap(
        'carrefour.outboundLinks',
        'carrefour.connectionsOut',
      )
      .orderBy('carrefour.name', 'ASC');

    if (cityId) {
      query.where('carrefour.cityId = :cityId', { cityId });
    }

    const rows = await query.getMany();
    return rows.map((row) => this.toCarrefourSummary(row));
  }

  async getCarrefour(carrefourId: string): Promise<CarrefourSummary> {
    const row = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
      relations: {
        city: true,
        engineeringIntersection: true,
        primaryController: true,
        branches: true,
        movements: true,
        connectionsIn: true,
        connectionsOut: true,
      },
    });
    if (!row)
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    return this.toCarrefourSummary(row);
  }

  async listBranches(carrefourId: string): Promise<BranchView[]> {
    const carrefour = await this.requireCarrefour(carrefourId);
    const branches = await this.branchRepository.find({
      where: { carrefourId: carrefour.id },
      relations: { lanes: true },
      order: { direction: 'ASC' },
    });
    return branches.map((branch) => ({
      id: branch.id,
      carrefourId: branch.carrefourId,
      direction: branch.direction,
      label: branch.label,
      isIncoming: branch.isIncoming,
      isOutgoing: branch.isOutgoing,
      laneCount: branch.laneCount,
      widthMetres:
        branch.widthMetres !== null ? Number(branch.widthMetres) : null,
      lengthMetres:
        branch.lengthMetres !== null ? Number(branch.lengthMetres) : null,
      storageLengthMetres:
        branch.storageLengthMetres !== null
          ? Number(branch.storageLengthMetres)
          : null,
      branchClass: branch.branchClass,
      lanes: (branch.lanes ?? [])
        .slice()
        .sort((a, b) => a.laneIndex - b.laneIndex)
        .map((lane) => ({
          id: lane.id,
          laneIndex: lane.laneIndex,
          widthMetres:
            lane.widthMetres !== null ? Number(lane.widthMetres) : null,
          allowedMovements: lane.allowedMovements ?? [],
          reservedMode: lane.reservedMode,
          hourlyCapacity: lane.hourlyCapacity,
        })),
    }));
  }

  async listMovements(carrefourId: string): Promise<MovementView[]> {
    await this.requireCarrefour(carrefourId);
    const movements = await this.movementRepository.find({
      where: { carrefourId },
      order: { fromDirection: 'ASC', toDirection: 'ASC' },
    });
    return movements.map((row) => ({
      id: row.id,
      carrefourId: row.carrefourId,
      fromDirection: row.fromDirection,
      toDirection: row.toDirection,
      status: row.status,
      protected: row.protected,
      priorityLevel: row.priorityLevel,
      hasConflict: row.hasConflict,
      conflictMovementIds: row.conflictMovementIds ?? [],
    }));
  }

  async listConnections(carrefourId: string): Promise<ConnectedView[]> {
    await this.requireCarrefour(carrefourId);
    const rows = await this.connectedRepository.find({
      where: [{ fromCarrefourId: carrefourId }, { toCarrefourId: carrefourId }],
      relations: { fromCarrefour: true, toCarrefour: true },
    });
    return rows.map((row) => ({
      id: row.id,
      fromCarrefourId: row.fromCarrefourId,
      toCarrefourId: row.toCarrefourId,
      relationKind: row.relationKind,
      distanceMetres:
        row.distanceMetres !== null ? Number(row.distanceMetres) : null,
      travelTimeSeconds:
        row.travelTimeSeconds !== null ? Number(row.travelTimeSeconds) : null,
      queueSpillbackRisk:
        row.queueSpillbackRisk !== null ? Number(row.queueSpillbackRisk) : null,
      geometry: row.geometry ?? {},
      fromLat: Number(row.fromCarrefour.lat),
      fromLng: Number(row.fromCarrefour.lng),
      toLat: Number(row.toCarrefour.lat),
      toLng: Number(row.toCarrefour.lng),
    }));
  }

  async listAllConnections(): Promise<ConnectedView[]> {
    const rows = await this.connectedRepository.find({
      relations: { fromCarrefour: true, toCarrefour: true },
    });
    return rows.map((row) => ({
      id: row.id,
      fromCarrefourId: row.fromCarrefourId,
      toCarrefourId: row.toCarrefourId,
      relationKind: row.relationKind,
      distanceMetres:
        row.distanceMetres !== null ? Number(row.distanceMetres) : null,
      travelTimeSeconds:
        row.travelTimeSeconds !== null ? Number(row.travelTimeSeconds) : null,
      queueSpillbackRisk:
        row.queueSpillbackRisk !== null ? Number(row.queueSpillbackRisk) : null,
      geometry: row.geometry ?? {},
      fromLat: Number(row.fromCarrefour.lat),
      fromLng: Number(row.fromCarrefour.lng),
      toLat: Number(row.toCarrefour.lat),
      toLng: Number(row.toCarrefour.lng),
    }));
  }

  // ───────────── seeding ─────────────

  /**
   * Materialise carrefours from existing engineering intersections
   * so the graph layer has real data even before any custom carrefour
   * is created.  Idempotent — uses engineeringIntersectionId as the
   * dedupe key.
   */
  async seedFromEngineeringIntersections(): Promise<void> {
    let intersections: IntersectionEntity[] = [];
    try {
      intersections = await this.intersectionRepository.find({
        relations: { controllers: true },
      });
    } catch {
      return;
    }
    if (intersections.length === 0) return;

    // Resolve canonical STLS cities from the backend geography
    // reference so frontend/backend selection ids stay aligned.
    const cityByCode = new Map<string, CityEntity>();
    for (const intersection of intersections) {
      const scope = this.topology.resolveIntersection(intersection);
      if (cityByCode.has(scope.city.id)) continue;
      const code = scope.city.id;
      let city = await this.cityRepository.findOne({ where: { code } });
      if (!city) {
        city = await this.cityRepository.save(
          this.cityRepository.create({
            code,
            name: scope.city.name,
            region: scope.region.name,
            countryIso: 'MA',
            centroidLat: scope.city.center.lat,
            centroidLng: scope.city.center.lng,
          }),
        );
      } else {
        city.name = scope.city.name;
        city.region = scope.region.name;
        city.centroidLat = scope.city.center.lat;
        city.centroidLng = scope.city.center.lng;
        city = await this.cityRepository.save(city);
      }
      cityByCode.set(scope.city.id, city);
    }

    // One carrefour per engineering intersection.
    for (const intersection of intersections) {
      try {
        const scope = this.topology.resolveIntersection(intersection);
        const city = cityByCode.get(scope.city.id) ?? null;
        const primaryController =
          intersection.controllers?.find(
            (controller) => controller.isPrimary,
          ) ??
          intersection.controllers?.[0] ??
          null;

        // Match on the engineering link first, then fall back to the
        // carrefour `code` (which carries a UNIQUE constraint).  A row can
        // legitimately pre-exist with a null/stale engineeringIntersectionId
        // — imported from a carfmap, or left behind when an engineering
        // intersection was recreated with a fresh uuid.  Without the code
        // fallback the insert below collides with UQ_carrefours_code and the
        // whole sync aborts, so every later intersection is skipped too.
        const existing =
          (await this.carrefourRepository.findOne({
            where: { engineeringIntersectionId: intersection.id },
          })) ??
          (await this.carrefourRepository.findOne({
            where: { code: intersection.code },
          }));
        if (existing) {
          // Adopt an orphan/stale row instead of duplicating its code.
          const adopted =
            existing.engineeringIntersectionId !== intersection.id;
          existing.engineeringIntersectionId = intersection.id;
          existing.cityId = city?.id ?? existing.cityId;
          existing.primaryControllerId =
            primaryController?.id ?? existing.primaryControllerId;
          existing.lat = Number(intersection.latitude);
          existing.lng = Number(intersection.longitude);
          existing.name = intersection.name;
          await this.carrefourRepository.save(existing);
          // A row we just adopted was never seeded through this path, so it
          // may have no branches/movements.  Both seeders are no-ops when
          // rows already exist, and we only pay for them on adoption.
          if (adopted) {
            await this.seedDefaultBranches(existing.id);
            await this.seedDefaultMovements(existing.id);
          }
          continue;
        }

        const carrefour = await this.carrefourRepository.save(
          this.carrefourRepository.create({
            code: intersection.code,
            name: intersection.name,
            cityId: city?.id ?? null,
            engineeringIntersectionId: intersection.id,
            primaryControllerId: primaryController?.id ?? null,
            lat: Number(intersection.latitude),
            lng: Number(intersection.longitude),
            intersectionType: 'cross',
            regulationType: 'signalized',
            metadata: {
              seededFromEngineering: true,
              regionId: scope.region.id,
              cityCode: scope.city.id,
              zoneId: scope.zone?.id ?? null,
            },
          }),
        );

        // Default 4-arm branch set: N/E/S/O all incoming + outgoing.
        await this.seedDefaultBranches(carrefour.id);
        // Default movement matrix: through + L/R from each branch.
        await this.seedDefaultMovements(carrefour.id);
      } catch (error) {
        // One malformed intersection must not abort the whole sync.
        this.logger.warn(
          `Carrefour sync skipped for intersection "${intersection.code}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Auto-link carrefours that share a city by nearest-neighbour
    // (≤ 800 m) so the network has corridor edges to render.
    await this.seedNeighbourConnections();
    this.logger.log(
      `Seeded ${intersections.length} carrefours from engineering intersections.`,
    );
  }

  private async seedDefaultBranches(carrefourId: string): Promise<void> {
    const existing = await this.branchRepository.find({
      where: { carrefourId },
    });
    if (existing.length > 0) return;
    const directions: BranchDirection[] = ['N', 'E', 'S', 'O'];
    for (const direction of directions) {
      const branch = await this.branchRepository.save(
        this.branchRepository.create({
          carrefourId,
          direction,
          label: `Branche ${direction}`,
          isIncoming: true,
          isOutgoing: true,
          laneCount: 2,
          widthMetres: 7,
          lengthMetres: 60,
          storageLengthMetres: 30,
          branchClass: 'urban',
        }),
      );
      // Two lanes per branch by default.
      for (let i = 0; i < 2; i++) {
        await this.laneRepository.save(
          this.laneRepository.create({
            branchId: branch.id,
            laneIndex: i,
            widthMetres: 3.25,
            allowedMovements:
              i === 0 ? ['through', 'right'] : ['through', 'left'],
            reservedMode: null,
            hourlyCapacity: 1800,
          }),
        );
      }
    }
  }

  private async seedDefaultMovements(carrefourId: string): Promise<void> {
    const existing = await this.movementRepository.find({
      where: { carrefourId },
    });
    if (existing.length > 0) return;
    const directions: BranchDirection[] = ['N', 'E', 'S', 'O'];
    const movements: Array<Partial<MovementEntity>> = [];
    for (const from of directions) {
      for (const to of directions) {
        if (from === to) continue;
        movements.push({
          carrefourId,
          fromDirection: from,
          toDirection: to,
          status: 'allowed',
          protected: false,
          hasConflict: opposingDirection(from) !== to,
          conflictMovementIds: [],
        });
      }
    }
    await this.movementRepository.save(
      movements.map((movement) => this.movementRepository.create(movement)),
    );
  }

  private async seedNeighbourConnections(): Promise<void> {
    const carrefours = await this.carrefourRepository.find();
    const byCity = new Map<string, CarrefourEntity[]>();
    for (const carrefour of carrefours) {
      const key = carrefour.cityId ?? 'no-city';
      const list = byCity.get(key) ?? [];
      list.push(carrefour);
      byCity.set(key, list);
    }

    for (const [, list] of byCity) {
      if (list.length < 2) continue;
      for (const a of list) {
        const neighbours = list
          .filter((b) => b.id !== a.id)
          .map((b) => ({ b, distance: haversine(a, b) }))
          .filter((entry) => entry.distance <= 800)
          .sort((x, y) => x.distance - y.distance)
          .slice(0, 3);
        for (const { b, distance } of neighbours) {
          const existing = await this.connectedRepository.findOne({
            where: {
              fromCarrefourId: a.id,
              toCarrefourId: b.id,
              relationKind: 'corridor',
            },
          });
          if (existing) continue;
          await this.connectedRepository.save(
            this.connectedRepository.create({
              fromCarrefourId: a.id,
              toCarrefourId: b.id,
              relationKind: 'corridor',
              distanceMetres: Math.round(distance),
              travelTimeSeconds: Math.round((distance / 8.5) * 1.3), // ~30 km/h with stops
              queueSpillbackRisk: distance < 200 ? 0.6 : 0.2,
              geometry: {},
            }),
          );
        }
      }
    }
  }

  // ───────────── helpers ─────────────

  private async requireCarrefour(
    carrefourId: string,
  ): Promise<CarrefourEntity> {
    const row = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!row)
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    return row;
  }

  private toCitySummary(city: CityEntity): CitySummary {
    return {
      id: city.id,
      code: city.code,
      name: city.name,
      region: city.region,
      countryIso: city.countryIso,
      centroid:
        city.centroidLat != null && city.centroidLng != null
          ? { lat: Number(city.centroidLat), lng: Number(city.centroidLng) }
          : null,
      carrefourCount: city.carrefours?.length ?? 0,
    };
  }

  private toCarrefourSummary(carrefour: CarrefourEntity): CarrefourSummary {
    const counts = carrefour as CarrefourEntity & {
      branchCount?: number;
      movementCount?: number;
      inboundLinks?: number;
      outboundLinks?: number;
    };

    return {
      id: carrefour.id,
      code: carrefour.code,
      name: carrefour.name,
      cityId: carrefour.cityId,
      cityName: carrefour.city?.name ?? null,
      engineeringIntersectionId: carrefour.engineeringIntersectionId,
      engineeringIntersectionCode:
        carrefour.engineeringIntersection?.code ?? null,
      primaryControllerId: carrefour.primaryControllerId,
      primaryControllerCode: carrefour.primaryController?.code ?? null,
      primaryControllerType:
        carrefour.primaryController?.controllerType ?? null,
      primaryControllerConnectionState:
        carrefour.primaryController?.connectionState ?? null,
      lat: Number(carrefour.lat),
      lng: Number(carrefour.lng),
      intersectionType: carrefour.intersectionType,
      regulationType: carrefour.regulationType,
      saturationScore:
        carrefour.saturationScore !== null
          ? Number(carrefour.saturationScore)
          : null,
      criticalityScore:
        carrefour.criticalityScore !== null
          ? Number(carrefour.criticalityScore)
          : null,
      branchCount: counts.branchCount ?? carrefour.branches?.length ?? 0,
      movementCount: counts.movementCount ?? carrefour.movements?.length ?? 0,
      inboundLinks: counts.inboundLinks ?? carrefour.connectionsIn?.length ?? 0,
      outboundLinks:
        counts.outboundLinks ?? carrefour.connectionsOut?.length ?? 0,
    };
  }
}

function slugify(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function opposingDirection(direction: BranchDirection): BranchDirection {
  const idx = ALL_DIRECTIONS.indexOf(direction);
  return ALL_DIRECTIONS[(idx + 4) % 8];
}

function haversine(a: CarrefourEntity, b: CarrefourEntity): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(Number(b.lat) - Number(a.lat));
  const dLng = toRad(Number(b.lng) - Number(a.lng));
  const lat1 = toRad(Number(a.lat));
  const lat2 = toRad(Number(b.lat));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

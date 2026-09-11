import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
  IntersectionBranchEntity,
  LaneDetailEntity,
} from '../database/entities';
import type {
  UpsertBranchDto,
  UpsertConnectionDto,
} from './traffic-geometry.dto';

@Injectable()
export class TrafficGeometryService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(IntersectionBranchEntity)
    private readonly branchRepository: Repository<IntersectionBranchEntity>,
    @InjectRepository(LaneDetailEntity)
    private readonly laneRepository: Repository<LaneDetailEntity>,
    @InjectRepository(ConnectedIntersectionEntity)
    private readonly connectedRepository: Repository<ConnectedIntersectionEntity>,
  ) {}

  async upsertBranch(carrefourId: string, dto: UpsertBranchDto) {
    const carrefour = await this.carrefourRepository.findOne({
      where: { id: carrefourId },
    });
    if (!carrefour) {
      throw new NotFoundException(`Carrefour "${carrefourId}" not found.`);
    }
    let branch = await this.branchRepository.findOne({
      where: { carrefourId, direction: dto.direction },
    });
    if (!branch) {
      branch = this.branchRepository.create({
        carrefourId,
        direction: dto.direction,
      });
    }
    if (dto.label !== undefined) branch.label = dto.label;
    if (dto.isIncoming !== undefined) branch.isIncoming = dto.isIncoming;
    if (dto.isOutgoing !== undefined) branch.isOutgoing = dto.isOutgoing;
    if (dto.laneCount !== undefined) branch.laneCount = dto.laneCount;
    if (dto.widthMetres !== undefined) branch.widthMetres = dto.widthMetres;
    if (dto.lengthMetres !== undefined) branch.lengthMetres = dto.lengthMetres;
    if (dto.storageLengthMetres !== undefined) {
      branch.storageLengthMetres = dto.storageLengthMetres;
    }
    if (dto.branchClass !== undefined) branch.branchClass = dto.branchClass;

    branch = await this.branchRepository.save(branch);

    if (dto.lanes && dto.lanes.length > 0) {
      for (const laneInput of dto.lanes) {
        let lane = await this.laneRepository.findOne({
          where: { branchId: branch.id, laneIndex: laneInput.laneIndex },
        });
        if (!lane) {
          lane = this.laneRepository.create({
            branchId: branch.id,
            laneIndex: laneInput.laneIndex,
          });
        }
        if (laneInput.widthMetres !== undefined) {
          lane.widthMetres = laneInput.widthMetres;
        }
        if (laneInput.allowedMovements !== undefined) {
          lane.allowedMovements = laneInput.allowedMovements;
        }
        if (laneInput.reservedMode !== undefined) {
          lane.reservedMode = laneInput.reservedMode;
        }
        if (laneInput.hourlyCapacity !== undefined) {
          lane.hourlyCapacity = laneInput.hourlyCapacity;
        }
        await this.laneRepository.save(lane);
      }
    }

    return this.branchRepository.findOne({
      where: { id: branch.id },
      relations: { lanes: true },
    });
  }

  async upsertConnection(dto: UpsertConnectionDto) {
    const [from, to] = await Promise.all([
      this.carrefourRepository.findOne({ where: { id: dto.fromCarrefourId } }),
      this.carrefourRepository.findOne({ where: { id: dto.toCarrefourId } }),
    ]);
    if (!from || !to) {
      throw new NotFoundException(
        `Carrefour pair (${dto.fromCarrefourId}, ${dto.toCarrefourId}) not found.`,
      );
    }
    const relationKind = dto.relationKind ?? 'corridor';
    let link = await this.connectedRepository.findOne({
      where: {
        fromCarrefourId: dto.fromCarrefourId,
        toCarrefourId: dto.toCarrefourId,
        relationKind,
      },
    });
    if (!link) {
      link = this.connectedRepository.create({
        fromCarrefourId: dto.fromCarrefourId,
        toCarrefourId: dto.toCarrefourId,
        relationKind,
      });
    }
    if (dto.distanceMetres !== undefined)
      link.distanceMetres = dto.distanceMetres;
    if (dto.travelTimeSeconds !== undefined) {
      link.travelTimeSeconds = dto.travelTimeSeconds;
    }
    if (dto.queueSpillbackRisk !== undefined) {
      link.queueSpillbackRisk = dto.queueSpillbackRisk;
    }
    return this.connectedRepository.save(link);
  }
}

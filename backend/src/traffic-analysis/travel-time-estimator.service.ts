import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  CarrefourEntity,
  ConnectedIntersectionEntity,
} from '../database/entities';
import { SaturationEstimatorService } from './saturation-estimator.service';
import type {
  AnalysisHeuristicNote,
  TravelTimeResult,
} from './traffic-analysis.types';

const FREE_FLOW_KPH = 35;

@Injectable()
export class TravelTimeEstimatorService {
  constructor(
    @InjectRepository(CarrefourEntity)
    private readonly carrefourRepository: Repository<CarrefourEntity>,
    @InjectRepository(ConnectedIntersectionEntity)
    private readonly connectedRepository: Repository<ConnectedIntersectionEntity>,
    private readonly saturationService: SaturationEstimatorService,
  ) {}

  async estimateBetween(
    fromCarrefourId: string,
    toCarrefourId: string,
  ): Promise<TravelTimeResult> {
    const [from, to] = await Promise.all([
      this.carrefourRepository.findOne({ where: { id: fromCarrefourId } }),
      this.carrefourRepository.findOne({ where: { id: toCarrefourId } }),
    ]);
    if (!from || !to) {
      throw new NotFoundException(
        `Carrefour pair (${fromCarrefourId}, ${toCarrefourId}) not found.`,
      );
    }
    const link = await this.connectedRepository.findOne({
      where: [
        {
          fromCarrefourId,
          toCarrefourId,
        },
        {
          fromCarrefourId: toCarrefourId,
          toCarrefourId: fromCarrefourId,
        },
      ],
    });
    const distanceMetres = link?.distanceMetres
      ? Number(link.distanceMetres)
      : haversine(from, to);
    const freeFlowSeconds = (distanceMetres / 1000) * (3600 / FREE_FLOW_KPH);
    const downstream = await this.saturationService
      .estimateForCarrefour(toCarrefourId)
      .catch(() => null);
    const downstreamSat = downstream?.overallSaturation ?? 0;
    const congestionFactor = 1 + Math.max(0, downstreamSat - 0.5) * 1.4;
    const estimatedSeconds = Math.round(freeFlowSeconds * congestionFactor);

    const notes: AnalysisHeuristicNote[] = [];
    if (!link) notes.push('fallback_default');
    if (downstream == null) notes.push('no_observation');
    if (downstreamSat >= 0.9) notes.push('spillback_risk_high');

    return {
      fromCarrefourId,
      toCarrefourId,
      distanceMetres: Math.round(distanceMetres),
      freeFlowSeconds: Math.round(freeFlowSeconds),
      estimatedSeconds,
      congestionFactor: Number(congestionFactor.toFixed(3)),
      notes,
    };
  }
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

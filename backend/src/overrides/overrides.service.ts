import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  IntersectionEntity,
  OverrideCommandEntity,
  OverrideResult,
} from '../database/entities';
import type { LogOverrideDto } from './dto/log-override.dto';
import type { OverrideCommandResponse } from './overrides.types';

@Injectable()
export class OverridesService {
  private readonly logger = new Logger(OverridesService.name);

  constructor(
    @InjectRepository(OverrideCommandEntity)
    private readonly overrideRepository: Repository<OverrideCommandEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
  ) {}

  async logOverride(
    intersectionCode: string,
    dto: LogOverrideDto,
    context: {
      ipAddress?: string | null;
      operatorUserId?: string | null;
    } = {},
  ): Promise<OverrideCommandResponse> {
    const intersection = await this.intersectionRepository
      .findOne({ where: { code: intersectionCode } })
      .catch(() => null);

    const issuedAt = new Date();
    const expiresAt =
      dto.durationSeconds != null
        ? new Date(issuedAt.getTime() + dto.durationSeconds * 1000)
        : null;

    const saved = await this.overrideRepository.save(
      this.overrideRepository.create({
        action: dto.action,
        reasonCode: dto.reasonCode,
        note: dto.note ?? null,
        result: OverrideResult.ACCEPTED,
        durationSeconds: dto.durationSeconds ?? null,
        payload: dto.targetReference
          ? { targetReference: dto.targetReference }
          : {},
        ipAddress: context.ipAddress ?? null,
        issuedAt,
        expiresAt,
        intersectionCode,
        intersectionId: intersection?.id ?? null,
        operatorUserId: context.operatorUserId ?? null,
      }),
    );

    this.logger.log(
      `Override ${saved.action} on ${intersectionCode} — reason: ${saved.reasonCode}`,
    );

    return this.toResponse(saved);
  }

  async listRecentForIntersection(
    intersectionCode: string,
    limit = 25,
  ): Promise<OverrideCommandResponse[]> {
    const rows = await this.overrideRepository.find({
      where: { intersectionCode },
      order: { issuedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listRecent(limit = 50): Promise<OverrideCommandResponse[]> {
    const rows = await this.overrideRepository.find({
      order: { issuedAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(row: OverrideCommandEntity): OverrideCommandResponse {
    return {
      id: row.id,
      intersectionCode: row.intersectionCode,
      action: row.action,
      reasonCode: row.reasonCode,
      note: row.note,
      result: row.result,
      durationSeconds: row.durationSeconds,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      operatorUserId: row.operatorUserId,
    };
  }
}

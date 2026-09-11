import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLogEntity, AuditOutcome } from '../database/entities';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
  ) {}

  record(entry: {
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: AuditOutcome;
    method: string;
    route: string;
    actorUserId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    return this.auditLogRepository.save(
      this.auditLogRepository.create({
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        method: entry.method,
        route: entry.route,
        actorUserId: entry.actorUserId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: entry.metadata ?? {},
      }),
    );
  }

  findRecent(limit = 100) {
    return this.auditLogRepository.find({
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }
}

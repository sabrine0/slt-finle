import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, tap, throwError } from 'rxjs';

import {
  AUDIT_ACTION_KEY,
  AuditActionMetadata,
} from './audit-action.decorator';
import { AuditLogService } from './audit-log.service';
import { AuditOutcome } from '../database/entities';
import type { AuthenticatedRequestUser } from '../auth/types/authenticated-user';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const metadata = this.reflector.getAllAndOverride<AuditActionMetadata>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditRequest>();
    const resourceId = metadata.resourceIdParam
      ? request.params?.[metadata.resourceIdParam]
      : undefined;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.auditLogService.record({
            action: metadata.action,
            resourceType: metadata.resourceType,
            resourceId,
            outcome: AuditOutcome.SUCCESS,
            method: request.method,
            route: request.route?.path ?? request.url,
            actorUserId: request.user?.sub ?? null,
            ipAddress: request.ip ?? null,
            userAgent: request.headers['user-agent'],
            metadata: sanitizePayload(request.body),
          });
        },
      }),
      catchError((error: unknown) => {
        void this.auditLogService.record({
          action: metadata.action,
          resourceType: metadata.resourceType,
          resourceId,
          outcome: AuditOutcome.FAILURE,
          method: request.method,
          route: request.route?.path ?? request.url,
          actorUserId: request.user?.sub ?? null,
          ipAddress: request.ip ?? null,
          userAgent: request.headers['user-agent'],
          metadata: {
            ...sanitizePayload(request.body),
            error:
              error instanceof Error ? error.message : 'Unknown audit failure',
          },
        });

        return throwError(() => error);
      }),
    );
  }
}

interface AuditRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string | undefined>;
  ip?: string;
  method: string;
  params?: Record<string, string>;
  route?: { path?: string };
  url: string;
  user?: AuthenticatedRequestUser;
}

function sanitizePayload(payload?: Record<string, unknown>) {
  if (!payload) {
    return {};
  }

  const clone = { ...payload };

  for (const sensitiveKey of ['password', 'refreshToken', 'token']) {
    if (sensitiveKey in clone) {
      clone[sensitiveKey] = '[redacted]';
    }
  }

  return clone;
}

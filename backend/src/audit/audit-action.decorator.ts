import { SetMetadata } from '@nestjs/common';

export interface AuditActionMetadata {
  action: string;
  resourceType: string;
  resourceIdParam?: string;
}

export const AUDIT_ACTION_KEY = 'auditAction';
export const AuditAction = (metadata: AuditActionMetadata) =>
  SetMetadata(AUDIT_ACTION_KEY, metadata);

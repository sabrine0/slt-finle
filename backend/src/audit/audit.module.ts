import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLogEntity } from '../database/entities';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [
    AuditLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}

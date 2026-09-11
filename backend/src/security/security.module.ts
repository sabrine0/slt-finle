import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import appConfig from '../config/app.config';
import {
  AuditLogEntity,
  PermissionEntity,
  RoleEntity,
  UserEntity,
} from '../database/entities';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forFeature([
      UserEntity,
      RoleEntity,
      PermissionEntity,
      AuditLogEntity,
    ]),
  ],
  controllers: [SecurityController],
  providers: [SecurityService],
})
export class SecurityModule {}

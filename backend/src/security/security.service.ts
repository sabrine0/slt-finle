import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import appConfig from '../config/app.config';
import {
  AuditLogEntity,
  PermissionEntity,
  RoleEntity,
  UserEntity,
} from '../database/entities';
import { CreateUserDto } from './dto/security.dto';

@Injectable()
export class SecurityService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
  ) {}

  listUsers() {
    return this.userRepository.find({
      relations: {
        roles: {
          permissions: true,
        },
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  listRoles() {
    return this.roleRepository.find({
      relations: {
        permissions: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  listPermissions() {
    return this.permissionRepository.find({
      order: {
        code: 'ASC',
      },
    });
  }

  listAuditLogs(limit = 100) {
    return this.auditLogRepository.find({
      order: {
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  async createUser(createUserDto: CreateUserDto) {
    const roles = await this.roleRepository.find({
      where: createUserDto.roleNames.map((roleName) => ({ name: roleName })),
      relations: {
        permissions: true,
      },
    });

    if (roles.length !== createUserDto.roleNames.length) {
      throw new NotFoundException('One or more roles were not found.');
    }

    const passwordHash = await bcrypt.hash(
      createUserDto.password,
      this.config.bcryptSaltRounds,
    );

    return this.userRepository.save(
      this.userRepository.create({
        email: createUserDto.email.toLowerCase(),
        fullName: createUserDto.fullName,
        passwordHash,
        isActive: true,
        mfaEnabled: false,
        lastLoginAt: null,
        passwordChangedAt: new Date(),
        roles,
      }),
    );
  }
}

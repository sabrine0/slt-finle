import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../database/entities';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  findByEmail(email: string) {
    return this.userRepository.findOne({
      where: {
        email: email.toLowerCase(),
      },
      relations: {
        roles: {
          permissions: true,
        },
      },
    });
  }

  findById(id: string) {
    return this.userRepository.findOne({
      where: { id },
      relations: {
        roles: {
          permissions: true,
        },
      },
    });
  }

  async updateLastLogin(userId: string) {
    await this.userRepository.update(userId, {
      lastLoginAt: new Date(),
    });
  }
}

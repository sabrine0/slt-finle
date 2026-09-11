import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import appConfig from '../config/app.config';
import { RefreshTokenEntity, UserEntity } from '../database/entities';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/auth.dto';
import type { AuthenticatedRequestUser } from './types/authenticated-user';

interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, requestContext: RequestContext) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.usersService.updateLastLogin(user.id);
    return this.issueTokenPair(user, requestContext);
  }

  async refresh(refreshToken: string, requestContext: RequestContext) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const persistedToken = await this.refreshTokenRepository.findOne({
      where: {
        id: payload.tokenId,
        userId: payload.sub,
      },
      relations: {
        user: {
          roles: {
            permissions: true,
          },
        },
      },
    });

    if (
      !persistedToken ||
      persistedToken.revokedAt ||
      persistedToken.isCompromised
    ) {
      throw new UnauthorizedException('Refresh token is invalid or revoked.');
    }

    if (persistedToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired.');
    }

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      persistedToken.tokenHash,
    );

    if (!tokenMatches) {
      persistedToken.isCompromised = true;
      await this.refreshTokenRepository.save(persistedToken);
      throw new UnauthorizedException('Refresh token validation failed.');
    }

    persistedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(persistedToken);

    return this.issueTokenPair(
      persistedToken.user,
      requestContext,
      persistedToken.id,
    );
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const persistedToken = await this.refreshTokenRepository.findOne({
      where: {
        id: payload.tokenId,
        userId: payload.sub,
      },
    });

    if (!persistedToken) {
      return { revoked: true };
    }

    persistedToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(persistedToken);
    return { revoked: true };
  }

  async getProfile(user: AuthenticatedRequestUser) {
    const persistedUser = await this.usersService.findById(user.sub);

    if (!persistedUser) {
      throw new UnauthorizedException('User no longer exists.');
    }

    return this.serializeUser(persistedUser);
  }

  private async issueTokenPair(
    user: UserEntity,
    requestContext: RequestContext,
    replacedTokenId?: string,
  ) {
    const accessPayload = this.buildAccessPayload(user);
    const expiresAt = new Date(
      Date.now() + parseDurationMs(this.config.refreshTokenTtl),
    );
    const refreshTokenRecord = await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        tokenHash: 'pending',
        expiresAt,
        revokedAt: null,
        replacedByTokenId: null,
        userAgent: requestContext.userAgent ?? null,
        ipAddress: requestContext.ipAddress ?? null,
        isCompromised: false,
        deviceName: null,
        userId: user.id,
      }),
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        tokenId: refreshTokenRecord.id,
        type: 'refresh',
      },
      {
        secret: this.config.refreshTokenSecret,
        expiresIn: asTokenExpiry(this.config.refreshTokenTtl),
        issuer: this.config.jwtIssuer,
      },
    );

    refreshTokenRecord.tokenHash = await bcrypt.hash(
      refreshToken,
      this.config.bcryptSaltRounds,
    );
    await this.refreshTokenRepository.save(refreshTokenRecord);

    if (replacedTokenId) {
      await this.refreshTokenRepository.update(
        {
          id: replacedTokenId,
          userId: user.id,
        },
        {
          replacedByTokenId: refreshTokenRecord.id,
        },
      );
    }

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.config.accessTokenSecret,
      expiresIn: asTokenExpiry(this.config.accessTokenTtl),
      issuer: this.config.jwtIssuer,
    });

    return {
      accessToken,
      refreshToken,
      user: this.serializeUser(user),
    };
  }

  private buildAccessPayload(user: UserEntity): AuthenticatedRequestUser {
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((role) =>
          role.permissions.map((permission) => permission.code),
        ),
      ),
    );

    return {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles.map((role) => role.name),
      permissions,
    };
  }

  private serializeUser(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roles: user.roles.map((role) => ({
        id: role.id,
        name: role.name,
        displayName: role.displayName,
      })),
      permissions: Array.from(
        new Set(
          user.roles.flatMap((role) =>
            role.permissions.map((permission) => permission.code),
          ),
        ),
      ),
    };
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwtService.verifyAsync<{
        sub: string;
        tokenId: string;
        type: string;
      }>(refreshToken, {
        secret: this.config.refreshTokenSecret,
        issuer: this.config.jwtIssuer,
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid.');
    }
  }
}

function parseDurationMs(duration: string) {
  const match = /^(\d+)([smhd])$/.exec(duration);

  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return value;
  }
}

function asTokenExpiry(duration: string) {
  return duration as `${number}${'s' | 'm' | 'h' | 'd'}`;
}

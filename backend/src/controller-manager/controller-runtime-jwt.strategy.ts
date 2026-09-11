import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';

import appConfig from '../config/app.config';
import { ControllerEntity } from '../database/entities';
import type { AuthenticatedController } from './types/authenticated-controller';

@Injectable()
export class ControllerRuntimeJwtStrategy extends PassportStrategy(
  Strategy,
  'controller-jwt',
) {
  constructor(
    @Inject(appConfig.KEY)
    config: ConfigType<typeof appConfig>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.controllerAccessTokenSecret,
      issuer: `${config.jwtIssuer}:controller`,
    });
  }

  async validate(payload: AuthenticatedController) {
    const controller = await this.controllerRepository.findOne({
      where: {
        id: payload.sub,
      },
    });

    if (!controller) {
      throw new UnauthorizedException('Controller identity is invalid.');
    }

    return payload;
  }
}

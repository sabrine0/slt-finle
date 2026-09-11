import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import {
  isPublicForEnvironment,
  PUBLIC_ACCESS_KEY,
  type PublicAccessOptions,
} from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const publicAccess = this.reflector.getAllAndOverride<PublicAccessOptions>(
      PUBLIC_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isPublic = isPublicForEnvironment(
      publicAccess,
      process.env.NODE_ENV ?? 'development',
    );

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}

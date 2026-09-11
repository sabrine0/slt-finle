import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import {
  isPublicForEnvironment,
  PUBLIC_ACCESS_KEY,
  type PublicAccessOptions,
} from '../../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from '../types/authenticated-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    const userPermissions = new Set(request.user?.permissions ?? []);
    const missingPermission = requiredPermissions.find(
      (permission) => !userPermissions.has(permission),
    );

    if (missingPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${missingPermission}`,
      );
    }

    return true;
  }
}

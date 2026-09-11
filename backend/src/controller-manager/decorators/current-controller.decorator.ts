import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedController } from '../types/authenticated-controller';

export const CurrentController = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedController => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedController;
    }>();

    return request.user as AuthenticatedController;
  },
);

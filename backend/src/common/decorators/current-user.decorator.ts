import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequestUser } from '../../auth/types/authenticated-user';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AuthenticatedRequestUser | undefined => {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    return request.user;
  },
);

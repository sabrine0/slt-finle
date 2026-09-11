import { SetMetadata } from '@nestjs/common';

export interface PublicAccessOptions {
  allowedEnvironments?: string[];
}

export const PUBLIC_ACCESS_KEY = 'publicAccess';
export const Public = (options: PublicAccessOptions = {}) =>
  SetMetadata(PUBLIC_ACCESS_KEY, options);
export const DevPublic = () =>
  Public({
    allowedEnvironments: ['development', 'local', 'test'],
  });

export function isPublicForEnvironment(
  publicAccess: PublicAccessOptions | undefined,
  nodeEnv: string,
) {
  if (!publicAccess) {
    return false;
  }

  if (!publicAccess.allowedEnvironments?.length) {
    return true;
  }

  return publicAccess.allowedEnvironments.includes(nodeEnv);
}

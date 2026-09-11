import type { OperatingEnvironment } from '../../database/entities';

export interface AuthenticatedController {
  sub: string;
  controllerCode: string;
  clientId: string;
  operatingEnvironment: OperatingEnvironment;
  intersectionId: string;
  type: 'controller';
}

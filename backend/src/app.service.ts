import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'stls-hybrid-backend',
    };
  }

  getMeta() {
    return {
      service: 'stls-hybrid-backend',
      environment: this.configService.get<string>('NODE_ENV') ?? 'development',
      jwtIssuer: this.configService.get<string>('JWT_ISSUER') ?? 'stls-hybrid',
      serverTime: new Date().toISOString(),
    };
  }
}

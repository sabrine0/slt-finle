import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'NODE_ENV') return 'test';
              if (key === 'JWT_ISSUER') return 'stls-hybrid';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return backend health', () => {
      expect(appController.getHealth()).toEqual({
        status: 'ok',
        service: 'stls-hybrid-backend',
      });
    });
  });

  describe('meta', () => {
    it('should return backend meta with environment and jwt issuer', () => {
      const meta = appController.getMeta();
      expect(meta.service).toBe('stls-hybrid-backend');
      expect(meta.environment).toBe('test');
      expect(meta.jwtIssuer).toBe('stls-hybrid');
      expect(typeof meta.serverTime).toBe('string');
    });
  });
});

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  IntersectionEntity,
  IntersectionRuntimeConfigEntity,
} from '../database/entities';
import { TrafficModule } from '../traffic/traffic.module';
import { IntersectionRuntimeController } from './intersection-runtime.controller';
import { IntersectionRuntimeGateway } from './intersection-runtime.gateway';
import { IntersectionRuntimeService } from './intersection-runtime.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntersectionEntity,
      IntersectionRuntimeConfigEntity,
    ]),
    TrafficModule,
  ],
  controllers: [IntersectionRuntimeController],
  providers: [IntersectionRuntimeService, IntersectionRuntimeGateway],
  exports: [IntersectionRuntimeService],
})
export class IntersectionRuntimeModule {}

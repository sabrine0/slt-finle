import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  IntersectionEntity,
  OverrideCommandEntity,
} from '../database/entities';
import { OverridesController } from './overrides.controller';
import { OverridesService } from './overrides.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OverrideCommandEntity, IntersectionEntity]),
  ],
  controllers: [OverridesController],
  providers: [OverridesService],
  exports: [OverridesService],
})
export class OverridesModule {}

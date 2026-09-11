import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ControllerEntity,
  CorridorControlSessionEntity,
  CorridorEntity,
  CorridorIntersectionEntity,
  CorridorScenarioAssignmentEntity,
  IntersectionEntity,
  OverrideCommandEntity,
} from '../database/entities';
import { IntersectionRuntimeModule } from '../intersection-runtime/intersection-runtime.module';
import { TrafficModule } from '../traffic/traffic.module';
import { CorridorsController } from './corridors.controller';
import { CorridorsService } from './corridors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CorridorEntity,
      CorridorIntersectionEntity,
      CorridorScenarioAssignmentEntity,
      CorridorControlSessionEntity,
      IntersectionEntity,
      ControllerEntity,
      OverrideCommandEntity,
    ]),
    IntersectionRuntimeModule,
    TrafficModule,
  ],
  controllers: [CorridorsController],
  providers: [CorridorsService],
  exports: [CorridorsService],
})
export class CorridorsModule implements OnApplicationBootstrap {
  constructor(private readonly corridorsService: CorridorsService) {}

  async onApplicationBootstrap() {
    try {
      await this.corridorsService.ensureDemoSeed();
    } catch {
      /* DB may not be ready yet; non-fatal for dev boot */
    }
  }
}

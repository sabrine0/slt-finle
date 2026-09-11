import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import { OverrideCommandEntity } from '../database/entities';
import { OperatorActionsController } from './operator-actions.controller';
import { OperatorActionsService } from './operator-actions.service';

@Module({
  imports: [TypeOrmModule.forFeature([OverrideCommandEntity]), CitiesModule],
  controllers: [OperatorActionsController],
  providers: [OperatorActionsService],
  exports: [OperatorActionsService],
})
export class OperatorActionsModule {}

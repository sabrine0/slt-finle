import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitiesModule } from '../cities/cities.module';
import { ControllerEntity } from '../database/entities';
import { ControllersController } from './controllers.controller';
import { ControllersService } from './controllers.service';

@Module({
  imports: [TypeOrmModule.forFeature([ControllerEntity]), CitiesModule],
  controllers: [ControllersController],
  providers: [ControllersService],
  exports: [ControllersService],
})
export class ControllersModule {}

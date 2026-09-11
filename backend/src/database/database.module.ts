import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import appConfig from '../config/app.config';
import { databaseEntities } from './database.entities';
import { DatabaseSeedService } from './database-seed.service';
import { createDatabaseOptions } from './database.options';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule.forFeature(appConfig)],
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => ({
        ...createDatabaseOptions(config),
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature(databaseEntities),
  ],
  providers: [DatabaseSeedService],
  exports: [TypeOrmModule, DatabaseSeedService],
})
export class DatabaseModule {}

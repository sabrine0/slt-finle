import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  IntersectionEntity,
  OrganizationEntity,
  ProjectEntity,
  SiteEntity,
} from '../database/entities';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      ProjectEntity,
      SiteEntity,
      IntersectionEntity,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule implements OnApplicationBootstrap {
  constructor(private readonly projectsService: ProjectsService) {}

  async onApplicationBootstrap() {
    try {
      await this.projectsService.ensureDefaultSeed();
    } catch {
      /* DB may not be ready or tables missing — non-fatal for dev boot */
    }
  }
}

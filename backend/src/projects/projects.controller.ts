import { Controller, Get, Param } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ProjectsService } from './projects.service';

@DevPublic()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @RequirePermissions('command-platform.read')
  @Get()
  listProjects() {
    return this.projectsService.listProjects();
  }

  @RequirePermissions('command-platform.read')
  @Get('organizations')
  listOrganizations() {
    return this.projectsService.listOrganizations();
  }

  @RequirePermissions('command-platform.read')
  @Get(':id')
  getProject(@Param('id') projectId: string) {
    return this.projectsService.getProject(projectId);
  }
}

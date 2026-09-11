import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  IntersectionEntity,
  OrganizationEntity,
  OrganizationType,
  ProjectEntity,
  ProjectStatus,
  SiteEntity,
} from '../database/entities';

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  clientReference: string | null;
  organization: {
    id: string;
    code: string;
    name: string;
    type: OrganizationType;
  };
  sites: Array<{
    id: string;
    code: string;
    name: string;
    city: string | null;
    region: string | null;
  }>;
  intersectionCount: number;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
    @InjectRepository(SiteEntity)
    private readonly siteRepository: Repository<SiteEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
  ) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const projects = await this.projectRepository.find({
      relations: { organization: true, sites: true },
      order: { createdAt: 'ASC' },
    });

    return Promise.all(projects.map((project) => this.toSummary(project)));
  }

  async getProject(projectId: string): Promise<ProjectSummary> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: { organization: true, sites: true },
    });
    if (!project) {
      throw new NotFoundException(`Project "${projectId}" not found.`);
    }
    return this.toSummary(project);
  }

  async listOrganizations() {
    const organizations = await this.organizationRepository.find({
      order: { createdAt: 'ASC' },
    });
    return organizations.map((organization) => ({
      id: organization.id,
      code: organization.code,
      name: organization.name,
      type: organization.type,
      description: organization.description,
    }));
  }

  async ensureDefaultSeed(): Promise<void> {
    const organizationCount = await this.organizationRepository.count();
    if (organizationCount > 0) {
      return;
    }

    const organization = await this.organizationRepository.save(
      this.organizationRepository.create({
        code: 'tomorrow-ma',
        name: 'Tomorrow Morocco',
        type: OrganizationType.AGENCY,
        description:
          'Default demo organization — replace with a real client before production use.',
      }),
    );

    const project = await this.projectRepository.save(
      this.projectRepository.create({
        organizationId: organization.id,
        code: 'stls-pilot',
        name: 'STLS Pilot — Casablanca',
        status: ProjectStatus.ACTIVE,
        clientReference: 'DEMO-PILOT-2026',
        description:
          'Demo pilot project covering the first supervised intersections.',
      }),
    );

    await this.siteRepository.save(
      this.siteRepository.create({
        projectId: project.id,
        code: 'casablanca-centre',
        name: 'Casablanca — Centre',
        city: 'Casablanca',
        region: 'Casablanca-Settat',
        latitude: 33.5731,
        longitude: -7.5898,
      }),
    );

    this.logger.log('Seeded default organization, project and site.');
  }

  private async toSummary(project: ProjectEntity): Promise<ProjectSummary> {
    const intersectionCount = await this.intersectionRepository
      .count({ where: { projectId: project.id } })
      .catch(() => 0);

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      status: project.status,
      clientReference: project.clientReference,
      organization: {
        id: project.organization.id,
        code: project.organization.code,
        name: project.organization.name,
        type: project.organization.type,
      },
      sites: (project.sites ?? []).map((site) => ({
        id: site.id,
        code: site.code,
        name: site.name,
        city: site.city,
        region: site.region,
      })),
      intersectionCount,
    };
  }
}

import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { OrganizationType, ProjectStatus } from './enums';

@Entity({ name: 'organizations' })
export class OrganizationEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({
    type: 'enum',
    enum: OrganizationType,
    enumName: 'organization_type',
    default: OrganizationType.AGENCY,
  })
  type!: OrganizationType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @OneToMany(() => ProjectEntity, (project) => project.organization)
  projects!: ProjectEntity[];
}

@Entity({ name: 'projects' })
@Unique('UQ_projects_organization_code', ['organizationId', 'code'])
export class ProjectEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    enumName: 'project_status',
    default: ProjectStatus.DRAFT,
  })
  status!: ProjectStatus;

  @Column({ type: 'varchar', length: 160, nullable: true })
  clientReference!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(
    () => OrganizationEntity,
    (organization) => organization.projects,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'organizationId' })
  organization!: OrganizationEntity;

  @OneToMany(() => SiteEntity, (site) => site.project)
  sites!: SiteEntity[];
}

@Entity({ name: 'sites' })
@Unique('UQ_sites_project_code', ['projectId', 'code'])
export class SiteEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  latitude!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  longitude!: number | null;

  @Column({ type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, (project) => project.sites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;
}

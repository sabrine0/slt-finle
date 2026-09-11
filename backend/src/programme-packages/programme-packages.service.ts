import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ControllerEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { EngineeringReferencesService } from '../engineering-references/engineering-references.service';

@Injectable()
export class ProgrammePackagesService {
  constructor(
    @InjectRepository(ProgrammePackageEntity)
    private readonly packages: Repository<ProgrammePackageEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersections: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllers: Repository<ControllerEntity>,
    private readonly references: EngineeringReferencesService,
  ) {}

  list() {
    return this.packages.find({
      order: { ingestedAt: 'DESC' },
      take: 200,
    });
  }

  async get(id: string) {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException(`Programme package ${id} not found.`);
    return pkg;
  }

  async byController(codeOrId: string) {
    const controller = await this.references.resolveController(codeOrId);
    if (!controller) return { controller: null, packages: [] };
    const packages = await this.packages.find({
      where: { controllerId: controller.id },
      order: { ingestedAt: 'DESC' },
    });
    return { controller, packages };
  }

  async link(
    id: string,
    body: { intersectionId?: string | null; controllerId?: string | null },
  ) {
    const pkg = await this.get(id);
    if (body.intersectionId !== undefined) {
      if (body.intersectionId === null) {
        pkg.intersectionId = null;
      } else {
        const exists = await this.intersections.findOne({
          where: { id: body.intersectionId },
        });
        if (!exists) {
          throw new NotFoundException(
            `Intersection ${body.intersectionId} not found.`,
          );
        }
        pkg.intersectionId = exists.id;
      }
    }
    if (body.controllerId !== undefined) {
      if (body.controllerId === null) {
        pkg.controllerId = null;
      } else {
        const exists = await this.controllers.findOne({
          where: { id: body.controllerId },
        });
        if (!exists) {
          throw new NotFoundException(
            `Controller ${body.controllerId} not found.`,
          );
        }
        pkg.controllerId = exists.id;
      }
    }
    return this.packages.save(pkg);
  }
}

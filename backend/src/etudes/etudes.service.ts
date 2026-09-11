import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  EtudeEntity,
  IntersectionEntity,
  type EtudeScope,
} from '../database/entities';
import { IntersectionsService } from '../intersections/intersections.service';
import { ETUDE_GENERATOR } from './etude-generator.token';
import type {
  EtudeGenerationContext,
  EtudeGeneratorAdapter,
  ResolvedIntersection,
} from './etude-generator.adapter';
import {
  emptySectionRecord,
  findSection,
  listSectionsForScope,
  type EtudeSectionId,
  type EtudeSectionRecord,
} from './etude-sections';

export interface EtudeView {
  id: string;
  intersectionCode: string | null;
  intersectionLabel: string;
  latitude: number | null;
  longitude: number | null;
  scope: 'standard' | 'tram' | 'cablage';
  status: 'draft' | 'in_review' | 'approved';
  generationMode: 'offline' | 'claude';
  sections: Record<string, EtudeSectionRecord>;
  catalog: Array<{
    id: EtudeSectionId;
    title: string;
    order: number;
    description: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEtudeInput {
  intersectionCode?: string | null;
  intersectionLabel: string;
  latitude?: number | null;
  longitude?: number | null;
  scope?: EtudeScope;
}

export interface PatchSectionInput {
  content: Record<string, unknown>;
  note?: string;
  lock?: boolean;
}

@Injectable()
export class EtudesService {
  constructor(
    @InjectRepository(EtudeEntity)
    private readonly repo: Repository<EtudeEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepo: Repository<IntersectionEntity>,
    private readonly intersections: IntersectionsService,
    @Inject(ETUDE_GENERATOR)
    private readonly generator: EtudeGeneratorAdapter,
  ) {}

  async list(): Promise<EtudeView[]> {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' } });
    return rows.map((row) => this.toView(row));
  }

  async get(id: string): Promise<EtudeView> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Etude ${id} introuvable`);
    return this.toView(row);
  }

  async create(input: CreateEtudeInput): Promise<EtudeView> {
    const scope: EtudeScope = input.scope ?? 'standard';
    const label = input.intersectionLabel?.trim();
    if (!label) {
      throw new BadRequestException('intersectionLabel requis');
    }

    const sections: Record<string, EtudeSectionRecord> = {};
    for (const descriptor of listSectionsForScope(scope)) {
      sections[descriptor.id] = emptySectionRecord(descriptor.id);
    }

    const entity = this.repo.create({
      intersectionCode: input.intersectionCode ?? null,
      intersectionLabel: label,
      latitude: input.latitude == null ? null : String(input.latitude),
      longitude: input.longitude == null ? null : String(input.longitude),
      scope,
      status: 'draft',
      generationMode: this.generator.mode,
      sections,
      meta: {},
    });
    const saved = await this.repo.save(entity);
    return this.toView(saved);
  }

  async generateSection(
    etudeId: string,
    sectionId: EtudeSectionId,
  ): Promise<EtudeView> {
    const row = await this.repo.findOne({ where: { id: etudeId } });
    if (!row) throw new NotFoundException(`Etude ${etudeId} introuvable`);
    const descriptor = findSection(sectionId);
    if (!descriptor) {
      throw new BadRequestException(`Section ${sectionId} inconnue`);
    }
    if (!descriptor.scopes.includes(row.scope)) {
      throw new BadRequestException(
        `Section ${sectionId} non applicable au scope ${row.scope}`,
      );
    }

    const sections = (row.sections ?? {}) as Record<string, EtudeSectionRecord>;
    const previous = sections[sectionId] ?? emptySectionRecord(sectionId);
    if (previous.status === 'locked') {
      throw new BadRequestException(
        `Section ${sectionId} verrouillée — déverrouillez avant de régénérer`,
      );
    }

    const context = await this.buildContext(row);
    const result = await this.generator.generateSection(sectionId, context);

    const next: EtudeSectionRecord = {
      id: sectionId,
      status: 'generated',
      version: previous.version + 1,
      content: result.content,
      generatedAt: new Date().toISOString(),
      lockedAt: null,
      edits: previous.edits,
    };
    sections[sectionId] = next;
    row.sections = sections;
    row.meta = {
      ...(row.meta ?? {}),
      [`${sectionId}.lastSource`]: result.source,
      ...(result.rationale
        ? { [`${sectionId}.lastRationale`]: result.rationale }
        : {}),
    };
    const saved = await this.repo.save(row);
    return this.toView(saved);
  }

  async patchSection(
    etudeId: string,
    sectionId: EtudeSectionId,
    input: PatchSectionInput,
  ): Promise<EtudeView> {
    const row = await this.repo.findOne({ where: { id: etudeId } });
    if (!row) throw new NotFoundException(`Etude ${etudeId} introuvable`);
    if (!findSection(sectionId)) {
      throw new BadRequestException(`Section ${sectionId} inconnue`);
    }

    const sections = (row.sections ?? {}) as Record<string, EtudeSectionRecord>;
    const previous = sections[sectionId] ?? emptySectionRecord(sectionId);
    if (previous.status === 'locked') {
      throw new BadRequestException(`Section ${sectionId} verrouillée`);
    }

    const next: EtudeSectionRecord = {
      ...previous,
      status: input.lock ? 'locked' : 'edited',
      version: previous.version + 1,
      content: input.content,
      lockedAt: input.lock ? new Date().toISOString() : previous.lockedAt,
      edits: [
        ...previous.edits,
        {
          at: new Date().toISOString(),
          note: input.note ?? (input.lock ? 'verrouillée' : 'édition manuelle'),
        },
      ],
    };
    sections[sectionId] = next;
    row.sections = sections;
    const saved = await this.repo.save(row);
    return this.toView(saved);
  }

  async unlockSection(
    etudeId: string,
    sectionId: EtudeSectionId,
  ): Promise<EtudeView> {
    const row = await this.repo.findOne({ where: { id: etudeId } });
    if (!row) throw new NotFoundException(`Etude ${etudeId} introuvable`);
    const sections = (row.sections ?? {}) as Record<string, EtudeSectionRecord>;
    const previous = sections[sectionId];
    if (!previous) {
      throw new BadRequestException(`Section ${sectionId} non générée`);
    }
    if (previous.status !== 'locked') return this.toView(row);
    sections[sectionId] = {
      ...previous,
      status: previous.content == null ? 'pending' : 'edited',
      lockedAt: null,
    };
    row.sections = sections;
    const saved = await this.repo.save(row);
    return this.toView(saved);
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Etude ${id} introuvable`);
    await this.repo.delete(id);
    return { id };
  }

  // ---------------------------------------------------------------

  private async buildContext(
    row: EtudeEntity,
  ): Promise<EtudeGenerationContext> {
    let intersection: ResolvedIntersection | null = null;
    if (row.intersectionCode) {
      try {
        const entity = await this.intersectionRepo.findOne({
          where: { code: row.intersectionCode },
          relations: {
            controllers: true,
            detectors: true,
            phases: true,
            timingPlans: true,
          },
        });
        if (entity) {
          const view = (await this.intersections.list()).find(
            (entry) => entry.code === row.intersectionCode,
          );
          intersection = {
            code: entity.code,
            name: entity.name,
            district: entity.district ?? null,
            address: entity.address ?? null,
            latitude: entity.latitude == null ? null : Number(entity.latitude),
            longitude:
              entity.longitude == null ? null : Number(entity.longitude),
            cityId: view?.cityId ?? null,
            zoneId: view?.zoneId ?? null,
            controlMode: entity.controlMode,
            status: entity.status,
            queueLength: entity.queueLength,
            averageDelaySeconds: entity.averageDelaySeconds,
            incidents: entity.incidents,
            controllers: (entity.controllers ?? []).map((controller) => ({
              code: controller.code,
              controllerType: controller.controllerType ?? null,
              firmwareVersion: controller.firmwareVersion,
              operatingEnvironment: controller.operatingEnvironment,
              connectionState: controller.connectionState,
              batteryBacked: controller.batteryBacked,
              isPrimary: controller.isPrimary,
            })),
            detectors: (entity.detectors ?? []).map((detector) => ({
              code: detector.code,
              name: detector.name,
              type: detector.type,
              laneReference: detector.laneReference ?? null,
              isActive: detector.isActive,
            })),
            phases: (entity.phases ?? []).map((phase) => ({
              sequenceNumber: phase.sequenceNumber,
              name: phase.name,
              approach: phase.approach,
              movementGroup: phase.movementGroup,
              phaseType: phase.phaseType,
              minGreenSeconds: phase.minGreenSeconds,
              yellowSeconds: phase.yellowSeconds,
              redClearanceSeconds: phase.redClearanceSeconds,
              pedestrianWalkSeconds: phase.pedestrianWalkSeconds ?? null,
              pedestrianClearSeconds: phase.pedestrianClearSeconds ?? null,
              conflictingPhaseSequenceNumbers:
                phase.conflictingPhaseSequenceNumbers ?? [],
            })),
            timingPlans: (entity.timingPlans ?? []).map((plan) => ({
              code: plan.code,
              name: plan.name,
              status: plan.status,
              cycleLengthSeconds: plan.cycleLengthSeconds,
              offsetSeconds: plan.offsetSeconds,
            })),
          };
        }
      } catch {
        intersection = null;
      }
    }
    return { etude: row, intersection };
  }

  private toView(row: EtudeEntity): EtudeView {
    // Normalise scope : trust the column at runtime but coerce to a
    // known value before exposing it on the API so the client type
    // stays accurate even if the DB row is corrupt.
    const rawScope = row.scope ?? 'standard';
    const scope: EtudeScope = (
      ['standard', 'tram', 'cablage'] as const
    ).includes(rawScope)
      ? rawScope
      : 'standard';
    const catalog = listSectionsForScope(scope).map((descriptor) => ({
      id: descriptor.id,
      title: descriptor.title,
      order: descriptor.order,
      description: descriptor.description,
    }));
    const sectionsRaw = (row.sections ?? {}) as Record<
      string,
      EtudeSectionRecord
    >;
    const sections: Record<string, EtudeSectionRecord> = {};
    for (const descriptor of listSectionsForScope(scope)) {
      sections[descriptor.id] =
        sectionsRaw[descriptor.id] ?? emptySectionRecord(descriptor.id);
    }
    return {
      id: row.id,
      intersectionCode: row.intersectionCode,
      intersectionLabel: row.intersectionLabel,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      scope,
      status: (row.status ?? 'draft') as EtudeView['status'],
      generationMode: (row.generationMode ??
        'offline') as EtudeView['generationMode'],
      sections,
      catalog,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

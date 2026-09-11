import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, IsNull, Not } from 'typeorm';

import {
  ControllerEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import type { EngineeringDocumentType } from '../database/entities/engineering-document.entity';
import {
  KNOWN_SHORT_CODES,
  SHORT_CODE_LABELS,
  findShortCodeInName,
} from './short-codes';

export interface ReferenceListFilter {
  documentType?: EngineeringDocumentType;
  city?: string;
  shortCode?: string;
  corridor?: string;
  intersectionId?: string;
  controllerId?: string;
  linked?: 'linked' | 'unlinked';
}

@Injectable()
export class EngineeringReferencesService {
  constructor(
    @InjectRepository(EngineeringDocumentEntity)
    private readonly documents: Repository<EngineeringDocumentEntity>,
    @InjectRepository(ProgrammePackageEntity)
    private readonly programmePackages: Repository<ProgrammePackageEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersections: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllers: Repository<ControllerEntity>,
  ) {}

  listShortCodes() {
    return KNOWN_SHORT_CODES.map((code) => ({
      code,
      label: SHORT_CODE_LABELS[code] ?? code,
    }));
  }

  async list(filter: ReferenceListFilter = {}) {
    const qb = this.documents.createQueryBuilder('d').orderBy({
      'd.documentType': 'ASC',
      'd.city': 'ASC',
      'd.corridor': 'ASC',
      'd.carrefourLabel': 'ASC',
      'd.revision': 'DESC',
    });
    if (filter.documentType) {
      qb.andWhere('d.documentType = :t', { t: filter.documentType });
    }
    if (filter.city) qb.andWhere('d.city = :c', { c: filter.city });
    if (filter.shortCode) {
      qb.andWhere('d.shortCode = :s', { s: filter.shortCode.toUpperCase() });
    }
    if (filter.corridor) {
      qb.andWhere('d.corridor = :co', { co: filter.corridor });
    }
    if (filter.intersectionId) {
      qb.andWhere('d.intersectionId = :iid', { iid: filter.intersectionId });
    }
    if (filter.controllerId) {
      qb.andWhere('d.controllerId = :cid', { cid: filter.controllerId });
    }
    if (filter.linked === 'linked') {
      qb.andWhere('d.intersectionId IS NOT NULL');
    } else if (filter.linked === 'unlinked') {
      qb.andWhere('d.intersectionId IS NULL');
    }
    qb.take(500);
    return qb.getMany();
  }

  async get(id: string) {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc) {
      throw new NotFoundException(`Engineering document ${id} not found.`);
    }
    return doc;
  }

  async listForIntersection(intersectionIdOrCode: string) {
    const intersection = await this.resolveIntersection(intersectionIdOrCode);
    if (!intersection) {
      return { intersection: null, documents: [], programmePackages: [] };
    }
    const [documents, programmePackages] = await Promise.all([
      this.documents.find({
        where: [
          { intersectionId: intersection.id },
          ...this.softMatchWhere(intersection),
        ],
        order: {
          documentType: 'ASC',
          city: 'ASC',
          carrefourLabel: 'ASC',
          revision: 'DESC',
        },
        take: 200,
      }),
      this.programmePackages.find({
        where: [
          { intersectionId: intersection.id },
          ...this.softMatchPackageWhere(intersection),
        ],
        order: { ingestedAt: 'DESC' },
        take: 50,
      }),
    ]);
    return { intersection, documents, programmePackages };
  }

  async listForController(controllerIdOrCode: string) {
    const controller = await this.resolveController(controllerIdOrCode);
    if (!controller) {
      return { controller: null, programmePackages: [], documents: [] };
    }
    const [programmePackages, documents] = await Promise.all([
      this.programmePackages.find({
        where: { controllerId: controller.id },
        order: { ingestedAt: 'DESC' },
        take: 50,
      }),
      this.documents.find({
        where: { controllerId: controller.id },
        order: { ingestedAt: 'DESC' },
        take: 50,
      }),
    ]);
    return { controller, programmePackages, documents };
  }

  async link(
    id: string,
    body: { intersectionId?: string | null; controllerId?: string | null },
  ) {
    const doc = await this.get(id);
    if (body.intersectionId !== undefined) {
      if (body.intersectionId === null) {
        doc.intersectionId = null;
      } else {
        const exists = await this.intersections.findOne({
          where: { id: body.intersectionId },
        });
        if (!exists) {
          throw new NotFoundException(
            `Intersection ${body.intersectionId} not found.`,
          );
        }
        doc.intersectionId = exists.id;
      }
    }
    if (body.controllerId !== undefined) {
      if (body.controllerId === null) {
        doc.controllerId = null;
      } else {
        const exists = await this.controllers.findOne({
          where: { id: body.controllerId },
        });
        if (!exists) {
          throw new NotFoundException(
            `Controller ${body.controllerId} not found.`,
          );
        }
        doc.controllerId = exists.id;
      }
    }
    return this.documents.save(doc);
  }

  /**
   * Best-effort soft-match: documents whose short code or
   * carrefour label appears in the intersection name/address/code.
   * Used in addition to hard FK links so an unlinked document can
   * still show up next to the intersection that mentions it.
   */
  private softMatchWhere(intersection: IntersectionEntity) {
    const candidates = this.softCandidates(intersection);
    if (candidates.length === 0) return [];
    return [{ shortCode: In(candidates), intersectionId: IsNull() }];
  }

  private softMatchPackageWhere(intersection: IntersectionEntity) {
    const candidates = this.softCandidates(intersection);
    if (candidates.length === 0) return [];
    return [{ shortCode: In(candidates), intersectionId: IsNull() }];
  }

  private softCandidates(intersection: IntersectionEntity): string[] {
    const haystack = [
      intersection.code ?? '',
      intersection.name ?? '',
      intersection.address ?? '',
      intersection.district ?? '',
    ].join(' ');
    const direct = findShortCodeInName(haystack);
    return direct ? [direct] : [];
  }

  async resolveIntersection(idOrCode: string) {
    if (!idOrCode) return null;
    if (/^[0-9a-f]{8}-/.test(idOrCode)) {
      return this.intersections.findOne({ where: { id: idOrCode } });
    }
    return this.intersections.findOne({ where: { code: idOrCode } });
  }

  async resolveController(idOrCode: string) {
    if (!idOrCode) return null;
    if (/^[0-9a-f]{8}-/.test(idOrCode)) {
      return this.controllers.findOne({ where: { id: idOrCode } });
    }
    return this.controllers.findOne({ where: { code: idOrCode } });
  }

  /**
   * Count linked vs unlinked references — used by an admin
   * sidebar/widget so operators can see how many documents are
   * still waiting to be tied to a STLS intersection.
   */
  async counts() {
    const [
      totalDocuments,
      linkedDocuments,
      unlinkedDocuments,
      totalPackages,
      linkedPackages,
    ] = await Promise.all([
      this.documents.count(),
      this.documents.count({ where: { intersectionId: Not(IsNull()) } }),
      this.documents.count({ where: { intersectionId: IsNull() } }),
      this.programmePackages.count(),
      this.programmePackages.count({
        where: { intersectionId: Not(IsNull()) },
      }),
    ]);
    return {
      documents: {
        total: totalDocuments,
        linked: linkedDocuments,
        unlinked: unlinkedDocuments,
      },
      programmePackages: {
        total: totalPackages,
        linked: linkedPackages,
        unlinked: totalPackages - linkedPackages,
      },
    };
  }
}

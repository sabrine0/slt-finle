import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ControllerEntity,
  DetectorEntity,
  EngineeringDocumentEntity,
  IntersectionEntity,
  PhaseEntity,
  ProgrammePackageEntity,
} from '../database/entities';
import { EngineeringReferencesService } from './engineering-references.service';

/**
 * Counts STLS-generated artefacts and the linked real-world
 * artefacts side-by-side. This is the scaffold the user asked for
 * — it does not yet parse PDF contents to extract reference phase
 * or loop counts; it returns the metadata we already have so a
 * follow-up PR can replace the `referenceXxx` numbers with values
 * parsed from the real PDFs.
 */
export interface BenchmarkSummary {
  intersection: {
    id: string;
    code: string;
    name: string;
  } | null;
  stls: {
    controllerCount: number;
    phaseCount: number;
    detectorCount: number;
    timingPlanCount: number;
  };
  reference: {
    planRsDocuments: number;
    dossierRegulationDocuments: number;
    planFilaireDocuments: number;
    programmePackages: number;
    programmePackagesWithClp9: number;
  };
  /**
   * Deltas. Populated once the document-parser layer is added in a
   * follow-up — for now they are null to make it obvious to the
   * caller that the field is a placeholder rather than 0.
   */
  delta: {
    phaseCount: number | null;
    movementCount: number | null;
    supportCount: number | null;
    detectorCount: number | null;
  };
}

@Injectable()
export class BenchmarkCompareService {
  constructor(
    private readonly references: EngineeringReferencesService,
    @InjectRepository(IntersectionEntity)
    private readonly intersections: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllers: Repository<ControllerEntity>,
    @InjectRepository(PhaseEntity)
    private readonly phases: Repository<PhaseEntity>,
    @InjectRepository(DetectorEntity)
    private readonly detectors: Repository<DetectorEntity>,
    @InjectRepository(EngineeringDocumentEntity)
    private readonly documents: Repository<EngineeringDocumentEntity>,
    @InjectRepository(ProgrammePackageEntity)
    private readonly packages: Repository<ProgrammePackageEntity>,
  ) {}

  async compare(intersectionIdOrCode: string): Promise<BenchmarkSummary> {
    const intersection =
      await this.references.resolveIntersection(intersectionIdOrCode);
    if (!intersection) {
      return {
        intersection: null,
        stls: {
          controllerCount: 0,
          phaseCount: 0,
          detectorCount: 0,
          timingPlanCount: 0,
        },
        reference: {
          planRsDocuments: 0,
          dossierRegulationDocuments: 0,
          planFilaireDocuments: 0,
          programmePackages: 0,
          programmePackagesWithClp9: 0,
        },
        delta: {
          phaseCount: null,
          movementCount: null,
          supportCount: null,
          detectorCount: null,
        },
      };
    }

    const [
      controllerCount,
      phaseCount,
      detectorCount,
      planRsDocuments,
      dossierRegulationDocuments,
      planFilaireDocuments,
      programmePackages,
      programmePackagesWithClp9,
    ] = await Promise.all([
      this.controllers.count({
        where: { intersectionId: intersection.id },
      }),
      this.phases.count({ where: { intersectionId: intersection.id } }),
      this.detectors.count({ where: { intersectionId: intersection.id } }),
      this.documents.count({
        where: {
          intersectionId: intersection.id,
          documentType: 'plan_rs',
        },
      }),
      this.documents.count({
        where: {
          intersectionId: intersection.id,
          documentType: 'dossier_regulation',
        },
      }),
      this.documents.count({
        where: {
          intersectionId: intersection.id,
          documentType: 'plan_filaire',
        },
      }),
      this.packages.count({ where: { intersectionId: intersection.id } }),
      this.packages
        .createQueryBuilder('p')
        .where('p.intersectionId = :i', { i: intersection.id })
        .andWhere(`p.contents::jsonb @> '[{"kind":"clp9"}]'::jsonb`)
        .getCount(),
    ]);

    // timingPlans live on IntersectionEntity directly via relation;
    // counting them via the relation table would require an extra
    // relation load — read it lazily off the intersection record.
    const timingPlanCount = Array.isArray(intersection.timingPlans)
      ? intersection.timingPlans.length
      : 0;

    return {
      intersection: {
        id: intersection.id,
        code: intersection.code,
        name: intersection.name,
      },
      stls: {
        controllerCount,
        phaseCount,
        detectorCount,
        timingPlanCount,
      },
      reference: {
        planRsDocuments,
        dossierRegulationDocuments,
        planFilaireDocuments,
        programmePackages,
        programmePackagesWithClp9,
      },
      delta: {
        phaseCount: null,
        movementCount: null,
        supportCount: null,
        detectorCount: null,
      },
    };
  }
}

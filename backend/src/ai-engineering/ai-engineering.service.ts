import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ControllerEntity, IntersectionEntity } from '../database/entities';

import {
  ControllerConnectionState,
  IntersectionControlMode,
  OperatingEnvironment,
  PhaseType,
  TimingPlanStatus,
} from '../database/entities/enums';
import {
  CreateControllerDto,
  CreateDetectorDto,
  CreateIntersectionDto,
  CreatePhaseDto,
  CreateTimingPlanDto,
  UpdatePhaseDto,
} from '../engineering/dto/engineering.dto';
import { EngineeringService } from '../engineering/engineering.service';
import { PROPOSAL_GENERATOR } from './proposal-generator.adapter';
import type { ProposalGeneratorAdapter } from './proposal-generator.adapter';
import { ProposalStoreService } from './proposal-store.service';
import type {
  EngineeringProposal,
  ProposalGenerationInput,
  ProposalSet,
} from './proposal-types';
import { STUDY_ANALYZER } from './study-analyzer.adapter';
import type { StudyAnalyzerAdapter } from './study-analyzer.adapter';
import { StudyStoreService } from './study-store.service';
import type { IntersectionStudy, ObservedGeometry } from './study-types';

export interface ProposalApprovalInput {
  /** Engineering intersection code (e.g. INT-RBA-001). */
  code: string;
  /** Optional override for the human-readable name. */
  name?: string;
  /** Optional override for district. */
  district?: string;
  /** Optional override for free-form address. */
  address?: string;
  /** Optional primary controller code. Defaults to `CTRL-{code-suffix}`. */
  controllerCode?: string;
}

export interface ProposalApprovalResult {
  intersectionId: string;
  intersectionCode: string;
  controllerCode: string;
  phaseCount: number;
  detectorCount: number;
  timingPlanCount: number;
  redirectTo: string;
  warnings: string[];
}

/**
 * Orchestrates the AI engineering workflow :
 *   1. `generateProposals` — call the active adapter (offline today,
 *      Claude tomorrow) to produce a proposal set. Persist it in the
 *      ephemeral store so the operator can review without holding
 *      the entire payload client-side.
 *   2. `getProposalSet` / `getProposal` — read-only access.
 *   3. `approveProposal` — materialise the chosen proposal as a real
 *      STLS intersection (+ controller + phases + detectors +
 *      timing plans) by calling the existing `EngineeringService`.
 *      Nothing in the manual workflow is touched — the final result
 *      is indistinguishable from a manually-created intersection.
 */
@Injectable()
export class AiEngineeringService {
  private readonly logger = new Logger(AiEngineeringService.name);

  constructor(
    @Inject(PROPOSAL_GENERATOR)
    private readonly generator: ProposalGeneratorAdapter,
    @Inject(STUDY_ANALYZER)
    private readonly analyzer: StudyAnalyzerAdapter,
    private readonly store: ProposalStoreService,
    private readonly studyStore: StudyStoreService,
    private readonly engineering: EngineeringService,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepo: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepo: Repository<ControllerEntity>,
  ) {}

  /**
   * Run an intersection study : analyse geometry + classification +
   * constraints + complexity. Always called BEFORE proposal
   * generation so the proposals are curated against the analysis.
   */
  async analyzeIntersection(
    input: ProposalGenerationInput,
    geometry?: ObservedGeometry,
  ): Promise<IntersectionStudy> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Le nom du carrefour est requis.');
    }
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new BadRequestException('Coordonnees WGS-84 invalides.');
    }
    const study = await this.analyzer.analyze(input, geometry);
    this.studyStore.save(study);
    this.logger.log(
      `Study ${study.id} — classification=${study.classification}, complexity=${study.complexityScore}, recommended=${study.recommendedVariantCodes.join(',')}`,
    );
    return study;
  }

  getStudy(studyId: string): IntersectionStudy {
    const study = this.studyStore.get(studyId);
    if (!study) {
      throw new NotFoundException(
        `Étude ${studyId} introuvable (expirée ou inexistante).`,
      );
    }
    return study;
  }

  /**
   * Pre-flight check : abort if intersection / controller codes
   * collide with existing records. Otherwise the create calls fail
   * mid-way and leak partial state into the catalog.
   */
  private async assertNoCollision(
    intersectionCode: string,
    controllerCode: string,
  ): Promise<void> {
    const intersectionExists = await this.intersectionRepo.exists({
      where: { code: intersectionCode },
    });
    if (intersectionExists) {
      throw new ConflictException(
        `Le code carrefour "${intersectionCode}" est déjà utilisé. Choisir un autre code.`,
      );
    }
    const controllerExists = await this.controllerRepo.exists({
      where: { code: controllerCode },
    });
    if (controllerExists) {
      throw new ConflictException(
        `Le code contrôleur "${controllerCode}" est déjà utilisé. Choisir un autre code.`,
      );
    }
  }

  async generateProposals(
    input: ProposalGenerationInput,
    options: { studyId?: string } = {},
  ): Promise<ProposalSet & { studyId?: string }> {
    if (!input.name?.trim()) {
      throw new BadRequestException('Le nom du carrefour est requis.');
    }
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new BadRequestException('Coordonnees WGS-84 invalides.');
    }
    // When a study is provided, use it to filter the proposal
    // catalogue down to the variants the analyzer endorses for this
    // site. Otherwise generate the full catalogue (legacy path).
    let study: IntersectionStudy | null = null;
    if (options.studyId) {
      study = this.studyStore.get(options.studyId);
      if (!study) {
        throw new NotFoundException(
          `Étude ${options.studyId} introuvable (expirée). Relancer l'analyse.`,
        );
      }
    }
    const fullSet = await this.generator.generate(input);
    let curated = fullSet;
    if (study) {
      const recommended = new Set(study.recommendedVariantCodes);
      const filtered = fullSet.proposals.filter((p) =>
        recommended.has(p.variantCode),
      );
      // Preserve recommended order
      filtered.sort(
        (a, b) =>
          study.recommendedVariantCodes.indexOf(a.variantCode) -
          study.recommendedVariantCodes.indexOf(b.variantCode),
      );
      curated = { ...fullSet, proposals: filtered };
    }
    this.store.save(curated);
    this.logger.log(
      `Generated ${curated.proposals.length} proposal(s) for "${input.name}" (set ${curated.id}, scope=${input.scope}${
        study ? `, study=${study.id}` : ''
      })`,
    );
    return { ...curated, studyId: study?.id };
  }

  getProposalSet(setId: string): ProposalSet {
    const set = this.store.getSet(setId);
    if (!set) {
      throw new NotFoundException(
        `Proposal set ${setId} introuvable (expire ou inexistant).`,
      );
    }
    return set;
  }

  async approveProposal(
    proposalId: string,
    input: ProposalApprovalInput,
  ): Promise<ProposalApprovalResult> {
    const found = this.store.findProposalById(proposalId);
    if (!found) {
      throw new NotFoundException(
        `Proposition ${proposalId} introuvable (expire ou inexistante).`,
      );
    }
    const { set, proposal } = found;

    if (!input.code?.trim()) {
      throw new BadRequestException('Le code carrefour est requis.');
    }

    const warnings: string[] = [...proposal.warnings];
    const intersectionCode = input.code.trim().toUpperCase();
    const controllerCode =
      input.controllerCode?.trim().toUpperCase() ??
      `CTRL-${intersectionCode.replace(/^INT-/, '')}`;

    // Pre-flight : reject collisions BEFORE writing anything.
    await this.assertNoCollision(intersectionCode, controllerCode);

    // 1) Intersection (hard step — anything that follows is rolled back on failure)
    const intersectionDto: CreateIntersectionDto = {
      code: intersectionCode,
      name: (input.name ?? set.input.name).trim(),
      district: (input.district ?? set.input.district ?? '—').trim(),
      address: (
        input.address ??
        set.input.address ??
        `${set.input.latitude.toFixed(6)} N / ${set.input.longitude.toFixed(6)} E`
      ).trim(),
      latitude: set.input.latitude,
      longitude: set.input.longitude,
      controlMode: this.mapControlMode(proposal.recommendedControlMode),
    };
    const intersection =
      await this.engineering.createIntersection(intersectionDto);
    this.logger.log(
      `AI-approved intersection ${intersection.id} (${intersectionDto.code}) — variant=${proposal.variantCode}`,
    );

    // From here, any hard failure must roll back the intersection so
    // the catalog never holds a half-built carrefour. The catch block
    // at the end of this try frame is the compensating delete.
    const createdPhases: Array<{ id: string; sequenceNumber: number }> = [];
    try {
      // 2) Primary controller
      const controllerDto: CreateControllerDto = {
        code: controllerCode,
        firmwareVersion: '1.0.0',
        controllerType: proposal.recommendedControllerType,
        operatingEnvironment: OperatingEnvironment.SIMULATION,
        connectionState: ControllerConnectionState.OFFLINE,
        batteryBacked: false,
        isPrimary: true,
        intersectionId: intersection.id,
      };
      await this.engineering.createController(controllerDto);

      // 3) Phases — two-pass to satisfy the conflict-matrix validator.
      //    Pass 1 creates every phase without conflict references (so
      //    each phase only references siblings that already exist or
      //    are part of this batch).
      //    Pass 2 patches conflict + allowedConcurrent refs once all
      //    phases share the same intersection.
      for (const phase of proposal.phases) {
        const phaseDto: CreatePhaseDto = {
          sequenceNumber: phase.sequenceNumber,
          name: phase.name,
          approach: phase.approach,
          movementGroup: phase.movementGroup,
          phaseType: phase.phaseType,
          minGreenSeconds: Math.max(1, phase.minGreenSeconds || 1),
          yellowSeconds: phase.yellowSeconds,
          redClearanceSeconds: phase.redClearanceSeconds,
          pedestrianWalkSeconds:
            phase.phaseType === PhaseType.PEDESTRIAN
              ? (phase.pedestrianWalkSeconds ?? 18)
              : undefined,
          pedestrianClearSeconds:
            phase.phaseType === PhaseType.PEDESTRIAN
              ? (phase.pedestrianClearSeconds ?? 6)
              : undefined,
          isProtected: phase.isProtected,
          intersectionId: intersection.id,
        };
        const created = await this.engineering.createPhase(phaseDto);
        createdPhases.push({
          id: created.id,
          sequenceNumber: phase.sequenceNumber,
        });
      }
    } catch (hardFailure) {
      // Compensating rollback : delete the partially-built intersection.
      this.logger.error(
        `AI approval hard failure for intersection ${intersection.id} — rolling back. Reason: ${(hardFailure as Error).message}`,
      );
      try {
        await this.engineering.deleteIntersection(intersection.id);
      } catch (rollbackError) {
        this.logger.error(
          `Rollback ALSO failed for intersection ${intersection.id} — manual cleanup required. Reason: ${(rollbackError as Error).message}`,
        );
      }
      throw hardFailure;
    }
    // Pass 2 : patch conflict + concurrent refs now that all phases exist.
    for (const phase of proposal.phases) {
      const target = createdPhases.find(
        (entry) => entry.sequenceNumber === phase.sequenceNumber,
      );
      if (!target) continue;
      const hasConflicts =
        (phase.conflictingPhaseSequenceNumbers?.length ?? 0) > 0;
      const hasConcurrent =
        (phase.allowedConcurrentPhaseSequenceNumbers?.length ?? 0) > 0;
      if (!hasConflicts && !hasConcurrent) continue;
      const update: UpdatePhaseDto = {
        conflictingPhaseSequenceNumbers: hasConflicts
          ? phase.conflictingPhaseSequenceNumbers
          : undefined,
        allowedConcurrentPhaseSequenceNumbers: hasConcurrent
          ? phase.allowedConcurrentPhaseSequenceNumbers
          : undefined,
      };
      try {
        await this.engineering.updatePhase(target.id, update);
      } catch (error) {
        this.logger.warn(
          `Phase ${phase.sequenceNumber} conflict refs skipped : ${(error as Error).message}`,
        );
        warnings.push(
          `Conflits phase ${phase.sequenceNumber} non appliqués (${(error as Error).message}).`,
        );
      }
    }

    // 4) Detectors — assign to phases by sequence numbers. Detector
    //    codes are globally unique in the engineering layer, so we
    //    namespace each one with the intersection's region+id suffix
    //    (e.g. "BCL-E1" → "BCL-RBA-FIX1-E1") to avoid collisions
    //    when multiple AI-approved carrefours share the offline
    //    template's stock detector codes.
    const detectorSuffix = intersectionCode.replace(/^INT-/, '');
    let detectorCount = 0;
    for (const detector of proposal.detectors) {
      try {
        const namespacedCode = `${detector.code}-${detectorSuffix}`.slice(
          0,
          80,
        );
        const detectorDto: CreateDetectorDto = {
          code: namespacedCode,
          name: detector.label,
          type: detector.kind,
          laneReference: detector.laneReference ?? null,
          intersectionId: intersection.id,
          assignedPhaseSequenceNumbers: detector.assignedPhaseSequenceNumbers
            ?.length
            ? detector.assignedPhaseSequenceNumbers
            : undefined,
        };
        await this.engineering.createDetector(detectorDto);
        detectorCount += 1;
      } catch (error) {
        this.logger.warn(
          `Detector ${detector.code} skipped : ${(error as Error).message}`,
        );
        warnings.push(
          `Detecteur ${detector.code} non cree (${(error as Error).message}).`,
        );
      }
    }

    // 5) Timing plans — same namespacing rule as detectors (the
    //    `code` column is globally unique).
    let timingPlanCount = 0;
    for (const plan of proposal.timingPlans) {
      try {
        const planDto: CreateTimingPlanDto = {
          code: `${plan.code}-${detectorSuffix}`.slice(0, 80),
          name: plan.name,
          status: TimingPlanStatus.DRAFT,
          cycleLengthSeconds: Math.max(10, plan.cycleSeconds),
          offsetSeconds: plan.offsetSeconds,
          simulationOnly: true,
          scheduleConfig: {},
          planData: {
            source: 'ai-engineering',
            variant: proposal.variantCode,
          },
          intersectionId: intersection.id,
        };
        await this.engineering.createTimingPlan(planDto);
        timingPlanCount += 1;
      } catch (error) {
        this.logger.warn(
          `Timing plan ${plan.code} skipped : ${(error as Error).message}`,
        );
        warnings.push(
          `Plan de feux ${plan.code} non cree (${(error as Error).message}).`,
        );
      }
    }

    return {
      intersectionId: intersection.id,
      intersectionCode: intersection.code,
      controllerCode,
      phaseCount: proposal.phases.length,
      detectorCount,
      timingPlanCount,
      redirectTo: `/studio/workspace/${intersection.id}`,
      warnings,
    };
  }

  private mapControlMode(
    mode: EngineeringProposal['recommendedControlMode'],
  ): IntersectionControlMode {
    switch (mode) {
      case 'adaptive':
        return IntersectionControlMode.ADAPTIVE;
      case 'manual':
        return IntersectionControlMode.MANUAL;
      case 'flash':
        return IntersectionControlMode.FLASH;
      case 'fail-safe':
        return IntersectionControlMode.FAIL_SAFE;
      case 'fixed':
      default:
        return IntersectionControlMode.FIXED;
    }
  }
}

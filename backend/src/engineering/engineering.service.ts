import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import type { AuthenticatedRequestUser } from '../auth/types/authenticated-user';
import { ControllerManagerService } from '../controller-manager/controller-manager.service';
import {
  ControllerEntity,
  ControllerConnectionState,
  ControllerDeploymentState,
  ControllerType,
  DeploymentEntity,
  DeploymentStatus,
  DetectorEntity,
  EventEntity,
  IntersectionEntity,
  IntersectionHealth,
  OperatingEnvironment,
  PhaseEntity,
  ScenarioEntity,
  TimingPlanEntity,
  TimingPlanStatus,
} from '../database/entities';
import { DeploymentPackageService } from './deployment-package.service';
import {
  CreateControllerDto,
  CreateDeploymentDraftDto,
  CreateDetectorDto,
  CreateIntersectionDto,
  CreatePhaseDto,
  CreateScenarioDto,
  CreateTimingPlanDto,
  UpdateControllerDto,
  UpdateDeploymentDraftDto,
  UpdateDetectorDto,
  UpdateIntersectionDto,
  UpdatePhaseDto,
  UpdateScenarioDto,
  UpdateTimingPlanDto,
} from './dto/engineering.dto';
import { EngineeringSafetyService } from './engineering-safety.service';
import type {
  DeploymentConfigurationContext,
  ValidationReport,
} from './engineering.types';

@Injectable()
export class EngineeringService {
  constructor(
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    @InjectRepository(DetectorEntity)
    private readonly detectorRepository: Repository<DetectorEntity>,
    @InjectRepository(PhaseEntity)
    private readonly phaseRepository: Repository<PhaseEntity>,
    @InjectRepository(TimingPlanEntity)
    private readonly timingPlanRepository: Repository<TimingPlanEntity>,
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepository: Repository<ScenarioEntity>,
    @InjectRepository(DeploymentEntity)
    private readonly deploymentRepository: Repository<DeploymentEntity>,
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    private readonly engineeringSafetyService: EngineeringSafetyService,
    private readonly deploymentPackageService: DeploymentPackageService,
    private readonly controllerManagerService: ControllerManagerService,
  ) {}

  listIntersections() {
    return this.intersectionRepository.find({
      relations: {
        controllers: true,
        detectors: true,
        phases: true,
        timingPlans: true,
      },
      order: {
        code: 'ASC',
      },
    });
  }

  async getIntersection(intersectionId: string) {
    const intersection = await this.intersectionRepository.findOne({
      where: {
        id: intersectionId,
      },
      relations: {
        controllers: true,
        detectors: true,
        phases: true,
        timingPlans: {
          scenario: true,
        },
        deployments: {
          controller: true,
          timingPlan: true,
          scenario: true,
        },
      },
    });

    if (!intersection) {
      throw new NotFoundException('Intersection not found.');
    }

    return intersection;
  }

  createIntersection(createIntersectionDto: CreateIntersectionDto) {
    return this.intersectionRepository.save(
      this.intersectionRepository.create({
        ...createIntersectionDto,
        status: IntersectionHealth.HEALTHY,
        queueLength: 0,
        incidents: 0,
        averageDelaySeconds: 0,
        lastHeartbeat: null,
      }),
    );
  }

  async updateIntersection(
    intersectionId: string,
    updateIntersectionDto: UpdateIntersectionDto,
  ) {
    const intersection = await this.getIntersectionEntity(intersectionId);

    return this.intersectionRepository.save({
      ...intersection,
      ...updateIntersectionDto,
    });
  }

  async deleteIntersection(intersectionId: string) {
    const intersection = await this.getIntersectionEntity(intersectionId);
    const deploymentCount = await this.deploymentRepository.count({
      where: {
        intersectionId,
      },
    });

    if (deploymentCount > 0) {
      throw new BadRequestException(
        'Intersection cannot be deleted once deployments exist. Retain it for audit and rollback history.',
      );
    }

    await this.intersectionRepository.remove(intersection);
    return {
      deleted: true,
      id: intersectionId,
    };
  }

  listControllers(intersectionId?: string) {
    return this.controllerRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
      },
      order: {
        code: 'ASC',
      },
    });
  }

  async getController(controllerId: string) {
    const controller = await this.controllerRepository.findOne({
      where: {
        id: controllerId,
      },
      relations: {
        intersection: true,
        detectors: true,
      },
    });

    if (!controller) {
      throw new NotFoundException('Controller not found.');
    }

    return controller;
  }

  async createController(createControllerDto: CreateControllerDto) {
    await this.getIntersectionEntity(createControllerDto.intersectionId);

    if (createControllerDto.isPrimary) {
      await this.reassignPrimaryController(
        createControllerDto.intersectionId,
        null,
      );
    }

    return this.controllerRepository.save(
      this.controllerRepository.create({
        code: createControllerDto.code,
        firmwareVersion: createControllerDto.firmwareVersion,
        controllerType:
          createControllerDto.controllerType ?? ControllerType.ATC,
        runtimeVersion: createControllerDto.runtimeVersion ?? '1.0.0',
        supportedPackageSchemaVersion:
          createControllerDto.supportedPackageSchemaVersion ?? 1,
        connectionState:
          createControllerDto.connectionState ??
          ControllerConnectionState.ONLINE,
        operatingEnvironment: createControllerDto.operatingEnvironment,
        batteryBacked: createControllerDto.batteryBacked ?? true,
        uptimeHours: createControllerDto.uptimeHours ?? 0,
        detectorCapacity: createControllerDto.detectorCapacity ?? 32,
        signalGroupCapacity: createControllerDto.signalGroupCapacity ?? 16,
        isPrimary: createControllerDto.isPrimary ?? false,
        lastSeen: null,
        lastDeployedPackageVersion: null,
        lastDeploymentState: ControllerDeploymentState.IDLE,
        lastDeploymentAt: null,
        lastTelemetryAt: null,
        telemetrySummary: {},
        lastKnownIpAddress: null,
        intersectionId: createControllerDto.intersectionId,
      }),
    );
  }

  async updateController(
    controllerId: string,
    updateControllerDto: UpdateControllerDto,
  ) {
    const controller = await this.getControllerEntity(controllerId);
    const nextIntersectionId =
      updateControllerDto.intersectionId ?? controller.intersectionId;

    await this.getIntersectionEntity(nextIntersectionId);

    if (updateControllerDto.isPrimary) {
      await this.reassignPrimaryController(nextIntersectionId, controller.id);
    }

    return this.controllerRepository.save({
      ...controller,
      ...updateControllerDto,
      intersectionId: nextIntersectionId,
    });
  }

  async deleteController(controllerId: string) {
    const controller = await this.getControllerEntity(controllerId);
    const deploymentCount = await this.deploymentRepository.count({
      where: {
        controllerId,
      },
    });

    if (deploymentCount > 0) {
      throw new BadRequestException(
        'Controller cannot be deleted once deployments exist. Disable or reassign it instead.',
      );
    }

    await this.detectorRepository.update(
      {
        controllerId,
      },
      {
        controllerId: null,
      },
    );
    await this.controllerRepository.remove(controller);
    return {
      deleted: true,
      id: controllerId,
    };
  }

  listDetectors(intersectionId?: string) {
    return this.detectorRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
        controller: true,
      },
      order: {
        code: 'ASC',
      },
    });
  }

  async getDetector(detectorId: string) {
    const detector = await this.detectorRepository.findOne({
      where: {
        id: detectorId,
      },
      relations: {
        intersection: true,
        controller: true,
      },
    });

    if (!detector) {
      throw new NotFoundException('Detector not found.');
    }

    return detector;
  }

  async createDetector(createDetectorDto: CreateDetectorDto) {
    await this.getIntersectionEntity(createDetectorDto.intersectionId);
    await this.assertControllerBelongsToIntersection(
      createDetectorDto.controllerId ?? null,
      createDetectorDto.intersectionId,
    );

    return this.detectorRepository.save(
      this.detectorRepository.create({
        ...createDetectorDto,
        controllerId: createDetectorDto.controllerId ?? null,
        assignedPhaseSequenceNumbers:
          createDetectorDto.assignedPhaseSequenceNumbers ?? [],
        laneReference: createDetectorDto.laneReference ?? null,
        isActive: true,
        lastTriggeredAt: null,
      }),
    );
  }

  async updateDetector(
    detectorId: string,
    updateDetectorDto: UpdateDetectorDto,
  ) {
    const detector = await this.getDetectorEntity(detectorId);
    await this.assertControllerBelongsToIntersection(
      updateDetectorDto.controllerId ?? detector.controllerId,
      detector.intersectionId,
    );

    return this.detectorRepository.save({
      ...detector,
      ...updateDetectorDto,
      controllerId:
        updateDetectorDto.controllerId === undefined
          ? detector.controllerId
          : updateDetectorDto.controllerId,
      assignedPhaseSequenceNumbers:
        updateDetectorDto.assignedPhaseSequenceNumbers ??
        detector.assignedPhaseSequenceNumbers,
      laneReference:
        updateDetectorDto.laneReference === undefined
          ? detector.laneReference
          : updateDetectorDto.laneReference,
    });
  }

  async deleteDetector(detectorId: string) {
    const detector = await this.getDetectorEntity(detectorId);
    await this.detectorRepository.remove(detector);
    return {
      deleted: true,
      id: detectorId,
    };
  }

  listPhases(intersectionId?: string) {
    return this.phaseRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
      },
      order: {
        sequenceNumber: 'ASC',
      },
    });
  }

  async getPhase(phaseId: string) {
    const phase = await this.phaseRepository.findOne({
      where: {
        id: phaseId,
      },
      relations: {
        intersection: true,
      },
    });

    if (!phase) {
      throw new NotFoundException('Phase not found.');
    }

    return phase;
  }

  async createPhase(createPhaseDto: CreatePhaseDto) {
    await this.getIntersectionEntity(createPhaseDto.intersectionId);
    const phase = this.phaseRepository.create({
      ...createPhaseDto,
      clearanceGroup: createPhaseDto.clearanceGroup ?? null,
      allowedConcurrentPhaseSequenceNumbers:
        createPhaseDto.allowedConcurrentPhaseSequenceNumbers ?? [],
      conflictingPhaseSequenceNumbers:
        createPhaseDto.conflictingPhaseSequenceNumbers ?? [],
      pedestrianWalkSeconds: createPhaseDto.pedestrianWalkSeconds ?? null,
      pedestrianClearSeconds: createPhaseDto.pedestrianClearSeconds ?? null,
    });
    const existingPhases = await this.phaseRepository.find({
      where: {
        intersectionId: createPhaseDto.intersectionId,
      },
      order: {
        sequenceNumber: 'ASC',
      },
    });

    await this.assertIntersectionSafety(createPhaseDto.intersectionId, [
      ...existingPhases,
      phase,
    ]);

    return this.phaseRepository.save(phase);
  }

  async updatePhase(phaseId: string, updatePhaseDto: UpdatePhaseDto) {
    const phase = await this.getPhaseEntity(phaseId);
    const candidate = this.phaseRepository.create({
      ...phase,
      ...updatePhaseDto,
      clearanceGroup:
        updatePhaseDto.clearanceGroup === undefined
          ? phase.clearanceGroup
          : updatePhaseDto.clearanceGroup,
      allowedConcurrentPhaseSequenceNumbers:
        updatePhaseDto.allowedConcurrentPhaseSequenceNumbers ??
        phase.allowedConcurrentPhaseSequenceNumbers,
      conflictingPhaseSequenceNumbers:
        updatePhaseDto.conflictingPhaseSequenceNumbers ??
        phase.conflictingPhaseSequenceNumbers,
      pedestrianWalkSeconds:
        updatePhaseDto.pedestrianWalkSeconds === undefined
          ? phase.pedestrianWalkSeconds
          : updatePhaseDto.pedestrianWalkSeconds,
      pedestrianClearSeconds:
        updatePhaseDto.pedestrianClearSeconds === undefined
          ? phase.pedestrianClearSeconds
          : updatePhaseDto.pedestrianClearSeconds,
    });
    const existingPhases = await this.phaseRepository.find({
      where: {
        intersectionId: phase.intersectionId,
      },
      order: {
        sequenceNumber: 'ASC',
      },
    });

    await this.assertIntersectionSafety(
      phase.intersectionId,
      existingPhases.map((existingPhase) =>
        existingPhase.id === phaseId ? candidate : existingPhase,
      ),
    );

    return this.phaseRepository.save(candidate);
  }

  async deletePhase(phaseId: string) {
    const phase = await this.getPhaseEntity(phaseId);
    const existingPhases = await this.phaseRepository.find({
      where: {
        intersectionId: phase.intersectionId,
      },
    });
    const remainingPhases = existingPhases.filter(
      (existingPhase) => existingPhase.id !== phaseId,
    );

    await this.assertIntersectionSafety(phase.intersectionId, remainingPhases);
    await this.phaseRepository.remove(phase);
    return {
      deleted: true,
      id: phaseId,
    };
  }

  listTimingPlans(intersectionId?: string) {
    return this.timingPlanRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
        scenario: true,
      },
      order: {
        code: 'ASC',
      },
    });
  }

  async getTimingPlan(timingPlanId: string) {
    const timingPlan = await this.timingPlanRepository.findOne({
      where: {
        id: timingPlanId,
      },
      relations: {
        intersection: true,
        scenario: true,
      },
    });

    if (!timingPlan) {
      throw new NotFoundException('Timing plan not found.');
    }

    return timingPlan;
  }

  async createTimingPlan(createTimingPlanDto: CreateTimingPlanDto) {
    await this.getIntersectionEntity(createTimingPlanDto.intersectionId);
    const scenario = await this.getScenarioOptional(
      createTimingPlanDto.scenarioId,
    );
    const timingPlan = this.timingPlanRepository.create({
      ...createTimingPlanDto,
      scenarioId: createTimingPlanDto.scenarioId ?? null,
      scheduleConfig: createTimingPlanDto.scheduleConfig ?? {},
      planData: createTimingPlanDto.planData ?? {},
    });

    await this.assertTimingPlanSafe(
      timingPlan,
      createTimingPlanDto.intersectionId,
      scenario,
      createTimingPlanDto.simulationOnly
        ? OperatingEnvironment.SIMULATION
        : OperatingEnvironment.REAL,
      null,
    );

    return this.timingPlanRepository.save(timingPlan);
  }

  async updateTimingPlan(
    timingPlanId: string,
    updateTimingPlanDto: UpdateTimingPlanDto,
  ) {
    const timingPlan = await this.getTimingPlanEntity(timingPlanId);
    const nextTimingPlan = this.timingPlanRepository.create({
      ...timingPlan,
      ...updateTimingPlanDto,
      scenarioId:
        updateTimingPlanDto.scenarioId === undefined
          ? timingPlan.scenarioId
          : updateTimingPlanDto.scenarioId,
      scheduleConfig:
        updateTimingPlanDto.scheduleConfig ?? timingPlan.scheduleConfig,
      planData: updateTimingPlanDto.planData ?? timingPlan.planData,
    });
    const scenario = await this.getScenarioOptional(nextTimingPlan.scenarioId);

    await this.assertTimingPlanSafe(
      nextTimingPlan,
      timingPlan.intersectionId,
      scenario,
      nextTimingPlan.simulationOnly
        ? OperatingEnvironment.SIMULATION
        : OperatingEnvironment.REAL,
      null,
    );

    return this.timingPlanRepository.save(nextTimingPlan);
  }

  async deleteTimingPlan(timingPlanId: string) {
    const timingPlan = await this.getTimingPlanEntity(timingPlanId);

    if (timingPlan.status === TimingPlanStatus.ACTIVE) {
      throw new BadRequestException(
        'Active timing plans cannot be deleted. Retire them or publish a replacement first.',
      );
    }

    const deploymentCount = await this.deploymentRepository.count({
      where: {
        timingPlanId,
        status: In([
          DeploymentStatus.PUBLISHED,
          DeploymentStatus.SIGNED,
          DeploymentStatus.VALIDATED,
          DeploymentStatus.COMPLETED,
        ]),
      },
    });

    if (deploymentCount > 0) {
      throw new BadRequestException(
        'Timing plans with validated or published deployments cannot be deleted.',
      );
    }

    await this.timingPlanRepository.remove(timingPlan);
    return {
      deleted: true,
      id: timingPlanId,
    };
  }

  listScenarios() {
    return this.scenarioRepository.find({
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async getScenario(scenarioId: string) {
    const scenario = await this.scenarioRepository.findOne({
      where: {
        id: scenarioId,
      },
    });

    if (!scenario) {
      throw new NotFoundException('Scenario not found.');
    }

    return scenario;
  }

  createScenario(createScenarioDto: CreateScenarioDto) {
    return this.scenarioRepository.save(
      this.scenarioRepository.create({
        ...createScenarioDto,
        isSystem: createScenarioDto.isSystem ?? false,
        isActive: createScenarioDto.isActive ?? false,
        parameters: createScenarioDto.parameters ?? {},
      }),
    );
  }

  async updateScenario(
    scenarioId: string,
    updateScenarioDto: UpdateScenarioDto,
  ) {
    const scenario = await this.getScenarioEntity(scenarioId);

    return this.scenarioRepository.save({
      ...scenario,
      ...updateScenarioDto,
      parameters: updateScenarioDto.parameters ?? scenario.parameters,
    });
  }

  async deleteScenario(scenarioId: string) {
    const scenario = await this.getScenarioEntity(scenarioId);

    if (scenario.isSystem || scenario.isActive) {
      throw new BadRequestException(
        'System or active scenarios cannot be deleted.',
      );
    }

    const deploymentCount = await this.deploymentRepository.count({
      where: {
        scenarioId,
      },
    });

    if (deploymentCount > 0) {
      throw new BadRequestException(
        'Scenarios with deployment history cannot be deleted.',
      );
    }

    await this.scenarioRepository.remove(scenario);
    return {
      deleted: true,
      id: scenarioId,
    };
  }

  listDeployments(intersectionId?: string) {
    return this.deploymentRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
        controller: true,
        timingPlan: true,
        scenario: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getDeployment(deploymentId: string) {
    return this.getDeploymentEntity(deploymentId);
  }

  async createDeploymentDraft(
    createDeploymentDto: CreateDeploymentDraftDto,
    actor?: AuthenticatedRequestUser,
  ) {
    const deployment = this.deploymentRepository.create({
      targetType: createDeploymentDto.targetType,
      targetEnvironment: createDeploymentDto.targetEnvironment,
      operatingMode: createDeploymentDto.operatingMode,
      payload: {},
      packageManifest: {
        requestPayload: createDeploymentDto.payload ?? {},
      },
      validationReport: {},
      packageVersion: null,
      packageDigest: null,
      packageSignature: null,
      requiredRuntimeVersion:
        createDeploymentDto.requiredRuntimeVersion ?? null,
      compatibleControllerTypes:
        createDeploymentDto.compatibleControllerTypes ?? [],
      runtimeContractSchemaVersion: 1,
      status: DeploymentStatus.DRAFT,
      isSigned: false,
      requestedAt: new Date(),
      validatedAt: null,
      signedAt: null,
      publishedAt: null,
      acknowledgedAt: null,
      completedAt: null,
      rolledBackAt: null,
      controllerReportedPackageDigest: null,
      requestedByUserId: actor?.sub ?? null,
      acknowledgedByControllerId: null,
      resultSummary: createDeploymentDto.resultSummary ?? null,
      intersectionId: createDeploymentDto.intersectionId,
      controllerId: createDeploymentDto.controllerId ?? null,
      timingPlanId: createDeploymentDto.timingPlanId ?? null,
      scenarioId: createDeploymentDto.scenarioId ?? null,
      rollbackOfDeploymentId: null,
      supersededByDeploymentId: null,
    });
    const savedDraft = await this.deploymentRepository.save(deployment);
    const refreshedDraft = await this.refreshDeploymentArtifacts(savedDraft.id);

    await this.createDeploymentEvent(
      'deployment.draft.created',
      refreshedDraft,
      `Draft package ${refreshedDraft.packageVersion} created.`,
    );

    return refreshedDraft;
  }

  async updateDeploymentDraft(
    deploymentId: string,
    updateDeploymentDto: UpdateDeploymentDraftDto,
  ) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    this.assertDraftMutable(deployment);

    if (updateDeploymentDto.intersectionId) {
      await this.getIntersectionEntity(updateDeploymentDto.intersectionId);
    }

    const nextDeployment = this.deploymentRepository.create({
      ...deployment,
      ...updateDeploymentDto,
      controllerId:
        updateDeploymentDto.controllerId === undefined
          ? deployment.controllerId
          : updateDeploymentDto.controllerId,
      timingPlanId:
        updateDeploymentDto.timingPlanId === undefined
          ? deployment.timingPlanId
          : updateDeploymentDto.timingPlanId,
      scenarioId:
        updateDeploymentDto.scenarioId === undefined
          ? deployment.scenarioId
          : updateDeploymentDto.scenarioId,
      packageManifest: {
        ...(deployment.packageManifest ?? {}),
        requestPayload:
          updateDeploymentDto.payload === undefined
            ? this.readRequestPayload(deployment)
            : updateDeploymentDto.payload,
      },
      payload: {},
      validationReport: {},
      packageDigest: null,
      packageSignature: null,
      requiredRuntimeVersion:
        updateDeploymentDto.requiredRuntimeVersion === undefined
          ? deployment.requiredRuntimeVersion
          : updateDeploymentDto.requiredRuntimeVersion,
      compatibleControllerTypes:
        updateDeploymentDto.compatibleControllerTypes ??
        deployment.compatibleControllerTypes,
      runtimeContractSchemaVersion: deployment.runtimeContractSchemaVersion,
      packageVersion: deployment.packageVersion,
      isSigned: false,
      status: DeploymentStatus.DRAFT,
      validatedAt: null,
      signedAt: null,
      publishedAt: null,
      acknowledgedAt: null,
      rolledBackAt: null,
      completedAt: null,
      controllerReportedPackageDigest: null,
      acknowledgedByControllerId: null,
    });

    await this.deploymentRepository.save(nextDeployment);
    return this.refreshDeploymentArtifacts(deploymentId);
  }

  async deleteDeployment(deploymentId: string) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    this.assertDraftMutable(deployment);
    await this.deploymentRepository.remove(deployment);
    return {
      deleted: true,
      id: deploymentId,
    };
  }

  async validateDeployment(deploymentId: string) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    this.assertDeploymentNotPublished(deployment);

    const refreshed = await this.refreshDeploymentArtifacts(deploymentId);
    const report = refreshed.validationReport as unknown as ValidationReport;
    const nextStatus = report.valid
      ? DeploymentStatus.VALIDATED
      : DeploymentStatus.DRAFT;

    refreshed.status = nextStatus;
    refreshed.validatedAt = report.valid ? new Date() : null;
    refreshed.resultSummary = report.valid
      ? `Validation passed for ${refreshed.packageVersion}.`
      : `Validation blocked ${refreshed.packageVersion}.`;

    await this.deploymentRepository.save(refreshed);
    await this.createDeploymentEvent(
      'deployment.validated',
      refreshed,
      refreshed.resultSummary,
    );
    return refreshed;
  }

  async signDeployment(deploymentId: string) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    this.assertDeploymentNotPublished(deployment);

    const refreshed = await this.refreshDeploymentArtifacts(deploymentId);
    const report = refreshed.validationReport as unknown as ValidationReport;

    if (!report.valid) {
      throw new BadRequestException({
        message: 'Deployment validation must pass before signing.',
        validationReport: report,
      });
    }

    const signedAt = new Date();
    const packageSignature = this.deploymentPackageService.signPackage(
      refreshed.payload as never,
    );
    refreshed.packageSignature = packageSignature;
    refreshed.isSigned = true;
    refreshed.status = DeploymentStatus.SIGNED;
    refreshed.validatedAt = refreshed.validatedAt ?? new Date();
    refreshed.signedAt = signedAt;
    refreshed.payload = this.deploymentPackageService.attachSignature(
      refreshed.payload as never,
      packageSignature,
      signedAt.toISOString(),
    ) as never;
    refreshed.resultSummary = `Package ${refreshed.packageVersion} signed.`;

    await this.deploymentRepository.save(refreshed);
    await this.createDeploymentEvent(
      'deployment.signed',
      refreshed,
      refreshed.resultSummary,
    );
    return refreshed;
  }

  async publishDeployment(
    deploymentId: string,
    actor?: AuthenticatedRequestUser,
  ) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    if (!deployment.isSigned || !deployment.packageSignature) {
      throw new BadRequestException(
        'Deployment must be signed before publishing.',
      );
    }

    const refreshed = await this.refreshDeploymentArtifacts(deploymentId);
    const report = refreshed.validationReport as unknown as ValidationReport;

    if (!report.valid) {
      throw new BadRequestException({
        message:
          'Deployment is no longer valid. Regenerate, validate, and sign again before publishing.',
        validationReport: report,
      });
    }

    if (refreshed.packageDigest !== deployment.packageDigest) {
      throw new BadRequestException(
        'Configuration changed after signing. Revalidate and sign the deployment again.',
      );
    }

    await this.supersedePublishedDeployments(refreshed);

    refreshed.status = DeploymentStatus.PUBLISHED;
    refreshed.publishedAt = new Date();
    refreshed.completedAt = refreshed.publishedAt;
    refreshed.resultSummary = `Package ${refreshed.packageVersion} published to ${refreshed.targetEnvironment}.`;
    refreshed.requestedByUserId = actor?.sub ?? refreshed.requestedByUserId;
    await this.deploymentRepository.save(refreshed);
    await this.controllerManagerService.markDeploymentPublished(refreshed);

    if (
      refreshed.timingPlanId &&
      refreshed.intersectionId &&
      refreshed.targetEnvironment === OperatingEnvironment.REAL
    ) {
      await this.activatePublishedTimingPlan(
        refreshed.intersectionId,
        refreshed.timingPlanId,
        refreshed.targetEnvironment,
      );
      await this.intersectionRepository.update(refreshed.intersectionId, {
        controlMode: refreshed.operatingMode,
      });
    }

    await this.createDeploymentEvent(
      'deployment.published',
      refreshed,
      refreshed.resultSummary,
    );
    return refreshed;
  }

  async rollbackDeployment(
    deploymentId: string,
    actor?: AuthenticatedRequestUser,
  ) {
    const deployment = await this.getDeploymentEntity(deploymentId);

    if (
      ![
        DeploymentStatus.PUBLISHED,
        DeploymentStatus.COMPLETED,
        DeploymentStatus.SUPERSEDED,
      ].includes(deployment.status)
    ) {
      throw new BadRequestException(
        'Only published deployments can be rolled back.',
      );
    }

    const rollbackSource = await this.findRollbackSource(deployment);

    if (!rollbackSource) {
      throw new BadRequestException(
        'No previous published deployment is available to roll back to.',
      );
    }

    const rollbackDraft = await this.deploymentRepository.save(
      this.deploymentRepository.create({
        targetType: rollbackSource.targetType,
        targetEnvironment: rollbackSource.targetEnvironment,
        operatingMode: rollbackSource.operatingMode,
        payload: {},
        packageManifest: {
          requestPayload: this.readRequestPayload(rollbackSource),
        },
        validationReport: {},
        packageVersion: null,
        packageDigest: null,
        packageSignature: null,
        requiredRuntimeVersion: rollbackSource.requiredRuntimeVersion,
        compatibleControllerTypes: rollbackSource.compatibleControllerTypes,
        runtimeContractSchemaVersion:
          rollbackSource.runtimeContractSchemaVersion,
        status: DeploymentStatus.DRAFT,
        isSigned: false,
        requestedAt: new Date(),
        validatedAt: null,
        signedAt: null,
        publishedAt: null,
        acknowledgedAt: null,
        completedAt: null,
        rolledBackAt: null,
        controllerReportedPackageDigest: null,
        requestedByUserId: actor?.sub ?? null,
        acknowledgedByControllerId: null,
        resultSummary: `Rollback of ${deployment.packageVersion ?? deployment.id}`,
        intersectionId: rollbackSource.intersectionId,
        controllerId: rollbackSource.controllerId,
        timingPlanId: rollbackSource.timingPlanId,
        scenarioId: rollbackSource.scenarioId,
        rollbackOfDeploymentId: deployment.id,
        supersededByDeploymentId: null,
      }),
    );
    const validatedDraft = await this.validateDeployment(rollbackDraft.id);
    const signedDraft = await this.signDeployment(validatedDraft.id);
    const publishedRollback = await this.publishDeployment(
      signedDraft.id,
      actor,
    );

    deployment.status = DeploymentStatus.ROLLED_BACK;
    deployment.rolledBackAt = new Date();
    deployment.completedAt = deployment.rolledBackAt;
    deployment.resultSummary = `Rolled back by ${publishedRollback.packageVersion}.`;
    await this.deploymentRepository.save(deployment);

    await this.createDeploymentEvent(
      'deployment.rolled-back',
      publishedRollback,
      `Rollback package ${publishedRollback.packageVersion} published.`,
    );
    return publishedRollback;
  }

  private async refreshDeploymentArtifacts(deploymentId: string) {
    const deployment = await this.getDeploymentEntity(deploymentId);
    const context = await this.loadDeploymentContext(deployment);
    const safetyValidationReport =
      this.engineeringSafetyService.validateTimingPlanConfiguration({
        phases: context.phases,
        timingPlan: context.timingPlan,
        controllers: context.controllers,
        scenario: context.scenario,
        targetEnvironment: deployment.targetEnvironment,
        targetControllerId: deployment.controllerId,
      });
    const compatibility =
      this.controllerManagerService.validateDeploymentCompatibility({
        deployment,
        context,
      });
    const validationReport =
      this.controllerManagerService.mergeCompatibilityIntoValidationReport(
        safetyValidationReport,
        compatibility,
      );
    const requestPayload = this.readRequestPayload(deployment);
    const targetController =
      compatibility.targetController ??
      compatibility.candidateControllers[0] ??
      context.controllers.find((controller) =>
        deployment.controllerId
          ? controller.id === deployment.controllerId
          : controller.operatingEnvironment === deployment.targetEnvironment,
      ) ??
      context.controllers[0];

    if (!targetController) {
      return this.deploymentRepository.save({
        ...deployment,
        payload: {},
        packageManifest: {
          ...(deployment.packageManifest ?? {}),
          requestPayload,
          targetControllerId: null,
          targetControllerCode: null,
        },
        validationReport: validationReport as unknown as Record<
          string,
          unknown
        >,
        packageVersion: deployment.packageVersion,
        packageDigest: null,
        packageSignature:
          deployment.status === DeploymentStatus.SIGNED ||
          deployment.status === DeploymentStatus.PUBLISHED
            ? deployment.packageSignature
            : null,
        isSigned:
          deployment.status === DeploymentStatus.SIGNED ||
          deployment.status === DeploymentStatus.PUBLISHED,
      });
    }

    const packageBuild = this.deploymentPackageService.buildPackage({
      deployment,
      context,
      targetController,
      validationReport,
    });
    const payload =
      (deployment.status === DeploymentStatus.SIGNED ||
        deployment.status === DeploymentStatus.PUBLISHED) &&
      deployment.packageSignature
        ? this.deploymentPackageService.attachSignature(
            packageBuild.document,
            deployment.packageSignature,
            deployment.signedAt?.toISOString() ?? null,
          )
        : packageBuild.document;

    return this.deploymentRepository.save({
      ...deployment,
      payload: payload as unknown as Record<string, unknown>,
      packageManifest: {
        ...packageBuild.manifest,
        requestPayload,
      },
      validationReport: validationReport as unknown as Record<string, unknown>,
      packageVersion: packageBuild.packageVersion,
      packageDigest: packageBuild.packageDigest,
      packageSignature:
        deployment.status === DeploymentStatus.SIGNED ||
        deployment.status === DeploymentStatus.PUBLISHED
          ? deployment.packageSignature
          : null,
      isSigned:
        deployment.status === DeploymentStatus.SIGNED ||
        deployment.status === DeploymentStatus.PUBLISHED,
    });
  }

  private async assertIntersectionSafety(
    intersectionId: string,
    phases: PhaseEntity[],
  ) {
    const phaseReport = this.engineeringSafetyService.validatePhaseSet(phases);

    if (!phaseReport.valid) {
      throw new BadRequestException({
        message: 'Phase configuration is unsafe.',
        validationReport: phaseReport,
      });
    }

    const [timingPlans, controllers] = await Promise.all([
      this.timingPlanRepository.find({
        where: {
          intersectionId,
          status: In([TimingPlanStatus.DRAFT, TimingPlanStatus.ACTIVE]),
        },
      }),
      this.controllerRepository.find({
        where: {
          intersectionId,
        },
      }),
    ]);

    for (const timingPlan of timingPlans) {
      const scenario = await this.getScenarioOptional(timingPlan.scenarioId);
      const targetEnvironment = timingPlan.simulationOnly
        ? OperatingEnvironment.SIMULATION
        : OperatingEnvironment.REAL;
      const validationReport =
        this.engineeringSafetyService.validateTimingPlanConfiguration({
          phases,
          timingPlan,
          controllers,
          scenario,
          targetEnvironment,
        });

      if (!validationReport.valid) {
        throw new BadRequestException({
          message: `Phase change would invalidate timing plan ${timingPlan.code}.`,
          validationReport,
        });
      }
    }
  }

  private async assertTimingPlanSafe(
    timingPlan: TimingPlanEntity,
    intersectionId: string,
    scenario: ScenarioEntity | null,
    targetEnvironment: OperatingEnvironment,
    targetControllerId: string | null,
  ) {
    const [phases, controllers] = await Promise.all([
      this.phaseRepository.find({
        where: {
          intersectionId,
        },
      }),
      this.controllerRepository.find({
        where: {
          intersectionId,
        },
      }),
    ]);
    const validationReport =
      this.engineeringSafetyService.validateTimingPlanConfiguration({
        phases,
        timingPlan,
        controllers,
        scenario,
        targetEnvironment,
        targetControllerId,
      });

    if (!validationReport.valid) {
      throw new BadRequestException({
        message: 'Timing plan configuration is unsafe.',
        validationReport,
      });
    }
  }

  private async loadDeploymentContext(
    deployment: DeploymentEntity,
  ): Promise<DeploymentConfigurationContext> {
    if (!deployment.intersectionId) {
      throw new BadRequestException(
        'Deployments must reference an intersection.',
      );
    }

    if (!deployment.timingPlanId) {
      throw new BadRequestException(
        'Deployments must reference a timing plan.',
      );
    }

    const intersection = await this.intersectionRepository.findOne({
      where: {
        id: deployment.intersectionId,
      },
      relations: {
        controllers: true,
        detectors: true,
        phases: true,
      },
    });

    if (!intersection) {
      throw new NotFoundException('Intersection not found.');
    }

    const timingPlan = await this.timingPlanRepository.findOne({
      where: {
        id: deployment.timingPlanId,
      },
      relations: {
        scenario: true,
      },
    });

    if (!timingPlan) {
      throw new NotFoundException('Timing plan not found.');
    }

    if (timingPlan.intersectionId !== intersection.id) {
      throw new BadRequestException(
        'Timing plan does not belong to the deployment intersection.',
      );
    }

    let scenario = timingPlan.scenario ?? null;

    if (deployment.scenarioId) {
      scenario = await this.getScenarioEntity(deployment.scenarioId);
    }

    await this.assertControllerBelongsToIntersection(
      deployment.controllerId,
      intersection.id,
    );

    return {
      intersection,
      controllers: intersection.controllers,
      detectors: intersection.detectors,
      phases: intersection.phases.sort(
        (leftPhase, rightPhase) =>
          leftPhase.sequenceNumber - rightPhase.sequenceNumber,
      ),
      timingPlan,
      scenario,
    };
  }

  private async activatePublishedTimingPlan(
    intersectionId: string,
    timingPlanId: string,
    targetEnvironment: OperatingEnvironment,
  ) {
    const timingPlans = await this.timingPlanRepository.find({
      where: {
        intersectionId,
      },
    });

    for (const timingPlan of timingPlans) {
      const shouldBeActive = timingPlan.id === timingPlanId;
      const belongsToEnvironment =
        targetEnvironment === OperatingEnvironment.SIMULATION
          ? timingPlan.simulationOnly
          : !timingPlan.simulationOnly;

      if (!belongsToEnvironment) {
        continue;
      }

      timingPlan.status = shouldBeActive
        ? TimingPlanStatus.ACTIVE
        : TimingPlanStatus.DRAFT;
      await this.timingPlanRepository.save(timingPlan);
    }
  }

  private async supersedePublishedDeployments(deployment: DeploymentEntity) {
    if (!deployment.intersectionId) {
      return;
    }

    const priorDeployments = await this.deploymentRepository.find({
      where: {
        intersectionId: deployment.intersectionId,
        targetEnvironment: deployment.targetEnvironment,
        targetType: deployment.targetType,
      },
    });

    for (const priorDeployment of priorDeployments) {
      if (priorDeployment.id === deployment.id) {
        continue;
      }

      const controllerMatches =
        priorDeployment.controllerId === deployment.controllerId ||
        (!priorDeployment.controllerId && !deployment.controllerId);

      if (!controllerMatches) {
        continue;
      }

      if (
        [
          DeploymentStatus.PUBLISHED,
          DeploymentStatus.COMPLETED,
          DeploymentStatus.SIGNED,
        ].includes(priorDeployment.status)
      ) {
        priorDeployment.status = DeploymentStatus.SUPERSEDED;
        priorDeployment.completedAt = new Date();
        priorDeployment.supersededByDeploymentId = deployment.id;
        await this.deploymentRepository.save(priorDeployment);
      }
    }
  }

  private async findRollbackSource(deployment: DeploymentEntity) {
    if (!deployment.intersectionId) {
      return null;
    }

    const candidates = await this.deploymentRepository.find({
      where: {
        intersectionId: deployment.intersectionId,
        targetEnvironment: deployment.targetEnvironment,
        targetType: deployment.targetType,
        status: In([
          DeploymentStatus.PUBLISHED,
          DeploymentStatus.COMPLETED,
          DeploymentStatus.SUPERSEDED,
        ]),
      },
      order: {
        publishedAt: 'DESC',
        createdAt: 'DESC',
      },
    });

    return (
      candidates.find((candidate) => {
        if (candidate.id === deployment.id) {
          return false;
        }

        return (
          candidate.controllerId === deployment.controllerId ||
          (!candidate.controllerId && !deployment.controllerId)
        );
      }) ?? null
    );
  }

  private async createDeploymentEvent(
    eventType: string,
    deployment: DeploymentEntity,
    summary: string,
  ) {
    await this.eventRepository.save(
      this.eventRepository.create({
        eventType,
        operatingEnvironment: deployment.targetEnvironment,
        summary,
        payload: {
          deploymentId: deployment.id,
          packageVersion: deployment.packageVersion,
          targetType: deployment.targetType,
          status: deployment.status,
        },
        occurredAt: new Date(),
        intersectionId: deployment.intersectionId ?? null,
        controllerId: deployment.controllerId ?? null,
        scenarioId: deployment.scenarioId ?? null,
      }),
    );
  }

  private readRequestPayload(deployment: DeploymentEntity) {
    const packageManifest = deployment.packageManifest ?? {};
    const requestPayload = packageManifest.requestPayload;

    return requestPayload &&
      typeof requestPayload === 'object' &&
      !Array.isArray(requestPayload)
      ? (requestPayload as Record<string, unknown>)
      : {};
  }

  private assertDraftMutable(deployment: DeploymentEntity) {
    if (
      ![
        DeploymentStatus.DRAFT,
        DeploymentStatus.VALIDATED,
        DeploymentStatus.FAILED,
      ].includes(deployment.status)
    ) {
      throw new BadRequestException(
        'Only draft, validated, or failed deployments can be edited or removed.',
      );
    }
  }

  private assertDeploymentNotPublished(deployment: DeploymentEntity) {
    if (
      [
        DeploymentStatus.PUBLISHED,
        DeploymentStatus.ROLLED_BACK,
        DeploymentStatus.SUPERSEDED,
      ].includes(deployment.status)
    ) {
      throw new BadRequestException(
        'Published deployment history is immutable. Create a new draft instead.',
      );
    }
  }

  private async reassignPrimaryController(
    intersectionId: string,
    exemptControllerId: string | null,
  ) {
    const primaryControllers = await this.controllerRepository.find({
      where: {
        intersectionId,
        isPrimary: true,
      },
    });

    for (const controller of primaryControllers) {
      if (controller.id === exemptControllerId) {
        continue;
      }

      controller.isPrimary = false;
      await this.controllerRepository.save(controller);
    }
  }

  private async assertControllerBelongsToIntersection(
    controllerId: string | null | undefined,
    intersectionId: string,
  ) {
    if (!controllerId) {
      return;
    }

    const controller = await this.getControllerEntity(controllerId);

    if (controller.intersectionId !== intersectionId) {
      throw new BadRequestException(
        'Selected controller does not belong to the specified intersection.',
      );
    }
  }

  private async getScenarioOptional(scenarioId?: string | null) {
    if (!scenarioId) {
      return null;
    }

    return this.getScenarioEntity(scenarioId);
  }

  private async getIntersectionEntity(intersectionId: string) {
    const intersection = await this.intersectionRepository.findOne({
      where: {
        id: intersectionId,
      },
    });

    if (!intersection) {
      throw new NotFoundException('Intersection not found.');
    }

    return intersection;
  }

  private async getControllerEntity(controllerId: string) {
    const controller = await this.controllerRepository.findOne({
      where: {
        id: controllerId,
      },
    });

    if (!controller) {
      throw new NotFoundException('Controller not found.');
    }

    return controller;
  }

  private async getDetectorEntity(detectorId: string) {
    const detector = await this.detectorRepository.findOne({
      where: {
        id: detectorId,
      },
    });

    if (!detector) {
      throw new NotFoundException('Detector not found.');
    }

    return detector;
  }

  private async getPhaseEntity(phaseId: string) {
    const phase = await this.phaseRepository.findOne({
      where: {
        id: phaseId,
      },
    });

    if (!phase) {
      throw new NotFoundException('Phase not found.');
    }

    return phase;
  }

  private async getTimingPlanEntity(timingPlanId: string) {
    const timingPlan = await this.timingPlanRepository.findOne({
      where: {
        id: timingPlanId,
      },
    });

    if (!timingPlan) {
      throw new NotFoundException('Timing plan not found.');
    }

    return timingPlan;
  }

  private async getScenarioEntity(scenarioId: string) {
    const scenario = await this.scenarioRepository.findOne({
      where: {
        id: scenarioId,
      },
    });

    if (!scenario) {
      throw new NotFoundException('Scenario not found.');
    }

    return scenario;
  }

  private async getDeploymentEntity(deploymentId: string) {
    const deployment = await this.deploymentRepository.findOne({
      where: {
        id: deploymentId,
      },
      relations: {
        intersection: true,
        controller: true,
        timingPlan: true,
        scenario: true,
        rollbackOfDeployment: true,
        supersededByDeployment: true,
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found.');
    }

    return deployment;
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';

import appConfig from '../config/app.config';
import {
  AlarmEntity,
  AlarmSeverity,
  AlarmStatus,
  ControllerConnectionState,
  ControllerCredentialEntity,
  ControllerDeploymentState,
  ControllerEntity,
  ControllerEventEntity,
  ControllerEventType,
  ControllerType,
  DeploymentEntity,
  DeploymentStatus,
  IntersectionEntity,
  TimingPlanEntity,
} from '../database/entities';
import type {
  DeploymentConfigurationContext,
  ValidationIssue,
  ValidationReport,
} from '../engineering/engineering.types';
import {
  CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION,
  controllerRuntimePackageJsonSchema,
} from './controller-runtime-contract';
import {
  ControllerAcknowledgeDeploymentDto,
  ControllerAlarmUploadDto,
  ControllerBootstrapDto,
  ControllerHeartbeatDto,
  ControllerTelemetryUploadDto,
  IssueControllerCredentialDto,
  RegisterControllerDto,
  UpdateManagedControllerDto,
  mapAckStateToDeploymentState,
} from './dto/controller-manager.dto';
import type { AuthenticatedController } from './types/authenticated-controller';

interface ControllerRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface DeploymentCompatibilityResult {
  valid: boolean;
  targetController: ControllerEntity | null;
  candidateControllers: ControllerEntity[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

@Injectable()
export class ControllerManagerService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    @InjectRepository(DeploymentEntity)
    private readonly deploymentRepository: Repository<DeploymentEntity>,
    @InjectRepository(ControllerCredentialEntity)
    private readonly controllerCredentialRepository: Repository<ControllerCredentialEntity>,
    @InjectRepository(ControllerEventEntity)
    private readonly controllerEventRepository: Repository<ControllerEventEntity>,
    @InjectRepository(AlarmEntity)
    private readonly alarmRepository: Repository<AlarmEntity>,
    private readonly jwtService: JwtService,
  ) {}

  getRuntimeContractSchema() {
    return {
      schemaVersion: CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION,
      schema: controllerRuntimePackageJsonSchema,
    };
  }

  async listControllers(intersectionId?: string) {
    await this.refreshControllerConnectionStates();
    const controllers = await this.controllerRepository.find({
      where: intersectionId ? { intersectionId } : {},
      relations: {
        intersection: true,
      },
      order: {
        code: 'ASC',
      },
    });

    return controllers.map((controller) =>
      this.serializeController(controller),
    );
  }

  async getController(controllerId: string) {
    await this.refreshControllerConnectionStates();
    const controller = await this.controllerRepository.findOne({
      where: { id: controllerId },
      relations: {
        intersection: true,
        detectors: true,
        deployments: {
          timingPlan: true,
          scenario: true,
        },
        credentials: true,
      },
    });

    if (!controller) {
      throw new NotFoundException('Controller not found.');
    }

    const recentRuntimeEvents = await this.controllerEventRepository.find({
      where: { controllerId },
      relations: {
        deployment: true,
      },
      order: {
        occurredAt: 'DESC',
      },
      take: 20,
    });

    return {
      ...this.serializeController(controller),
      detectors: controller.detectors.map((detector) => ({
        id: detector.id,
        code: detector.code,
        name: detector.name,
        type: detector.type,
        laneReference: detector.laneReference,
        assignedPhaseSequenceNumbers: detector.assignedPhaseSequenceNumbers,
      })),
      credentials: controller.credentials
        .sort(
          (leftCredential, rightCredential) =>
            rightCredential.issuedAt.getTime() -
            leftCredential.issuedAt.getTime(),
        )
        .map((credential) => ({
          id: credential.id,
          clientId: credential.clientId,
          label: credential.label,
          issuedAt: credential.issuedAt.toISOString(),
          expiresAt: credential.expiresAt?.toISOString() ?? null,
          revokedAt: credential.revokedAt?.toISOString() ?? null,
          lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
        })),
      recentRuntimeEvents: recentRuntimeEvents.map((runtimeEvent) => ({
        id: runtimeEvent.id,
        eventType: runtimeEvent.eventType,
        severity: runtimeEvent.severity,
        summary: runtimeEvent.summary,
        occurredAt: runtimeEvent.occurredAt.toISOString(),
        deploymentId: runtimeEvent.deploymentId,
        deploymentPackageVersion:
          runtimeEvent.deployment?.packageVersion ?? null,
        payload: runtimeEvent.payload,
      })),
    };
  }

  async registerController(registerControllerDto: RegisterControllerDto) {
    await this.getIntersectionEntity(registerControllerDto.intersectionId);

    if (registerControllerDto.isPrimary) {
      await this.reassignPrimaryController(
        registerControllerDto.intersectionId,
        null,
      );
    }

    const controller = await this.controllerRepository.save(
      this.controllerRepository.create({
        code: registerControllerDto.code,
        firmwareVersion: registerControllerDto.firmwareVersion,
        controllerType:
          registerControllerDto.controllerType ?? ControllerType.ATC,
        runtimeVersion: registerControllerDto.runtimeVersion ?? '1.0.0',
        supportedPackageSchemaVersion:
          registerControllerDto.supportedPackageSchemaVersion ??
          CONTROLLER_RUNTIME_PACKAGE_SCHEMA_VERSION,
        connectionState:
          registerControllerDto.connectionState ??
          ControllerConnectionState.OFFLINE,
        operatingEnvironment: registerControllerDto.operatingEnvironment,
        batteryBacked: registerControllerDto.batteryBacked ?? true,
        uptimeHours: registerControllerDto.uptimeHours ?? 0,
        detectorCapacity: registerControllerDto.detectorCapacity ?? 32,
        signalGroupCapacity: registerControllerDto.signalGroupCapacity ?? 16,
        isPrimary: registerControllerDto.isPrimary ?? false,
        lastSeen: null,
        lastDeployedPackageVersion: null,
        lastDeploymentState: ControllerDeploymentState.IDLE,
        lastDeploymentAt: null,
        lastTelemetryAt: null,
        telemetrySummary: {},
        lastKnownIpAddress: null,
        intersectionId: registerControllerDto.intersectionId,
      }),
    );

    return this.getController(controller.id);
  }

  async updateController(
    controllerId: string,
    updateControllerDto: UpdateManagedControllerDto,
  ) {
    const controller = await this.getControllerEntity(controllerId);
    const nextIntersectionId =
      updateControllerDto.intersectionId ?? controller.intersectionId;

    await this.getIntersectionEntity(nextIntersectionId);

    if (updateControllerDto.isPrimary) {
      await this.reassignPrimaryController(nextIntersectionId, controllerId);
    }

    await this.controllerRepository.save({
      ...controller,
      ...updateControllerDto,
      intersectionId: nextIntersectionId,
    });

    return this.getController(controllerId);
  }

  // Hard-delete a controller. FK cascade behaviour (defined on the
  // entity @ManyToOne relations) takes care of the dependents:
  //   credentials, controller_events     → ON DELETE CASCADE (auto-removed)
  //   detectors, alarms, events,
  //   deployments, engineering docs,
  //   programme packages, traffic graph  → ON DELETE SET NULL
  // So we don't need to walk those tables manually.
  async deleteController(controllerId: string): Promise<void> {
    const controller = await this.getControllerEntity(controllerId);
    await this.controllerRepository.remove(controller);
  }

  async issueCredential(
    controllerId: string,
    issueCredentialDto: IssueControllerCredentialDto,
  ) {
    await this.getControllerEntity(controllerId);

    const clientId = `ctrl_${randomBytes(10).toString('hex')}`;
    const clientSecret = randomBytes(24).toString('base64url');
    const expiresAt = issueCredentialDto.expiresInDays
      ? new Date(
          Date.now() + issueCredentialDto.expiresInDays * 24 * 60 * 60 * 1000,
        )
      : null;

    const credential = await this.controllerCredentialRepository.save(
      this.controllerCredentialRepository.create({
        clientId,
        secretHash: await bcrypt.hash(
          clientSecret,
          this.config.bcryptSaltRounds,
        ),
        label: issueCredentialDto.label,
        issuedAt: new Date(),
        expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        controllerId,
      }),
    );

    return {
      credentialId: credential.id,
      clientId,
      clientSecret,
      label: credential.label,
      issuedAt: credential.issuedAt.toISOString(),
      expiresAt: credential.expiresAt?.toISOString() ?? null,
    };
  }

  async bootstrapController(
    bootstrapDto: ControllerBootstrapDto,
    requestContext: ControllerRequestContext,
  ) {
    const credential = await this.controllerCredentialRepository.findOne({
      where: { clientId: bootstrapDto.clientId },
      relations: {
        controller: {
          intersection: true,
        },
      },
    });

    if (!credential || credential.revokedAt) {
      throw new UnauthorizedException('Controller credential is invalid.');
    }

    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Controller credential expired.');
    }

    if (
      bootstrapDto.controllerCode &&
      credential.controller.code !== bootstrapDto.controllerCode
    ) {
      throw new UnauthorizedException('Controller credential mismatch.');
    }

    const secretMatches = await bcrypt.compare(
      bootstrapDto.clientSecret,
      credential.secretHash,
    );

    if (!secretMatches) {
      throw new UnauthorizedException('Controller credential is invalid.');
    }

    credential.lastUsedAt = new Date();
    await this.controllerCredentialRepository.save(credential);

    credential.controller.lastSeen = new Date();
    credential.controller.connectionState = ControllerConnectionState.ONLINE;
    credential.controller.lastKnownIpAddress = requestContext.ipAddress ?? null;
    await this.controllerRepository.save(credential.controller);

    const accessPayload: AuthenticatedController = {
      sub: credential.controller.id,
      controllerCode: credential.controller.code,
      clientId: credential.clientId,
      operatingEnvironment: credential.controller.operatingEnvironment,
      intersectionId: credential.controller.intersectionId,
      type: 'controller',
    };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.config.controllerAccessTokenSecret,
      expiresIn: asTokenExpiry(this.config.controllerAccessTokenTtl),
      issuer: `${this.config.jwtIssuer}:controller`,
    });
    const latestDeployment = await this.findLatestDeploymentForController(
      credential.controller,
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: parseTtlSeconds(this.config.controllerAccessTokenTtl),
      controller: this.serializeController(credential.controller),
      latestDeployment: latestDeployment
        ? this.serializeDeploymentSummary(latestDeployment)
        : null,
    };
  }

  async fetchLatestPackage(authenticatedController: AuthenticatedController) {
    const controller = await this.loadAuthenticatedController(
      authenticatedController,
    );
    const deployment = await this.findLatestDeploymentForController(controller);

    return {
      controller: this.serializeController(controller),
      deployment: deployment
        ? this.serializeDeploymentSummary(deployment)
        : null,
      package: deployment?.payload ?? null,
    };
  }

  async acknowledgeDeployment(
    authenticatedController: AuthenticatedController,
    deploymentId: string,
    acknowledgeDto: ControllerAcknowledgeDeploymentDto,
  ) {
    const controller = await this.loadAuthenticatedController(
      authenticatedController,
    );
    const deployment = await this.getControllerDeploymentEntity(
      controller,
      deploymentId,
    );

    if (
      acknowledgeDto.packageVersion !== deployment.packageVersion ||
      acknowledgeDto.packageDigest !== deployment.packageDigest ||
      !acknowledgeDto.signatureVerified ||
      acknowledgeDto.state === 'rejected'
    ) {
      const rejectionReason =
        acknowledgeDto.rejectionReason ??
        this.resolvePackageRejectionReason(deployment, acknowledgeDto);
      await this.recordPackageRejection(
        controller,
        deployment,
        rejectionReason,
        {
          reportedPackageVersion: acknowledgeDto.packageVersion,
          reportedPackageDigest: acknowledgeDto.packageDigest,
          signatureVerified: acknowledgeDto.signatureVerified,
        },
      );

      return {
        acknowledged: false,
        state: ControllerDeploymentState.REJECTED,
        reason: rejectionReason,
      };
    }

    const acknowledgedAt = new Date();
    controller.lastSeen = acknowledgedAt;
    controller.connectionState = ControllerConnectionState.ONLINE;
    controller.lastDeploymentState = mapAckStateToDeploymentState(
      acknowledgeDto.state,
    );
    controller.lastDeployedPackageVersion = deployment.packageVersion;
    controller.lastDeploymentAt = acknowledgedAt;
    controller.runtimeVersion =
      acknowledgeDto.runtimeVersion ?? controller.runtimeVersion;
    await this.controllerRepository.save(controller);

    deployment.acknowledgedAt = acknowledgedAt;
    deployment.acknowledgedByControllerId = controller.id;
    deployment.controllerReportedPackageDigest = acknowledgeDto.packageDigest;
    await this.deploymentRepository.save(deployment);

    await this.createRuntimeEvent({
      controllerId: controller.id,
      deploymentId: deployment.id,
      eventType: ControllerEventType.DEPLOYMENT_ACK,
      severity: AlarmSeverity.INFO,
      summary: `Deployment ${deployment.packageVersion} ${acknowledgeDto.state}.`,
      payload: {
        packageVersion: deployment.packageVersion,
        packageDigest: acknowledgeDto.packageDigest,
        state: acknowledgeDto.state,
      },
    });

    return {
      acknowledged: true,
      state: controller.lastDeploymentState,
      deploymentId: deployment.id,
      packageVersion: deployment.packageVersion,
    };
  }

  async recordHeartbeat(
    authenticatedController: AuthenticatedController,
    heartbeatDto: ControllerHeartbeatDto,
    requestContext: ControllerRequestContext,
  ) {
    const controller = await this.loadAuthenticatedController(
      authenticatedController,
    );
    const now = new Date();

    controller.lastSeen = now;
    controller.connectionState = ControllerConnectionState.ONLINE;
    controller.runtimeVersion =
      heartbeatDto.runtimeVersion ?? controller.runtimeVersion;
    controller.firmwareVersion =
      heartbeatDto.softwareVersion ?? controller.firmwareVersion;
    controller.lastKnownIpAddress = requestContext.ipAddress ?? null;
    controller.uptimeHours = heartbeatDto.uptimeHours ?? controller.uptimeHours;
    if (heartbeatDto.packageVersion) {
      controller.lastDeployedPackageVersion = heartbeatDto.packageVersion;
    }
    if (heartbeatDto.telemetrySummary) {
      controller.telemetrySummary = heartbeatDto.telemetrySummary;
      controller.lastTelemetryAt = now;
    }

    await this.controllerRepository.save(controller);
    await this.createRuntimeEvent({
      controllerId: controller.id,
      deploymentId: null,
      eventType: ControllerEventType.HEARTBEAT,
      severity: AlarmSeverity.INFO,
      summary: `Heartbeat received from ${controller.code}.`,
      payload: {
        runtimeVersion: controller.runtimeVersion,
        firmwareVersion: controller.firmwareVersion,
        uptimeHours: controller.uptimeHours,
        packageVersion: controller.lastDeployedPackageVersion,
      },
    });

    return {
      accepted: true,
      receivedAt: now.toISOString(),
      controllerState: this.serializeController(controller),
    };
  }

  async uploadTelemetry(
    authenticatedController: AuthenticatedController,
    telemetryDto: ControllerTelemetryUploadDto,
  ) {
    const controller = await this.loadAuthenticatedController(
      authenticatedController,
    );
    const occurredAt = new Date();

    controller.lastSeen = occurredAt;
    controller.lastTelemetryAt = occurredAt;
    controller.connectionState = ControllerConnectionState.ONLINE;
    controller.telemetrySummary = {
      summary: telemetryDto.summary,
      ...(telemetryDto.payload ?? {}),
    };
    await this.controllerRepository.save(controller);

    await this.createRuntimeEvent({
      controllerId: controller.id,
      deploymentId: null,
      eventType: ControllerEventType.TELEMETRY,
      severity: telemetryDto.severity ?? AlarmSeverity.INFO,
      summary: telemetryDto.summary,
      payload: telemetryDto.payload ?? {},
    });

    return {
      accepted: true,
      receivedAt: occurredAt.toISOString(),
    };
  }

  async uploadAlarm(
    authenticatedController: AuthenticatedController,
    alarmDto: ControllerAlarmUploadDto,
  ) {
    const controller = await this.loadAuthenticatedController(
      authenticatedController,
    );
    const triggeredAt = alarmDto.triggeredAt
      ? new Date(alarmDto.triggeredAt)
      : new Date();

    controller.lastSeen = triggeredAt;
    controller.connectionState = ControllerConnectionState.DEGRADED;
    await this.controllerRepository.save(controller);

    const alarm = await this.alarmRepository.save(
      this.alarmRepository.create({
        severity: alarmDto.severity,
        status: AlarmStatus.OPEN,
        operatingEnvironment: controller.operatingEnvironment,
        title: alarmDto.title,
        detail: alarmDto.detail,
        triggeredAt,
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        intersectionId: controller.intersectionId,
        controllerId: controller.id,
      }),
    );

    await this.createRuntimeEvent({
      controllerId: controller.id,
      deploymentId: null,
      eventType: ControllerEventType.RUNTIME_FAULT,
      severity: alarm.severity,
      summary: alarm.title,
      payload: {
        alarmId: alarm.id,
        detail: alarm.detail,
      },
    });

    return {
      accepted: true,
      alarmId: alarm.id,
    };
  }

  async markDeploymentPublished(deployment: DeploymentEntity) {
    const controller = await this.resolveControllerForDeployment(deployment);

    if (!controller) {
      return null;
    }

    controller.lastDeploymentState = ControllerDeploymentState.PUBLISHED;
    controller.lastDeployedPackageVersion = deployment.packageVersion;
    controller.lastDeploymentAt = deployment.publishedAt ?? new Date();
    await this.controllerRepository.save(controller);
    return controller;
  }

  validateDeploymentCompatibility(input: {
    deployment: DeploymentEntity;
    context: DeploymentConfigurationContext;
  }): DeploymentCompatibilityResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const candidateControllers = input.context.controllers.filter(
      (controller) =>
        input.deployment.controllerId
          ? controller.id === input.deployment.controllerId
          : controller.operatingEnvironment ===
            input.deployment.targetEnvironment,
    );
    const envControllers = input.context.controllers.filter(
      (controller) =>
        controller.operatingEnvironment === input.deployment.targetEnvironment,
    );

    if (envControllers.length === 0) {
      errors.push({
        code: 'controller.compatibility.missing-environment-controller',
        message: `No controller is registered for ${input.deployment.targetEnvironment}.`,
      });
    }

    if (input.deployment.controllerId && candidateControllers.length === 0) {
      errors.push({
        code: 'controller.compatibility.missing-target',
        message:
          'The selected controller is not part of the deployment intersection.',
      });
    }

    if (!input.deployment.controllerId && candidateControllers.length > 1) {
      errors.push({
        code: 'controller.compatibility.ambiguous-target',
        message:
          'A controller-specific deployment target is required when multiple compatible controllers exist.',
      });
    }

    const targetController =
      candidateControllers.length === 1 ? candidateControllers[0] : null;

    if (!targetController) {
      return {
        valid: errors.length === 0,
        targetController,
        candidateControllers,
        errors,
        warnings,
      };
    }

    if (
      targetController.operatingEnvironment !==
      input.deployment.targetEnvironment
    ) {
      errors.push({
        code: 'controller.compatibility.environment-mismatch',
        message: `${targetController.code} is configured for ${targetController.operatingEnvironment}, not ${input.deployment.targetEnvironment}.`,
      });
    }

    if (
      input.deployment.compatibleControllerTypes.length > 0 &&
      !input.deployment.compatibleControllerTypes.includes(
        targetController.controllerType,
      )
    ) {
      errors.push({
        code: 'controller.compatibility.type-mismatch',
        message: `${targetController.code} type ${targetController.controllerType} is not allowed for this package.`,
      });
    }

    const requiredRuntimeVersion =
      input.deployment.requiredRuntimeVersion ??
      readRuntimeVersionRequirement(input.context.timingPlan);

    if (
      requiredRuntimeVersion &&
      compareVersionLike(
        targetController.runtimeVersion,
        requiredRuntimeVersion,
      ) < 0
    ) {
      errors.push({
        code: 'controller.compatibility.runtime-version',
        message: `${targetController.code} runtime ${targetController.runtimeVersion} does not satisfy ${requiredRuntimeVersion}.`,
      });
    }

    if (
      targetController.supportedPackageSchemaVersion <
      input.deployment.runtimeContractSchemaVersion
    ) {
      errors.push({
        code: 'controller.compatibility.package-schema-version',
        message: `${targetController.code} supports runtime schema ${targetController.supportedPackageSchemaVersion} and cannot consume schema ${input.deployment.runtimeContractSchemaVersion}.`,
      });
    }

    if (input.context.detectors.length > targetController.detectorCapacity) {
      errors.push({
        code: 'controller.compatibility.detector-capacity',
        message: `${targetController.code} supports ${targetController.detectorCapacity} detectors, but ${input.context.detectors.length} are configured.`,
      });
    }

    if (input.context.phases.length > targetController.signalGroupCapacity) {
      errors.push({
        code: 'controller.compatibility.signal-group-capacity',
        message: `${targetController.code} supports ${targetController.signalGroupCapacity} signal groups, but ${input.context.phases.length} are configured.`,
      });
    }

    if (targetController.connectionState !== ControllerConnectionState.ONLINE) {
      warnings.push({
        code: 'controller.compatibility.connection-state',
        message: `${targetController.code} is currently ${targetController.connectionState}.`,
      });
    }

    return {
      valid: errors.length === 0,
      targetController,
      candidateControllers,
      errors,
      warnings,
    };
  }

  mergeCompatibilityIntoValidationReport(
    validationReport: ValidationReport,
    compatibility: DeploymentCompatibilityResult,
  ): ValidationReport {
    const mergedErrors = [...validationReport.errors, ...compatibility.errors];
    const mergedWarnings = [
      ...validationReport.warnings,
      ...compatibility.warnings,
    ];

    return {
      ...validationReport,
      valid: mergedErrors.length === 0,
      errors: mergedErrors,
      warnings: mergedWarnings,
      summary:
        mergedErrors.length === 0
          ? validationReport.summary
          : `Compatibility validation blocked deployment: ${mergedErrors[0]?.message ?? validationReport.summary}`,
    };
  }

  private async resolveControllerForDeployment(deployment: DeploymentEntity) {
    if (deployment.controllerId) {
      return this.controllerRepository.findOne({
        where: { id: deployment.controllerId },
      });
    }

    if (!deployment.intersectionId) {
      return null;
    }

    const controllers = await this.controllerRepository.find({
      where: {
        intersectionId: deployment.intersectionId,
        operatingEnvironment: deployment.targetEnvironment,
      },
    });

    return controllers.length === 1 ? controllers[0] : null;
  }

  private async loadAuthenticatedController(
    authenticatedController: AuthenticatedController,
  ) {
    const controller = await this.controllerRepository.findOne({
      where: { id: authenticatedController.sub },
      relations: {
        intersection: true,
      },
    });

    if (!controller) {
      throw new UnauthorizedException('Controller identity is invalid.');
    }

    return controller;
  }

  private async findLatestDeploymentForController(
    controller: ControllerEntity,
  ) {
    return this.deploymentRepository.findOne({
      where: [
        {
          controllerId: controller.id,
          targetEnvironment: controller.operatingEnvironment,
          status: In([DeploymentStatus.PUBLISHED, DeploymentStatus.COMPLETED]),
          isSigned: true,
          intersectionId: controller.intersectionId,
        },
        {
          controllerId: IsNull(),
          targetEnvironment: controller.operatingEnvironment,
          status: In([DeploymentStatus.PUBLISHED, DeploymentStatus.COMPLETED]),
          isSigned: true,
          intersectionId: controller.intersectionId,
        },
      ],
      order: {
        publishedAt: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  private async getControllerDeploymentEntity(
    controller: ControllerEntity,
    deploymentId: string,
  ) {
    const deployment = await this.deploymentRepository.findOne({
      where: {
        id: deploymentId,
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found.');
    }

    const targetsController =
      deployment.controllerId === controller.id ||
      (deployment.controllerId === null &&
        deployment.intersectionId === controller.intersectionId &&
        deployment.targetEnvironment === controller.operatingEnvironment);

    if (!targetsController) {
      throw new BadRequestException(
        'Deployment does not target this controller.',
      );
    }

    return deployment;
  }

  private resolvePackageRejectionReason(
    deployment: DeploymentEntity,
    acknowledgeDto: ControllerAcknowledgeDeploymentDto,
  ) {
    if (!acknowledgeDto.signatureVerified) {
      return 'Package signature verification failed on controller.';
    }

    if (acknowledgeDto.packageDigest !== deployment.packageDigest) {
      return 'Package digest reported by controller does not match published digest.';
    }

    if (acknowledgeDto.packageVersion !== deployment.packageVersion) {
      return 'Package version reported by controller does not match published version.';
    }

    return 'Controller rejected the deployment package.';
  }

  private async recordPackageRejection(
    controller: ControllerEntity,
    deployment: DeploymentEntity,
    reason: string,
    payload: Record<string, unknown>,
  ) {
    controller.lastSeen = new Date();
    controller.connectionState = ControllerConnectionState.DEGRADED;
    controller.lastDeploymentState = ControllerDeploymentState.REJECTED;
    await this.controllerRepository.save(controller);

    deployment.controllerReportedPackageDigest =
      typeof payload.reportedPackageDigest === 'string'
        ? payload.reportedPackageDigest
        : null;
    await this.deploymentRepository.save(deployment);

    await this.createRuntimeEvent({
      controllerId: controller.id,
      deploymentId: deployment.id,
      eventType: ControllerEventType.PACKAGE_REJECTION,
      severity: AlarmSeverity.WARNING,
      summary: reason,
      payload,
    });
  }

  private async refreshControllerConnectionStates() {
    const controllers = await this.controllerRepository.find();
    const staleBefore =
      Date.now() - this.config.controllerHeartbeatTimeoutSeconds * 1000;

    for (const controller of controllers) {
      if (!controller.lastSeen) {
        continue;
      }

      const shouldBeOffline = controller.lastSeen.getTime() < staleBefore;

      if (
        shouldBeOffline &&
        controller.connectionState !== ControllerConnectionState.OFFLINE
      ) {
        controller.connectionState = ControllerConnectionState.OFFLINE;
        await this.controllerRepository.save(controller);
        await this.createRuntimeEvent({
          controllerId: controller.id,
          deploymentId: null,
          eventType: ControllerEventType.COMMUNICATION_LOSS,
          severity: AlarmSeverity.WARNING,
          summary: `Communication lost with ${controller.code}.`,
          payload: {
            lastSeen: controller.lastSeen.toISOString(),
          },
        });
      }
    }
  }

  private async createRuntimeEvent(input: {
    controllerId: string;
    deploymentId: string | null;
    eventType: ControllerEventType;
    severity: AlarmSeverity;
    summary: string;
    payload: Record<string, unknown>;
  }) {
    await this.controllerEventRepository.save(
      this.controllerEventRepository.create({
        controllerId: input.controllerId,
        deploymentId: input.deploymentId,
        eventType: input.eventType,
        severity: input.severity,
        summary: input.summary,
        payload: input.payload,
        occurredAt: new Date(),
      }),
    );
  }

  private serializeController(controller: ControllerEntity) {
    return {
      id: controller.id,
      code: controller.code,
      firmwareVersion: controller.firmwareVersion,
      controllerType: controller.controllerType,
      runtimeVersion: controller.runtimeVersion,
      supportedPackageSchemaVersion: controller.supportedPackageSchemaVersion,
      connectionState: controller.connectionState,
      operatingEnvironment: controller.operatingEnvironment,
      batteryBacked: controller.batteryBacked,
      uptimeHours: controller.uptimeHours,
      detectorCapacity: controller.detectorCapacity,
      signalGroupCapacity: controller.signalGroupCapacity,
      isPrimary: controller.isPrimary,
      lastSeen: controller.lastSeen?.toISOString() ?? null,
      lastDeployedPackageVersion: controller.lastDeployedPackageVersion,
      lastDeploymentState: controller.lastDeploymentState,
      lastDeploymentAt: controller.lastDeploymentAt?.toISOString() ?? null,
      lastTelemetryAt: controller.lastTelemetryAt?.toISOString() ?? null,
      telemetrySummary: controller.telemetrySummary,
      lastKnownIpAddress: controller.lastKnownIpAddress,
      intersectionId: controller.intersectionId,
      intersection: controller.intersection
        ? {
            id: controller.intersection.id,
            code: controller.intersection.code,
            name: controller.intersection.name,
          }
        : null,
    };
  }

  private serializeDeploymentSummary(deployment: DeploymentEntity) {
    return {
      id: deployment.id,
      packageVersion: deployment.packageVersion,
      status: deployment.status,
      targetEnvironment: deployment.targetEnvironment,
      operatingMode: deployment.operatingMode,
      publishedAt: deployment.publishedAt?.toISOString() ?? null,
      packageDigest: deployment.packageDigest,
      runtimeContractSchemaVersion: deployment.runtimeContractSchemaVersion,
    };
  }

  private async getControllerEntity(controllerId: string) {
    const controller = await this.controllerRepository.findOne({
      where: { id: controllerId },
    });

    if (!controller) {
      throw new NotFoundException('Controller not found.');
    }

    return controller;
  }

  private async getIntersectionEntity(intersectionId: string) {
    const intersection = await this.intersectionRepository.findOne({
      where: { id: intersectionId },
    });

    if (!intersection) {
      throw new NotFoundException('Intersection not found.');
    }

    return intersection;
  }

  private async reassignPrimaryController(
    intersectionId: string,
    preservedControllerId: string | null,
  ) {
    const controllers = await this.controllerRepository.find({
      where: { intersectionId },
    });

    for (const controller of controllers) {
      if (controller.id === preservedControllerId) {
        continue;
      }

      if (controller.isPrimary) {
        controller.isPrimary = false;
        await this.controllerRepository.save(controller);
      }
    }
  }
}

function readRuntimeVersionRequirement(timingPlan: TimingPlanEntity) {
  const scheduleConfig = timingPlan.scheduleConfig;
  const requiredRuntimeVersion = scheduleConfig.requiredRuntimeVersion;

  return typeof requiredRuntimeVersion === 'string' &&
    requiredRuntimeVersion.length > 0
    ? requiredRuntimeVersion
    : null;
}

function compareVersionLike(leftValue: string, rightValue: string) {
  const leftParts = normalizeVersionParts(leftValue);
  const rightParts = normalizeVersionParts(rightValue);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function normalizeVersionParts(value: string) {
  const matches = value.match(/\d+/g);

  return matches?.map((entry) => Number(entry)) ?? [0];
}

function asTokenExpiry(duration: string) {
  return duration as `${number}${'s' | 'm' | 'h' | 'd'}`;
}

function parseTtlSeconds(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  switch (match[2]) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 0;
  }
}

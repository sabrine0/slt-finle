import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import appConfig from '../config/app.config';
import {
  permissionCatalog,
  roleCatalog,
} from '../access-control/permissions.constants';
import {
  AlarmEntity,
  ControllerEntity,
  ControllerDeploymentState,
  DeploymentEntity,
  DeploymentStatus,
  DetectorEntity,
  EventEntity,
  IntersectionEntity,
  IntersectionControlMode,
  PermissionEntity,
  PhaseType,
  PhaseEntity,
  OperatingEnvironment,
  RoleEntity,
  ScenarioEntity,
  TimingPlanEntity,
  UserEntity,
} from './entities';
import {
  alarmSeedData,
  controllerSeedData,
  defaultUsers,
  deploymentSeedData,
  detectorSeedData,
  eventSeedData,
  intersectionSeedData,
  phaseTemplates,
  scenarioSeedData,
  timingPlanSeedData,
} from './seed-data';

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);
  private initialized = false;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepository: Repository<ScenarioEntity>,
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
    @InjectRepository(AlarmEntity)
    private readonly alarmRepository: Repository<AlarmEntity>,
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    @InjectRepository(DeploymentEntity)
    private readonly deploymentRepository: Repository<DeploymentEntity>,
  ) {}

  async onApplicationBootstrap() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    await this.seedPermissionsAndRoles();
    await this.seedUsers();
    await this.seedTrafficDomain();
    this.logger.log('Database seed completed.');
  }

  private async seedPermissionsAndRoles() {
    for (const permissionDefinition of permissionCatalog) {
      const existingPermission = await this.permissionRepository.findOne({
        where: { code: permissionDefinition.code },
      });

      if (existingPermission) {
        existingPermission.description = permissionDefinition.description;
        await this.permissionRepository.save(existingPermission);
        continue;
      }

      await this.permissionRepository.save(
        this.permissionRepository.create(permissionDefinition),
      );
    }

    const permissions = await this.permissionRepository.find();
    const permissionsByCode = new Map(
      permissions.map((permission) => [permission.code, permission]),
    );

    for (const roleDefinition of roleCatalog) {
      const permissionEntities = roleDefinition.permissions
        .map((permissionCode) => permissionsByCode.get(permissionCode))
        .filter((permission): permission is PermissionEntity =>
          Boolean(permission),
        );
      const existingRole = await this.roleRepository.findOne({
        where: { name: roleDefinition.name },
        relations: { permissions: true },
      });

      if (existingRole) {
        existingRole.displayName = roleDefinition.displayName;
        existingRole.description = roleDefinition.description;
        existingRole.permissions = permissionEntities;
        await this.roleRepository.save(existingRole);
        continue;
      }

      await this.roleRepository.save(
        this.roleRepository.create({
          name: roleDefinition.name,
          displayName: roleDefinition.displayName,
          description: roleDefinition.description,
          permissions: permissionEntities,
        }),
      );
    }
  }

  private async seedUsers() {
    if (!this.config.seedDefaultUsers) {
      return;
    }

    const passwordHash = await bcrypt.hash(
      this.config.seedDefaultPassword,
      this.config.bcryptSaltRounds,
    );
    const roles = await this.roleRepository.find({
      relations: { permissions: true },
    });
    const rolesByName = new Map(roles.map((role) => [role.name, role]));

    for (const userDefinition of defaultUsers) {
      const roleEntities = userDefinition.roles
        .map((roleName) => rolesByName.get(roleName))
        .filter((role): role is RoleEntity => Boolean(role));
      const existingUser = await this.userRepository.findOne({
        where: { email: userDefinition.email },
        relations: { roles: true },
      });

      if (existingUser) {
        existingUser.fullName = userDefinition.fullName;
        existingUser.roles = roleEntities;
        existingUser.isActive = true;
        if (!existingUser.passwordHash) {
          existingUser.passwordHash = passwordHash;
        }
        await this.userRepository.save(existingUser);
        continue;
      }

      await this.userRepository.save(
        this.userRepository.create({
          email: userDefinition.email,
          fullName: userDefinition.fullName,
          roles: roleEntities,
          passwordHash,
          isActive: true,
          mfaEnabled: false,
          lastLoginAt: null,
          passwordChangedAt: null,
        }),
      );
    }
  }

  private async seedTrafficDomain() {
    await this.seedScenarios();
    await this.seedIntersectionsAndControllers();
    await this.seedDetectorsAndPhases();
    await this.seedTimingPlans();
    await this.seedAlarmsAndEvents();
    await this.seedDeployments();
  }

  private async seedScenarios() {
    await this.scenarioRepository
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .execute();

    for (const scenarioDefinition of scenarioSeedData) {
      const existingScenario = await this.scenarioRepository.findOne({
        where: { code: scenarioDefinition.code },
      });

      if (existingScenario) {
        await this.scenarioRepository.save({
          ...existingScenario,
          ...scenarioDefinition,
        });
        continue;
      }

      await this.scenarioRepository.save(
        this.scenarioRepository.create(scenarioDefinition),
      );
    }
  }

  private async seedIntersectionsAndControllers() {
    for (const intersectionDefinition of intersectionSeedData) {
      const existingIntersection = await this.intersectionRepository.findOne({
        where: { code: intersectionDefinition.code },
      });

      if (existingIntersection) {
        await this.intersectionRepository.save({
          ...existingIntersection,
          ...intersectionDefinition,
          lastHeartbeat: existingIntersection.lastHeartbeat ?? new Date(),
        });
        continue;
      }

      await this.intersectionRepository.save(
        this.intersectionRepository.create({
          ...intersectionDefinition,
          lastHeartbeat: new Date(),
        }),
      );
    }

    const intersections = await this.intersectionRepository.find();
    const intersectionsByCode = new Map(
      intersections.map((intersection) => [intersection.code, intersection]),
    );

    // SEED_CONTROLLERS=false skips controller seeding entirely. Used
    // when you want a fresh DB without the catalogue's default 7
    // controllers (the rest of the seed handles missing FKs via NULL).
    if (process.env.SEED_CONTROLLERS === 'false') {
      return;
    }

    for (const controllerDefinition of controllerSeedData) {
      const intersection = intersectionsByCode.get(
        controllerDefinition.intersectionCode,
      );

      if (!intersection) {
        continue;
      }

      const existingController = await this.controllerRepository.findOne({
        where: { code: controllerDefinition.code },
      });
      const payload = {
        code: controllerDefinition.code,
        firmwareVersion: controllerDefinition.firmwareVersion,
        controllerType: controllerDefinition.controllerType,
        runtimeVersion: controllerDefinition.runtimeVersion,
        supportedPackageSchemaVersion: 1,
        connectionState: controllerDefinition.connectionState,
        operatingEnvironment: controllerDefinition.operatingEnvironment,
        batteryBacked: controllerDefinition.batteryBacked,
        uptimeHours: controllerDefinition.uptimeHours,
        detectorCapacity: controllerDefinition.detectorCapacity,
        signalGroupCapacity: controllerDefinition.signalGroupCapacity,
        intersectionId: intersection.id,
        isPrimary: true,
        lastSeen: new Date(),
        lastDeployedPackageVersion: null,
        lastDeploymentState: ControllerDeploymentState.IDLE,
        lastDeploymentAt: null,
        lastTelemetryAt: null,
        telemetrySummary: {},
        lastKnownIpAddress: null,
      };

      if (existingController) {
        await this.controllerRepository.save({
          ...existingController,
          ...payload,
        });
        continue;
      }

      await this.controllerRepository.save(
        this.controllerRepository.create(payload),
      );
    }
  }

  private async seedDetectorsAndPhases() {
    const intersections = await this.intersectionRepository.find();
    const intersectionsByCode = new Map(
      intersections.map((intersection) => [intersection.code, intersection]),
    );
    const controllers = await this.controllerRepository.find();
    const controllersByCode = new Map(
      controllers.map((controller) => [controller.code, controller]),
    );

    for (const detectorDefinition of detectorSeedData) {
      const intersection = intersectionsByCode.get(
        detectorDefinition.intersectionCode,
      );

      if (!intersection) {
        continue;
      }

      const existingDetector = await this.detectorRepository.findOne({
        where: { code: detectorDefinition.code },
      });
      const payload = {
        code: detectorDefinition.code,
        name: detectorDefinition.name,
        type: detectorDefinition.type,
        laneReference: detectorDefinition.laneReference,
        isActive: true,
        lastTriggeredAt: null,
        assignedPhaseSequenceNumbers:
          detectorDefinition.assignedPhaseSequenceNumbers
            ? [...detectorDefinition.assignedPhaseSequenceNumbers]
            : [],
        intersectionId: intersection.id,
        controllerId:
          controllersByCode.get(detectorDefinition.controllerCode)?.id ?? null,
      };

      if (existingDetector) {
        await this.detectorRepository.save({
          ...existingDetector,
          ...payload,
        });
        continue;
      }

      await this.detectorRepository.save(
        this.detectorRepository.create(payload),
      );
    }

    for (const intersection of intersections) {
      const existingPhaseCount = await this.phaseRepository.count({
        where: { intersectionId: intersection.id },
      });

      if (existingPhaseCount > 0) {
        continue;
      }

      await this.phaseRepository.save(
        phaseTemplates.map((phaseDefinition) =>
          this.phaseRepository.create({
            ...phaseDefinition,
            approach: inferPhaseApproach(phaseDefinition.sequenceNumber),
            phaseType:
              phaseDefinition.movementGroup === 'pedestrian'
                ? PhaseType.PEDESTRIAN
                : PhaseType.VEHICLE,
            clearanceGroup: `cg-${phaseDefinition.sequenceNumber}`,
            allowedConcurrentPhaseSequenceNumbers: [],
            conflictingPhaseSequenceNumbers: phaseTemplates
              .filter(
                (candidatePhase) =>
                  candidatePhase.sequenceNumber !==
                  phaseDefinition.sequenceNumber,
              )
              .map((candidatePhase) => candidatePhase.sequenceNumber),
            intersectionId: intersection.id,
          }),
        ),
      );
    }
  }

  private async seedTimingPlans() {
    const intersections = await this.intersectionRepository.find();
    const intersectionsByCode = new Map(
      intersections.map((intersection) => [intersection.code, intersection]),
    );
    const scenarios = await this.scenarioRepository.find();
    const scenariosByCode = new Map(
      scenarios.map((scenario) => [scenario.code, scenario]),
    );

    for (const timingPlanDefinition of timingPlanSeedData) {
      const intersection = intersectionsByCode.get(
        timingPlanDefinition.intersectionCode,
      );
      const scenario = scenariosByCode.get(timingPlanDefinition.scenarioCode);

      if (!intersection) {
        continue;
      }

      const existingPlan = await this.timingPlanRepository.findOne({
        where: { code: timingPlanDefinition.code },
      });
      const payload = {
        code: timingPlanDefinition.code,
        name: timingPlanDefinition.name,
        status: timingPlanDefinition.status,
        cycleLengthSeconds: timingPlanDefinition.cycleLengthSeconds,
        offsetSeconds: timingPlanDefinition.offsetSeconds,
        simulationOnly: timingPlanDefinition.simulationOnly,
        scheduleConfig: {
          timezone: 'Africa/Casablanca',
          profile: timingPlanDefinition.status,
        },
        planData: buildDefaultStagePlan(
          timingPlanDefinition.cycleLengthSeconds,
        ),
        intersectionId: intersection.id,
        scenarioId: scenario?.id ?? null,
      };

      if (existingPlan) {
        await this.timingPlanRepository.save({
          ...existingPlan,
          ...payload,
        });
        continue;
      }

      await this.timingPlanRepository.save(
        this.timingPlanRepository.create(payload),
      );
    }
  }

  private async seedAlarmsAndEvents() {
    if ((await this.alarmRepository.count()) === 0) {
      const intersections = await this.intersectionRepository.find();
      const intersectionsByCode = new Map(
        intersections.map((intersection) => [intersection.code, intersection]),
      );
      const controllers = await this.controllerRepository.find();
      const controllersByCode = new Map(
        controllers.map((controller) => [controller.code, controller]),
      );

      await this.alarmRepository.save(
        alarmSeedData
          .map((alarmDefinition) => {
            const intersection = intersectionsByCode.get(
              alarmDefinition.intersectionCode,
            );

            if (!intersection) {
              return null;
            }

            return this.alarmRepository.create({
              severity: alarmDefinition.severity,
              status: alarmDefinition.status,
              operatingEnvironment: alarmDefinition.operatingEnvironment,
              title: alarmDefinition.title,
              detail: alarmDefinition.detail,
              triggeredAt: new Date(),
              acknowledgedAt: null,
              acknowledgedByUserId: null,
              intersectionId: intersection.id,
              controllerId:
                controllersByCode.get(alarmDefinition.controllerCode)?.id ??
                null,
            });
          })
          .filter((alarm): alarm is AlarmEntity => Boolean(alarm)),
      );
    }

    if ((await this.eventRepository.count()) === 0) {
      const intersections = await this.intersectionRepository.find();
      const intersectionsByCode = new Map(
        intersections.map((intersection) => [intersection.code, intersection]),
      );
      const controllers = await this.controllerRepository.find();
      const controllersByCode = new Map(
        controllers.map((controller) => [controller.code, controller]),
      );
      const scenarios = await this.scenarioRepository.find();
      const scenariosByCode = new Map(
        scenarios.map((scenario) => [scenario.code, scenario]),
      );

      await this.eventRepository.save(
        eventSeedData.map((eventDefinition) =>
          this.eventRepository.create({
            eventType: eventDefinition.eventType,
            operatingEnvironment: eventDefinition.operatingEnvironment,
            summary: eventDefinition.summary,
            payload: eventDefinition.payload,
            occurredAt: new Date(),
            intersectionId:
              intersectionsByCode.get(eventDefinition.intersectionCode)?.id ??
              null,
            controllerId: eventDefinition.controllerCode
              ? (controllersByCode.get(eventDefinition.controllerCode)?.id ??
                null)
              : null,
            scenarioId: eventDefinition.scenarioCode
              ? (scenariosByCode.get(eventDefinition.scenarioCode)?.id ?? null)
              : null,
          }),
        ),
      );
    }
  }

  private async seedDeployments() {
    if ((await this.deploymentRepository.count()) > 0) {
      return;
    }

    const intersections = await this.intersectionRepository.find();
    const intersectionsByCode = new Map(
      intersections.map((intersection) => [intersection.code, intersection]),
    );
    const controllers = await this.controllerRepository.find();
    const controllersByCode = new Map(
      controllers.map((controller) => [controller.code, controller]),
    );
    const scenarios = await this.scenarioRepository.find();
    const scenariosByCode = new Map(
      scenarios.map((scenario) => [scenario.code, scenario]),
    );
    const timingPlans = await this.timingPlanRepository.find();
    const timingPlansByCode = new Map(
      timingPlans.map((timingPlan) => [timingPlan.code, timingPlan]),
    );
    const adminUser = await this.userRepository.findOne({
      where: { email: 'admin@stls.local' },
    });

    await this.deploymentRepository.save(
      deploymentSeedData.map((deploymentDefinition) =>
        this.deploymentRepository.create({
          status: deploymentDefinition.status,
          targetType: deploymentDefinition.targetType,
          targetEnvironment: deploymentDefinition.targetEnvironment,
          operatingMode:
            deploymentDefinition.targetEnvironment ===
            OperatingEnvironment.SIMULATION
              ? IntersectionControlMode.ADAPTIVE
              : IntersectionControlMode.FIXED,
          payload: deploymentDefinition.payload,
          packageManifest: {
            packageVersion:
              deploymentDefinition.payload.version ?? 'bootstrap-package',
            requestPayload: {},
          },
          validationReport: {
            valid: true,
            errors: [],
            warnings: [],
            generatedAt: new Date().toISOString(),
          },
          packageVersion:
            deploymentDefinition.payload.version ?? 'bootstrap-package',
          packageDigest: null,
          packageSignature: deploymentDefinition.isSigned
            ? 'seed-signature'
            : null,
          requiredRuntimeVersion:
            deploymentDefinition.requiredRuntimeVersion ?? null,
          compatibleControllerTypes:
            deploymentDefinition.compatibleControllerTypes
              ? [...deploymentDefinition.compatibleControllerTypes]
              : [],
          runtimeContractSchemaVersion:
            deploymentDefinition.runtimeContractSchemaVersion ?? 1,
          resultSummary: deploymentDefinition.resultSummary,
          isSigned: deploymentDefinition.isSigned,
          requestedAt: new Date(),
          validatedAt: new Date(),
          signedAt: deploymentDefinition.isSigned ? new Date() : null,
          publishedAt:
            deploymentDefinition.status === DeploymentStatus.PUBLISHED ||
            deploymentDefinition.status === DeploymentStatus.COMPLETED
              ? new Date()
              : null,
          acknowledgedAt: null,
          completedAt: new Date(),
          rolledBackAt: null,
          controllerReportedPackageDigest: null,
          requestedByUserId: adminUser?.id ?? null,
          acknowledgedByControllerId: null,
          intersectionId:
            intersectionsByCode.get(deploymentDefinition.intersectionCode)
              ?.id ?? null,
          controllerId:
            controllersByCode.get(deploymentDefinition.controllerCode)?.id ??
            null,
          timingPlanId:
            timingPlansByCode.get(deploymentDefinition.timingPlanCode)?.id ??
            null,
          scenarioId:
            scenariosByCode.get(deploymentDefinition.scenarioCode)?.id ?? null,
          rollbackOfDeploymentId: null,
          supersededByDeploymentId: null,
        }),
      ),
    );
  }
}

function inferPhaseApproach(sequenceNumber: number) {
  switch (sequenceNumber) {
    case 1:
      return 'north-south';
    case 2:
      return 'east-west';
    case 3:
      return 'left-turn';
    case 4:
      return 'pedestrian';
    default:
      return 'general';
  }
}

function buildDefaultStagePlan(cycleLengthSeconds: number) {
  const minimumStageSeconds = [28, 24, 12, 26];
  const stageNames = [
    'North-South Through',
    'East-West Through',
    'Protected Turn',
    'Pedestrian',
  ];
  let remaining = Math.max(cycleLengthSeconds, 90);
  const stagePlan = minimumStageSeconds.map((minimumSeconds, index) => {
    const isLastStage = index === minimumStageSeconds.length - 1;

    if (isLastStage) {
      return {
        key: `stage-${index + 1}`,
        name: stageNames[index],
        splitSeconds: remaining,
        phaseSequenceNumbers: [index + 1],
      };
    }

    const reserve = minimumStageSeconds
      .slice(index + 1)
      .reduce((sum, value) => sum + value, 0);
    const bonusSeconds = Math.floor(
      (cycleLengthSeconds -
        minimumStageSeconds.reduce((sum, value) => sum + value, 0)) /
        minimumStageSeconds.length,
    );
    const splitSeconds = Math.max(
      minimumSeconds,
      Math.min(remaining - reserve, minimumSeconds + bonusSeconds),
    );

    remaining -= splitSeconds;

    return {
      key: `stage-${index + 1}`,
      name: stageNames[index],
      splitSeconds,
      phaseSequenceNumbers: [index + 1],
    };
  });

  return {
    splitStrategy: 'fixed-stage-seed',
    stagePlan,
  };
}

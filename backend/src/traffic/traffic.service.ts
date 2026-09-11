import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TopologyReferenceService } from '../cities/topology-reference.service';
import {
  AlarmEntity,
  AlarmSeverity,
  AlarmStatus,
  ControllerConnectionState,
  ControllerEntity,
  EventEntity,
  IntersectionControlMode,
  IntersectionEntity,
  IntersectionHealth,
  OperatingEnvironment,
  ScenarioEntity,
} from '../database/entities';
import {
  controllerSeedData,
  intersectionSeedData,
} from '../database/seed-data';
import { buildCorridors } from './traffic.corridors';
import type {
  AlertSnapshot,
  CommandPlatformSnapshot,
  IntersectionMode,
  IntersectionSnapshot,
  OperatorDirection,
  ScenarioId,
  SystemState,
} from './traffic.types';

interface OperatorCommandState {
  manualOverride: boolean;
  forcedDirection: OperatorDirection | null;
  modeOverride: IntersectionMode | null;
}

const OPERATOR_ALERT_LIMIT = 6;
const CONFIRMABLE_MODES: IntersectionMode[] = ['emergency', 'fail-safe'];

type SnapshotPublisher = (snapshot: CommandPlatformSnapshot) => void;

@Injectable()
export class TrafficService implements OnModuleInit, OnModuleDestroy {
  private publisher?: SnapshotPublisher;
  private simulationInterval?: NodeJS.Timeout;
  private readonly operatorState = new Map<string, OperatorCommandState>();
  private operatorAlerts: AlertSnapshot[] = [];

  constructor(
    @InjectRepository(ScenarioEntity)
    private readonly scenarioRepository: Repository<ScenarioEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    @InjectRepository(AlarmEntity)
    private readonly alarmRepository: Repository<AlarmEntity>,
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    private readonly topology: TopologyReferenceService,
  ) {}

  onModuleInit() {
    this.simulationInterval = setInterval(() => {
      void this.advanceSimulation();
    }, 5000);
  }

  onModuleDestroy() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
    }
  }

  registerPublisher(publisher: SnapshotPublisher) {
    this.publisher = publisher;
  }

  async getSnapshot(): Promise<CommandPlatformSnapshot> {
    const [scenarios, intersections, activeAlerts, systemState] =
      await Promise.all([
        this.scenarioRepository.find({
          order: {
            createdAt: 'ASC',
          },
        }),
        this.intersectionRepository.find({
          relations: {
            controllers: true,
          },
          order: {
            code: 'ASC',
          },
        }),
        this.alarmRepository.find({
          where: {
            status: AlarmStatus.OPEN,
          },
          relations: {
            intersection: true,
          },
          order: {
            triggeredAt: 'DESC',
          },
          take: 3,
        }),
        this.resolveSystemState(),
      ]);
    const intersectionSnapshots = intersections.map((intersection) =>
      this.mapIntersection(intersection),
    );
    const activeScenario =
      (scenarios.find((scenario) => scenario.isActive)?.code as
        | ScenarioId
        | undefined) ?? 'peak_traffic';
    const corridors = buildCorridors(intersectionSnapshots, activeScenario);
    const alerts = this.buildAlerts(
      intersectionSnapshots,
      corridors,
      activeAlerts,
    );
    const throughputBase = readScenarioNumber(
      scenarios.find((scenario) => scenario.code === activeScenario)
        ?.parameters,
      'throughputBase',
      2800,
    );
    const averageDelay =
      intersectionSnapshots.reduce(
        (sum, intersection) => sum + intersection.averageDelaySeconds,
        0,
      ) / Math.max(intersectionSnapshots.length, 1);
    const incidentsCount = intersectionSnapshots.reduce(
      (sum, intersection) => sum + intersection.incidents,
      0,
    );
    const activeControllers =
      systemState === 'running'
        ? intersectionSnapshots.filter(
            (intersection) =>
              intersection.controllerConnectionState !== 'offline',
          ).length
        : 0;

    return {
      cityCenter: {
        lat: 33.5876,
        lng: -7.6114,
      },
      metrics: {
        throughputVph:
          systemState === 'running'
            ? clamp(
                throughputBase -
                  intersectionSnapshots.filter(
                    (intersection) => intersection.status === 'critical',
                  ).length *
                    60,
                0,
                3600,
              )
            : 0,
        delayIndex:
          systemState === 'running'
            ? Number((averageDelay / 45).toFixed(2))
            : 0,
        activeControllers,
        incidentsCount,
        updatedAt: new Date().toISOString(),
        activeScenario,
        city: 'Casablanca Metropolitan Grid',
      },
      intersections: intersectionSnapshots,
      corridors,
      hardware: intersections.flatMap((intersection) =>
        intersection.controllers.map((controller) => ({
          controllerId: controller.code,
          intersectionId: intersection.code,
          connectionState: controller.connectionState,
          mode: controller.operatingEnvironment,
          firmwareVersion: controller.firmwareVersion,
          uptimeHours: controller.uptimeHours,
          batteryBacked: controller.batteryBacked,
          lastSeen:
            controller.lastSeen?.toISOString() ?? new Date().toISOString(),
        })),
      ),
      scenarios: scenarios.map((scenario) => ({
        id: scenario.code as ScenarioId,
        label: scenario.name,
        description: scenario.description,
      })),
      alerts,
      systemState,
    };
  }

  async runScenario(scenarioId: ScenarioId) {
    await this.scenarioRepository
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .execute();
    const scenario = await this.scenarioRepository.findOne({
      where: {
        code: scenarioId,
      },
    });

    if (scenario) {
      scenario.isActive = true;
      await this.scenarioRepository.save(scenario);
    }

    await this.resetSimulationEstate();
    await this.recordSystemState('running', scenarioId);
    await this.createEvent({
      eventType: 'scenario.activated',
      operatingEnvironment: OperatingEnvironment.SIMULATION,
      summary: `${scenarioId} scenario activated.`,
      payload: { scenarioId },
      scenarioId: scenario?.id ?? null,
    });

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async stopSystem() {
    const simulationIntersections = await this.intersectionRepository.find({
      relations: {
        controllers: true,
      },
      order: {
        code: 'ASC',
      },
    });

    for (const intersection of simulationIntersections) {
      const primaryController = findPrimaryController(intersection.controllers);

      if (
        primaryController?.operatingEnvironment !==
        OperatingEnvironment.SIMULATION
      ) {
        continue;
      }

      intersection.controlMode = IntersectionControlMode.FAIL_SAFE;
      intersection.status = IntersectionHealth.CRITICAL;
      intersection.queueLength = clamp(intersection.queueLength + 6, 4, 48);
      intersection.averageDelaySeconds = clamp(
        intersection.averageDelaySeconds + 14,
        16,
        132,
      );
      intersection.lastHeartbeat = new Date();
      primaryController.connectionState = ControllerConnectionState.DEGRADED;
      primaryController.lastSeen = new Date();

      await this.intersectionRepository.save(intersection);
      await this.controllerRepository.update(primaryController.id, {
        connectionState: primaryController.connectionState,
        lastSeen: primaryController.lastSeen,
      });
    }

    await this.createAlarm({
      severity: AlarmSeverity.CRITICAL,
      status: AlarmStatus.OPEN,
      operatingEnvironment: OperatingEnvironment.SIMULATION,
      title: 'Fail-safe stop command issued',
      detail:
        'Simulation controllers switched to protected mode awaiting operator reset.',
      intersectionId: null,
      controllerId: null,
    });
    await this.recordSystemState('stopped');

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  private async advanceSimulation() {
    const systemState = await this.resolveSystemState();

    if (systemState === 'stopped') {
      const snapshot = await this.getSnapshot();
      this.publishSnapshot(snapshot);
      return;
    }

    const [scenarios, intersections] = await Promise.all([
      this.scenarioRepository.find(),
      this.intersectionRepository.find({
        relations: {
          controllers: true,
        },
        order: {
          code: 'ASC',
        },
      }),
    ]);
    const activeScenario =
      scenarios.find((scenario) => scenario.isActive) ?? scenarios[0] ?? null;
    const queueBias = readScenarioNumber(
      activeScenario?.parameters,
      'queueBias',
      0,
    );
    const delayBias = readScenarioNumber(
      activeScenario?.parameters,
      'delayBias',
      0,
    );

    for (const [index, intersection] of intersections.entries()) {
      const primaryController = findPrimaryController(intersection.controllers);

      if (!primaryController) {
        continue;
      }

      if (
        primaryController.operatingEnvironment !==
        OperatingEnvironment.SIMULATION
      ) {
        continue;
      }

      const incidentPulse =
        activeScenario?.code === 'emergency'
          ? index % 2 === 0
            ? 1
            : 0
          : randomInt(0, 100) > 84
            ? 1
            : 0;
      const queueLength = clamp(
        intersection.queueLength + queueBias + randomInt(-3, 4),
        4,
        48,
      );
      const averageDelaySeconds = clamp(
        intersection.averageDelaySeconds + delayBias + randomInt(-6, 7),
        16,
        132,
      );
      const incidents = clamp(
        (activeScenario?.code === 'normal_traffic'
          ? Math.max(0, intersection.incidents - 1)
          : intersection.incidents) + incidentPulse,
        0,
        3,
      );

      intersection.queueLength = queueLength;
      intersection.averageDelaySeconds = averageDelaySeconds;
      intersection.incidents = incidents;
      intersection.status = deriveIntersectionHealth(
        queueLength,
        averageDelaySeconds,
        incidents,
      );
      intersection.controlMode = deriveControlMode(
        activeScenario?.code as ScenarioId | undefined,
        index,
      );
      intersection.lastHeartbeat = new Date();

      primaryController.connectionState = deriveConnectionState(
        queueLength,
        incidents,
        index,
      );
      primaryController.uptimeHours += 1;
      primaryController.lastSeen = new Date();

      await this.intersectionRepository.save(intersection);
      await this.controllerRepository.update(primaryController.id, {
        connectionState: primaryController.connectionState,
        uptimeHours: primaryController.uptimeHours,
        lastSeen: primaryController.lastSeen,
      });
    }

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
  }

  private mapIntersection(
    intersection: IntersectionEntity,
  ): IntersectionSnapshot {
    const primaryController = findPrimaryController(intersection.controllers);
    const operator = this.operatorState.get(intersection.code);
    const scope = this.topology.resolveIntersection(intersection);

    return {
      id: intersection.code,
      name: intersection.name,
      regionId: scope.region.id,
      cityId: scope.city.id,
      zoneId: scope.zone?.id ?? null,
      district: intersection.district,
      address: intersection.address,
      location: {
        lat: Number(intersection.latitude),
        lng: Number(intersection.longitude),
      },
      mode: (operator?.modeOverride ??
        intersection.controlMode) as IntersectionMode,
      status: intersection.status,
      queueLength: intersection.queueLength,
      incidents: intersection.incidents,
      averageDelaySeconds: intersection.averageDelaySeconds,
      controllerId: primaryController?.code ?? 'unassigned',
      controllerConnectionState:
        primaryController?.connectionState ?? ControllerConnectionState.OFFLINE,
      systemMode:
        primaryController?.operatingEnvironment ??
        OperatingEnvironment.SIMULATION,
      lastHeartbeat:
        intersection.lastHeartbeat?.toISOString() ?? new Date().toISOString(),
      manualOverride: operator?.manualOverride ?? false,
      forcedDirection: operator?.forcedDirection ?? null,
    };
  }

  private getOperatorState(intersectionId: string): OperatorCommandState {
    const existing = this.operatorState.get(intersectionId);
    if (existing) return existing;
    const fresh: OperatorCommandState = {
      manualOverride: false,
      forcedDirection: null,
      modeOverride: null,
    };
    this.operatorState.set(intersectionId, fresh);
    return fresh;
  }

  readOperatorCommandState(intersectionId: string): {
    manualOverride: boolean;
    forcedDirection: OperatorDirection | null;
    modeOverride: IntersectionMode | null;
  } {
    const current = this.operatorState.get(intersectionId);
    return {
      manualOverride: current?.manualOverride ?? false,
      forcedDirection: current?.forcedDirection ?? null,
      modeOverride: current?.modeOverride ?? null,
    };
  }

  private async requireIntersection(
    intersectionId: string,
  ): Promise<IntersectionEntity> {
    const intersection = await this.intersectionRepository.findOne({
      where: { code: intersectionId },
      relations: { controllers: true },
    });
    if (!intersection) {
      throw new NotFoundException(
        `Intersection "${intersectionId}" not found in backend data.`,
      );
    }
    return intersection;
  }

  private recordOperatorAlert(alert: {
    level: AlertSnapshot['level'];
    title: string;
    detail: string;
  }) {
    const stamped: AlertSnapshot = {
      id: `operator-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
      timestamp: new Date().toISOString(),
    };
    this.operatorAlerts = [stamped, ...this.operatorAlerts].slice(
      0,
      OPERATOR_ALERT_LIMIT,
    );
  }

  async setIntersectionOverride(
    intersectionId: string,
    engaged: boolean,
  ): Promise<CommandPlatformSnapshot> {
    const intersection = await this.requireIntersection(intersectionId);
    const state = this.getOperatorState(intersectionId);
    state.manualOverride = engaged;
    if (!engaged) {
      state.forcedDirection = null;
    }

    this.recordOperatorAlert({
      level: 'info',
      title: engaged
        ? `Override engaged at ${intersection.name}`
        : `Override released at ${intersection.name}`,
      detail: engaged
        ? 'Operator took manual control of this intersection.'
        : 'Operator returned intersection to automatic control.',
    });

    await this.createEvent({
      eventType: engaged
        ? 'command-platform.override.engage'
        : 'command-platform.override.release',
      operatingEnvironment: OperatingEnvironment.SIMULATION,
      summary: `Override ${engaged ? 'engaged' : 'released'} at ${intersection.name}.`,
      payload: { intersectionId, engaged },
      scenarioId: null,
    });

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async setIntersectionForcedGreen(
    intersectionId: string,
    direction: OperatorDirection | null | undefined,
  ): Promise<CommandPlatformSnapshot> {
    const intersection = await this.requireIntersection(intersectionId);
    const state = this.getOperatorState(intersectionId);
    if (direction && !state.manualOverride) {
      throw new BadRequestException(
        'Manual override must be engaged before forcing a direction.',
      );
    }

    state.forcedDirection = direction ?? null;

    this.recordOperatorAlert({
      level: 'warning',
      title: state.forcedDirection
        ? `Force green ${state.forcedDirection} at ${intersection.name}`
        : `Forced green cleared at ${intersection.name}`,
      detail: state.forcedDirection
        ? `Operator forced green aspect on the ${state.forcedDirection} approach.`
        : 'Operator released forced green; intersection returned to normal phasing.',
    });

    await this.createEvent({
      eventType: state.forcedDirection
        ? 'command-platform.force-green.set'
        : 'command-platform.force-green.clear',
      operatingEnvironment: OperatingEnvironment.SIMULATION,
      summary: state.forcedDirection
        ? `Force green ${state.forcedDirection} at ${intersection.name}.`
        : `Force green cleared at ${intersection.name}.`,
      payload: { intersectionId, direction: state.forcedDirection },
      scenarioId: null,
    });

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async setIntersectionMode(
    intersectionId: string,
    mode: IntersectionMode,
    confirmed?: boolean,
  ): Promise<CommandPlatformSnapshot> {
    const intersection = await this.requireIntersection(intersectionId);
    if (CONFIRMABLE_MODES.includes(mode) && confirmed !== true) {
      throw new BadRequestException(
        `Mode "${mode}" requires explicit confirmation.`,
      );
    }

    const state = this.getOperatorState(intersectionId);
    state.modeOverride = mode;
    if (mode === 'emergency' || mode === 'manual') {
      state.manualOverride = true;
    }
    if (mode !== 'manual' && mode !== 'emergency') {
      state.forcedDirection = null;
    }

    this.recordOperatorAlert({
      level: CONFIRMABLE_MODES.includes(mode) ? 'critical' : 'warning',
      title: `Mode → ${mode} at ${intersection.name}`,
      detail: `Operator switched intersection control mode to ${mode}.`,
    });

    await this.createEvent({
      eventType: 'command-platform.mode.set',
      operatingEnvironment: OperatingEnvironment.SIMULATION,
      summary: `Mode set to ${mode} at ${intersection.name}.`,
      payload: { intersectionId, mode, confirmed: confirmed === true },
      scenarioId: null,
    });

    const snapshot = await this.getSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  private buildAlerts(
    intersections: IntersectionSnapshot[],
    corridors: CommandPlatformSnapshot['corridors'],
    alarms: AlarmEntity[],
  ): AlertSnapshot[] {
    const alarmAlerts: AlertSnapshot[] = alarms.map((alarm) => ({
      id: alarm.id,
      level: alarm.severity as AlertSnapshot['level'],
      title: alarm.title,
      detail: alarm.detail,
      timestamp: alarm.triggeredAt.toISOString(),
    }));
    for (const operatorAlert of this.operatorAlerts) {
      alarmAlerts.unshift(operatorAlert);
    }
    const busiestIntersection = [...intersections].sort(
      (left, right) => right.queueLength - left.queueLength,
    )[0];
    const slowestCorridor = [...corridors].sort(
      (left, right) => right.travelTimeMinutes - left.travelTimeMinutes,
    )[0];

    if (busiestIntersection) {
      alarmAlerts.unshift({
        id: `derived-${busiestIntersection.id}`,
        level:
          busiestIntersection.status === 'critical' ? 'critical' : 'warning',
        title: `Pressure at ${busiestIntersection.name}`,
        detail: `${busiestIntersection.queueLength} vehicles queued with ${busiestIntersection.averageDelaySeconds}s average delay.`,
        timestamp: new Date().toISOString(),
      });
    }

    if (slowestCorridor) {
      alarmAlerts.push({
        id: `corridor-${slowestCorridor.id}`,
        level: slowestCorridor.state === 'congestion' ? 'warning' : 'info',
        title: `${slowestCorridor.label} travel time shift`,
        detail: `${slowestCorridor.travelTimeMinutes} minutes estimated end-to-end.`,
        timestamp: new Date().toISOString(),
      });
    }

    return alarmAlerts.slice(0, 8);
  }

  private async resolveSystemState(): Promise<SystemState> {
    const latestEvent = await this.eventRepository.findOne({
      where: {
        eventType: 'system.state',
      },
      order: {
        occurredAt: 'DESC',
      },
    });

    if (latestEvent?.payload && latestEvent.payload['state'] === 'stopped') {
      return 'stopped';
    }

    return 'running';
  }

  private async recordSystemState(state: SystemState, scenarioId?: ScenarioId) {
    await this.eventRepository.save(
      this.eventRepository.create({
        eventType: 'system.state',
        operatingEnvironment: OperatingEnvironment.SIMULATION,
        summary: `System state changed to ${state}.`,
        payload: {
          state,
          scenarioId: scenarioId ?? null,
        },
        occurredAt: new Date(),
        intersectionId: null,
        controllerId: null,
        scenarioId: null,
      }),
    );
  }

  private async createEvent(input: {
    eventType: string;
    operatingEnvironment: OperatingEnvironment;
    summary: string;
    payload: Record<string, unknown>;
    scenarioId: string | null;
  }) {
    await this.eventRepository.save(
      this.eventRepository.create({
        eventType: input.eventType,
        operatingEnvironment: input.operatingEnvironment,
        summary: input.summary,
        payload: input.payload,
        occurredAt: new Date(),
        intersectionId: null,
        controllerId: null,
        scenarioId: input.scenarioId,
      }),
    );
  }

  private async createAlarm(input: {
    severity: AlarmSeverity;
    status: AlarmStatus;
    operatingEnvironment: OperatingEnvironment;
    title: string;
    detail: string;
    intersectionId: string | null;
    controllerId: string | null;
  }) {
    await this.alarmRepository.save(
      this.alarmRepository.create({
        severity: input.severity,
        status: input.status,
        operatingEnvironment: input.operatingEnvironment,
        title: input.title,
        detail: input.detail,
        triggeredAt: new Date(),
        acknowledgedAt: null,
        acknowledgedByUserId: null,
        intersectionId: input.intersectionId,
        controllerId: input.controllerId,
      }),
    );
  }

  private async resetSimulationEstate() {
    const intersections = await this.intersectionRepository.find({
      relations: {
        controllers: true,
      },
    });
    const intersectionSeedByCode = new Map<
      string,
      (typeof intersectionSeedData)[number]
    >(
      intersectionSeedData.map((intersection) => [
        intersection.code,
        intersection,
      ]),
    );
    const controllerSeedByCode = new Map<
      string,
      (typeof controllerSeedData)[number]
    >(controllerSeedData.map((controller) => [controller.code, controller]));

    for (const intersection of intersections) {
      const primaryController = findPrimaryController(intersection.controllers);

      if (!primaryController) {
        continue;
      }

      if (
        primaryController.operatingEnvironment !==
        OperatingEnvironment.SIMULATION
      ) {
        continue;
      }

      const intersectionSeed = intersectionSeedByCode.get(intersection.code);
      const controllerSeed = controllerSeedByCode.get(primaryController.code);

      if (intersectionSeed) {
        intersection.controlMode = intersectionSeed.controlMode;
        intersection.status = intersectionSeed.status;
        intersection.queueLength = intersectionSeed.queueLength;
        intersection.incidents = intersectionSeed.incidents;
        intersection.averageDelaySeconds = intersectionSeed.averageDelaySeconds;
        intersection.lastHeartbeat = new Date();
        await this.intersectionRepository.save(intersection);
      }

      if (controllerSeed) {
        primaryController.connectionState = controllerSeed.connectionState;
        primaryController.uptimeHours = controllerSeed.uptimeHours;
        primaryController.lastSeen = new Date();
        await this.controllerRepository.update(primaryController.id, {
          connectionState: primaryController.connectionState,
          uptimeHours: primaryController.uptimeHours,
          lastSeen: primaryController.lastSeen,
        });
      }
    }
  }

  private publishSnapshot(snapshot: CommandPlatformSnapshot) {
    this.publisher?.(snapshot);
  }
}

function deriveIntersectionHealth(
  queueLength: number,
  averageDelaySeconds: number,
  incidents: number,
) {
  if (incidents > 0 || queueLength >= 32 || averageDelaySeconds >= 82) {
    return IntersectionHealth.CRITICAL;
  }

  if (queueLength >= 18 || averageDelaySeconds >= 46) {
    return IntersectionHealth.WATCH;
  }

  return IntersectionHealth.HEALTHY;
}

function deriveConnectionState(
  queueLength: number,
  incidents: number,
  index: number,
) {
  if (queueLength >= 30 || incidents > 1) {
    return index % 3 === 0
      ? ControllerConnectionState.OFFLINE
      : ControllerConnectionState.DEGRADED;
  }

  if (queueLength >= 18) {
    return ControllerConnectionState.DEGRADED;
  }

  return ControllerConnectionState.ONLINE;
}

function deriveControlMode(scenarioId: ScenarioId | undefined, index: number) {
  if (scenarioId === 'emergency') {
    return index % 2 === 0
      ? IntersectionControlMode.EMERGENCY
      : IntersectionControlMode.MANUAL;
  }

  if (scenarioId === 'normal_traffic') {
    return index % 3 === 0
      ? IntersectionControlMode.FIXED
      : IntersectionControlMode.ADAPTIVE;
  }

  return IntersectionControlMode.ADAPTIVE;
}

function findPrimaryController(controllers: ControllerEntity[]) {
  return (
    controllers.find((controller) => controller.isPrimary) ?? controllers[0]
  );
}

function readScenarioNumber(
  parameters: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
) {
  const value = parameters?.[key];

  if (typeof value === 'number') {
    return value;
  }

  return fallback;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

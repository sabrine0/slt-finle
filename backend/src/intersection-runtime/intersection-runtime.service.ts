import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  IntersectionEntity,
  IntersectionRuntimeConfigEntity,
} from '../database/entities';
import { TrafficService } from '../traffic/traffic.service';
import type { SetIntersectionConfigDto } from './dto/set-intersection-config.dto';
import type {
  ConfigBearing,
  DetectorState,
  IntersectionConfigResponse,
  IntersectionRuntimeState,
  PhaseSlice,
  PhaseState,
  SignalAspect,
  SignalGroupState,
} from './intersection-runtime.types';

type Bearing = 'N' | 'E' | 'S' | 'W';

interface ConfigPhase {
  id: string;
  label: string;
  greenSignalGroupIds: string[];
  minGreenSeconds: number;
  yellowSeconds: number;
  redClearanceSeconds: number;
}

interface ConfigStage {
  id: string;
  phaseId: string;
  order: number;
}

interface IntersectionSimConfig {
  id: string;
  isDefault: boolean;
  signalGroups: Array<{ id: string; bearing: ConfigBearing; label?: string }>;
  detectors: Array<{ id: string; bearing: ConfigBearing; label?: string }>;
  phases: ConfigPhase[];
  stages: ConfigStage[];
  conflicts: Array<{ a: string; b: string }>;
  slices: PhaseSlice[];
  cycleSeconds: number;
}

// Seed simulated runtimes for a few featured carrefours so the
// runtime endpoints have a valid config even before the DB is up.
// Codes match the carfmap-derived seed (CAR-{4-digit-id}).
const DEFAULT_IDS = [
  'CAR-0147', // T3 — Bd MED 6 / Bd Abbasside
  'CAR-0169', // T4 — Rahal Meskini / Abou bakr Essedik
  'CAR-0226', // BHNS L5 — Mohammed VI / Cdt Driss Al Harti
  'CAR-0126', // Fès — Royal Mirage
  'CAR-0114', // El Jadida — Rte 1 / Av Khalil Jabran
];
const RENDERABLE_BEARINGS: Bearing[] = ['N', 'E', 'S', 'W'];

function buildSlicesFromStagesAndPhases(
  stages: ConfigStage[],
  phases: ConfigPhase[],
): PhaseSlice[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const slices: PhaseSlice[] = [];
  let cursor = 0;
  for (const stage of ordered) {
    const phase = phases.find((p) => p.id === stage.phaseId);
    if (!phase) continue;
    const duration =
      phase.minGreenSeconds + phase.yellowSeconds + phase.redClearanceSeconds;
    slices.push({
      phaseId: phase.id,
      label: phase.label,
      greenSignalGroupIds: phase.greenSignalGroupIds,
      minGreenSeconds: phase.minGreenSeconds,
      yellowSeconds: phase.yellowSeconds,
      redClearanceSeconds: phase.redClearanceSeconds,
      startsAtCycleSecond: cursor,
      durationSeconds: duration,
    });
    cursor += duration;
  }
  return slices;
}

function buildDefaultConfig(intersectionId: string): IntersectionSimConfig {
  const signalGroups = RENDERABLE_BEARINGS.map((bearing) => ({
    id: `sg-${bearing.toLowerCase()}`,
    bearing,
    label: `${bearing} signal group`,
  }));
  const detectors = RENDERABLE_BEARINGS.map((bearing, index) => ({
    id: `det-${(index + 1).toString().padStart(3, '0')}`,
    bearing,
    label: `${bearing} stop bar detector`,
  }));

  const phases: ConfigPhase[] = [
    {
      id: 'ph-1',
      label: 'Phase 1 — N/S green',
      greenSignalGroupIds: ['sg-n', 'sg-s'],
      minGreenSeconds: 12,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
    {
      id: 'ph-2',
      label: 'Phase 2 — E/W green',
      greenSignalGroupIds: ['sg-e', 'sg-w'],
      minGreenSeconds: 12,
      yellowSeconds: 3,
      redClearanceSeconds: 2,
    },
  ];

  const stages: ConfigStage[] = [
    { id: 'st-1', phaseId: 'ph-1', order: 1 },
    { id: 'st-2', phaseId: 'ph-2', order: 2 },
  ];

  const conflicts = [
    { a: 'sg-n', b: 'sg-e' },
    { a: 'sg-n', b: 'sg-w' },
    { a: 'sg-s', b: 'sg-e' },
    { a: 'sg-s', b: 'sg-w' },
  ];

  const slices = buildSlicesFromStagesAndPhases(stages, phases);
  const cycleSeconds = slices.reduce(
    (sum, slice) => sum + slice.durationSeconds,
    0,
  );

  return {
    id: intersectionId,
    isDefault: true,
    signalGroups,
    detectors,
    phases,
    stages,
    conflicts,
    slices,
    cycleSeconds,
  };
}

type Listener = (state: IntersectionRuntimeState) => void;

@Injectable()
export class IntersectionRuntimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly configs = new Map<string, IntersectionSimConfig>();
  private readonly forcedPhases = new Map<string, string | null>();
  private readonly forcedPhaseAt = new Map<string, number>();
  private readonly detectorLastActive = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private tickHandle?: NodeJS.Timeout;
  private elapsedSeconds = 0;

  constructor(
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(IntersectionRuntimeConfigEntity)
    private readonly runtimeConfigRepository: Repository<IntersectionRuntimeConfigEntity>,
    private readonly trafficService: TrafficService,
  ) {}

  async onModuleInit() {
    try {
      const rows = await this.intersectionRepository.find({ take: 64 });
      for (const row of rows) {
        if (!this.configs.has(row.code)) {
          this.configs.set(row.code, buildDefaultConfig(row.code));
        }
      }
    } catch {
      /* DB may be empty — fall back to defaults below */
    }
    for (const id of DEFAULT_IDS) {
      if (!this.configs.has(id)) this.configs.set(id, buildDefaultConfig(id));
    }

    await this.hydratePersistedConfigs();

    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  private async hydratePersistedConfigs(): Promise<void> {
    let stored: IntersectionRuntimeConfigEntity[] = [];
    try {
      stored = await this.runtimeConfigRepository.find();
    } catch {
      /* runtime_configs table missing or DB down — keep defaults */
      return;
    }
    for (const row of stored) {
      try {
        const config = this.buildConfigFromPayload(
          row.intersectionCode,
          row.payload,
        );
        this.configs.set(row.intersectionCode, config);
      } catch {
        /* discard a corrupt row rather than crash boot */
      }
    }
  }

  onModuleDestroy() {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }

  onStateUpdate(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private ensureConfig(id: string): IntersectionSimConfig {
    const existing = this.configs.get(id);
    if (existing) return existing;
    const created = buildDefaultConfig(id);
    this.configs.set(id, created);
    return created;
  }

  private tick() {
    this.elapsedSeconds += 1;
    for (const config of this.configs.values()) {
      const state = this.computeState(config);
      for (const listener of this.listeners) listener(state);
    }
  }

  getState(intersectionId: string): IntersectionRuntimeState {
    const config = this.ensureConfig(intersectionId);
    return this.computeState(config);
  }

  listKnownIds(): string[] {
    return Array.from(this.configs.keys()).sort();
  }

  getConfig(intersectionId: string): IntersectionConfigResponse {
    const config = this.ensureConfig(intersectionId);
    return {
      intersectionId,
      isDefault: config.isDefault,
      signalGroups: config.signalGroups.map((sg) => ({
        id: sg.id,
        approachBearing: sg.bearing,
        label: sg.label,
      })),
      detectors: config.detectors.map((d) => ({
        id: d.id,
        approachBearing: d.bearing,
        label: d.label,
      })),
      phases: config.phases.map((phase) => ({
        id: phase.id,
        label: phase.label,
        greenSignalGroupIds: phase.greenSignalGroupIds,
        minGreenSeconds: phase.minGreenSeconds,
        yellowSeconds: phase.yellowSeconds,
        redClearanceSeconds: phase.redClearanceSeconds,
      })),
      stages: config.stages.map((stage) => ({
        id: stage.id,
        phaseId: stage.phaseId,
        order: stage.order,
      })),
      conflicts: config.conflicts.map((pair) => ({ a: pair.a, b: pair.b })),
      cycleSeconds: config.cycleSeconds,
    };
  }

  async applyConfig(
    intersectionId: string,
    payload: SetIntersectionConfigDto,
  ): Promise<IntersectionRuntimeState> {
    this.validatePayload(intersectionId, payload);

    const config = this.buildConfigFromPayload(intersectionId, payload);

    this.configs.set(intersectionId, config);
    this.forcedPhases.set(intersectionId, null);
    this.forcedPhaseAt.delete(intersectionId);

    try {
      const persistedPayload = this.toPersistedPayload(config);
      const existing = await this.runtimeConfigRepository.findOne({
        where: { intersectionCode: intersectionId },
      });
      if (existing) {
        existing.payload = persistedPayload;
        existing.appliedAt = new Date();
        await this.runtimeConfigRepository.save(existing);
      } else {
        await this.runtimeConfigRepository.save(
          this.runtimeConfigRepository.create({
            intersectionCode: intersectionId,
            payload: persistedPayload,
            schemaVersion: 1,
            appliedAt: new Date(),
            appliedBy: null,
          }),
        );
      }
    } catch (error) {
      this.configs.set(intersectionId, this.configs.get(intersectionId)!);
      throw new InternalServerErrorException(
        `Configuration applied to memory but failed to persist: ${
          error instanceof Error ? error.message : 'database error'
        }`,
      );
    }

    const state = this.computeState(config);
    for (const listener of this.listeners) listener(state);
    return state;
  }

  private buildConfigFromPayload(
    intersectionId: string,
    payload:
      | SetIntersectionConfigDto
      | IntersectionRuntimeConfigEntity['payload'],
  ): IntersectionSimConfig {
    const phases: ConfigPhase[] = payload.phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      greenSignalGroupIds: [...phase.greenSignalGroupIds],
      minGreenSeconds: phase.minGreenSeconds,
      yellowSeconds: phase.yellowSeconds,
      redClearanceSeconds: phase.redClearanceSeconds,
    }));

    const stages: ConfigStage[] = payload.stages.map((stage) => ({
      id: stage.id,
      phaseId: stage.phaseId,
      order: stage.order,
    }));

    const slices = buildSlicesFromStagesAndPhases(stages, phases);
    const cycleSeconds = slices.reduce(
      (sum, slice) => sum + slice.durationSeconds,
      0,
    );
    if (cycleSeconds <= 0) {
      throw new BadRequestException(
        'Cycle length is zero — at least one stage must reference a phase with a positive minimum-green time.',
      );
    }

    return {
      id: intersectionId,
      isDefault: false,
      signalGroups: payload.signalGroups.map((sg) => ({
        id: sg.id,
        bearing: sg.approachBearing,
        label: sg.label,
      })),
      detectors: payload.detectors.map((det) => ({
        id: det.id,
        bearing: det.approachBearing,
        label: det.label,
      })),
      phases,
      stages,
      conflicts: payload.conflicts.map((pair) => ({ a: pair.a, b: pair.b })),
      slices,
      cycleSeconds,
    };
  }

  private toPersistedPayload(
    config: IntersectionSimConfig,
  ): IntersectionRuntimeConfigEntity['payload'] {
    return {
      signalGroups: config.signalGroups.map((sg) => ({
        id: sg.id,
        approachBearing: sg.bearing,
        label: sg.label,
      })),
      detectors: config.detectors.map((det) => ({
        id: det.id,
        approachBearing: det.bearing,
        label: det.label,
      })),
      phases: config.phases.map((phase) => ({
        id: phase.id,
        label: phase.label,
        greenSignalGroupIds: [...phase.greenSignalGroupIds],
        minGreenSeconds: phase.minGreenSeconds,
        yellowSeconds: phase.yellowSeconds,
        redClearanceSeconds: phase.redClearanceSeconds,
      })),
      stages: config.stages.map((stage) => ({
        id: stage.id,
        phaseId: stage.phaseId,
        order: stage.order,
      })),
      conflicts: config.conflicts.map((pair) => ({ a: pair.a, b: pair.b })),
    };
  }

  async setForcedPhase(
    intersectionId: string,
    phaseId: string | null,
  ): Promise<IntersectionRuntimeState> {
    const config = this.ensureConfig(intersectionId);

    if (phaseId) {
      const slice = config.slices.find(
        (candidate) => candidate.phaseId === phaseId,
      );
      if (!slice) {
        throw new NotFoundException(
          `Phase "${phaseId}" is not defined for intersection "${intersectionId}".`,
        );
      }

      const operator =
        this.trafficService.readOperatorCommandState(intersectionId);
      if (
        operator.modeOverride === 'fail-safe' ||
        operator.modeOverride === 'flash' ||
        operator.modeOverride === 'emergency'
      ) {
        throw new BadRequestException(
          `Cannot force phase while intersection is in "${operator.modeOverride}" mode. Switch to a normal control mode first.`,
        );
      }

      if (operator.manualOverride && operator.forcedDirection) {
        const directionGroupId = this.signalGroupIdForBearing(
          config,
          operator.forcedDirection,
        );
        if (
          directionGroupId &&
          !slice.greenSignalGroupIds.includes(directionGroupId)
        ) {
          throw new BadRequestException(
            `Phase "${phaseId}" does not include the currently force-green direction "${operator.forcedDirection}" (signal group "${directionGroupId}"). Release force-green first or pick a phase that contains it.`,
          );
        }
      }
    }

    this.forcedPhases.set(intersectionId, phaseId ?? null);
    this.forcedPhaseAt.set(intersectionId, this.elapsedSeconds);
    const state = this.computeState(config);
    for (const listener of this.listeners) listener(state);
    return state;
  }

  private signalGroupIdForBearing(
    config: IntersectionSimConfig,
    bearing: string,
  ): string | null {
    const sg = config.signalGroups.find((group) => group.bearing === bearing);
    return sg?.id ?? null;
  }

  private validatePayload(
    intersectionId: string,
    payload: SetIntersectionConfigDto,
  ): void {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Configuration payload is missing.');
    }

    const sgIds = new Set(payload.signalGroups.map((sg) => sg.id));
    if (sgIds.size !== payload.signalGroups.length) {
      throw new BadRequestException('Signal group IDs must be unique.');
    }

    const phaseIds = new Set(payload.phases.map((phase) => phase.id));
    if (phaseIds.size !== payload.phases.length) {
      throw new BadRequestException('Phase IDs must be unique.');
    }

    const stageIds = new Set(payload.stages.map((stage) => stage.id));
    if (stageIds.size !== payload.stages.length) {
      throw new BadRequestException('Stage IDs must be unique.');
    }

    const detectorIds = new Set(payload.detectors.map((det) => det.id));
    if (detectorIds.size !== payload.detectors.length) {
      throw new BadRequestException('Detector IDs must be unique.');
    }

    for (const phase of payload.phases) {
      for (const sgId of phase.greenSignalGroupIds) {
        if (!sgIds.has(sgId)) {
          throw new BadRequestException(
            `Phase "${phase.id}" references unknown signal group "${sgId}".`,
          );
        }
      }
    }

    for (const stage of payload.stages) {
      if (!phaseIds.has(stage.phaseId)) {
        throw new BadRequestException(
          `Stage "${stage.id}" references unknown phase "${stage.phaseId}".`,
        );
      }
    }

    for (const pair of payload.conflicts) {
      if (pair.a === pair.b) {
        throw new BadRequestException(
          `Conflict pair cannot reference the same signal group: "${pair.a}".`,
        );
      }
      if (!sgIds.has(pair.a) || !sgIds.has(pair.b)) {
        throw new BadRequestException(
          `Conflict pair references unknown signal groups: "${pair.a}" / "${pair.b}".`,
        );
      }
    }

    for (const phase of payload.phases) {
      const greens = phase.greenSignalGroupIds;
      for (let i = 0; i < greens.length; i += 1) {
        for (let j = i + 1; j < greens.length; j += 1) {
          const a = greens[i];
          const b = greens[j];
          const conflicts = payload.conflicts.some(
            (pair) =>
              (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a),
          );
          if (conflicts) {
            throw new BadRequestException(
              `Phase "${phase.id}" contains conflicting signal groups: "${a}" and "${b}" cannot be green simultaneously.`,
            );
          }
        }
      }
    }

    if (payload.signalGroups.length === 0) {
      throw new BadRequestException(
        'Configuration must declare at least one signal group.',
      );
    }

    void intersectionId;
  }

  private computeState(
    config: IntersectionSimConfig,
  ): IntersectionRuntimeState {
    const operator = this.trafficService.readOperatorCommandState(config.id);
    const forcedPhaseId = this.forcedPhases.get(config.id) ?? null;

    let activeSlice: PhaseSlice | null = null;
    let secondsIntoPhaseState = 0;
    let secondsRemainingInPhaseState = 0;
    let phaseState: PhaseState = 'idle';
    let cycleSecond = 0;

    if (config.cycleSeconds === 0) {
      return this.emptyState(config, operator, forcedPhaseId);
    }

    if (forcedPhaseId) {
      activeSlice =
        config.slices.find((slice) => slice.phaseId === forcedPhaseId) ?? null;
      if (activeSlice) {
        const forcedSince =
          this.forcedPhaseAt.get(config.id) ?? this.elapsedSeconds;
        secondsIntoPhaseState = this.elapsedSeconds - forcedSince;
        secondsRemainingInPhaseState = Math.max(
          0,
          activeSlice.minGreenSeconds - secondsIntoPhaseState,
        );
        phaseState = 'green';
        cycleSecond = activeSlice.startsAtCycleSecond;
      }
    } else {
      cycleSecond = this.elapsedSeconds % config.cycleSeconds;
      let cursor = 0;
      for (const slice of config.slices) {
        const slot = cycleSecond - cursor;
        if (slot < slice.durationSeconds) {
          activeSlice = slice;
          if (slot < slice.minGreenSeconds) {
            phaseState = 'green';
            secondsIntoPhaseState = slot;
            secondsRemainingInPhaseState = slice.minGreenSeconds - slot;
          } else if (slot < slice.minGreenSeconds + slice.yellowSeconds) {
            phaseState = 'yellow';
            secondsIntoPhaseState = slot - slice.minGreenSeconds;
            secondsRemainingInPhaseState =
              slice.yellowSeconds - secondsIntoPhaseState;
          } else {
            phaseState = 'red-clearance';
            secondsIntoPhaseState =
              slot - slice.minGreenSeconds - slice.yellowSeconds;
            secondsRemainingInPhaseState =
              slice.redClearanceSeconds - secondsIntoPhaseState;
          }
          break;
        }
        cursor += slice.durationSeconds;
      }
    }

    const overrideMode = operator.modeOverride;
    const signalGroups = this.buildSignalGroups(
      config,
      activeSlice,
      phaseState,
      operator,
      overrideMode,
    );
    const detectors = this.buildDetectors(config);

    return {
      intersectionId: config.id,
      activePhaseId: activeSlice?.phaseId ?? null,
      activePhaseLabel: activeSlice?.label ?? '—',
      phaseState,
      secondsIntoPhaseState,
      secondsRemainingInPhaseState,
      cycleSecond,
      cycleSeconds: config.cycleSeconds,
      orderedSlices: config.slices,
      signalGroups,
      detectors,
      commands: {
        manualOverride: operator.manualOverride,
        forcedDirection: operator.forcedDirection,
        forcedPhaseId,
        modeOverride: overrideMode,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private buildSignalGroups(
    config: IntersectionSimConfig,
    activeSlice: PhaseSlice | null,
    phaseState: PhaseState,
    operator: ReturnType<TrafficService['readOperatorCommandState']>,
    modeOverride: ReturnType<
      TrafficService['readOperatorCommandState']
    >['modeOverride'],
  ): SignalGroupState[] {
    const forcedBearing = operator.forcedDirection;

    return config.signalGroups
      .filter(
        (group): group is { id: string; bearing: Bearing; label?: string } =>
          (RENDERABLE_BEARINGS as ConfigBearing[]).includes(group.bearing),
      )
      .map((group) => {
        let aspect: SignalAspect = 'red';

        if (modeOverride === 'flash' || modeOverride === 'fail-safe') {
          aspect = 'yellow';
        } else if (modeOverride === 'emergency') {
          aspect = 'red';
        } else if (operator.manualOverride && forcedBearing) {
          aspect = group.bearing === forcedBearing ? 'green' : 'red';
        } else if (activeSlice) {
          const isActive = activeSlice.greenSignalGroupIds.includes(group.id);
          if (isActive) {
            if (phaseState === 'green') aspect = 'green';
            else if (phaseState === 'yellow') aspect = 'yellow';
            else aspect = 'red';
          }
        }

        return {
          id: group.id,
          approachBearing: group.bearing,
          aspect,
        };
      });
  }

  private buildDetectors(config: IntersectionSimConfig): DetectorState[] {
    return config.detectors
      .filter(
        (
          detector,
        ): detector is { id: string; bearing: Bearing; label?: string } =>
          (RENDERABLE_BEARINGS as ConfigBearing[]).includes(detector.bearing),
      )
      .map((detector) => {
        const period = 6 + ((this.hashString(detector.id) % 5) + 1);
        const phase =
          (this.elapsedSeconds + this.hashString(detector.id)) % period;
        const active = phase < 2;
        if (active) {
          this.detectorLastActive.set(detector.id, this.elapsedSeconds);
        }
        const lastTick = this.detectorLastActive.get(detector.id);
        const lastActivationAt = lastTick
          ? new Date(
              Date.now() - (this.elapsedSeconds - lastTick) * 1000,
            ).toISOString()
          : undefined;
        return {
          id: detector.id,
          approachBearing: detector.bearing,
          active,
          lastActivationAt,
        };
      });
  }

  private hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private emptyState(
    config: IntersectionSimConfig,
    operator: ReturnType<TrafficService['readOperatorCommandState']>,
    forcedPhaseId: string | null,
  ): IntersectionRuntimeState {
    return {
      intersectionId: config.id,
      activePhaseId: null,
      activePhaseLabel: '—',
      phaseState: 'idle',
      secondsIntoPhaseState: 0,
      secondsRemainingInPhaseState: 0,
      cycleSecond: 0,
      cycleSeconds: 0,
      orderedSlices: [],
      signalGroups: [],
      detectors: [],
      commands: {
        manualOverride: operator.manualOverride,
        forcedDirection: operator.forcedDirection,
        forcedPhaseId,
        modeOverride: operator.modeOverride,
      },
      updatedAt: new Date().toISOString(),
    };
  }
}

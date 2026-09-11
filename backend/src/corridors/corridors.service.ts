import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  ControllerEntity,
  CorridorControlKind,
  CorridorControlSessionEntity,
  CorridorControlStatus,
  CorridorEntity,
  CorridorIntersectionEntity,
  CorridorScenarioAssignmentEntity,
  CorridorScenarioCode,
  IntersectionEntity,
  OverrideAction,
  OverrideReasonCode,
  OverrideResult,
  OverrideCommandEntity,
} from '../database/entities';
import { IntersectionRuntimeService } from '../intersection-runtime/intersection-runtime.service';
import { TrafficService } from '../traffic/traffic.service';
import type { CreateCorridorDto } from './dto/create-corridor.dto';
import type { AddCorridorIntersectionsDto } from './dto/add-corridor-intersections.dto';
import type { ActivateCorridorScenarioDto } from './dto/activate-scenario.dto';
import type { CorridorOverrideDto } from './dto/corridor-override.dto';
import type { ReleaseCorridorControlDto } from './dto/release-corridor.dto';
import {
  CORRIDOR_SCENARIO_CODES,
  type CorridorControlSessionView,
  type CorridorIntersectionRuntimeView,
  type CorridorIntersectionSummary,
  type CorridorReasonCode,
  type CorridorRuntimeSnapshot,
  type CorridorSummary,
} from './corridors.types';

interface DispatchResult {
  intersectionCode: string;
  action: string;
  success: boolean;
  error?: string;
}

const REASON_TO_OVERRIDE_REASON: Record<
  CorridorReasonCode,
  OverrideReasonCode
> = {
  police_operation: OverrideReasonCode.EMERGENCY_VEHICLE,
  emergency_vehicle: OverrideReasonCode.EMERGENCY_VEHICLE,
  incident: OverrideReasonCode.INCIDENT,
  event: OverrideReasonCode.EVENT,
  congestion_relief: OverrideReasonCode.CONGESTION_RELIEF,
  maintenance: OverrideReasonCode.MAINTENANCE,
  drill: OverrideReasonCode.DRILL,
  other: OverrideReasonCode.OTHER,
};

const OUTRANKING_SCENARIOS: CorridorScenarioCode[] = [
  'police_diversion',
  'emergency_clear_path',
];

const OUTRANKING_CONTROL_KINDS: CorridorControlKind[] = [
  'emergency_green_corridor',
];

@Injectable()
export class CorridorsService {
  private readonly logger = new Logger(CorridorsService.name);

  constructor(
    @InjectRepository(CorridorEntity)
    private readonly corridorRepository: Repository<CorridorEntity>,
    @InjectRepository(CorridorIntersectionEntity)
    private readonly corridorIntersectionRepository: Repository<CorridorIntersectionEntity>,
    @InjectRepository(CorridorScenarioAssignmentEntity)
    private readonly scenarioAssignmentRepository: Repository<CorridorScenarioAssignmentEntity>,
    @InjectRepository(CorridorControlSessionEntity)
    private readonly controlSessionRepository: Repository<CorridorControlSessionEntity>,
    @InjectRepository(IntersectionEntity)
    private readonly intersectionRepository: Repository<IntersectionEntity>,
    @InjectRepository(ControllerEntity)
    private readonly controllerRepository: Repository<ControllerEntity>,
    @InjectRepository(OverrideCommandEntity)
    private readonly overrideRepository: Repository<OverrideCommandEntity>,
    private readonly runtime: IntersectionRuntimeService,
    private readonly trafficService: TrafficService,
  ) {}

  async listCorridors(): Promise<CorridorSummary[]> {
    const corridors = await this.corridorRepository.find({
      relations: { intersections: true, controlSessions: true },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(corridors.map((corridor) => this.toSummary(corridor)));
  }

  async getCorridor(corridorId: string): Promise<CorridorSummary> {
    const corridor = await this.findCorridorOrFail(corridorId);
    return this.toSummary(corridor);
  }

  async getRuntimeSnapshot(
    corridorId: string,
  ): Promise<CorridorRuntimeSnapshot> {
    const corridor = await this.findCorridorOrFail(corridorId);
    const summary = await this.toSummary(corridor);
    const ordered = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );

    const controllerByCode = await this.resolveControllerInfo(
      ordered.map((entry) => entry.intersectionCode),
    );

    const firstCycleSecond = ordered.length
      ? this.runtime.getState(ordered[0].intersectionCode).cycleSecond
      : 0;

    const intersections: CorridorIntersectionRuntimeView[] = ordered.map(
      (entry) => {
        let dispatchError: string | null = null;
        let state;
        try {
          state = this.runtime.getState(entry.intersectionCode);
        } catch (error) {
          dispatchError =
            error instanceof Error ? error.message : 'Runtime unavailable';
          state = null;
        }
        const controller = controllerByCode.get(entry.intersectionCode);
        return {
          orderIndex: entry.orderIndex,
          intersectionCode: entry.intersectionCode,
          name: controller?.intersectionName ?? null,
          controllerCode: controller?.controllerCode ?? null,
          controllerType: controller?.controllerType ?? null,
          controllerConnectionState:
            controller?.controllerConnectionState ?? null,
          activePhaseId: state?.activePhaseId ?? null,
          activePhaseLabel: state?.activePhaseLabel ?? '—',
          phaseState: state?.phaseState ?? 'idle',
          secondsIntoPhaseState: state?.secondsIntoPhaseState ?? 0,
          secondsRemainingInPhaseState:
            state?.secondsRemainingInPhaseState ?? 0,
          cycleSecond: state?.cycleSecond ?? 0,
          cycleSeconds: state?.cycleSeconds ?? 0,
          plannedOffsetSeconds: entry.plannedOffsetSeconds,
          effectiveOffsetSeconds: state
            ? (state.cycleSecond -
                firstCycleSecond +
                (state.cycleSeconds || 1)) %
              (state.cycleSeconds || 1)
            : 0,
          modeOverride: state?.commands.modeOverride ?? null,
          manualOverride: state?.commands.manualOverride ?? false,
          forcedPhaseId: state?.commands.forcedPhaseId ?? null,
          forcedDirection: state?.commands.forcedDirection ?? null,
          signalGroups:
            state?.signalGroups.map((group) => ({
              id: group.id,
              approachBearing: group.approachBearing,
              aspect: group.aspect,
            })) ?? [],
          dispatchError,
          updatedAt: state?.updatedAt ?? new Date().toISOString(),
        };
      },
    );

    const [activeSessions, recentSessions] = await Promise.all([
      this.listSessionViews(corridor.id, { activeOnly: true }),
      this.listSessionViews(corridor.id, { limit: 20 }),
    ]);

    const coordinationHealth = this.deriveCoordinationHealth(intersections);

    return {
      corridor: summary,
      intersections,
      activeSessions,
      recentSessions,
      coordinationHealth,
      updatedAt: new Date().toISOString(),
    };
  }

  async createCorridor(dto: CreateCorridorDto): Promise<CorridorSummary> {
    this.validateIntersectionList(
      dto.intersections.map((entry) => entry.intersectionCode),
    );

    const existing = await this.corridorRepository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Corridor code "${dto.code}" already exists.`,
      );
    }

    const corridor = await this.corridorRepository.save(
      this.corridorRepository.create({
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        city: dto.city ?? null,
        region: dto.region ?? null,
        projectId: dto.projectId ?? null,
        activeScenarioCode: 'normal_traffic',
      }),
    );

    const intersectionsByCode = await this.mapIntersectionsByCode(
      dto.intersections.map((entry) => entry.intersectionCode),
    );

    await this.corridorIntersectionRepository.save(
      dto.intersections.map((entry, index) =>
        this.corridorIntersectionRepository.create({
          corridorId: corridor.id,
          orderIndex: index,
          intersectionCode: entry.intersectionCode,
          intersectionId:
            intersectionsByCode.get(entry.intersectionCode)?.id ?? null,
          plannedOffsetSeconds: entry.plannedOffsetSeconds ?? 0,
          primaryBearing: entry.primaryBearing ?? null,
        }),
      ),
    );

    await this.seedScenarioAssignments(corridor.id);
    return this.getCorridor(corridor.id);
  }

  async addIntersections(
    corridorId: string,
    dto: AddCorridorIntersectionsDto,
  ): Promise<CorridorSummary> {
    const corridor = await this.findCorridorOrFail(corridorId);
    const existingCodes = new Set(
      corridor.intersections.map((entry) => entry.intersectionCode),
    );
    for (const entry of dto.intersections) {
      if (existingCodes.has(entry.intersectionCode)) {
        throw new BadRequestException(
          `Intersection "${entry.intersectionCode}" is already part of this corridor.`,
        );
      }
    }
    this.validateIntersectionList(
      dto.intersections.map((entry) => entry.intersectionCode),
    );

    const nextIndex = corridor.intersections.reduce(
      (max, entry) => Math.max(max, entry.orderIndex),
      -1,
    );
    const intersectionsByCode = await this.mapIntersectionsByCode(
      dto.intersections.map((entry) => entry.intersectionCode),
    );

    await this.corridorIntersectionRepository.save(
      dto.intersections.map((entry, index) =>
        this.corridorIntersectionRepository.create({
          corridorId: corridor.id,
          orderIndex: nextIndex + 1 + index,
          intersectionCode: entry.intersectionCode,
          intersectionId:
            intersectionsByCode.get(entry.intersectionCode)?.id ?? null,
          plannedOffsetSeconds: entry.plannedOffsetSeconds ?? 0,
          primaryBearing: entry.primaryBearing ?? null,
        }),
      ),
    );

    return this.getCorridor(corridor.id);
  }

  async activateScenario(
    corridorId: string,
    dto: ActivateCorridorScenarioDto,
    ipAddress: string | null,
  ): Promise<{
    session: CorridorControlSessionView;
    snapshot: CorridorRuntimeSnapshot;
  }> {
    const corridor = await this.findCorridorOrFail(corridorId);
    const ordered = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    if (ordered.length === 0) {
      throw new BadRequestException(
        'Corridor has no intersections — add at least two before activating a scenario.',
      );
    }

    const now = new Date();
    const isOutranking = OUTRANKING_SCENARIOS.includes(dto.scenarioCode);

    // If a lower-priority corridor session is running and the new scenario
    // is outranking, the new session implicitly supersedes the old ones.
    if (isOutranking) {
      await this.autoReleaseLowerPrioritySessions(corridor.id, now);
    }

    const session = await this.controlSessionRepository.save(
      this.controlSessionRepository.create({
        corridorId: corridor.id,
        controlKind: 'full_corridor',
        scenarioCode: dto.scenarioCode,
        reasonCode: dto.reasonCode,
        note: dto.note ?? null,
        status: 'active',
        dispatchLog: [],
        startedAt: now,
        expectedEndAt: dto.durationSeconds
          ? new Date(now.getTime() + dto.durationSeconds * 1000)
          : null,
        durationSeconds: dto.durationSeconds ?? null,
        outranksAi: isOutranking,
        operatorUserId: dto.operatorUserId ?? null,
      }),
    );

    const dispatchLog: DispatchResult[] = [];
    for (const entry of ordered) {
      const result = await this.applyScenarioToIntersection(
        entry,
        dto.scenarioCode,
      );
      dispatchLog.push(result);
      await this.writeOverrideAudit({
        intersectionCode: entry.intersectionCode,
        action:
          dto.scenarioCode === 'emergency_clear_path'
            ? OverrideAction.EMERGENCY
            : OverrideAction.MODE_CHANGE,
        reasonCode: REASON_TO_OVERRIDE_REASON[dto.reasonCode],
        note: `Corridor "${corridor.code}" scenario ${dto.scenarioCode}: ${dto.note ?? ''}`.trim(),
        durationSeconds: dto.durationSeconds ?? null,
        operatorUserId: dto.operatorUserId ?? null,
        ipAddress,
        payload: {
          corridorId: corridor.id,
          corridorCode: corridor.code,
          corridorSessionId: session.id,
          scenarioCode: dto.scenarioCode,
          success: result.success,
          error: result.error ?? null,
        },
        result: result.success
          ? OverrideResult.ACCEPTED
          : OverrideResult.REJECTED,
      });
    }

    session.dispatchLog = dispatchLog.map((entry) => ({
      intersectionCode: entry.intersectionCode,
      action: entry.action,
      at: new Date().toISOString(),
      success: entry.success,
      error: entry.error,
    }));
    await this.controlSessionRepository.save(session);

    corridor.activeScenarioCode = dto.scenarioCode;
    corridor.activeScenarioActivatedAt = now;
    corridor.activeScenarioActivatedByUserId = dto.operatorUserId ?? null;
    await this.corridorRepository.save(corridor);

    await this.scenarioAssignmentRepository
      .createQueryBuilder()
      .update()
      .set({ lastActivatedAt: now })
      .where('corridorId = :id', { id: corridor.id })
      .andWhere('scenarioCode = :code', { code: dto.scenarioCode })
      .execute();

    const snapshot = await this.getRuntimeSnapshot(corridor.id);
    const view = this.toSessionView(session);
    this.logger.log(
      `Corridor ${corridor.code} scenario ${dto.scenarioCode} dispatched to ${ordered.length} intersections.`,
    );
    return { session: view, snapshot };
  }

  async override(
    corridorId: string,
    dto: CorridorOverrideDto,
    ipAddress: string | null,
  ): Promise<{
    session: CorridorControlSessionView;
    snapshot: CorridorRuntimeSnapshot;
  }> {
    const corridor = await this.findCorridorOrFail(corridorId);
    const ordered = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    if (ordered.length === 0) {
      throw new BadRequestException(
        'Corridor has no intersections — cannot dispatch an override.',
      );
    }

    if (
      (dto.controlKind === 'single_intersection' ||
        dto.controlKind === 'direction_priority') &&
      !dto.targetIntersectionCode
    ) {
      throw new BadRequestException(
        `controlKind "${dto.controlKind}" requires "targetIntersectionCode".`,
      );
    }

    if (dto.controlKind === 'direction_priority' && !dto.targetBearing) {
      throw new BadRequestException(
        'Direction priority override requires "targetBearing".',
      );
    }

    if (dto.targetIntersectionCode) {
      const found = ordered.find(
        (entry) => entry.intersectionCode === dto.targetIntersectionCode,
      );
      if (!found) {
        throw new BadRequestException(
          `Intersection "${dto.targetIntersectionCode}" does not belong to this corridor.`,
        );
      }
    }

    const now = new Date();
    const isOutranking = OUTRANKING_CONTROL_KINDS.includes(dto.controlKind);

    if (isOutranking) {
      await this.autoReleaseLowerPrioritySessions(corridor.id, now);
    }

    const session = await this.controlSessionRepository.save(
      this.controlSessionRepository.create({
        corridorId: corridor.id,
        controlKind: dto.controlKind,
        targetIntersectionCode: dto.targetIntersectionCode ?? null,
        targetBearing: dto.targetBearing ?? null,
        reasonCode: dto.reasonCode,
        note: dto.note ?? null,
        status: 'active',
        startedAt: now,
        expectedEndAt: dto.durationSeconds
          ? new Date(now.getTime() + dto.durationSeconds * 1000)
          : null,
        durationSeconds: dto.durationSeconds ?? null,
        outranksAi: isOutranking,
        operatorUserId: dto.operatorUserId ?? null,
        dispatchLog: [],
      }),
    );

    const targetEntries = this.resolveTargetEntries(ordered, dto);
    const dispatchLog: DispatchResult[] = [];
    for (const entry of targetEntries) {
      const result = await this.applyOverrideToIntersection(entry, dto);
      dispatchLog.push(result);
      await this.writeOverrideAudit({
        intersectionCode: entry.intersectionCode,
        action: this.deriveOverrideAction(dto.controlKind),
        reasonCode: REASON_TO_OVERRIDE_REASON[dto.reasonCode],
        note: `Corridor "${corridor.code}" ${dto.controlKind}: ${dto.note ?? ''}`.trim(),
        durationSeconds: dto.durationSeconds ?? null,
        operatorUserId: dto.operatorUserId ?? null,
        ipAddress,
        payload: {
          corridorId: corridor.id,
          corridorCode: corridor.code,
          corridorSessionId: session.id,
          controlKind: dto.controlKind,
          targetBearing: dto.targetBearing ?? null,
          success: result.success,
          error: result.error ?? null,
        },
        result: result.success
          ? OverrideResult.ACCEPTED
          : OverrideResult.REJECTED,
      });
    }

    session.dispatchLog = dispatchLog.map((entry) => ({
      intersectionCode: entry.intersectionCode,
      action: entry.action,
      at: new Date().toISOString(),
      success: entry.success,
      error: entry.error,
    }));
    await this.controlSessionRepository.save(session);

    const snapshot = await this.getRuntimeSnapshot(corridor.id);
    const view = this.toSessionView(session);
    this.logger.log(
      `Corridor ${corridor.code} override ${dto.controlKind} dispatched (${targetEntries.length} intersections).`,
    );
    return { session: view, snapshot };
  }

  async releaseControl(
    corridorId: string,
    dto: ReleaseCorridorControlDto,
    ipAddress: string | null,
  ): Promise<{
    released: CorridorControlSessionView[];
    snapshot: CorridorRuntimeSnapshot;
  }> {
    const corridor = await this.findCorridorOrFail(corridorId);
    const ordered = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );

    const whereClause = dto.sessionId
      ? {
          id: dto.sessionId,
          corridorId: corridor.id,
          status: 'active' as CorridorControlStatus,
        }
      : { corridorId: corridor.id, status: 'active' as CorridorControlStatus };

    const sessions = await this.controlSessionRepository.find({
      where: whereClause,
      order: { startedAt: 'ASC' },
    });
    if (sessions.length === 0) {
      throw new NotFoundException(
        dto.sessionId
          ? `Active session "${dto.sessionId}" not found.`
          : 'No active corridor control sessions to release.',
      );
    }

    const now = new Date();
    const released: CorridorControlSessionView[] = [];

    for (const session of sessions) {
      session.status = 'released';
      session.releasedAt = now;
      session.releaseNote = dto.note ?? null;
      session.releasedByUserId = dto.operatorUserId ?? null;
      await this.controlSessionRepository.save(session);

      const targetEntries = this.resolveSessionTargets(ordered, session);
      for (const entry of targetEntries) {
        await this.releaseIntersection(entry.intersectionCode);
        await this.writeOverrideAudit({
          intersectionCode: entry.intersectionCode,
          action: OverrideAction.RELEASE,
          reasonCode: OverrideReasonCode.OTHER,
          note: `Corridor "${corridor.code}" release: ${dto.note ?? ''}`.trim(),
          durationSeconds: null,
          operatorUserId: dto.operatorUserId ?? null,
          ipAddress,
          payload: {
            corridorId: corridor.id,
            corridorCode: corridor.code,
            corridorSessionId: session.id,
            releasedControlKind: session.controlKind,
          },
          result: OverrideResult.RELEASED,
        });
      }
      released.push(this.toSessionView(session));
    }

    // After full release, return the corridor to its default scenario.
    const activeRemaining = await this.controlSessionRepository.count({
      where: { corridorId: corridor.id, status: 'active' },
    });
    if (
      activeRemaining === 0 &&
      corridor.activeScenarioCode !== 'normal_traffic'
    ) {
      corridor.activeScenarioCode = 'normal_traffic';
      corridor.activeScenarioActivatedAt = now;
      corridor.activeScenarioActivatedByUserId = dto.operatorUserId ?? null;
      await this.corridorRepository.save(corridor);
    }

    const snapshot = await this.getRuntimeSnapshot(corridor.id);
    this.logger.log(
      `Corridor ${corridor.code} release — ${released.length} session(s) closed.`,
    );
    return { released, snapshot };
  }

  private async findCorridorOrFail(
    corridorId: string,
  ): Promise<CorridorEntity> {
    const corridor = await this.corridorRepository.findOne({
      where: { id: corridorId },
      relations: { intersections: true },
    });
    if (!corridor) {
      throw new NotFoundException(`Corridor "${corridorId}" not found.`);
    }
    corridor.intersections = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    return corridor;
  }

  private validateIntersectionList(codes: string[]): void {
    const unique = new Set(codes);
    if (unique.size !== codes.length) {
      throw new BadRequestException(
        'Corridor intersection list contains duplicates.',
      );
    }
  }

  private async mapIntersectionsByCode(
    codes: string[],
  ): Promise<Map<string, IntersectionEntity>> {
    const map = new Map<string, IntersectionEntity>();
    if (codes.length === 0) return map;
    try {
      const rows = await this.intersectionRepository.find({
        where: { code: In(codes) },
      });
      for (const row of rows) {
        map.set(row.code, row);
      }
    } catch {
      /* DB missing or empty — fall through, corridor still usable with runtime */
    }
    return map;
  }

  private async resolveControllerInfo(intersectionCodes: string[]): Promise<
    Map<
      string,
      {
        intersectionName: string | null;
        controllerCode: string | null;
        controllerType: string | null;
        controllerConnectionState: string | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        intersectionName: string | null;
        controllerCode: string | null;
        controllerType: string | null;
        controllerConnectionState: string | null;
      }
    >();
    if (intersectionCodes.length === 0) return map;
    try {
      const rows = await this.intersectionRepository.find({
        where: { code: In(intersectionCodes) },
        relations: { controllers: true },
      });
      for (const row of rows) {
        const primary =
          row.controllers.find((controller) => controller.isPrimary) ??
          row.controllers[0] ??
          null;
        map.set(row.code, {
          intersectionName: row.name,
          controllerCode: primary?.code ?? null,
          controllerType: primary?.controllerType ?? null,
          controllerConnectionState: primary?.connectionState ?? null,
        });
      }
    } catch {
      /* DB missing — stay empty */
    }
    return map;
  }

  private async seedScenarioAssignments(corridorId: string): Promise<void> {
    const rows = CORRIDOR_SCENARIO_CODES.map((code) =>
      this.scenarioAssignmentRepository.create({
        corridorId,
        scenarioCode: code,
        payload: {},
      }),
    );
    await this.scenarioAssignmentRepository.save(rows);
  }

  private async applyScenarioToIntersection(
    entry: CorridorIntersectionEntity,
    scenarioCode: CorridorScenarioCode,
  ): Promise<DispatchResult> {
    try {
      switch (scenarioCode) {
        case 'normal_traffic':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'adaptive',
            false,
          );
          return {
            intersectionCode: entry.intersectionCode,
            action: 'mode:adaptive',
            success: true,
          };
        case 'peak_traffic':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'adaptive',
            false,
          );
          return {
            intersectionCode: entry.intersectionCode,
            action: 'mode:adaptive (peak)',
            success: true,
          };
        case 'police_diversion':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'manual',
            false,
          );
          if (entry.primaryBearing) {
            await this.trafficService.setIntersectionForcedGreen(
              entry.intersectionCode,
              entry.primaryBearing,
            );
          }
          return {
            intersectionCode: entry.intersectionCode,
            action: `mode:manual${entry.primaryBearing ? `+force-green:${entry.primaryBearing}` : ''}`,
            success: true,
          };
        case 'event_egress':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'fixed',
            false,
          );
          return {
            intersectionCode: entry.intersectionCode,
            action: 'mode:fixed',
            success: true,
          };
        case 'emergency_clear_path':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'emergency',
            true,
          );
          if (entry.primaryBearing) {
            await this.trafficService.setIntersectionForcedGreen(
              entry.intersectionCode,
              entry.primaryBearing,
            );
          }
          return {
            intersectionCode: entry.intersectionCode,
            action: `mode:emergency${entry.primaryBearing ? `+force-green:${entry.primaryBearing}` : ''}`,
            success: true,
          };
      }
    } catch (error) {
      return {
        intersectionCode: entry.intersectionCode,
        action: `scenario:${scenarioCode}`,
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private async applyOverrideToIntersection(
    entry: CorridorIntersectionEntity,
    dto: CorridorOverrideDto,
  ): Promise<DispatchResult> {
    try {
      switch (dto.controlKind) {
        case 'single_intersection':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'manual',
            false,
          );
          return {
            intersectionCode: entry.intersectionCode,
            action: 'mode:manual',
            success: true,
          };
        case 'full_corridor':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'manual',
            false,
          );
          if (entry.primaryBearing) {
            await this.trafficService.setIntersectionForcedGreen(
              entry.intersectionCode,
              entry.primaryBearing,
            );
          }
          return {
            intersectionCode: entry.intersectionCode,
            action: `mode:manual${entry.primaryBearing ? `+force-green:${entry.primaryBearing}` : ''}`,
            success: true,
          };
        case 'direction_priority': {
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'manual',
            false,
          );
          const bearing = dto.targetBearing ?? entry.primaryBearing ?? null;
          if (bearing) {
            await this.trafficService.setIntersectionForcedGreen(
              entry.intersectionCode,
              bearing,
            );
          }
          return {
            intersectionCode: entry.intersectionCode,
            action: `force-green:${bearing ?? 'unset'}`,
            success: true,
          };
        }
        case 'emergency_green_corridor':
          await this.trafficService.setIntersectionMode(
            entry.intersectionCode,
            'emergency',
            true,
          );
          if (entry.primaryBearing) {
            await this.trafficService.setIntersectionForcedGreen(
              entry.intersectionCode,
              entry.primaryBearing,
            );
          }
          return {
            intersectionCode: entry.intersectionCode,
            action: `mode:emergency${entry.primaryBearing ? `+force-green:${entry.primaryBearing}` : ''}`,
            success: true,
          };
      }
    } catch (error) {
      return {
        intersectionCode: entry.intersectionCode,
        action: `override:${dto.controlKind}`,
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private deriveOverrideAction(kind: CorridorControlKind): OverrideAction {
    switch (kind) {
      case 'emergency_green_corridor':
        return OverrideAction.EMERGENCY;
      case 'direction_priority':
        return OverrideAction.FORCE_GREEN;
      case 'full_corridor':
      case 'single_intersection':
      default:
        return OverrideAction.MODE_CHANGE;
    }
  }

  private resolveTargetEntries(
    ordered: CorridorIntersectionEntity[],
    dto: CorridorOverrideDto,
  ): CorridorIntersectionEntity[] {
    if (dto.controlKind === 'single_intersection') {
      return ordered.filter(
        (entry) => entry.intersectionCode === dto.targetIntersectionCode,
      );
    }
    if (
      dto.controlKind === 'direction_priority' &&
      dto.targetIntersectionCode
    ) {
      return ordered.filter(
        (entry) => entry.intersectionCode === dto.targetIntersectionCode,
      );
    }
    return ordered;
  }

  private resolveSessionTargets(
    ordered: CorridorIntersectionEntity[],
    session: CorridorControlSessionEntity,
  ): CorridorIntersectionEntity[] {
    if (
      session.targetIntersectionCode &&
      (session.controlKind === 'single_intersection' ||
        session.controlKind === 'direction_priority')
    ) {
      return ordered.filter(
        (entry) => entry.intersectionCode === session.targetIntersectionCode,
      );
    }
    return ordered;
  }

  private async releaseIntersection(intersectionCode: string): Promise<void> {
    try {
      await this.trafficService.setIntersectionForcedGreen(
        intersectionCode,
        null,
      );
      await this.trafficService.setIntersectionOverride(
        intersectionCode,
        false,
      );
      await this.trafficService.setIntersectionMode(
        intersectionCode,
        'adaptive',
        false,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to release intersection ${intersectionCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async autoReleaseLowerPrioritySessions(
    corridorId: string,
    at: Date,
  ): Promise<void> {
    const active = await this.controlSessionRepository.find({
      where: { corridorId, status: 'active' },
    });
    for (const session of active) {
      if (session.outranksAi) continue;
      session.status = 'expired';
      session.releasedAt = at;
      session.releaseNote = 'Superseded by higher-priority corridor action.';
      await this.controlSessionRepository.save(session);
    }
  }

  private async writeOverrideAudit(input: {
    intersectionCode: string;
    action: OverrideAction;
    reasonCode: OverrideReasonCode;
    note: string;
    durationSeconds: number | null;
    operatorUserId: string | null;
    ipAddress: string | null;
    payload: Record<string, unknown>;
    result: OverrideResult;
  }): Promise<void> {
    try {
      const intersection = await this.intersectionRepository
        .findOne({ where: { code: input.intersectionCode } })
        .catch(() => null);
      await this.overrideRepository.save(
        this.overrideRepository.create({
          action: input.action,
          reasonCode: input.reasonCode,
          note: input.note || null,
          result: input.result,
          durationSeconds: input.durationSeconds ?? null,
          payload: input.payload,
          ipAddress: input.ipAddress,
          issuedAt: new Date(),
          expiresAt: input.durationSeconds
            ? new Date(Date.now() + input.durationSeconds * 1000)
            : null,
          intersectionCode: input.intersectionCode,
          intersectionId: intersection?.id ?? null,
          operatorUserId: input.operatorUserId,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to write corridor override audit row: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async listSessionViews(
    corridorId: string,
    options: { activeOnly?: boolean; limit?: number } = {},
  ): Promise<CorridorControlSessionView[]> {
    const rows = await this.controlSessionRepository.find({
      where: {
        corridorId,
        ...(options.activeOnly ? { status: 'active' } : {}),
      },
      order: { startedAt: 'DESC' },
      take: options.limit ?? 50,
    });
    return rows.map((row) => this.toSessionView(row));
  }

  private toSessionView(
    row: CorridorControlSessionEntity,
  ): CorridorControlSessionView {
    return {
      id: row.id,
      corridorId: row.corridorId,
      controlKind: row.controlKind,
      targetIntersectionCode: row.targetIntersectionCode,
      targetBearing: row.targetBearing,
      scenarioCode: row.scenarioCode,
      reasonCode: row.reasonCode,
      note: row.note,
      releaseNote: row.releaseNote,
      status: row.status,
      dispatchLog: row.dispatchLog ?? [],
      startedAt: row.startedAt.toISOString(),
      expectedEndAt: row.expectedEndAt ? row.expectedEndAt.toISOString() : null,
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      durationSeconds: row.durationSeconds,
      outranksAi: row.outranksAi,
      operatorUserId: row.operatorUserId,
      releasedByUserId: row.releasedByUserId,
    };
  }

  private async toSummary(corridor: CorridorEntity): Promise<CorridorSummary> {
    const intersections = [...corridor.intersections].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const controllerByCode = await this.resolveControllerInfo(
      intersections.map((entry) => entry.intersectionCode),
    );
    const activeSessions = await this.controlSessionRepository.find({
      where: { corridorId: corridor.id, status: 'active' },
      select: ['id'],
    });

    const summaries: CorridorIntersectionSummary[] = intersections.map(
      (entry) => {
        const controller = controllerByCode.get(entry.intersectionCode);
        return {
          id: entry.id,
          orderIndex: entry.orderIndex,
          intersectionCode: entry.intersectionCode,
          intersectionId: entry.intersectionId,
          plannedOffsetSeconds: entry.plannedOffsetSeconds,
          primaryBearing: entry.primaryBearing,
          name: controller?.intersectionName ?? null,
          controllerCode: controller?.controllerCode ?? null,
          controllerType: controller?.controllerType ?? null,
          controllerConnectionState:
            controller?.controllerConnectionState ?? null,
          city: corridor.city,
          district: null,
        };
      },
    );

    return {
      id: corridor.id,
      code: corridor.code,
      name: corridor.name,
      description: corridor.description,
      city: corridor.city,
      region: corridor.region,
      projectId: corridor.projectId,
      activeScenarioCode: corridor.activeScenarioCode,
      activeScenarioActivatedAt: corridor.activeScenarioActivatedAt
        ? corridor.activeScenarioActivatedAt.toISOString()
        : null,
      activeScenarioActivatedByUserId: corridor.activeScenarioActivatedByUserId,
      intersections: summaries,
      availableScenarioCodes: [...CORRIDOR_SCENARIO_CODES],
      activeControlSessionIds: activeSessions.map((row) => row.id),
      createdAt: corridor.createdAt.toISOString(),
      updatedAt: corridor.updatedAt.toISOString(),
    };
  }

  private deriveCoordinationHealth(
    views: CorridorIntersectionRuntimeView[],
  ): 'aligned' | 'drifting' | 'unknown' {
    if (views.length === 0) return 'unknown';
    const withCycles = views.filter(
      (view) => view.cycleSeconds > 0 && !view.dispatchError,
    );
    if (withCycles.length === 0) return 'unknown';
    const maxDrift = withCycles.reduce((acc, view) => {
      const drift = Math.abs(
        view.effectiveOffsetSeconds - view.plannedOffsetSeconds,
      );
      return Math.max(acc, drift);
    }, 0);
    return maxDrift <= 3 ? 'aligned' : 'drifting';
  }

  async ensureDemoSeed(): Promise<void> {
    const count = await this.corridorRepository.count().catch(() => -1);
    if (count === -1) return;
    if (count > 0) return;

    const intersections = await this.intersectionRepository
      .find({ take: 8, order: { code: 'ASC' } })
      .catch(() => [] as IntersectionEntity[]);
    if (intersections.length < 2) return;

    const corridor = await this.corridorRepository.save(
      this.corridorRepository.create({
        code: 'cor-demo-01',
        name: 'Demo Corridor — Casablanca CBD',
        description:
          'Auto-seeded demo corridor spanning the first pilot intersections.',
        city: 'Casablanca',
        region: 'Casablanca-Settat',
        activeScenarioCode: 'normal_traffic',
      }),
    );

    const primaryBearings: Array<'N' | 'E' | 'S' | 'W'> = ['E', 'E', 'E', 'E'];
    const subset = intersections.slice(0, Math.min(4, intersections.length));
    await this.corridorIntersectionRepository.save(
      subset.map((intersection, index) =>
        this.corridorIntersectionRepository.create({
          corridorId: corridor.id,
          orderIndex: index,
          intersectionCode: intersection.code,
          intersectionId: intersection.id,
          plannedOffsetSeconds: index * 12,
          primaryBearing:
            primaryBearings[index % primaryBearings.length] ?? 'E',
        }),
      ),
    );
    await this.seedScenarioAssignments(corridor.id);
    this.logger.log(`Seeded demo corridor ${corridor.code}.`);
  }
}

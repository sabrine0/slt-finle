import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { CitiesService } from '../cities/cities.service';
import appConfig from '../config/app.config';
import { IntersectionsService } from '../intersections/intersections.service';
import { TrafficControlExecutionService } from '../traffic-control/traffic-control-execution.service';
import { ZonesService } from '../zones/zones.service';
import { AgentEventBusService } from './agent-event-bus.service';
import { AgentRunsService, type AgentRunRecord } from './agent-runs.service';
import { AgentRuntimeService } from './agent-runtime.service';
import type { AgentRunResult } from './agent.types';

/**
 * AgentSchedulerService — turns the agent runtime into a continuous
 * loop. Every TICK_MS it runs three phases in order:
 *
 *   PHASE 1 (city)         — one run per active city.
 *   PHASE 2 (zone)         — one run per zone with at least one
 *                            intersection in topology.
 *   PHASE 3 (intersection) — diving runs for every intersection the
 *                            city / zone agents flagged as actionable
 *                            (`actionableIntersectionCodes` payload),
 *                            capped at INTERSECTION_TICK_CAP per tick
 *                            so a busy network can't starve the loop.
 *
 * Each phase persists every AgentRunResult, publishes events, and
 * forwards executable decisions to the traffic-control execution
 * service (which queues them for the hardware runtime).
 *
 * The loop is non-overlapping per (scope, ref): a long-running city
 * tick skips the same city next time round rather than queueing.
 * Initial run is delayed by INITIAL_DELAY_MS so the app finishes
 * booting before the first scrape kicks in.
 */

const TICK_MS = 30_000;
const INITIAL_DELAY_MS = 5_000;
const DEFAULT_CITY_TICK_CAP = 8;
const DEFAULT_ZONE_TICK_CAP = 18;
const DEFAULT_INTERSECTION_TICK_CAP = 24;
// Scope runs are DB-heavy (each persists a run, publishes events and
// queues commands).  The dev/default datastore is single-writer, so
// firing a whole phase at once with Promise.all pushed 50 concurrent
// write chains at it and wedged the pool — which is why the scheduler
// ended up disabled.  Run each phase through a bounded worker pool.
const DEFAULT_SCOPE_CONCURRENCY = 4;

@Injectable()
export class AgentSchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  private tickInFlight = false;
  private skippedTicks = 0;
  private cycleNumber = 0;
  private readonly enabled: boolean;
  private readonly cityTickCap: number;
  private readonly zoneTickCap: number;
  private readonly intersectionTickCap: number;
  private readonly verboseScopeLogs: boolean;
  private readonly scopeConcurrency: number;
  private cityCursor = 0;
  private zoneCursor = 0;
  private intersectionCursor = 0;

  constructor(
    private readonly runtime: AgentRuntimeService,
    private readonly runs: AgentRunsService,
    private readonly events: AgentEventBusService,
    private readonly execution: TrafficControlExecutionService,
    private readonly cities: CitiesService,
    private readonly zones: ZonesService,
    private readonly intersections: IntersectionsService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {
    // Tied to the existing dev/test toggles so CI and unit tests stay
    // quiet by default. In production / dev the loop runs.
    this.enabled = this.resolveEnabled();
    this.cityTickCap = readPositiveInt(
      'AGENT_SCHEDULER_CITY_CAP',
      DEFAULT_CITY_TICK_CAP,
    );
    this.zoneTickCap = readPositiveInt(
      'AGENT_SCHEDULER_ZONE_CAP',
      DEFAULT_ZONE_TICK_CAP,
    );
    this.intersectionTickCap = readPositiveInt(
      'AGENT_SCHEDULER_INTERSECTION_CAP',
      DEFAULT_INTERSECTION_TICK_CAP,
    );
    this.verboseScopeLogs = readBoolean('AGENT_SCHEDULER_VERBOSE_SCOPES', true);
    this.scopeConcurrency = readPositiveInt(
      'AGENT_SCHEDULER_CONCURRENCY',
      DEFAULT_SCOPE_CONCURRENCY,
    );
  }

  /**
   * Started explicitly from `bootstrap()` once the HTTP server is
   * listening — NOT from a lifecycle hook.  `onModuleInit` fires before
   * the `onApplicationBootstrap` seeders (database seed + traffic-graph
   * carrefour sync), so arming there put a DB-heavy 30s loop in direct
   * contention with startup seeding.  On a single-writer datastore that
   * starved the boot and the app never reached `app.listen()`.
   */
  start() {
    if (!this.enabled) {
      this.logger.log('Agent scheduler disabled by config — not starting.');
      return;
    }
    if (this.timer || this.initialTimer) return;
    this.logger.log(
      `Agent scheduler armed — first cycle in ${INITIAL_DELAY_MS / 1000}s, then every ${TICK_MS / 1000}s.`,
    );
    this.initialTimer = setTimeout(() => {
      void this.tick().catch((err) => this.logTickError(err));
      this.timer = setInterval(() => {
        void this.tick().catch((err) => this.logTickError(err));
      }, TICK_MS);
    }, INITIAL_DELAY_MS);
  }

  onModuleDestroy() {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Manual tick — exposed for tests / on-demand triggers. */
  async runOnce(): Promise<number> {
    return this.tick();
  }

  private async tick(): Promise<number> {
    // A full cycle can outlast TICK_MS on a large network or a slow
    // datastore.  Per-(scope,ref) guards stop duplicate scope work but
    // not duplicate cycles, so overlapping ticks still re-ran the three
    // list queries and piled DB load on an already-lagging cycle.  Skip
    // the tick outright while one is still running.
    if (this.tickInFlight) {
      this.skippedTicks += 1;
      return 0;
    }
    this.tickInFlight = true;
    try {
      return await this.runCycle();
    } finally {
      this.tickInFlight = false;
    }
  }

  private async runCycle(): Promise<number> {
    this.cycleNumber += 1;
    const cycle = this.cycleNumber;
    const start = Date.now();

    // ── PHASE 1: city scope ───────────────────────────────────────
    let activeCityIds: string[] = [];
    try {
      const allCities = await this.cities.list();
      activeCityIds = takeRoundRobinWindow(
        allCities
          .filter((city) => city.intersectionCount > 0)
          .sort((left, right) => {
            const scoreDelta =
              scoreScopeRisk(
                right.incidentCount,
                right.averageDelaySeconds,
                right.tone,
              ) -
              scoreScopeRisk(
                left.incidentCount,
                left.averageDelaySeconds,
                left.tone,
              );
            if (scoreDelta !== 0) return scoreDelta;
            return left.name.localeCompare(right.name);
          })
          .map((city) => city.id),
        this.cityTickCap,
        this.cityCursor,
        (next) => {
          this.cityCursor = next;
        },
      );
    } catch (err) {
      this.logger.warn(
        `Cycle #${cycle} could not list cities: ${(err as Error).message}`,
      );
    }

    const cityRecords = await this.mapScopes(activeCityIds, (cityId) =>
      this.runScope('city', cityId, cycle),
    );

    // ── PHASE 2: zone scope ───────────────────────────────────────
    let activeZoneIds: string[] = [];
    try {
      const allZones = await this.zones.list();
      activeZoneIds = takeRoundRobinWindow(
        allZones
          .filter((zone) => zone.intersectionCount > 0)
          .sort((left, right) => {
            const scoreDelta =
              scoreScopeRisk(
                right.incidentCount,
                right.averageDelaySeconds,
                right.tone,
              ) -
              scoreScopeRisk(
                left.incidentCount,
                left.averageDelaySeconds,
                left.tone,
              );
            if (scoreDelta !== 0) return scoreDelta;
            return left.name.localeCompare(right.name);
          })
          .map((zone) => zone.id),
        this.zoneTickCap,
        this.zoneCursor,
        (next) => {
          this.zoneCursor = next;
        },
      );
    } catch (err) {
      this.logger.warn(
        `Cycle #${cycle} could not list zones: ${(err as Error).message}`,
      );
    }

    const zoneRecords = await this.mapScopes(activeZoneIds, (zoneId) =>
      this.runScope('zone', zoneId, cycle),
    );

    // ── PHASE 3: actionable intersections ─────────────────────────
    let rankedIntersectionCodes: string[] = [];
    try {
      const allIntersections = await this.intersections.list();
      rankedIntersectionCodes = allIntersections
        .sort((left, right) => {
          const scoreDelta =
            scoreIntersectionRisk(right) - scoreIntersectionRisk(left);
          if (scoreDelta !== 0) return scoreDelta;
          return left.code.localeCompare(right.code);
        })
        .map((intersection) => intersection.code);
    } catch (err) {
      this.logger.warn(
        `Cycle #${cycle} could not list intersections: ${(err as Error).message}`,
      );
    }

    const actionable = collectActionableIntersectionCodes(
      [...cityRecords, ...zoneRecords].filter(
        (record): record is AgentRunRecord => record != null,
      ),
    );
    const selectedIntersectionCodes = selectIntersectionWindow(
      actionable,
      rankedIntersectionCodes,
      this.intersectionTickCap,
      this.intersectionCursor,
      (next) => {
        this.intersectionCursor = next;
      },
    );

    const intersectionRecords = await this.mapScopes(
      selectedIntersectionCodes,
      (code) => this.runScope('intersection', code, cycle),
    );

    const cityPersisted = cityRecords.filter((r) => r != null).length;
    const zonePersisted = zoneRecords.filter((r) => r != null).length;
    const interPersisted = intersectionRecords.filter((r) => r != null).length;
    const total = cityPersisted + zonePersisted + interPersisted;
    const skipped = this.skippedTicks;
    this.skippedTicks = 0;
    this.logger.log(
      `Cycle #${cycle} → city=${cityPersisted}/${activeCityIds.length} ` +
        `zone=${zonePersisted}/${activeZoneIds.length} ` +
        `intersection=${interPersisted}/${selectedIntersectionCodes.length} ` +
        `(cap=${this.intersectionTickCap}) in ${Date.now() - start} ms` +
        (skipped > 0 ? `, ${skipped} overlapping tick(s) skipped.` : '.'),
    );
    return total;
  }

  /**
   * Bounded-concurrency map over a phase's scope refs.  Preserves input
   * order in the result array so the caller's counting stays accurate.
   */
  private async mapScopes(
    refs: string[],
    run: (ref: string) => Promise<AgentRunRecord | null>,
  ): Promise<(AgentRunRecord | null)[]> {
    const results: (AgentRunRecord | null)[] = new Array<AgentRunRecord | null>(
      refs.length,
    ).fill(null);
    if (refs.length === 0) return results;
    const width = Math.max(1, Math.min(this.scopeConcurrency, refs.length));
    let cursor = 0;
    const workers = Array.from({ length: width }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= refs.length) return;
        results[index] = await run(refs[index]);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /**
   * Single scope tick. Skips when a previous run for the same
   * (scope, ref) is still in flight; logs and swallows runtime
   * failures so one bad scope cannot break the cycle.
   */
  private async runScope(
    scope: 'city' | 'zone' | 'intersection',
    scopeRef: string,
    cycle: number,
  ): Promise<AgentRunRecord | null> {
    const inflightKey = `${scope}:${scopeRef}`;
    if (this.inFlight.has(inflightKey)) {
      return null;
    }
    this.inFlight.add(inflightKey);
    try {
      const result = await this.runtime.execute(scope, scopeRef, {
        horizon: 'H+15',
      });
      const record = await this.runs.record(result, 'scheduled');
      this.events.publishRun({ result, trigger: 'scheduled' });
      const commands = await this.execution.execute(result, {
        agentRunId: record.id,
      });
      if (this.verboseScopeLogs) {
        this.logger.log(
          `Cycle #${cycle} executed ${scope}=${scopeRef} → severity=${result.aggregatedSeverity} ` +
            `final=${result.finalRecommendation?.kind ?? 'none'} commands=${commands.length}`,
        );
      }
      return record;
    } catch (err) {
      this.logger.warn(
        `Cycle #${cycle} ${scope}=${scopeRef} failed: ${(err as Error).message}`,
      );
      return null;
    } finally {
      this.inFlight.delete(inflightKey);
    }
  }

  private logTickError(err: unknown) {
    this.logger.error(
      `Scheduler tick crashed: ${(err as Error).message}`,
      (err as Error).stack,
    );
  }

  private resolveEnabled(): boolean {
    const env = process.env.AGENT_SCHEDULER_ENABLED;
    if (env === '0' || env?.toLowerCase() === 'false') return false;
    return true;
  }
}

/**
 * Walk every just-completed city/zone run and collect the
 * intersection codes the city-traffic-manager flagged as actionable
 * (`payload.actionableIntersectionCodes`). Dedupes while preserving
 * the first-seen order, which keeps higher-saturation hotspots
 * (emitted first by the agent) at the front when the cap kicks in.
 */
function collectActionableIntersectionCodes(
  records: AgentRunRecord[],
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const codes = pickActionableCodes(record);
    for (const code of codes) {
      if (typeof code !== 'string' || code.length === 0) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      ordered.push(code);
    }
  }
  return ordered;
}

function pickActionableCodes(result: AgentRunResult): string[] {
  for (const output of result.outputs) {
    if (output.agentId !== 'city-traffic-manager') continue;
    const payload = output.decision?.payload;
    if (!payload) continue;
    const value = payload['actionableIntersectionCodes'];
    if (Array.isArray(value)) return value as string[];
  }
  return [];
}

function takeRoundRobinWindow<T>(
  items: T[],
  cap: number,
  cursor: number,
  setCursor: (next: number) => void,
): T[] {
  if (items.length === 0 || cap <= 0) {
    setCursor(0);
    return [];
  }
  if (cap >= items.length) {
    setCursor(0);
    return [...items];
  }
  const start = cursor % items.length;
  const out: T[] = [];
  for (let offset = 0; offset < cap; offset += 1) {
    out.push(items[(start + offset) % items.length]);
  }
  setCursor((start + cap) % items.length);
  return out;
}

function selectIntersectionWindow(
  actionable: string[],
  rankedIntersectionCodes: string[],
  cap: number,
  cursor: number,
  setCursor: (next: number) => void,
): string[] {
  if (cap <= 0) {
    setCursor(0);
    return [];
  }
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const code of actionable) {
    if (seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
    if (ordered.length >= cap) {
      setCursor(cursor);
      return ordered;
    }
  }

  const coveragePool = rankedIntersectionCodes.filter(
    (code) => !seen.has(code),
  );
  const coverage = takeRoundRobinWindow(
    coveragePool,
    cap - ordered.length,
    cursor,
    setCursor,
  );
  for (const code of coverage) {
    if (seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
  }
  return ordered;
}

function scoreScopeRisk(
  incidentCount: number,
  averageDelaySeconds: number,
  tone: 'healthy' | 'watch' | 'critical',
) {
  const toneWeight = tone === 'critical' ? 120 : tone === 'watch' ? 60 : 0;
  return incidentCount * 25 + averageDelaySeconds * 1.3 + toneWeight;
}

function scoreIntersectionRisk(intersection: {
  incidents: number;
  averageDelaySeconds: number;
  queueLength: number;
  status: string;
  controlMode: string;
  controllerConnectionState: string | null;
}) {
  let score =
    intersection.incidents * 40 +
    intersection.averageDelaySeconds * 1.4 +
    intersection.queueLength * 2.2;
  if (intersection.status === 'critical') score += 120;
  else if (intersection.status === 'watch') score += 60;
  if (
    intersection.controlMode === 'manual' ||
    intersection.controlMode === 'flash'
  ) {
    score += 45;
  }
  if (intersection.controllerConnectionState === 'offline') score += 70;
  else if (intersection.controllerConnectionState === 'degraded') score += 35;
  return score;
}

function readPositiveInt(envKey: string, fallback: number) {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function readBoolean(envKey: string, fallback: boolean) {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

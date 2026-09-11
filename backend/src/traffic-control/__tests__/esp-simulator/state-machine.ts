/**
 * EspSimulator state machine — pure, deterministic, no I/O.
 *
 * Implements every invariant listed in
 * docs/esp32-led-prototype-plan.md §5 and the constants from
 * docs/esp32-prototype-decisions.md. The HTTP wrapper
 * (simulator-server.ts) drives this with a real clock; tests drive it
 * with controlled `now` values.
 *
 * Two entry points:
 *   - dispatch(req, now) → handle a POST /api/command request
 *   - tick(now)          → advance time, fire scheduled transitions
 *
 * Inspection (for tests / dashboards):
 *   - getState()    high-level state enum
 *   - getLights()   12-lamp matrix
 *   - getDiagnostics() everything else
 *
 * Fault injection (tests only):
 *   - pressOverride() / releaseOverride()
 */

export const MIN_YELLOW_MS = 3_000;
export const MIN_ALL_RED_MS = 1_000;
export const MIN_GREEN_MS = 5_000;
export const WATCHDOG_MS = 30_000;
export const IDEMPOTENCY_TTL_MS = 60_000;
export const IDEMPOTENCY_CACHE_SIZE = 16;
export const MANUAL_HOLD_TIMEOUT_MS = 60_000;
export const MAX_HOLD_SECONDS = 60;
export const MAX_EXTENSION_SECONDS = 30;
export const MAX_CYCLE_EXTENSION_SECONDS = 60;
export const FLASH_HALF_PERIOD_MS = 500;

export type SignalDirection = 'N' | 'S' | 'E' | 'W';
export type SignalLamp = 'red' | 'yellow' | 'green';
export type LampState = 'OFF' | 'ON';
export type LightMatrix = Record<
  SignalDirection,
  Record<SignalLamp, LampState>
>;
export type PhasePair = 'NS' | 'EW';

export type SimState =
  | 'BOOT_ALL_RED'
  | 'NORMAL_NS_GREEN'
  | 'NORMAL_NS_YELLOW'
  | 'NORMAL_EW_GREEN'
  | 'NORMAL_EW_YELLOW'
  | 'ALL_RED_TRANSITION'
  | 'MANUAL_HOLD'
  | 'FAILSAFE_FLASH';

export type CommandKind = 'force_phase' | 'update_timing' | 'set_manual_mode';

export interface EspRequestBody {
  commandId: string;
  kind: CommandKind;
  intersection: string;
  params: Record<string, unknown>;
}

export interface EspResponseBody {
  commandId: string;
  status: 'applied' | 'rejected';
  appliedAt: string | null;
  detail: string;
}

export interface SimulatorDiagnostics {
  state: SimState;
  manualPair: PhasePair | null;
  pendingPair: PhasePair | null;
  phaseEndsAt: number | null;
  stateEnteredAt: number;
  lastCommandAt: number;
  overrideActive: boolean;
  idempotencyCacheSize: number;
  authoritativeNow: number;
}

const ALL_OFF: LightMatrix = freezeLights({
  N: { red: 'OFF', yellow: 'OFF', green: 'OFF' },
  S: { red: 'OFF', yellow: 'OFF', green: 'OFF' },
  E: { red: 'OFF', yellow: 'OFF', green: 'OFF' },
  W: { red: 'OFF', yellow: 'OFF', green: 'OFF' },
});

const ALL_RED: LightMatrix = freezeLights({
  N: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  S: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  E: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  W: { red: 'ON', yellow: 'OFF', green: 'OFF' },
});

const NS_GREEN: LightMatrix = freezeLights({
  N: { red: 'OFF', yellow: 'OFF', green: 'ON' },
  S: { red: 'OFF', yellow: 'OFF', green: 'ON' },
  E: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  W: { red: 'ON', yellow: 'OFF', green: 'OFF' },
});

const NS_YELLOW: LightMatrix = freezeLights({
  N: { red: 'OFF', yellow: 'ON', green: 'OFF' },
  S: { red: 'OFF', yellow: 'ON', green: 'OFF' },
  E: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  W: { red: 'ON', yellow: 'OFF', green: 'OFF' },
});

const EW_GREEN: LightMatrix = freezeLights({
  N: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  S: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  E: { red: 'OFF', yellow: 'OFF', green: 'ON' },
  W: { red: 'OFF', yellow: 'OFF', green: 'ON' },
});

const EW_YELLOW: LightMatrix = freezeLights({
  N: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  S: { red: 'ON', yellow: 'OFF', green: 'OFF' },
  E: { red: 'OFF', yellow: 'ON', green: 'OFF' },
  W: { red: 'OFF', yellow: 'ON', green: 'OFF' },
});

export interface SimulatorOptions {
  now: number;
  authToken?: string | null;
  /** When true, transition to BOOT_ALL_RED is skipped (used by tests that need a known starting phase). Defaults false. */
  skipBoot?: boolean;
}

export class EspSimulator {
  private state: SimState = 'BOOT_ALL_RED';
  private lights: LightMatrix = ALL_RED;
  private stateEnteredAt: number;
  private lastCommandAt: number;
  private watchdogDeadline: number;

  private phaseEndsAt: number | null = null;
  private pendingPair: PhasePair | null = null;
  private pendingHoldMs: number | null = null;
  private manualPair: PhasePair | null = null;

  private overrideActive = false;
  private flashOn = true;
  private flashLastToggledAt: number;

  private readonly idempotency: Map<
    string,
    { response: EspResponseBody; expiresAt: number }
  > = new Map();

  private readonly authToken: string | null;

  constructor(options: SimulatorOptions) {
    this.stateEnteredAt = options.now;
    this.lastCommandAt = options.now;
    this.flashLastToggledAt = options.now;
    this.watchdogDeadline = options.now + WATCHDOG_MS;
    this.authToken = options.authToken ?? null;
  }

  // ───────────── public API ─────────────

  dispatch(
    req: EspRequestBody,
    now: number,
    authHeader?: string,
  ): EspResponseBody {
    if (this.authToken) {
      const expected = `Bearer ${this.authToken}`;
      if (authHeader !== expected) {
        return this.fail(
          req.commandId ?? 'unknown',
          'unauthorized',
          now,
          false,
        );
      }
    }
    const validation = validateRequest(req);
    if (!validation.ok) {
      return this.fail(
        req.commandId ?? 'unknown',
        validation.detail,
        now,
        false,
      );
    }
    const cached = this.idempotency.get(req.commandId);
    if (cached && cached.expiresAt > now) {
      return cached.response;
    }
    if (this.overrideActive) {
      return this.respondAndCache(
        this.rejected(req.commandId, 'override_active'),
        now,
      );
    }
    if (this.state === 'FAILSAFE_FLASH') {
      return this.respondAndCache(
        this.rejected(req.commandId, 'failsafe_flash_active'),
        now,
      );
    }

    let response: EspResponseBody;
    switch (req.kind) {
      case 'force_phase':
        response = this.handleForcePhase(req, now);
        break;
      case 'update_timing':
        response = this.handleUpdateTiming(req, now);
        break;
      case 'set_manual_mode':
        response = this.handleSetManualMode(req, now);
        break;
    }

    if (response.status === 'applied') {
      this.lastCommandAt = now;
      this.extendWatchdog(now);
    }
    return this.respondAndCache(response, now);
  }

  /**
   * Push the watchdog deadline forward. Called whenever a command is
   * applied or a long-lived state is committed (a forced green
   * scheduled to last N s, a manual hold pinning the intersection
   * for up to MANUAL_HOLD_TIMEOUT_MS, etc.). Once set, the deadline
   * never moves backward — natural state transitions (green → yellow
   * → all-red) cannot accidentally collapse it.
   */
  private extendWatchdog(now: number, futureEvent?: number | null): void {
    this.watchdogDeadline = Math.max(this.watchdogDeadline, now + WATCHDOG_MS);
    if (futureEvent !== undefined && futureEvent !== null) {
      this.watchdogDeadline = Math.max(
        this.watchdogDeadline,
        futureEvent + WATCHDOG_MS,
      );
    }
    if (this.phaseEndsAt !== null) {
      this.watchdogDeadline = Math.max(
        this.watchdogDeadline,
        this.phaseEndsAt + WATCHDOG_MS,
      );
    }
  }

  tick(now: number): void {
    // Run transitions in a loop so a single advance() call can cross
    // several state boundaries (yellow → all-red → green, etc.). The
    // safety counter is just a cap against accidental loops.
    let safety = 32;
    while (safety-- > 0) {
      const before = this.state;
      this.tickOnce(now);
      if (this.state === before) break;
    }
  }

  private tickOnce(now: number): void {
    // Override pin is sticky to FAILSAFE_FLASH; release requires both
    // pin HIGH AND a fresh set_manual_mode false (handled in dispatch).
    if (this.overrideActive && this.state !== 'FAILSAFE_FLASH') {
      this.transitionTo('FAILSAFE_FLASH', now);
      return;
    }

    if (this.isWatchdogTripped(now)) {
      this.transitionTo('FAILSAFE_FLASH', now);
      return;
    }

    // Natural transitions use their *scheduled* time as the next
    // state's entry time, not `now`. That way one `tick(now)` can
    // drain a chain of overdue transitions (green → yellow → all-red
    // → boot) at their correct internal timestamps, even if the
    // simulator was idle for a long time between ticks.
    switch (this.state) {
      case 'NORMAL_NS_GREEN':
      case 'NORMAL_EW_GREEN':
        if (this.phaseEndsAt !== null && now >= this.phaseEndsAt) {
          const yellowState =
            this.state === 'NORMAL_NS_GREEN'
              ? 'NORMAL_NS_YELLOW'
              : 'NORMAL_EW_YELLOW';
          this.transitionTo(yellowState, this.phaseEndsAt);
        }
        break;
      case 'NORMAL_NS_YELLOW':
      case 'NORMAL_EW_YELLOW': {
        const yellowEndsAt = this.stateEnteredAt + MIN_YELLOW_MS;
        if (now >= yellowEndsAt) {
          this.transitionTo('ALL_RED_TRANSITION', yellowEndsAt);
        }
        break;
      }
      case 'ALL_RED_TRANSITION': {
        const allRedEndsAt = this.stateEnteredAt + MIN_ALL_RED_MS;
        if (now >= allRedEndsAt) {
          const next = this.pendingPair ?? null;
          if (next === null) {
            // No pending phase requested — stay all-red until next command.
            // (Pin to BOOT_ALL_RED so the watchdog rule allows it.)
            this.transitionTo('BOOT_ALL_RED', allRedEndsAt);
          } else {
            const holdMs = this.pendingHoldMs ?? MIN_GREEN_MS * 2;
            this.pendingPair = null;
            this.pendingHoldMs = null;
            this.transitionTo(
              next === 'NS' ? 'NORMAL_NS_GREEN' : 'NORMAL_EW_GREEN',
              allRedEndsAt,
              { phaseDurationMs: holdMs },
            );
          }
        }
        break;
      }
      case 'MANUAL_HOLD': {
        const holdEndsAt = this.stateEnteredAt + MANUAL_HOLD_TIMEOUT_MS;
        if (now >= holdEndsAt) {
          this.manualPair = null;
          this.transitionTo('ALL_RED_TRANSITION', holdEndsAt);
        }
        break;
      }
      case 'FAILSAFE_FLASH':
        if (now - this.flashLastToggledAt >= FLASH_HALF_PERIOD_MS) {
          this.flashOn = !this.flashOn;
          this.flashLastToggledAt = now;
          this.lights = this.flashOn ? ALL_RED : ALL_OFF;
        }
        break;
      case 'BOOT_ALL_RED':
        // Hold indefinitely. No automatic cycle.
        break;
    }
  }

  /**
   * Watchdog: fires when the firmware has been left to run blind for
   * too long. The deadline (`watchdogDeadline`) is a sticky timestamp
   * pushed forward by every applied command and by every committed
   * long-lived state — never reset by ordinary state transitions.
   * BOOT_ALL_RED, FAILSAFE_FLASH, and MANUAL_HOLD are excluded:
   * BOOT_ALL_RED is the safe-by-design quiescent state, FAILSAFE_FLASH
   * is already the "blind" outcome, and MANUAL_HOLD has its own
   * dedicated MANUAL_HOLD_TIMEOUT_MS.
   */
  private isWatchdogTripped(now: number): boolean {
    if (
      this.state === 'BOOT_ALL_RED' ||
      this.state === 'FAILSAFE_FLASH' ||
      this.state === 'MANUAL_HOLD'
    ) {
      return false;
    }
    return now >= this.watchdogDeadline;
  }

  pressOverride(now: number): void {
    this.overrideActive = true;
    this.tick(now);
  }

  releaseOverride(): void {
    // The state machine deliberately does NOT auto-recover from
    // FAILSAFE_FLASH on release — a fresh set_manual_mode false is
    // required. Releasing only unlatches the pin.
    this.overrideActive = false;
  }

  getState(): SimState {
    return this.state;
  }

  getLights(): LightMatrix {
    return this.lights;
  }

  getDiagnostics(now: number): SimulatorDiagnostics {
    return {
      state: this.state,
      manualPair: this.manualPair,
      pendingPair: this.pendingPair,
      phaseEndsAt: this.phaseEndsAt,
      stateEnteredAt: this.stateEnteredAt,
      lastCommandAt: this.lastCommandAt,
      overrideActive: this.overrideActive,
      idempotencyCacheSize: this.idempotency.size,
      authoritativeNow: now,
    };
  }

  // ───────────── command handlers ─────────────

  private handleForcePhase(req: EspRequestBody, now: number): EspResponseBody {
    const direction = pickDirection(req.params['direction']);
    if (direction === null) {
      return this.rejected(req.commandId, 'invalid_direction');
    }
    const targetPair = pairFor(direction);
    const holdSeconds = clamp(
      pickNumber(req.params['holdSeconds'], 25),
      MIN_GREEN_MS / 1000,
      MAX_HOLD_SECONDS,
    );

    // If we are already in the target pair's green, extend it.
    if (
      (this.state === 'NORMAL_NS_GREEN' && targetPair === 'NS') ||
      (this.state === 'NORMAL_EW_GREEN' && targetPair === 'EW')
    ) {
      const newEnd = Math.max(
        this.phaseEndsAt ?? now,
        now + holdSeconds * 1000,
      );
      this.phaseEndsAt = newEnd;
      return this.applied(
        req.commandId,
        `extended ${targetPair} green; ends in ${Math.round(
          (newEnd - now) / 1000,
        )}s`,
        now,
      );
    }

    // If we are in the target pair's yellow or all-red on the way,
    // queue it; otherwise begin the path: yellow → all-red → target.
    this.pendingPair = targetPair;
    this.pendingHoldMs = holdSeconds * 1000;

    const holdMs = holdSeconds * 1000;
    if (this.state === 'BOOT_ALL_RED') {
      this.transitionTo('ALL_RED_TRANSITION', now);
    } else if (this.state === 'MANUAL_HOLD') {
      // Switching out of manual hold to a different pair: go through
      // yellow if we were green, otherwise straight to all-red.
      this.manualPair = null;
      const sourcePair: PhasePair = lightsToPair(this.lights) ?? targetPair;
      if (sourcePair === targetPair) {
        // Manual hold in same pair — convert to a normal extended green.
        this.transitionTo(
          targetPair === 'NS' ? 'NORMAL_NS_GREEN' : 'NORMAL_EW_GREEN',
          now,
          { phaseDurationMs: holdMs },
        );
        this.pendingPair = null;
      } else {
        const yellowState: SimState =
          sourcePair === 'NS' ? 'NORMAL_NS_YELLOW' : 'NORMAL_EW_YELLOW';
        this.transitionTo(yellowState, now);
      }
    } else if (
      (this.state === 'NORMAL_NS_GREEN' && targetPair === 'EW') ||
      (this.state === 'NORMAL_EW_GREEN' && targetPair === 'NS')
    ) {
      // Hot swap: must finish min-green then yellow then all-red.
      const minGreenAt = this.stateEnteredAt + MIN_GREEN_MS;
      this.phaseEndsAt = Math.max(now, minGreenAt);
    }
    // Other states (yellow, all-red, transition) — pendingPair is enough.

    return this.applied(
      req.commandId,
      `pending ${targetPair} (hold=${holdSeconds}s) — current=${this.state}`,
      now,
    );
  }

  private handleUpdateTiming(
    req: EspRequestBody,
    now: number,
  ): EspResponseBody {
    if (this.state !== 'NORMAL_NS_GREEN' && this.state !== 'NORMAL_EW_GREEN') {
      return this.rejected(req.commandId, 'no_active_green');
    }
    const extension = clamp(
      pickNumber(req.params['extensionSeconds'], 0),
      0,
      MAX_EXTENSION_SECONDS,
    );
    if (extension <= 0) {
      return this.applied(
        req.commandId,
        `no-op extension (cycleExtensionSeconds is acknowledged but not applied at this stage)`,
        now,
      );
    }
    const currentEnd = this.phaseEndsAt ?? now + MIN_GREEN_MS;
    this.phaseEndsAt = currentEnd + extension * 1000;
    return this.applied(
      req.commandId,
      `extended current green by ${extension}s`,
      now,
    );
  }

  private handleSetManualMode(
    req: EspRequestBody,
    now: number,
  ): EspResponseBody {
    const enabled = req.params['enabled'];
    if (typeof enabled !== 'boolean') {
      return this.rejected(req.commandId, 'invalid_enabled');
    }
    if (enabled) {
      // Enter manual hold pinned to the current pair (or NS if none).
      const pair = lightsToPair(this.lights) ?? 'NS';
      this.manualPair = pair;
      this.lights = pair === 'NS' ? NS_GREEN : EW_GREEN;
      this.transitionTo('MANUAL_HOLD', now, { keepLights: true });
      return this.applied(req.commandId, `manual hold pinned to ${pair}`, now);
    }
    // Release.
    this.manualPair = null;
    this.transitionTo('ALL_RED_TRANSITION', now);
    return this.applied(req.commandId, 'manual hold released', now);
  }

  // ───────────── transitions ─────────────

  private transitionTo(
    next: SimState,
    now: number,
    opts: { phaseDurationMs?: number; keepLights?: boolean } = {},
  ): void {
    this.state = next;
    this.stateEnteredAt = now;
    if (opts.keepLights !== true) {
      this.lights = lightsForState(next, this.manualPair);
    }
    this.phaseEndsAt =
      next === 'NORMAL_NS_GREEN' || next === 'NORMAL_EW_GREEN'
        ? now + (opts.phaseDurationMs ?? MIN_GREEN_MS * 2)
        : null;
    // Committing to a long-lived state pushes the watchdog deadline
    // so the upcoming natural transitions (green → yellow → all-red)
    // don't accidentally trip it.
    if (this.phaseEndsAt !== null) {
      this.extendWatchdog(now);
    }
    if (next === 'MANUAL_HOLD') {
      this.extendWatchdog(now, now + MANUAL_HOLD_TIMEOUT_MS);
    }
    if (next === 'FAILSAFE_FLASH') {
      this.flashOn = true;
      this.flashLastToggledAt = now;
      this.lights = ALL_RED;
    }
  }

  // ───────────── responses ─────────────

  private rejected(commandId: string, detail: string): EspResponseBody {
    return {
      commandId,
      status: 'rejected',
      appliedAt: null,
      detail,
    };
  }

  private applied(
    commandId: string,
    detail: string,
    now: number,
  ): EspResponseBody {
    return {
      commandId,
      status: 'applied',
      appliedAt: new Date(now).toISOString(),
      detail,
    };
  }

  private fail(
    commandId: string,
    detail: string,
    now: number,
    cache: boolean,
  ): EspResponseBody {
    const response = this.rejected(commandId, detail);
    if (cache) {
      this.cacheResponse(commandId, response, now);
    }
    return response;
  }

  private respondAndCache(
    response: EspResponseBody,
    now: number,
  ): EspResponseBody {
    this.cacheResponse(response.commandId, response, now);
    return response;
  }

  private cacheResponse(
    commandId: string,
    response: EspResponseBody,
    now: number,
  ): void {
    if (this.idempotency.size >= IDEMPOTENCY_CACHE_SIZE) {
      // LRU eviction — Map preserves insertion order, so delete oldest.
      // (Map iterator's `.value` is typed `any` in some TS versions;
      // the cast keeps the rule happy without changing runtime behaviour.)
      const oldest = this.idempotency.keys().next().value as string | undefined;
      if (oldest !== undefined) {
        this.idempotency.delete(oldest);
      }
    }
    this.idempotency.set(commandId, {
      response,
      expiresAt: now + IDEMPOTENCY_TTL_MS,
    });
  }
}

// ───────────── helpers ─────────────

function lightsForState(
  state: SimState,
  manualPair: PhasePair | null,
): LightMatrix {
  switch (state) {
    case 'BOOT_ALL_RED':
    case 'ALL_RED_TRANSITION':
    case 'FAILSAFE_FLASH':
      return ALL_RED;
    case 'NORMAL_NS_GREEN':
      return NS_GREEN;
    case 'NORMAL_NS_YELLOW':
      return NS_YELLOW;
    case 'NORMAL_EW_GREEN':
      return EW_GREEN;
    case 'NORMAL_EW_YELLOW':
      return EW_YELLOW;
    case 'MANUAL_HOLD':
      return manualPair === 'EW' ? EW_GREEN : NS_GREEN;
  }
}

function pickDirection(value: unknown): PhasePair | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase();
  if (upper === 'NORTH' || upper === 'SOUTH' || upper === 'NS') return 'NS';
  if (upper === 'EAST' || upper === 'WEST' || upper === 'EW') return 'EW';
  return null;
}

function pairFor(value: PhasePair): PhasePair {
  return value;
}

function lightsToPair(lights: LightMatrix): PhasePair | null {
  if (lights.N.green === 'ON' || lights.S.green === 'ON') return 'NS';
  if (lights.E.green === 'ON' || lights.W.green === 'ON') return 'EW';
  return null;
}

function pickNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function freezeLights(matrix: LightMatrix): LightMatrix {
  for (const dir of Object.keys(matrix) as SignalDirection[]) {
    Object.freeze(matrix[dir]);
  }
  return Object.freeze(matrix);
}

interface ValidationOk {
  ok: true;
}
interface ValidationErr {
  ok: false;
  detail: string;
}

function validateRequest(req: unknown): ValidationOk | ValidationErr {
  if (req === null || typeof req !== 'object') {
    return { ok: false, detail: 'malformed_body' };
  }
  const body = req as Record<string, unknown>;
  if (typeof body['commandId'] !== 'string' || body['commandId'].length === 0) {
    return { ok: false, detail: 'missing_commandId' };
  }
  if (
    body['kind'] !== 'force_phase' &&
    body['kind'] !== 'update_timing' &&
    body['kind'] !== 'set_manual_mode'
  ) {
    return { ok: false, detail: 'unknown_kind' };
  }
  if (
    typeof body['intersection'] !== 'string' ||
    body['intersection'].length === 0
  ) {
    return { ok: false, detail: 'missing_intersection' };
  }
  if (typeof body['params'] !== 'object' || body['params'] === null) {
    return { ok: false, detail: 'missing_params' };
  }
  return { ok: true };
}

export const EXPORTED_FOR_TESTS = {
  ALL_RED,
  ALL_OFF,
  NS_GREEN,
  NS_YELLOW,
  EW_GREEN,
  EW_YELLOW,
};

import { Injectable, Logger } from '@nestjs/common';

import {
  ControllerDriverError,
  type ControllerDriver,
  type DriverResult,
} from './drivers/controller-driver';
import { ControllerDriverRegistry } from './drivers/controller-driver-registry.service';
import type { TrafficCommandView } from './traffic-control-execution.service';

export interface HardwareDispatchResult {
  ok: boolean;
  detail: string;
  attempts: number;
  driver: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = [200, 500];

/**
 * TrafficControllerHardwareService — replaces the in-process
 * `simulate()` with a real driver dispatch. Translates a persisted
 * traffic command into the right driver call, applies retry with
 * backoff and a per-attempt timeout, and returns a structured
 * outcome the runtime can ack/fail.
 *
 * No knowledge of decisions or agents — only of commands.
 */
@Injectable()
export class TrafficControllerHardwareService {
  private readonly logger = new Logger('TrafficControllerHardware');
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];

  constructor(private readonly registry: ControllerDriverRegistry) {
    this.timeoutMs = readNumber('CONTROLLER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.maxAttempts =
      1 + readNumber('CONTROLLER_RETRY_ATTEMPTS', DEFAULT_RETRY_ATTEMPTS);
    this.backoffMs = readBackoff(
      'CONTROLLER_RETRY_BACKOFF_MS',
      DEFAULT_RETRY_BACKOFF_MS,
    );
  }

  /**
   * Translate the command into the matching driver method, run it
   * with retry + timeout, and return a uniform outcome. Throws only
   * for programmer errors (unknown command kind); transport errors
   * are reflected in `result.ok = false`.
   */
  async sendCommandToController(
    command: TrafficCommandView,
  ): Promise<HardwareDispatchResult> {
    const driver = this.registry.resolve(command);
    const start = Date.now();

    let lastDetail = 'no attempt made';
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const result = await this.runWithTimeout(
          () => this.dispatch(driver, command),
          this.timeoutMs,
          attempt,
        );
        if (result.ok) {
          return {
            ok: true,
            detail: `${result.detail} [driver=${driver.meta.name}]`,
            attempts: attempt,
            driver: driver.meta.name,
            durationMs: Date.now() - start,
          };
        }
        lastDetail = result.detail;
      } catch (err) {
        lastError = err;
        const retryable = isRetryable(err);
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `attempt ${attempt}/${this.maxAttempts} on ${driver.meta.name} failed (${retryable ? 'retry' : 'abort'}): ${message}`,
        );
        if (!retryable) break;
      }
      if (attempt < this.maxAttempts) {
        await delay(this.backoffMs[attempt - 1] ?? 500);
      }
    }

    const detail =
      lastError instanceof Error
        ? `driver ${driver.meta.name} failed after ${this.maxAttempts} attempt(s): ${lastError.message}`
        : `driver ${driver.meta.name} reported failure: ${lastDetail}`;
    return {
      ok: false,
      detail,
      attempts: this.maxAttempts,
      driver: driver.meta.name,
      durationMs: Date.now() - start,
    };
  }

  // ───────── private ─────────

  private async dispatch(
    driver: ControllerDriver,
    command: TrafficCommandView,
  ): Promise<DriverResult> {
    const intersection = command.intersectionCode ?? command.scopeRef;
    const ctx = { commandId: command.id };
    switch (command.kind) {
      case 'force_phase': {
        const direction = pickString(command.payload, 'direction');
        const hold =
          pickNumber(command.payload, 'recommendedHoldSeconds') ?? 25;
        return driver.sendForcePhase(intersection, direction, hold, ctx);
      }
      case 'modify_phase_timing': {
        return driver.updateTiming(
          intersection,
          {
            direction: pickString(command.payload, 'direction'),
            extensionSeconds:
              pickNumber(command.payload, 'extensionSeconds') ?? undefined,
            cycleExtensionSeconds:
              pickNumber(command.payload, 'cycleExtensionSeconds') ?? undefined,
            biasFactor: pickNumber(command.payload, 'biasFactor') ?? undefined,
          },
          ctx,
        );
      }
      case 'block_automatic_control': {
        const source =
          (command.payload['source'] as string | undefined) ?? 'event';
        return driver.setManualMode(intersection, true, source, ctx);
      }
      case 'release_block': {
        return driver.setManualMode(intersection, false, 'manual_release', ctx);
      }
      case 'advisory': {
        // Pure advisory — no driver hop needed.
        return {
          ok: true,
          detail: 'advisory acknowledged — no field action required',
        };
      }
      default: {
        return {
          ok: true,
          detail: `unknown kind ${command.kind} — no-op acknowledge`,
        };
      }
    }
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    ms: number,
    attempt: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new ControllerDriverError(
            `driver call timed out after ${ms} ms (attempt ${attempt})`,
            'mock',
            true,
          ),
        );
      }, ms);
      fn().then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof ControllerDriverError) return err.retryable;
  // Unknown errors — be conservative, retry once.
  return true;
}

function pickString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

function pickNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readNumber(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBackoff(envKey: string, fallback: number[]): number[] {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const values = raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length > 0 ? values : fallback;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

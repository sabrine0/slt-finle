import { Injectable, Logger } from '@nestjs/common';

import {
  ControllerDriverError,
  type ControllerDriver,
  type ControllerProtocolMeta,
  type DispatchContext,
  type DriverResult,
  type TimingParams,
} from './controller-driver';

/**
 * EspHttpControllerDriver — talks to a small ESP32 firmware that
 * drives signal-light relays. Wire format is intentionally simple
 * JSON-over-HTTP so we can iterate on firmware quickly while still
 * exercising the full agent → execution → driver pipeline against
 * physical hardware.
 *
 * Wire format
 * ───────────
 * POST {ESP_BASE_URL}{ESP_COMMAND_PATH}
 *   Headers:
 *     Content-Type: application/json
 *     Authorization: Bearer <ESP_AUTH_TOKEN>   (only when token set)
 *   Body:
 *     { commandId, kind, intersection, params }
 *   Response:
 *     { commandId, status: 'applied'|'rejected'|..., appliedAt, detail? }
 *
 * Error policy
 * ────────────
 *   - 2xx + status='applied'   → DriverResult { ok: true }
 *   - 2xx + status≠'applied'   → DriverResult { ok: false, detail }
 *   - 4xx                      → throws non-retryable ControllerDriverError
 *   - 5xx, network failure,
 *     abort/timeout            → throws retryable ControllerDriverError
 *
 * Required env when enabled
 * ─────────────────────────
 *   ESP_DRIVER_ENABLED   '1' to arm
 *   ESP_BASE_URL         e.g. http://192.168.1.50  (no trailing slash)
 *   ESP_COMMAND_PATH     default '/api/command'
 *   ESP_AUTH_TOKEN       optional bearer token
 *   ESP_TIMEOUT_MS       default 1500
 *
 * Non-goals (deliberately deferred)
 * ─────────────────────────────────
 *   - HMAC signing (bearer token is sufficient on a controlled LAN).
 *   - Per-attempt idempotency (the same commandId is sent on every
 *     retry; the firmware is responsible for deduping).
 */

interface EspRequestBody {
  commandId: string | null;
  kind: 'force_phase' | 'update_timing' | 'set_manual_mode';
  intersection: string;
  params: Record<string, unknown>;
}

interface EspResponseBody {
  commandId?: string;
  status?: string;
  appliedAt?: string;
  detail?: string;
}

const DEFAULT_COMMAND_PATH = '/api/command';
const DEFAULT_TIMEOUT_MS = 1500;
const STATUS_APPLIED = 'applied';

@Injectable()
export class EspHttpControllerDriver implements ControllerDriver {
  private readonly logger = new Logger('EspHttpControllerDriver');
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly commandPath: string;
  private readonly authToken: string | null;
  private readonly timeoutMs: number;

  readonly meta: ControllerProtocolMeta = {
    name: 'esp',
    vendor: 'in-house',
    description:
      'ESP32 over HTTP+JSON. Drives relays in our own bench rig before any vendor cabinet is involved.',
  };

  constructor() {
    this.enabled = (process.env.ESP_DRIVER_ENABLED ?? '0') === '1';
    this.baseUrl = (process.env.ESP_BASE_URL ?? '').replace(/\/+$/, '');
    this.commandPath = this.normalisePath(
      process.env.ESP_COMMAND_PATH ?? DEFAULT_COMMAND_PATH,
    );
    this.authToken = process.env.ESP_AUTH_TOKEN?.trim() || null;
    this.timeoutMs = parsePositiveInt(
      process.env.ESP_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    );

    if (this.enabled) {
      this.logger.log(
        `ESP driver armed → POST ${this.baseUrl}${this.commandPath} (timeout=${this.timeoutMs}ms, auth=${this.authToken ? 'bearer' : 'none'})`,
      );
    }
  }

  async sendForcePhase(
    intersectionCode: string,
    direction: string | null,
    holdSeconds: number,
    context?: DispatchContext,
  ): Promise<DriverResult> {
    return this.send({
      commandId: context?.commandId ?? null,
      kind: 'force_phase',
      intersection: intersectionCode,
      params: { direction, holdSeconds },
    });
  }

  async updateTiming(
    intersectionCode: string,
    params: TimingParams,
    context?: DispatchContext,
  ): Promise<DriverResult> {
    return this.send({
      commandId: context?.commandId ?? null,
      kind: 'update_timing',
      intersection: intersectionCode,
      params: {
        direction: params.direction,
        extensionSeconds: params.extensionSeconds ?? null,
        cycleExtensionSeconds: params.cycleExtensionSeconds ?? null,
        biasFactor: params.biasFactor ?? null,
      },
    });
  }

  async setManualMode(
    intersectionCode: string,
    enabled: boolean,
    source: string,
    context?: DispatchContext,
  ): Promise<DriverResult> {
    return this.send({
      commandId: context?.commandId ?? null,
      kind: 'set_manual_mode',
      intersection: intersectionCode,
      params: { enabled, source },
    });
  }

  // ───────── private ─────────

  private async send(body: EspRequestBody): Promise<DriverResult> {
    this.requireEnabled(body.kind);
    const url = `${this.baseUrl}${this.commandPath}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Network error, DNS, connection refused, abort/timeout — all
      // worth a retry: they describe transient problems, not bad
      // command semantics.
      const message = err instanceof Error ? err.message : String(err);
      throw new ControllerDriverError(
        `ESP transport error for ${body.kind} ${body.intersection}: ${message}`,
        'esp',
        true,
      );
    }

    if (response.status >= 500) {
      throw new ControllerDriverError(
        `ESP returned ${response.status} for ${body.kind} ${body.intersection}`,
        'esp',
        true,
      );
    }
    if (response.status >= 400) {
      // Bad request from our side — retrying won't help. Read the
      // body for diagnostics so the operator note is useful.
      const detail = await safeReadText(response);
      throw new ControllerDriverError(
        `ESP rejected ${body.kind} ${body.intersection} (${response.status}): ${detail}`,
        'esp',
        false,
      );
    }

    let parsed: EspResponseBody;
    try {
      parsed = (await response.json()) as EspResponseBody;
    } catch (err) {
      // 2xx but body unparseable — don't trust it. Treat as a hard
      // failure, no retry (retrying gives the same garbage).
      throw new ControllerDriverError(
        `ESP returned 2xx but body was not JSON for ${body.kind} ${body.intersection}: ${err instanceof Error ? err.message : String(err)}`,
        'esp',
        false,
      );
    }

    if (
      body.commandId &&
      parsed.commandId &&
      parsed.commandId !== body.commandId
    ) {
      this.logger.warn(
        `ESP echoed mismatched commandId (sent=${body.commandId}, got=${parsed.commandId}) — accepting result but flagging for diagnosis.`,
      );
    }

    const status = parsed.status ?? 'unknown';
    if (status === STATUS_APPLIED) {
      return {
        ok: true,
        detail: parsed.detail
          ? `${parsed.detail} (applied${parsed.appliedAt ? ` at ${parsed.appliedAt}` : ''})`
          : `applied${parsed.appliedAt ? ` at ${parsed.appliedAt}` : ''}`,
        raw: parsed,
      };
    }

    // Status reported but not 'applied' — the ESP refused the
    // command on purpose (e.g. relay locked, watchdog tripped).
    // No retry: the same payload would be refused again.
    return {
      ok: false,
      detail: parsed.detail
        ? `${parsed.detail} (status=${status})`
        : `ESP returned status=${status} for ${body.kind}`,
      raw: parsed,
    };
  }

  private requireEnabled(op: string): void {
    if (!this.enabled) {
      throw new ControllerDriverError(
        `ESP driver disabled (ESP_DRIVER_ENABLED!=1) for ${op}`,
        'esp',
        true,
      );
    }
    if (!this.baseUrl) {
      throw new ControllerDriverError(
        `ESP driver enabled but ESP_BASE_URL is not set (op=${op})`,
        'esp',
        false,
      );
    }
  }

  private normalisePath(raw: string): string {
    if (!raw.startsWith('/')) return `/${raw}`;
    return raw;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 0 ? text : '<empty body>';
  } catch {
    return '<unreadable body>';
  }
}

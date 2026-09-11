/**
 * Controller-driver protocol abstraction.
 *
 * Every concrete driver — mock, RS485, TCP, or future vendor SDKs —
 * implements this interface. The driver layer is intentionally
 * unaware of agents, decisions, or HTTP: it only knows how to talk
 * to a physical (or simulated) traffic controller.
 *
 * No Nest decorators here so drivers can be unit-tested standalone.
 */

export type ControllerDriverName = 'mock' | 'rs485' | 'tcp' | 'esp';

export interface ControllerProtocolMeta {
  name: ControllerDriverName;
  vendor?: string;
  description?: string;
}

export interface DriverResult {
  ok: boolean;
  /** Short, operator-readable reason. Stored as the command's resolution note. */
  detail: string;
  /** Optional raw transport echo for diagnostics. */
  raw?: unknown;
}

export interface TimingParams {
  direction: string | null;
  extensionSeconds?: number;
  cycleExtensionSeconds?: number;
  biasFactor?: number;
}

/**
 * Diagnostic context the hardware service threads down to drivers.
 * Optional today (only the ESP HTTP driver consumes `commandId` for
 * end-to-end traceability and firmware-side idempotency); kept
 * optional so existing drivers don't need to change.
 */
export interface DispatchContext {
  /** Persisted traffic_commands.id for this dispatch. */
  commandId?: string;
}

/**
 * Concrete driver contract — three operations cover every kind of
 * command we currently issue. Add new methods here only when a new
 * command kind is introduced (and only after the drivers can
 * implement it).
 */
export interface ControllerDriver {
  readonly meta: ControllerProtocolMeta;
  sendForcePhase(
    intersectionCode: string,
    direction: string | null,
    holdSeconds: number,
    context?: DispatchContext,
  ): Promise<DriverResult>;
  updateTiming(
    intersectionCode: string,
    params: TimingParams,
    context?: DispatchContext,
  ): Promise<DriverResult>;
  setManualMode(
    intersectionCode: string,
    enabled: boolean,
    source: string,
    context?: DispatchContext,
  ): Promise<DriverResult>;
}

/** Thrown by drivers when the underlying transport fails recoverably. */
export class ControllerDriverError extends Error {
  constructor(
    message: string,
    readonly driver: ControllerDriverName,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ControllerDriverError';
  }
}

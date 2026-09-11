import { Injectable, Logger } from '@nestjs/common';

import type {
  ControllerDriver,
  ControllerProtocolMeta,
  DriverResult,
  TimingParams,
} from './controller-driver';

/**
 * MockControllerDriver — in-process simulator that reports success
 * after a small synthetic latency. Used for development, tests, and
 * the boss demo. Set `CONTROLLER_DRIVER=mock` (default) to select.
 */
const SIMULATED_LATENCY_MS = 80;

@Injectable()
export class MockControllerDriver implements ControllerDriver {
  private readonly logger = new Logger('MockControllerDriver');

  readonly meta: ControllerProtocolMeta = {
    name: 'mock',
    description: 'In-process simulator — no field action, deterministic ack.',
  };

  async sendForcePhase(
    intersectionCode: string,
    direction: string | null,
    holdSeconds: number,
  ): Promise<DriverResult> {
    await delay(SIMULATED_LATENCY_MS);
    const dir = direction ?? 'undefined';
    this.logger.debug?.(
      `mock force_phase intersection=${intersectionCode} dir=${dir} hold=${holdSeconds}s`,
    );
    return {
      ok: true,
      detail: `mock set active phase: dir=${dir}, hold=${holdSeconds}s`,
    };
  }

  async updateTiming(
    intersectionCode: string,
    params: TimingParams,
  ): Promise<DriverResult> {
    await delay(SIMULATED_LATENCY_MS);
    const dir = params.direction ?? 'all';
    const extension =
      params.extensionSeconds ?? params.cycleExtensionSeconds ?? 0;
    const bias = params.biasFactor;
    this.logger.debug?.(
      `mock update_timing intersection=${intersectionCode} dir=${dir} +${extension}s bias=${bias ?? 'none'}`,
    );
    if (bias != null) {
      return {
        ok: true,
        detail: `mock phase bias: dir=${dir}, +${extension}s, biasFactor=${bias}`,
      };
    }
    return {
      ok: true,
      detail: `mock phase extension: dir=${dir}, +${extension}s`,
    };
  }

  async setManualMode(
    intersectionCode: string,
    enabled: boolean,
    source: string,
  ): Promise<DriverResult> {
    await delay(SIMULATED_LATENCY_MS);
    this.logger.debug?.(
      `mock manual_mode intersection=${intersectionCode} enabled=${enabled} source=${source}`,
    );
    return {
      ok: true,
      detail: enabled
        ? `mock auto-mode disabled (source=${source})`
        : `mock auto-mode re-enabled`,
    };
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

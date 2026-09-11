import { Injectable, Logger } from '@nestjs/common';

import {
  ControllerDriverError,
  type ControllerDriver,
  type ControllerProtocolMeta,
  type DriverResult,
  type TimingParams,
} from './controller-driver';

/**
 * TcpControllerDriver — talks to a controller over a long-lived TCP
 * socket (typical for vendor SDKs that expose a binary or
 * line-oriented protocol on a fixed port).
 *
 * Like the RS-485 driver, this file ships the *shape* only. Frame
 * encoding lands when the vendor protocol is finalised. Until
 * `TCP_DRIVER_ENABLED=true`, every call throws a retryable error so
 * the runtime falls back to the mock driver while we test wiring.
 *
 * Required env when enabled:
 *   TCP_HOST            10.0.0.50
 *   TCP_PORT            5050
 *   TCP_TIMEOUT_MS      1500
 */
@Injectable()
export class TcpControllerDriver implements ControllerDriver {
  private readonly logger = new Logger('TcpControllerDriver');
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;

  readonly meta: ControllerProtocolMeta = {
    name: 'tcp',
    vendor: 'generic',
    description:
      'TCP/IP driver. Ships disabled until vendor protocol is finalised.',
  };

  constructor() {
    this.enabled = (process.env.TCP_DRIVER_ENABLED ?? '0') === '1';
    this.host = process.env.TCP_HOST ?? '127.0.0.1';
    this.port = Number(process.env.TCP_PORT ?? '5050');
    if (this.enabled) {
      this.logger.log(
        `TCP driver armed — host=${this.host}, port=${this.port}.`,
      );
    }
  }

  async sendForcePhase(
    intersectionCode: string,
    direction: string | null,
    holdSeconds: number,
  ): Promise<DriverResult> {
    this.requireEnabled('sendForcePhase');
    return this.notImplemented(
      `tcp force_phase ${intersectionCode} dir=${direction} hold=${holdSeconds}`,
    );
  }

  async updateTiming(
    intersectionCode: string,
    params: TimingParams,
  ): Promise<DriverResult> {
    this.requireEnabled('updateTiming');
    return this.notImplemented(
      `tcp update_timing ${intersectionCode} dir=${params.direction}`,
    );
  }

  async setManualMode(
    intersectionCode: string,
    enabled: boolean,
    source: string,
  ): Promise<DriverResult> {
    this.requireEnabled('setManualMode');
    return this.notImplemented(
      `tcp manual_mode ${intersectionCode} enabled=${enabled} src=${source}`,
    );
  }

  private requireEnabled(op: string): void {
    if (!this.enabled) {
      throw new ControllerDriverError(
        `TCP driver disabled (TCP_DRIVER_ENABLED!=1) for ${op}`,
        'tcp',
        true,
      );
    }
  }

  private async notImplemented(op: string): Promise<DriverResult> {
    this.logger.warn(`TCP ${op} — vendor protocol not implemented yet.`);
    throw new ControllerDriverError(
      `TCP vendor protocol not implemented yet (${op})`,
      'tcp',
      false,
    );
  }
}

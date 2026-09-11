import { Injectable, Logger } from '@nestjs/common';

import {
  ControllerDriverError,
  type ControllerDriver,
  type ControllerProtocolMeta,
  type DriverResult,
  type TimingParams,
} from './controller-driver';

/**
 * Rs485ControllerDriver — talks to a controller over an RS-485 bus
 * (typically via a USB-RS485 dongle on the on-device gateway).
 *
 * This file ships the *shape* and config wiring only. Real frame
 * encoding (e.g. Modbus RTU, vendor-specific) is added when we have
 * an actual cabinet to talk to. Until `RS485_DRIVER_ENABLED=true`,
 * every call throws a retryable error so the runtime falls back to
 * the mock driver while we test wiring end-to-end.
 *
 * Required env when enabled:
 *   RS485_PORT          /dev/ttyUSB0  (or COM3 on Windows)
 *   RS485_BAUD_RATE     115200
 *   RS485_PARITY        none|even|odd
 *   RS485_TIMEOUT_MS    1000
 */
@Injectable()
export class Rs485ControllerDriver implements ControllerDriver {
  private readonly logger = new Logger('Rs485ControllerDriver');
  private readonly enabled: boolean;
  private readonly port: string;
  private readonly baudRate: number;

  readonly meta: ControllerProtocolMeta = {
    name: 'rs485',
    vendor: 'generic',
    description:
      'RS-485 bus driver (Modbus RTU envelope). Ships disabled until field validation.',
  };

  constructor() {
    this.enabled = (process.env.RS485_DRIVER_ENABLED ?? '0') === '1';
    this.port = process.env.RS485_PORT ?? '/dev/ttyUSB0';
    this.baudRate = Number(process.env.RS485_BAUD_RATE ?? '115200');
    if (this.enabled) {
      this.logger.log(
        `RS485 driver armed — port=${this.port}, baud=${this.baudRate}.`,
      );
    }
  }

  async sendForcePhase(
    intersectionCode: string,
    direction: string | null,
    holdSeconds: number,
  ): Promise<DriverResult> {
    this.requireEnabled('sendForcePhase');
    // TODO: encode Modbus RTU frame for "force phase" register write.
    return this.notImplemented(
      `rs485 force_phase ${intersectionCode} dir=${direction} hold=${holdSeconds}`,
    );
  }

  async updateTiming(
    intersectionCode: string,
    params: TimingParams,
  ): Promise<DriverResult> {
    this.requireEnabled('updateTiming');
    return this.notImplemented(
      `rs485 update_timing ${intersectionCode} dir=${params.direction}`,
    );
  }

  async setManualMode(
    intersectionCode: string,
    enabled: boolean,
    source: string,
  ): Promise<DriverResult> {
    this.requireEnabled('setManualMode');
    return this.notImplemented(
      `rs485 manual_mode ${intersectionCode} enabled=${enabled} src=${source}`,
    );
  }

  private requireEnabled(op: string): void {
    if (!this.enabled) {
      throw new ControllerDriverError(
        `RS485 driver disabled (RS485_DRIVER_ENABLED!=1) for ${op}`,
        'rs485',
        true,
      );
    }
  }

  private async notImplemented(op: string): Promise<DriverResult> {
    // Implementation lands when the first cabinet is on the bench.
    this.logger.warn(`RS485 ${op} — frame encoding not implemented yet.`);
    throw new ControllerDriverError(
      `RS485 frame encoding not implemented yet (${op})`,
      'rs485',
      false,
    );
  }
}

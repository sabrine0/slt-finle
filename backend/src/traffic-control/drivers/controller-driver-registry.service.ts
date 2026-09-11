import { Injectable, Logger } from '@nestjs/common';

import type { TrafficCommandView } from '../traffic-control-execution.service';
import {
  type ControllerDriver,
  type ControllerDriverName,
} from './controller-driver';
import { EspHttpControllerDriver } from './esp-http-controller-driver';
import { MockControllerDriver } from './mock-controller-driver';
import { Rs485ControllerDriver } from './rs485-controller-driver';
import { TcpControllerDriver } from './tcp-controller-driver';

const VALID_DRIVER_NAMES: ControllerDriverName[] = [
  'mock',
  'rs485',
  'tcp',
  'esp',
];

/**
 * ControllerDriverRegistry — picks the right driver for a given
 * command. Today every intersection uses the same driver, configured
 * by `CONTROLLER_DRIVER` (default `mock`). Per-intersection mapping
 * lands later when the carrefours table grows a `driver` column.
 */
@Injectable()
export class ControllerDriverRegistry {
  private readonly logger = new Logger(ControllerDriverRegistry.name);
  private readonly default: ControllerDriverName;
  private readonly drivers: Map<ControllerDriverName, ControllerDriver>;

  constructor(
    private readonly mock: MockControllerDriver,
    private readonly rs485: Rs485ControllerDriver,
    private readonly tcp: TcpControllerDriver,
    private readonly esp: EspHttpControllerDriver,
  ) {
    this.drivers = new Map<ControllerDriverName, ControllerDriver>([
      ['mock', this.mock],
      ['rs485', this.rs485],
      ['tcp', this.tcp],
      ['esp', this.esp],
    ]);

    const requested = (process.env.CONTROLLER_DRIVER ?? 'mock')
      .toLowerCase()
      .trim();
    this.default = VALID_DRIVER_NAMES.includes(
      requested as ControllerDriverName,
    )
      ? (requested as ControllerDriverName)
      : 'mock';
    this.logger.log(`Default controller driver: "${this.default}".`);
  }

  resolve(_command: TrafficCommandView): ControllerDriver {
    return this.drivers.get(this.default) ?? this.mock;
  }

  byName(name: ControllerDriverName): ControllerDriver {
    return this.drivers.get(name) ?? this.mock;
  }

  list(): ControllerDriver[] {
    return [...this.drivers.values()];
  }
}

import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  TrafficControlExecutionService,
  type TrafficCommandView,
} from './traffic-control-execution.service';
import { TrafficControllerHardwareService } from './traffic-controller-hardware.service';

/**
 * TrafficControllerRuntimeService — in-process simulator that
 * mimics the on-device controller-runtime. Polls the same
 * `traffic_commands` queue the real Go runtime will eventually
 * consume, runs the kind-specific simulated action, and acknowledges
 * the command.
 *
 *   queued ──pick──► dispatched ──simulate──► acknowledged
 *                                          ▲
 *                                          └─── failed (with note)
 *
 * Set `CONTROLLER_RUNTIME_ENABLED=false` to disable the loop (e.g.
 * during integration tests or when the real Go runtime is the one
 * draining the queue in production).
 */

const POLL_INTERVAL_MS = 2_000;
const INITIAL_DELAY_MS = 3_000;
/**
 * Hard cap to keep one tick fast even if many commands queued at
 * once. Anything above the cap is picked up next tick.
 */
const MAX_PER_TICK = 25;

@Injectable()
export class TrafficControllerRuntimeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('TrafficControllerRuntime');
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private cycle = 0;
  private readonly enabled: boolean;

  constructor(
    private readonly execution: TrafficControlExecutionService,
    private readonly hardware: TrafficControllerHardwareService,
  ) {
    this.enabled = resolveEnabled();
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log(
        'Controller runtime simulator disabled by CONTROLLER_RUNTIME_ENABLED.',
      );
      return;
    }
    this.logger.log(
      `Controller runtime simulator armed — first poll in ${INITIAL_DELAY_MS / 1000}s, then every ${POLL_INTERVAL_MS / 1000}s.`,
    );
    this.initialTimer = setTimeout(() => {
      void this.poll().catch((err) => this.logTickError(err));
      this.timer = setInterval(() => {
        void this.poll().catch((err) => this.logTickError(err));
      }, POLL_INTERVAL_MS);
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

  /** Manual single-tick — exposed for tests / on-demand drains. */
  async runOnce(): Promise<number> {
    return this.poll();
  }

  // ───────── private ─────────

  private async poll(): Promise<number> {
    if (this.inFlight) return 0;
    this.inFlight = true;
    this.cycle += 1;
    const cycle = this.cycle;
    try {
      const queued = await this.execution.listLatest({
        status: 'queued',
        limit: MAX_PER_TICK,
      });
      if (queued.length === 0) return 0;

      const drained: number[] = [];
      // Newest commands are returned first; process oldest first so
      // FIFO semantics hold — reverse the list before iteration.
      for (const command of [...queued].reverse()) {
        const ok = await this.handleOne(command);
        drained.push(ok ? 1 : 0);
      }
      const successful = drained.reduce((sum, value) => sum + value, 0);
      this.logger.log(
        `Cycle #${cycle} drained ${successful}/${queued.length} command(s).`,
      );
      return successful;
    } finally {
      this.inFlight = false;
    }
  }

  private async handleOne(command: TrafficCommandView): Promise<boolean> {
    const dispatched = await this.execution.markDispatched(command.id);
    if (!dispatched) {
      // Lost the race — another worker grabbed it. Skip silently.
      return false;
    }

    const target =
      command.intersectionCode ?? `${command.scope}/${command.scopeRef}`;
    this.logger.log(
      `RECEIVED [${command.id}] kind=${command.kind} intersection=${target}`,
    );

    try {
      const result = await this.hardware.sendCommandToController(command);
      if (result.ok) {
        await this.execution.acknowledge(command.id, result.detail);
        this.logger.log(
          `EXECUTED [${command.id}] kind=${command.kind} intersection=${target} ` +
            `attempts=${result.attempts} ${result.durationMs}ms :: ${result.detail}`,
        );
        return true;
      }
      this.logger.warn(
        `FAILED [${command.id}] kind=${command.kind} intersection=${target} ` +
          `attempts=${result.attempts} :: ${result.detail}`,
      );
      await this.execution.markFailed(command.id, result.detail);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `FAILED [${command.id}] kind=${command.kind} intersection=${target} :: ${message}`,
      );
      await this.execution.markFailed(
        command.id,
        `hardware_dispatch_error: ${message}`,
      );
      return false;
    }
  }

  private logTickError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Poll tick crashed: ${message}`);
  }
}

function resolveEnabled(): boolean {
  const env = process.env.CONTROLLER_RUNTIME_ENABLED;
  if (env === '0' || env?.toLowerCase() === 'false') return false;
  return true;
}

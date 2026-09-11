import {
  FatalError,
  RetryableError,
  makeCommand,
  makeFakeDriver,
  makeRegistry,
  withEnv,
} from './__tests__/traffic-control-test-helpers';
import { TrafficControllerHardwareService } from './traffic-controller-hardware.service';

/**
 * Build a service with deterministic env (small timeout, no backoff)
 * so tests don't add real-time delays.
 */
async function buildService(driver = makeFakeDriver(), attempts = 2) {
  return withEnv(
    {
      CONTROLLER_TIMEOUT_MS: '50',
      CONTROLLER_RETRY_ATTEMPTS: String(attempts),
      CONTROLLER_RETRY_BACKOFF_MS: '0,0,0',
    },
    () => ({
      driver,
      service: new TrafficControllerHardwareService(makeRegistry(driver)),
    }),
  );
}

describe('TrafficControllerHardwareService', () => {
  describe('command → driver dispatch', () => {
    it('routes force_phase to driver.sendForcePhase with payload values', async () => {
      const { service, driver } = await buildService();

      const result = await service.sendCommandToController(
        makeCommand({
          kind: 'force_phase',
          payload: { direction: 'east', recommendedHoldSeconds: 30 },
        }),
      );

      expect(result.ok).toBe(true);
      expect(driver.sendForcePhase).toHaveBeenCalledWith(
        'INT-CAS-001',
        'east',
        30,
        { commandId: 'cmd-1' },
      );
    });

    it('falls back to default 25s hold when not in payload', async () => {
      const { service, driver } = await buildService();

      await service.sendCommandToController(
        makeCommand({ kind: 'force_phase', payload: {} }),
      );

      expect(driver.sendForcePhase).toHaveBeenCalledWith(
        'INT-CAS-001',
        null,
        25,
        {
          commandId: 'cmd-1',
        },
      );
    });

    it('routes modify_phase_timing to driver.updateTiming with parsed params', async () => {
      const { service, driver } = await buildService();

      await service.sendCommandToController(
        makeCommand({
          kind: 'modify_phase_timing',
          payload: {
            direction: 'WEST',
            extensionSeconds: '8',
            cycleExtensionSeconds: 20,
            biasFactor: 0.65,
          },
        }),
      );

      expect(driver.updateTiming).toHaveBeenCalledWith(
        'INT-CAS-001',
        {
          direction: 'WEST',
          extensionSeconds: 8,
          cycleExtensionSeconds: 20,
          biasFactor: 0.65,
        },
        { commandId: 'cmd-1' },
      );
    });

    it('routes block_automatic_control to driver.setManualMode (enabled=true)', async () => {
      const { service, driver } = await buildService();

      await service.sendCommandToController(
        makeCommand({
          kind: 'block_automatic_control',
          payload: { source: 'event' },
        }),
      );

      expect(driver.setManualMode).toHaveBeenCalledWith(
        'INT-CAS-001',
        true,
        'event',
        { commandId: 'cmd-1' },
      );
    });

    it('routes release_block to driver.setManualMode (enabled=false, source=manual_release)', async () => {
      const { service, driver } = await buildService();

      await service.sendCommandToController(
        makeCommand({ kind: 'release_block', payload: {} }),
      );

      expect(driver.setManualMode).toHaveBeenCalledWith(
        'INT-CAS-001',
        false,
        'manual_release',
        { commandId: 'cmd-1' },
      );
    });

    it('advisory commands skip the driver and ack as ok', async () => {
      const { service, driver } = await buildService();

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'advisory', payload: {} }),
      );

      expect(result.ok).toBe(true);
      expect(driver.sendForcePhase).not.toHaveBeenCalled();
      expect(driver.updateTiming).not.toHaveBeenCalled();
      expect(driver.setManualMode).not.toHaveBeenCalled();
    });

    it('falls back to scopeRef when intersectionCode is null', async () => {
      const { service, driver } = await buildService();

      await service.sendCommandToController(
        makeCommand({
          intersectionCode: null,
          scopeRef: 'INT-FALLBACK',
          kind: 'force_phase',
          payload: {},
        }),
      );

      expect(driver.sendForcePhase).toHaveBeenCalledWith(
        'INT-FALLBACK',
        null,
        25,
        { commandId: 'cmd-1' },
      );
    });
  });

  describe('retry / backoff / abort', () => {
    it('retries a retryable failure and reports the successful attempt count', async () => {
      const driver = makeFakeDriver();
      driver.updateTiming
        .mockRejectedValueOnce(new RetryableError('transport blip'))
        .mockResolvedValueOnce({ ok: true, detail: 'applied' });
      const { service } = await buildService(driver, 2);

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'modify_phase_timing' }),
      );

      expect(result.ok).toBe(true);
      expect(result.attempts).toBe(2);
      expect(driver.updateTiming).toHaveBeenCalledTimes(2);
    });

    it('aborts immediately on a non-retryable error', async () => {
      const driver = makeFakeDriver();
      driver.updateTiming.mockRejectedValue(
        new FatalError('protocol mismatch'),
      );
      const { service } = await buildService(driver, 3);

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'modify_phase_timing' }),
      );

      expect(result.ok).toBe(false);
      // 3 attempts allowed, but driver only ever called once because
      // the fatal error stopped the loop.
      expect(driver.updateTiming).toHaveBeenCalledTimes(1);
      expect(result.detail).toMatch(/protocol mismatch/);
    });

    it('returns failure after all attempts when every call throws retryable', async () => {
      const driver = makeFakeDriver();
      driver.sendForcePhase.mockRejectedValue(new RetryableError('flaky'));
      const { service } = await buildService(driver, 2);

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'force_phase' }),
      );

      expect(result.ok).toBe(false);
      // attempts = 1 + CONTROLLER_RETRY_ATTEMPTS (2) = 3 total.
      expect(driver.sendForcePhase).toHaveBeenCalledTimes(3);
      expect(result.attempts).toBe(3);
    });

    it('reports an ok=false DriverResult (driver returned failure, did not throw)', async () => {
      const driver = makeFakeDriver();
      driver.updateTiming
        .mockResolvedValueOnce({ ok: false, detail: 'busy' })
        .mockResolvedValueOnce({ ok: false, detail: 'still busy' });
      const { service } = await buildService(driver, 1);

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'modify_phase_timing' }),
      );

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/still busy/);
    });

    it('times out when a driver call takes longer than CONTROLLER_TIMEOUT_MS', async () => {
      const driver = makeFakeDriver();
      driver.sendForcePhase.mockImplementation(
        () => new Promise(() => undefined), // never resolves
      );
      const { service } = await buildService(driver, 1);

      const result = await service.sendCommandToController(
        makeCommand({ kind: 'force_phase' }),
      );

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/timed out/i);
    }, 2000);
  });
});

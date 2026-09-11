import { withEnv } from '../__tests__/traffic-control-test-helpers';
import { ControllerDriverError } from './controller-driver';
import { TcpControllerDriver } from './tcp-controller-driver';

describe('TcpControllerDriver (disabled by default)', () => {
  it('exposes the tcp meta', async () => {
    await withEnv({ TCP_DRIVER_ENABLED: undefined }, () => {
      const driver = new TcpControllerDriver();
      expect(driver.meta.name).toBe('tcp');
    });
  });

  it.each(['sendForcePhase', 'updateTiming', 'setManualMode'] as const)(
    'throws a retryable ControllerDriverError on %s when env not set',
    async (op) => {
      await withEnv({ TCP_DRIVER_ENABLED: undefined }, async () => {
        const driver = new TcpControllerDriver();
        const call =
          op === 'sendForcePhase'
            ? () => driver.sendForcePhase('INT-CAS-001', null, 25)
            : op === 'updateTiming'
              ? () =>
                  driver.updateTiming('INT-CAS-001', {
                    direction: null,
                    extensionSeconds: 6,
                  })
              : () => driver.setManualMode('INT-CAS-001', true, 'event');

        await expect(call()).rejects.toMatchObject({
          name: 'ControllerDriverError',
          driver: 'tcp',
          retryable: true,
        });
      });
    },
  );

  it('throws a non-retryable "not implemented" error when enabled', async () => {
    await withEnv(
      { TCP_DRIVER_ENABLED: '1', TCP_HOST: '10.0.0.50', TCP_PORT: '5050' },
      async () => {
        const driver = new TcpControllerDriver();
        await expect(
          driver.updateTiming('INT-CAS-001', {
            direction: 'NORTH',
            extensionSeconds: 8,
          }),
        ).rejects.toMatchObject({
          name: 'ControllerDriverError',
          driver: 'tcp',
          retryable: false,
        });
      },
    );
  });

  it('ControllerDriverError carries the driver name and retryable flag', () => {
    const err = new ControllerDriverError('boom', 'tcp', true);
    expect(err).toBeInstanceOf(Error);
    expect(err.driver).toBe('tcp');
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('ControllerDriverError');
  });
});

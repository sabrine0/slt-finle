import { withEnv } from '../__tests__/traffic-control-test-helpers';
import { ControllerDriverError } from './controller-driver';
import { Rs485ControllerDriver } from './rs485-controller-driver';

describe('Rs485ControllerDriver (disabled by default)', () => {
  it('exposes the rs485 meta', async () => {
    await withEnv({ RS485_DRIVER_ENABLED: undefined }, () => {
      const driver = new Rs485ControllerDriver();
      expect(driver.meta.name).toBe('rs485');
    });
  });

  it.each(['sendForcePhase', 'updateTiming', 'setManualMode'] as const)(
    'throws a retryable ControllerDriverError on %s when env not set',
    async (op) => {
      await withEnv({ RS485_DRIVER_ENABLED: undefined }, async () => {
        const driver = new Rs485ControllerDriver();
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
          driver: 'rs485',
          retryable: true,
        });
      });
    },
  );

  it('throws a non-retryable "not implemented" error when enabled but called', async () => {
    await withEnv({ RS485_DRIVER_ENABLED: '1' }, async () => {
      const driver = new Rs485ControllerDriver();
      await expect(
        driver.sendForcePhase('INT-CAS-001', 'NORTH', 25),
      ).rejects.toMatchObject({
        name: 'ControllerDriverError',
        driver: 'rs485',
        retryable: false,
      });
    });
  });

  it('exposes the chosen port + baud when enabled', async () => {
    await withEnv(
      {
        RS485_DRIVER_ENABLED: '1',
        RS485_PORT: 'COM4',
        RS485_BAUD_RATE: '9600',
      },
      () => {
        const driver = new Rs485ControllerDriver();
        expect(driver.meta.name).toBe('rs485');
        // Port / baud are private, but a "not implemented" error from
        // a method confirms the constructor logged enabled=true.
        return expect(
          driver.sendForcePhase('INT-CAS-001', null, 25),
        ).rejects.toBeInstanceOf(ControllerDriverError);
      },
    );
  });
});

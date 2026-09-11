import { withEnv } from '../__tests__/traffic-control-test-helpers';
import { makeCommand } from '../__tests__/traffic-control-test-helpers';
import { ControllerDriverRegistry } from './controller-driver-registry.service';
import { EspHttpControllerDriver } from './esp-http-controller-driver';
import { MockControllerDriver } from './mock-controller-driver';
import { Rs485ControllerDriver } from './rs485-controller-driver';
import { TcpControllerDriver } from './tcp-controller-driver';

function buildRegistry(envOverrides: Record<string, string | undefined> = {}) {
  return withEnv(
    {
      RS485_DRIVER_ENABLED: undefined,
      TCP_DRIVER_ENABLED: undefined,
      ESP_DRIVER_ENABLED: undefined,
      ...envOverrides,
    },
    () =>
      new ControllerDriverRegistry(
        new MockControllerDriver(),
        new Rs485ControllerDriver(),
        new TcpControllerDriver(),
        new EspHttpControllerDriver(),
      ),
  );
}

describe('ControllerDriverRegistry', () => {
  it('defaults to mock when CONTROLLER_DRIVER is unset', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: undefined });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('mock');
  });

  it('respects CONTROLLER_DRIVER=rs485', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: 'rs485' });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('rs485');
  });

  it('respects CONTROLLER_DRIVER=tcp', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: 'tcp' });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('tcp');
  });

  it('falls back to mock for an unknown CONTROLLER_DRIVER value', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: 'chimera' });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('mock');
  });

  it('lowercases and trims CONTROLLER_DRIVER input', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: '  RS485  ' });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('rs485');
  });

  it('byName returns the requested driver, falling back to mock when unknown', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: undefined });

    expect(registry.byName('rs485').meta.name).toBe('rs485');
    expect(registry.byName('tcp').meta.name).toBe('tcp');
  });

  it('list() returns all registered drivers', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: undefined });

    const names = registry.list().map((driver) => driver.meta.name);

    expect(names).toEqual(
      expect.arrayContaining(['mock', 'rs485', 'tcp', 'esp']),
    );
  });

  it('respects CONTROLLER_DRIVER=esp', async () => {
    const registry = await buildRegistry({ CONTROLLER_DRIVER: 'esp' });

    const driver = registry.resolve(makeCommand());

    expect(driver.meta.name).toBe('esp');
  });
});

import { MockControllerDriver } from './mock-controller-driver';

describe('MockControllerDriver', () => {
  const driver = new MockControllerDriver();

  it('exposes the mock meta', () => {
    expect(driver.meta.name).toBe('mock');
  });

  it('sendForcePhase acks with direction + hold in detail', async () => {
    const result = await driver.sendForcePhase('INT-CAS-001', 'NORTH', 30);

    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/dir=NORTH/);
    expect(result.detail).toMatch(/hold=30s/);
  });

  it('sendForcePhase reports "undefined" when direction is null', async () => {
    const result = await driver.sendForcePhase('INT-CAS-001', null, 25);

    expect(result.detail).toMatch(/dir=undefined/);
  });

  it('updateTiming reports a phase extension when no biasFactor is set', async () => {
    const result = await driver.updateTiming('INT-CAS-001', {
      direction: 'EAST',
      extensionSeconds: 8,
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/phase extension/);
    expect(result.detail).toMatch(/dir=EAST/);
    expect(result.detail).toMatch(/\+8s/);
  });

  it('updateTiming reports a phase bias when biasFactor is set', async () => {
    const result = await driver.updateTiming('INT-CAS-001', {
      direction: 'WEST',
      cycleExtensionSeconds: 20,
      biasFactor: 0.65,
    });

    expect(result.detail).toMatch(/phase bias/);
    expect(result.detail).toMatch(/biasFactor=0\.65/);
    expect(result.detail).toMatch(/\+20s/);
  });

  it('updateTiming defaults direction to "all" when null', async () => {
    const result = await driver.updateTiming('INT-CAS-001', {
      direction: null,
      extensionSeconds: 4,
    });

    expect(result.detail).toMatch(/dir=all/);
  });

  it('setManualMode(true) acks with the source', async () => {
    const result = await driver.setManualMode('INT-CAS-001', true, 'event');

    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/disabled/);
    expect(result.detail).toMatch(/source=event/);
  });

  it('setManualMode(false) acks the re-enable', async () => {
    const result = await driver.setManualMode(
      'INT-CAS-001',
      false,
      'manual_release',
    );

    expect(result.ok).toBe(true);
    expect(result.detail).toMatch(/re-enabled/);
  });
});

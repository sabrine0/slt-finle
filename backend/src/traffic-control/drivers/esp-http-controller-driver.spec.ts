import { withEnv } from '../__tests__/traffic-control-test-helpers';
import { ControllerDriverError } from './controller-driver';
import { EspHttpControllerDriver } from './esp-http-controller-driver';

interface FetchCall {
  url: string;
  init: RequestInit;
}

interface FakeResponse {
  status?: number;
  bodyJson?: unknown;
  bodyText?: string;
  /** When set, awaiting .json() throws. */
  jsonThrows?: boolean;
}

let fetchMock: jest.Mock;
let fetchCalls: FetchCall[];
const realFetch = global.fetch;

function stubFetch(responses: (FakeResponse | Error)[]) {
  fetchCalls = [];
  fetchMock = jest.fn((url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) {
      return Promise.reject(
        new Error('fetch mock exhausted — no more queued responses'),
      );
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    const status = next.status ?? 200;
    const fakeResponse = {
      status,
      ok: status >= 200 && status < 300,
      json: () =>
        next.jsonThrows
          ? Promise.reject(
              new SyntaxError('Unexpected token < in JSON at position 0'),
            )
          : Promise.resolve(next.bodyJson ?? {}),
      text: () =>
        Promise.resolve(next.bodyText ?? JSON.stringify(next.bodyJson ?? {})),
    } as unknown as Response;
    return Promise.resolve(fakeResponse);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

/** Type-narrowed accessor for the JSON body sent on a recorded call. */
function bodyOf(call: FetchCall): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>;
}

afterEach(() => {
  global.fetch = realFetch;
});

const ENABLED_ENV = {
  ESP_DRIVER_ENABLED: '1',
  ESP_BASE_URL: 'http://192.168.1.50',
  ESP_COMMAND_PATH: '/api/command',
  ESP_AUTH_TOKEN: 'secret-token',
  ESP_TIMEOUT_MS: '500',
};

describe('EspHttpControllerDriver — disabled by default', () => {
  it('exposes the esp meta', async () => {
    await withEnv({ ESP_DRIVER_ENABLED: undefined }, () => {
      const driver = new EspHttpControllerDriver();
      expect(driver.meta.name).toBe('esp');
    });
  });

  it.each(['sendForcePhase', 'updateTiming', 'setManualMode'] as const)(
    'throws a retryable ControllerDriverError on %s when ESP_DRIVER_ENABLED is unset',
    async (op) => {
      await withEnv({ ESP_DRIVER_ENABLED: undefined }, async () => {
        const driver = new EspHttpControllerDriver();
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
          driver: 'esp',
          retryable: true,
        });
      });
    },
  );

  it('throws a non-retryable error when enabled but ESP_BASE_URL is missing', async () => {
    await withEnv(
      { ESP_DRIVER_ENABLED: '1', ESP_BASE_URL: undefined },
      async () => {
        const driver = new EspHttpControllerDriver();
        await expect(
          driver.sendForcePhase('INT-CAS-001', null, 25),
        ).rejects.toMatchObject({
          name: 'ControllerDriverError',
          driver: 'esp',
          retryable: false,
        });
      },
    );
  });
});

describe('EspHttpControllerDriver — request shape', () => {
  it('sends commandId, kind, intersection, params for force_phase', async () => {
    stubFetch([
      {
        bodyJson: {
          commandId: 'cmd-1',
          status: 'applied',
          appliedAt: '2026-05-04T12:00:00.000Z',
        },
      },
    ]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const result = await driver.sendForcePhase('INT-CAS-001', 'NORTH', 30, {
        commandId: 'cmd-1',
      });

      expect(result.ok).toBe(true);
      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.url).toBe('http://192.168.1.50/api/command');
      expect(call.init.method).toBe('POST');
      expect(bodyOf(call)).toEqual({
        commandId: 'cmd-1',
        kind: 'force_phase',
        intersection: 'INT-CAS-001',
        params: { direction: 'NORTH', holdSeconds: 30 },
      });
    });
  });

  it('sends update_timing payload with all four fields', async () => {
    stubFetch([
      {
        bodyJson: { commandId: 'cmd-7', status: 'applied' },
      },
    ]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await driver.updateTiming(
        'INT-CAS-001',
        {
          direction: 'EAST',
          extensionSeconds: 8,
          cycleExtensionSeconds: 20,
          biasFactor: 0.65,
        },
        { commandId: 'cmd-7' },
      );

      expect(bodyOf(fetchCalls[0])).toEqual({
        commandId: 'cmd-7',
        kind: 'update_timing',
        intersection: 'INT-CAS-001',
        params: {
          direction: 'EAST',
          extensionSeconds: 8,
          cycleExtensionSeconds: 20,
          biasFactor: 0.65,
        },
      });
    });
  });

  it('sends set_manual_mode payload with enabled flag + source', async () => {
    stubFetch([{ bodyJson: { commandId: 'cmd-3', status: 'applied' } }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await driver.setManualMode('INT-CAS-001', true, 'event', {
        commandId: 'cmd-3',
      });

      expect(bodyOf(fetchCalls[0])).toEqual({
        commandId: 'cmd-3',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: true, source: 'event' },
      });
    });
  });

  it('attaches Authorization header when ESP_AUTH_TOKEN is set', async () => {
    stubFetch([{ bodyJson: { status: 'applied' } }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await driver.sendForcePhase('INT-CAS-001', null, 25);

      const headers = fetchCalls[0].init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer secret-token');
      expect(headers['Content-Type']).toBe('application/json');
    });
  });

  it('omits Authorization header when ESP_AUTH_TOKEN is unset', async () => {
    stubFetch([{ bodyJson: { status: 'applied' } }]);

    await withEnv({ ...ENABLED_ENV, ESP_AUTH_TOKEN: undefined }, async () => {
      const driver = new EspHttpControllerDriver();
      await driver.sendForcePhase('INT-CAS-001', null, 25);

      const headers = fetchCalls[0].init.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  it('strips trailing slashes on ESP_BASE_URL and prepends slash on path', async () => {
    stubFetch([{ bodyJson: { status: 'applied' } }]);

    await withEnv(
      {
        ...ENABLED_ENV,
        ESP_BASE_URL: 'http://192.168.1.50/',
        ESP_COMMAND_PATH: 'cmd',
      },
      async () => {
        const driver = new EspHttpControllerDriver();
        await driver.sendForcePhase('INT-CAS-001', null, 25);

        expect(fetchCalls[0].url).toBe('http://192.168.1.50/cmd');
      },
    );
  });

  it('threads a null commandId through when context is omitted', async () => {
    stubFetch([{ bodyJson: { status: 'applied' } }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await driver.sendForcePhase('INT-CAS-001', null, 25);

      const body = bodyOf(fetchCalls[0]);
      expect(body['commandId']).toBeNull();
    });
  });
});

describe('EspHttpControllerDriver — response handling', () => {
  it('returns ok=true for status="applied" and includes appliedAt in detail', async () => {
    stubFetch([
      {
        bodyJson: {
          commandId: 'cmd-1',
          status: 'applied',
          appliedAt: '2026-05-04T12:00:00.000Z',
          detail: 'phase set',
        },
      },
    ]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const result = await driver.sendForcePhase('INT-CAS-001', null, 25, {
        commandId: 'cmd-1',
      });

      expect(result.ok).toBe(true);
      expect(result.detail).toMatch(/phase set/);
      expect(result.detail).toMatch(/2026-05-04T12:00:00\.000Z/);
    });
  });

  it('returns ok=false (no throw) when ESP responds 2xx with status="rejected"', async () => {
    stubFetch([
      {
        bodyJson: {
          commandId: 'cmd-1',
          status: 'rejected',
          detail: 'relay locked by watchdog',
        },
      },
    ]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const result = await driver.sendForcePhase('INT-CAS-001', null, 25, {
        commandId: 'cmd-1',
      });

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/relay locked/);
      expect(result.detail).toMatch(/status=rejected/);
    });
  });

  it('still returns ok=true when commandId echoes mismatch (logs warning, accepts result)', async () => {
    stubFetch([
      {
        bodyJson: { commandId: 'cmd-other', status: 'applied' },
      },
    ]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const result = await driver.sendForcePhase('INT-CAS-001', null, 25, {
        commandId: 'cmd-1',
      });

      expect(result.ok).toBe(true);
    });
  });
});

describe('EspHttpControllerDriver — error policy', () => {
  it('throws RETRYABLE on network failure', async () => {
    stubFetch([new TypeError('fetch failed')]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await expect(
        driver.sendForcePhase('INT-CAS-001', null, 25, { commandId: 'cmd-1' }),
      ).rejects.toMatchObject({
        name: 'ControllerDriverError',
        driver: 'esp',
        retryable: true,
      });
    });
  });

  it('throws RETRYABLE on HTTP 5xx', async () => {
    stubFetch([{ status: 503, bodyText: 'service unavailable' }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const promise = driver.sendForcePhase('INT-CAS-001', null, 25, {
        commandId: 'cmd-1',
      });
      await expect(promise).rejects.toMatchObject({ retryable: true });
      await expect(promise).rejects.toThrow(/503/);
    });
  });

  it('throws NON-retryable on HTTP 4xx', async () => {
    stubFetch([{ status: 400, bodyText: 'bad params' }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      const promise = driver.sendForcePhase('INT-CAS-001', null, 25, {
        commandId: 'cmd-1',
      });
      await expect(promise).rejects.toMatchObject({ retryable: false });
      await expect(promise).rejects.toThrow(/bad params/);
    });
  });

  it('throws NON-retryable on 2xx with unparseable JSON body', async () => {
    stubFetch([{ jsonThrows: true }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      await expect(
        driver.sendForcePhase('INT-CAS-001', null, 25, { commandId: 'cmd-1' }),
      ).rejects.toMatchObject({
        name: 'ControllerDriverError',
        driver: 'esp',
        retryable: false,
      });
    });
  });

  it('aborts and throws RETRYABLE when fetch exceeds ESP_TIMEOUT_MS', async () => {
    // Real abort path: fetch with AbortSignal.timeout(50). We stub
    // fetch to honour the signal by rejecting on abort.
    fetchCalls = [];
    fetchMock = jest.fn(async (_url: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(_url), init: init ?? {} });
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (!signal) {
          reject(new Error('expected AbortSignal'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await withEnv({ ...ENABLED_ENV, ESP_TIMEOUT_MS: '50' }, async () => {
      const driver = new EspHttpControllerDriver();
      await expect(
        driver.sendForcePhase('INT-CAS-001', null, 25, {
          commandId: 'cmd-1',
        }),
      ).rejects.toMatchObject({
        name: 'ControllerDriverError',
        driver: 'esp',
        retryable: true,
      });
    });
  }, 2000);

  it('error class is preserved (instanceof ControllerDriverError)', async () => {
    stubFetch([{ status: 500 }]);

    await withEnv(ENABLED_ENV, async () => {
      const driver = new EspHttpControllerDriver();
      try {
        await driver.sendForcePhase('INT-CAS-001', null, 25, {
          commandId: 'cmd-1',
        });
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ControllerDriverError);
      }
    });
  });
});

/**
 * State-machine spec — covers the testable §7 scenarios from
 * docs/esp32-led-prototype-plan.md against the pure simulator core.
 *
 * Hardware-only scenarios (LED visuals, 8h soak, power-cycle reboot,
 * Wi-Fi flicker) are deferred to bench testing.
 */
import {
  EspSimulator,
  IDEMPOTENCY_CACHE_SIZE,
  IDEMPOTENCY_TTL_MS,
  MANUAL_HOLD_TIMEOUT_MS,
  MAX_HOLD_SECONDS,
  MIN_ALL_RED_MS,
  MIN_GREEN_MS,
  MIN_YELLOW_MS,
  WATCHDOG_MS,
  type EspRequestBody,
  type EspResponseBody,
} from './state-machine';

const T0 = 1_000_000; // arbitrary epoch ms; tests use offsets from here.

function build(overrides: { authToken?: string | null } = {}): {
  sim: EspSimulator;
  advance: (ms: number) => number;
  clock: { now: number };
} {
  const clock = { now: T0 };
  const sim = new EspSimulator({ now: clock.now, ...overrides });
  const advance = (ms: number): number => {
    clock.now += ms;
    sim.tick(clock.now);
    return clock.now;
  };
  return { sim, advance, clock };
}

function makeReq(overrides: Partial<EspRequestBody> = {}): EspRequestBody {
  return {
    commandId: overrides.commandId ?? 'cmd-test-1',
    kind: overrides.kind ?? 'force_phase',
    intersection: overrides.intersection ?? 'INT-CAS-001',
    params: overrides.params ?? { direction: 'NORTH', holdSeconds: 10 },
  };
}

describe('EspSimulator — bring-up (§7.1)', () => {
  it('Scenario 1: cold boot leaves all reds ON', () => {
    const { sim } = build();
    expect(sim.getState()).toBe('BOOT_ALL_RED');
    const lights = sim.getLights();
    expect(lights.N.red).toBe('ON');
    expect(lights.S.red).toBe('ON');
    expect(lights.E.red).toBe('ON');
    expect(lights.W.red).toBe('ON');
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      expect(lights[dir].green).toBe('OFF');
      expect(lights[dir].yellow).toBe('OFF');
    }
  });

  it('Scenario 3: first force_phase NS goes through ALL_RED → GREEN → YELLOW → ALL_RED', () => {
    const { sim, advance, clock } = build();
    const res = sim.dispatch(
      makeReq({ params: { direction: 'NORTH', holdSeconds: 10 } }),
      clock.now,
    );
    expect(res.status).toBe('applied');
    expect(sim.getState()).toBe('ALL_RED_TRANSITION');

    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    expect(sim.getLights().N.green).toBe('ON');
    expect(sim.getLights().S.green).toBe('ON');
    expect(sim.getLights().E.green).toBe('OFF');

    // Green must hold at least MIN_GREEN_MS.
    advance(MIN_GREEN_MS - 100);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    // Then proceeds to yellow once holdSeconds (10s) elapses.
    advance(10_000 - MIN_GREEN_MS + 100); // total ≈ 10s in green
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');

    // Yellow holds at least MIN_YELLOW_MS.
    advance(MIN_YELLOW_MS - 100);
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
    advance(200);
    expect(sim.getState()).toBe('ALL_RED_TRANSITION');

    // No pending phase → falls back to BOOT_ALL_RED hold.
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('BOOT_ALL_RED');
  });
});

describe('EspSimulator — normal cycle (§7.2)', () => {
  it('Scenario 4: force_phase EW after settling cycles correctly', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'EAST', holdSeconds: 8 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_EW_GREEN');
    expect(sim.getLights().E.green).toBe('ON');
    expect(sim.getLights().N.red).toBe('ON');

    advance(8_000);
    expect(sim.getState()).toBe('NORMAL_EW_YELLOW');
  });

  it('Scenario 5: update_timing extension extends the active green', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    advance(2_000); // 2s into NS green

    const ext = sim.dispatch(
      {
        commandId: 'c2',
        kind: 'update_timing',
        intersection: 'INT-CAS-001',
        params: { direction: 'NS', extensionSeconds: 5 },
      },
      clock.now,
    );
    expect(ext.status).toBe('applied');
    expect(ext.detail).toMatch(/extended .* by 5s/);

    // Original 10s + 5s extension = 15s of green.
    advance(13_000); // total 15s — should hit yellow boundary
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
  });

  it('clamps extensionSeconds above MAX_EXTENSION_SECONDS (30)', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);

    sim.dispatch(
      {
        commandId: 'c2',
        kind: 'update_timing',
        intersection: 'INT-CAS-001',
        params: { extensionSeconds: 999 },
      },
      clock.now,
    );

    // 10s (initial) + 30s (clamped extension) = 40s before yellow.
    advance(39_500);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    advance(1_000);
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
  });

  it('Scenario 6: alternating force_phase commands respect MIN_GREEN_MS', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    advance(2_000); // 2s into NS green (still under MIN_GREEN_MS)

    // Issue an EW force_phase — must wait until min-green elapses.
    sim.dispatch(
      makeReq({
        commandId: 'c2',
        params: { direction: 'EAST', holdSeconds: 8 },
      }),
      clock.now,
    );
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    // Min-green ends 5s after entering — we're 2s in, so 3s more.
    advance(3_000);
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
    advance(MIN_YELLOW_MS);
    expect(sim.getState()).toBe('ALL_RED_TRANSITION');
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_EW_GREEN');
  });
});

describe('EspSimulator — manual control (§7.3)', () => {
  it('Scenario 7: set_manual_mode true pins to a pair', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    const res = sim.dispatch(
      {
        commandId: 'mm-on',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: true, source: 'event' },
      },
      clock.now,
    );
    expect(res.status).toBe('applied');
    expect(sim.getState()).toBe('MANUAL_HOLD');
    expect(sim.getLights().N.green).toBe('ON');

    // Holds across long durations (under cap).
    advance(20_000);
    expect(sim.getState()).toBe('MANUAL_HOLD');
  });

  it('Scenario 9: set_manual_mode false resumes from all-red', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    sim.dispatch(
      {
        commandId: 'mm-on',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: true, source: 'event' },
      },
      clock.now,
    );
    advance(5_000);

    sim.dispatch(
      {
        commandId: 'mm-off',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: false, source: 'manual_release' },
      },
      clock.now,
    );
    expect(sim.getState()).toBe('ALL_RED_TRANSITION');
    advance(MIN_ALL_RED_MS);
    // No pending phase → BOOT_ALL_RED hold.
    expect(sim.getState()).toBe('BOOT_ALL_RED');
  });

  it('MANUAL_HOLD auto-releases after MANUAL_HOLD_TIMEOUT_MS', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    sim.dispatch(
      {
        commandId: 'mm-on',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: true, source: 'event' },
      },
      clock.now,
    );
    advance(MANUAL_HOLD_TIMEOUT_MS);
    expect(sim.getState()).toBe('ALL_RED_TRANSITION');
  });
});

describe('EspSimulator — safety + fault injection (§7.4)', () => {
  it('Scenario 10: override press during green forces FAILSAFE_FLASH', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    sim.pressOverride(clock.now);
    expect(sim.getState()).toBe('FAILSAFE_FLASH');
    expect(sim.getLights().N.red).toBe('ON');
  });

  it('Scenario 11: releasing override does NOT auto-recover; needs set_manual_mode false', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    sim.pressOverride(clock.now);
    sim.releaseOverride();
    advance(2_000);
    expect(sim.getState()).toBe('FAILSAFE_FLASH');

    // Any new command while in FAILSAFE_FLASH is rejected with detail.
    const rejected = sim.dispatch(
      makeReq({ commandId: 'after-release' }),
      clock.now,
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.detail).toMatch(/failsafe_flash_active/);
  });

  it('Scenario 12: watchdog trips WATCHDOG_MS after the active phase ends with no further commands', () => {
    const { sim, advance, clock } = build();
    // Short hold so the natural cycle settles in BOOT_ALL_RED quickly.
    // Watchdog deadline = max(lastCommandAt + 30s, phaseEndsAt + 30s)
    // = max(0+30, 11+30) = 41 s.
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 6 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    // The natural cycle finishes (green 6s + yellow 3s + all-red 1s
    // = 10 s) and settles in BOOT_ALL_RED. BOOT_ALL_RED is excluded
    // from the watchdog, so we never trip — that is the expected
    // safe behaviour after a complete cycle.
    advance(15_000);
    expect(sim.getState()).toBe('BOOT_ALL_RED');

    // To actually trip the watchdog, we need to be in a non-quiescent
    // state past the deadline. Issue a fresh force_phase, then go
    // silent for WATCHDOG_MS + the green hold.
    sim.dispatch(
      makeReq({
        commandId: 'c2',
        params: { direction: 'EAST', holdSeconds: 6 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS); // enter green
    expect(sim.getState()).toBe('NORMAL_EW_GREEN');

    // phaseEndsAt is now (clock.now + 6s). Watchdog deadline =
    // (clock.now + 6) + WATCHDOG_MS. Advance past that.
    advance(6_000 + WATCHDOG_MS + 100);
    expect(sim.getState()).toBe('FAILSAFE_FLASH');
  });

  it('FAILSAFE_FLASH toggles all-red ↔ all-off at flash period', () => {
    const { sim, advance, clock } = build();
    sim.pressOverride(clock.now);
    expect(sim.getLights().N.red).toBe('ON');
    advance(600); // > FLASH_HALF_PERIOD_MS
    expect(sim.getLights().N.red).toBe('OFF');
    advance(600);
    expect(sim.getLights().N.red).toBe('ON');
  });

  it('Scenario 14: duplicate commandId returns cached response, no state change', () => {
    const { sim, advance, clock } = build();
    const first = sim.dispatch(
      makeReq({
        commandId: 'dup',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    // Send same commandId again with completely different intent.
    const replay = sim.dispatch(
      {
        commandId: 'dup',
        kind: 'set_manual_mode',
        intersection: 'INT-CAS-001',
        params: { enabled: true },
      },
      clock.now,
    );
    expect(replay).toEqual(first);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN'); // unchanged
  });

  it('Scenario 15: invalid direction is rejected', () => {
    const { sim, clock } = build();
    const res = sim.dispatch(
      makeReq({
        commandId: 'bad',
        params: { direction: 'BOTH' },
      }),
      clock.now,
    );
    expect(res.status).toBe('rejected');
    expect(res.detail).toBe('invalid_direction');
    expect(sim.getState()).toBe('BOOT_ALL_RED');
  });

  it('Scenario 18: holdSeconds below MIN_GREEN is clamped, never skips yellow', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 1 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');

    // hold was clamped to MIN_GREEN_MS/1000 = 5s.
    advance(MIN_GREEN_MS - 100);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    advance(200);
    // Yellow entered at the green's scheduled end (boundary-exact);
    // stay comfortably inside the yellow window for the assertion.
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
    advance(MIN_YELLOW_MS - 500);
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
  });

  it('clamps holdSeconds above MAX_HOLD_SECONDS (60)', () => {
    const { sim, advance, clock } = build();
    sim.dispatch(
      makeReq({
        commandId: 'c1',
        params: { direction: 'NORTH', holdSeconds: 9999 },
      }),
      clock.now,
    );
    advance(MIN_ALL_RED_MS);
    advance(MAX_HOLD_SECONDS * 1000 - 100);
    expect(sim.getState()).toBe('NORMAL_NS_GREEN');
    advance(200);
    expect(sim.getState()).toBe('NORMAL_NS_YELLOW');
  });
});

describe('EspSimulator — auth, validation, idempotency cache', () => {
  it('rejects with detail=unauthorized when authToken is set but header is missing', () => {
    const { sim, clock } = build({ authToken: 'secret' });
    const res = sim.dispatch(makeReq(), clock.now /* no auth header */);
    expect(res.status).toBe('rejected');
    expect(res.detail).toBe('unauthorized');
  });

  it('rejects with detail=unauthorized when token mismatches', () => {
    const { sim, clock } = build({ authToken: 'secret' });
    const res = sim.dispatch(makeReq(), clock.now, 'Bearer wrong');
    expect(res.status).toBe('rejected');
    expect(res.detail).toBe('unauthorized');
  });

  it('accepts when bearer matches', () => {
    const { sim, clock } = build({ authToken: 'secret' });
    const res = sim.dispatch(makeReq(), clock.now, 'Bearer secret');
    expect(res.status).toBe('applied');
  });

  it('rejects malformed body with descriptive detail', () => {
    const { sim, clock } = build();
    expect(
      sim.dispatch({ ...makeReq(), commandId: '' } as EspRequestBody, clock.now)
        .detail,
    ).toBe('missing_commandId');
    expect(
      sim.dispatch(
        { ...makeReq(), kind: 'wat' as never } as EspRequestBody,
        clock.now,
      ).detail,
    ).toBe('unknown_kind');
    expect(
      sim.dispatch(
        { ...makeReq(), intersection: '' } as EspRequestBody,
        clock.now,
      ).detail,
    ).toBe('missing_intersection');
  });

  it('idempotency cache evicts oldest entry at IDEMPOTENCY_CACHE_SIZE', () => {
    const { sim, clock } = build();
    for (let i = 0; i < IDEMPOTENCY_CACHE_SIZE + 5; i += 1) {
      sim.dispatch(
        makeReq({
          commandId: `cmd-${i}`,
          params: { direction: 'NORTH', holdSeconds: 10 },
        }),
        clock.now,
      );
    }
    const diag = sim.getDiagnostics(clock.now);
    expect(diag.idempotencyCacheSize).toBe(IDEMPOTENCY_CACHE_SIZE);
  });

  it('idempotency entry expires after IDEMPOTENCY_TTL_MS — duplicate id is re-handled', () => {
    const { sim, advance, clock } = build();
    const first = sim.dispatch(
      makeReq({
        commandId: 'dup',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    // Replay immediately — gets cached response.
    const replayCached = sim.dispatch(
      makeReq({
        commandId: 'dup',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    expect(replayCached).toEqual(first);

    // Advance past the TTL while sending heartbeat commands every 20 s
    // (real backend does the equivalent every TICK_MS=30 s). Each
    // heartbeat pushes the watchdog deadline forward.
    for (
      let elapsed = 0;
      elapsed < IDEMPOTENCY_TTL_MS + 1_000;
      elapsed += 20_000
    ) {
      advance(20_000);
      sim.dispatch(
        makeReq({
          commandId: `heartbeat-${elapsed}`,
          params: { direction: 'NORTH', holdSeconds: 10 },
        }),
        clock.now,
      );
    }

    // Cache entry for 'dup' has expired; the same commandId is now
    // processed afresh. (In a real run this would be a separate intent
    // that reused the same id by mistake — we re-process so the field
    // action matches the most recent intent.)
    const replayExpired = sim.dispatch(
      makeReq({
        commandId: 'dup',
        params: { direction: 'NORTH', holdSeconds: 10 },
      }),
      clock.now,
    );
    expect(replayExpired.appliedAt).not.toBe(first.appliedAt);
    expect(replayExpired.status).toBe('applied');
  });
});

describe('EspSimulator — invariant: BOOT_ALL_RED watchdog rule', () => {
  it('does NOT trip watchdog while sitting in BOOT_ALL_RED', () => {
    const { sim, advance } = build();
    advance(WATCHDOG_MS * 2);
    expect(sim.getState()).toBe('BOOT_ALL_RED');
  });
});

describe('EspSimulator — response shape (decision sheet #12, #13)', () => {
  it('applied response carries appliedAt as ISO string and a non-empty detail', () => {
    const { sim, clock } = build();
    const res: EspResponseBody = sim.dispatch(makeReq(), clock.now);
    expect(res.status).toBe('applied');
    expect(typeof res.appliedAt).toBe('string');
    expect(() => new Date(res.appliedAt!).toISOString()).not.toThrow();
    expect(res.detail.length).toBeGreaterThan(0);
    expect(res.commandId).toBe('cmd-test-1');
  });

  it('rejected response has appliedAt=null and detail=invariant name', () => {
    const { sim, clock } = build();
    const res = sim.dispatch(
      makeReq({
        commandId: 'bad',
        params: { direction: 'WHATEVER' },
      }),
      clock.now,
    );
    expect(res.status).toBe('rejected');
    expect(res.appliedAt).toBeNull();
    expect(res.detail).toBe('invalid_direction');
  });
});

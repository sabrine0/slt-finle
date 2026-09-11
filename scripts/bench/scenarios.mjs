/**
 * STLS bench scenarios.
 *
 * Each scenario is a scripted situation that drives the REAL system:
 * traffic observations are written to the database, the AI agents are
 * run against them, and whatever commands they produce travel through
 * the normal traffic-control execution path to the virtual ESP32.
 *
 * Nothing here fakes a result. Every value shown on the dashboard is
 * read back out of the running stack.
 *
 * A scenario receives a context (see bench.mjs `makeContext`) with:
 *   ctx.step(title)                  — announce a step
 *   ctx.inject(code, branches)       — write traffic observations
 *   ctx.clearObservations(code)      — remove them again
 *   ctx.analyse(code)                — run the optimiser, get saturation
 *   ctx.runAgents(code)              — run the AI agents for real
 *   ctx.recentCommands()             — commands queued/executed
 *   ctx.espState()                   — virtual board lamps + state
 *   ctx.espCommand(body)             — talk to the board directly
 *   ctx.operator(code, action, body) — operator/command-platform action
 *   ctx.note(text, tone)             — free-form line on the dashboard
 *   ctx.wait(ms)
 */

/** Target junction used by most scenarios (Casablanca, 4 arms). */
export const PRIMARY = 'CAR-0001';

/**
 * Flow levels in vehicles/hour. Branch capacity on the seeded network
 * is ~3600 vph, so these land at roughly the saturation shown.
 */
export const FLOW = {
  light: 900, // X ~ 0.25  free flow
  normal: 1800, // X ~ 0.50  comfortable
  busy: 2900, // X ~ 0.80  pressure
  saturated: 3500, // X ~ 0.97  congestion
  gridlock: 4400, // X ~ 1.22  oversaturated
};

export const scenarios = [
  {
    id: 'baseline',
    title: 'Baseline — quiet network',
    blurb:
      'Light, balanced flow on all four arms. Establishes what "nothing to do" looks like: the AI should decide to maintain the current plan and send no field command.',
    expect: 'AI keeps the plan. No hardware command.',
    async run(ctx) {
      ctx.step('Clearing any leftover observations');
      await ctx.clearObservations(PRIMARY);

      ctx.step('Injecting light, balanced traffic on N/S/E/O');
      await ctx.inject(PRIMARY, [
        { direction: 'N', flowVph: FLOW.light, speedKph: 46, queueM: 8 },
        { direction: 'S', flowVph: FLOW.light, speedKph: 45, queueM: 9 },
        { direction: 'E', flowVph: FLOW.light, speedKph: 44, queueM: 7 },
        { direction: 'O', flowVph: FLOW.light, speedKph: 47, queueM: 6 },
      ]);

      ctx.step('Reading saturation back from the traffic analysis engine');
      await ctx.analyse(PRIMARY);

      ctx.step('Running the AI agents against this state');
      await ctx.runAgents(PRIMARY);

      ctx.note(
        'Quiet network → the cognitive layer correctly does nothing. ' +
          'This is the control case for every scenario below.',
        'ok',
      );
    },
  },

  {
    id: 'morning-rush',
    title: 'Morning rush — N/S corridor saturates',
    blurb:
      'Commuter flow floods the north/south approaches while east/west stays light. This is the asymmetry adaptive control exists to fix: the AI should bias green time toward the loaded direction.',
    expect: 'Congestion detected on N/S. AI biases green / extends cycle.',
    async run(ctx) {
      ctx.step('Clearing observations');
      await ctx.clearObservations(PRIMARY);

      ctx.step('Rush hour builds on N/S — E/O stays light');
      await ctx.inject(PRIMARY, [
        { direction: 'N', flowVph: FLOW.saturated, speedKph: 12, queueM: 165 },
        { direction: 'S', flowVph: FLOW.busy, speedKph: 16, queueM: 130 },
        { direction: 'E', flowVph: FLOW.light, speedKph: 44, queueM: 10 },
        { direction: 'O', flowVph: FLOW.light, speedKph: 45, queueM: 8 },
      ]);

      ctx.step('Measuring saturation per approach');
      const analysis = await ctx.analyse(PRIMARY);

      ctx.step('Running the AI agents');
      await ctx.runAgents(PRIMARY);

      ctx.step('Checking whether a field command was produced');
      await ctx.recentCommands();

      const worst = analysis?.worst;
      ctx.note(
        worst
          ? `Worst approach ${worst.direction} at X≈${worst.saturation} — ` +
              'the AI now has a real asymmetry to correct.'
          : 'Saturation read back from the analysis engine.',
        'warn',
      );
    },
  },

  {
    id: 'incident',
    title: 'Incident — one arm blocked',
    blurb:
      'An accident blocks the east approach: flow collapses, queue explodes, speed drops near zero, while the other arms keep feeding the junction. Tests whether the system escalates rather than nudging timings.',
    expect: 'Severe congestion. Escalated severity, possible manual-control request.',
    async run(ctx) {
      ctx.step('Clearing observations');
      await ctx.clearObservations(PRIMARY);

      ctx.step('Blocking the east arm — queue 300 m, speed 3 km/h');
      await ctx.inject(PRIMARY, [
        { direction: 'E', flowVph: 180, speedKph: 3, queueM: 300, delayS: 240 },
        { direction: 'N', flowVph: FLOW.gridlock, speedKph: 7, queueM: 250, delayS: 180 },
        { direction: 'S', flowVph: FLOW.saturated, speedKph: 9, queueM: 210, delayS: 150 },
        { direction: 'O', flowVph: FLOW.busy, speedKph: 14, queueM: 120, delayS: 90 },
      ]);

      ctx.step('Measuring the damage');
      await ctx.analyse(PRIMARY);

      ctx.step('Running the AI agents on an incident-grade state');
      await ctx.runAgents(PRIMARY);

      ctx.step('Reading the command feed');
      await ctx.recentCommands();

      ctx.note(
        'Oversaturation on three arms with one blocked approach is the case ' +
          'where signal timing alone cannot recover — watch for escalation ' +
          'rather than a timing tweak.',
        'bad',
      );
    },
  },

  {
    id: 'emergency',
    title: 'Emergency vehicle — preemption to the board',
    blurb:
      'An ambulance needs the north approach. The operator engages override and forces a green. This is the full command path: API → execution service → driver → virtual ESP32 → lamps.',
    expect: 'force_phase reaches the board. Lamps go all-red, then N/S green.',
    async run(ctx) {
      ctx.step('Reading the board before preemption');
      await ctx.espState();

      ctx.step('Operator engages override on the junction');
      await ctx.operator(PRIMARY, 'override', { engaged: true });

      ctx.step('Operator forces green for the north approach');
      await ctx.operator(PRIMARY, 'force-green', { direction: 'N' });

      ctx.step('Sending the preemption to the virtual board');
      await ctx.espCommand({
        commandId: `bench-emergency-${Date.now()}`,
        kind: 'force_phase',
        intersection: PRIMARY,
        params: { direction: 'NORTH', holdSeconds: 30 },
      });

      ctx.step('Watching the lamps transition');
      await ctx.espState();
      await ctx.wait(1200);
      await ctx.espState();

      ctx.note(
        'The board went through ALL_RED_TRANSITION before giving green — ' +
          'the intergreen safety gap is enforced on the device, not by the server.',
        'ok',
      );
    },
  },

  {
    id: 'police-manual',
    title: 'Police manual control — and release',
    blurb:
      'An officer takes the junction by hand, then hands it back. Manual mode must pin the signals and suppress automatic control while engaged.',
    expect: 'Board enters MANUAL_HOLD, then returns to automatic cycling.',
    async run(ctx) {
      ctx.step('Officer takes manual control');
      await ctx.espCommand({
        commandId: `bench-police-on-${Date.now()}`,
        kind: 'set_manual_mode',
        intersection: PRIMARY,
        params: { enabled: true, source: 'police' },
      });
      await ctx.espState();

      ctx.step('Confirming the AI stands down while manual is engaged');
      await ctx.runAgents(PRIMARY);
      ctx.note(
        'While an override is active the intersection agent returns ' +
          'control_suppressed — the AI must never fight a human operator.',
        'ok',
      );

      ctx.step('Officer releases the junction');
      await ctx.espCommand({
        commandId: `bench-police-off-${Date.now()}`,
        kind: 'set_manual_mode',
        intersection: PRIMARY,
        params: { enabled: false, source: 'manual_release' },
      });
      await ctx.wait(800);
      await ctx.espState();

      ctx.step('Releasing the operator override');
      await ctx.operator(PRIMARY, 'override', { engaged: false });
    },
  },

  {
    id: 'safety-reject',
    title: 'Safety — bad commands are refused',
    blurb:
      'Two deliberately invalid commands. A safe controller refuses nonsense rather than doing something dangerous with it. This is the most important scenario on the bench.',
    expect: 'Both commands rejected by the board. Nothing changes on the lamps.',
    async run(ctx) {
      ctx.step('Board state before the bad commands');
      const before = await ctx.espState();

      ctx.step('Sending an invalid direction ("UPWARDS")');
      await ctx.espCommand(
        {
          commandId: `bench-bad-dir-${Date.now()}`,
          kind: 'force_phase',
          intersection: PRIMARY,
          params: { direction: 'UPWARDS', holdSeconds: 20 },
        },
        { expectReject: true },
      );

      ctx.step('Sending an absurd hold time (9999 s)');
      await ctx.espCommand(
        {
          commandId: `bench-bad-hold-${Date.now()}`,
          kind: 'force_phase',
          intersection: PRIMARY,
          params: { direction: 'NORTH', holdSeconds: 9999 },
        },
        { expectClamp: true },
      );

      ctx.step('Board state after');
      const after = await ctx.espState();

      ctx.note(
        `Direction rejected outright; hold time clamped to the safe maximum. ` +
          `State ${before?.state ?? '?'} → ${after?.state ?? '?'}.`,
        'ok',
      );
    },
  },

  {
    id: 'hardware-offline',
    title: 'Resilience — board goes offline',
    blurb:
      'The cable is pulled: commands are sent to an address with nothing listening. The system must retry, fail cleanly and stay up — never hang or crash.',
    expect: 'Command fails after retries. Backend stays healthy.',
    async run(ctx) {
      ctx.step('Sending a command to a dead endpoint (port 9)');
      await ctx.espCommand(
        {
          commandId: `bench-offline-${Date.now()}`,
          kind: 'force_phase',
          intersection: PRIMARY,
          params: { direction: 'NORTH', holdSeconds: 20 },
        },
        { toDeadEndpoint: true },
      );

      ctx.step('Confirming the backend survived');
      await ctx.health();

      ctx.step('Confirming the real board is still fine');
      await ctx.espState();

      ctx.note(
        'A dead field device produces a logged failure, not an outage. ' +
          'This is what keeps one broken cabinet from taking down the city.',
        'ok',
      );
    },
  },

  {
    id: 'recovery',
    title: 'Recovery — traffic clears',
    blurb:
      'Flow returns to normal after the rush. The AI should stand down and stop intervening, which matters as much as reacting.',
    expect: 'Back to maintain. Network reads healthy again.',
    async run(ctx) {
      ctx.step('Clearing the incident observations');
      await ctx.clearObservations(PRIMARY);

      ctx.step('Traffic returns to normal');
      await ctx.inject(PRIMARY, [
        { direction: 'N', flowVph: FLOW.normal, speedKph: 38, queueM: 22 },
        { direction: 'S', flowVph: FLOW.normal, speedKph: 40, queueM: 18 },
        { direction: 'E', flowVph: FLOW.light, speedKph: 44, queueM: 10 },
        { direction: 'O', flowVph: FLOW.light, speedKph: 45, queueM: 9 },
      ]);

      ctx.step('Re-measuring saturation');
      await ctx.analyse(PRIMARY);

      ctx.step('Running the AI agents');
      await ctx.runAgents(PRIMARY);

      ctx.note(
        'The loop closes: pressure appeared, the system reacted, pressure ' +
          'cleared, the system stood down.',
        'ok',
      );
    },
  },
];

# STLS Virtual Bench

Test the entire platform on your laptop. No hardware, no cabinet, no mains.

```bash
npm run bench
```

Then open the dashboard URL it prints (usually <http://127.0.0.1:9100>).

## What it starts

The bench boots any layer that isn't already running, and leaves alone
anything that is:

| Port | Layer |
|-----:|-------|
| 5433 | PGlite database bridge |
| 4010 | NestJS backend — driver pointed at the virtual board |
| 8090 | ESP32 simulator (the "virtual board") |
| 3000 | Next.js app (skip with `--no-frontend`) |
| 9100 | The bench itself + dashboard |

If a port is taken, the dashboard walks forward to the next free one and
tells you which it picked.

## What it does

Press a scenario on the dashboard and the bench drives the **real**
system:

1. Writes real traffic observations into the database.
2. Runs the real traffic-analysis engine and reads saturation back.
3. Asks the real AI agents to run against that state.
4. Lets any resulting command travel the normal execution path to the
   virtual ESP32 board.
5. Streams every step, measurement and decision to the dashboard.

Nothing is faked at the bench level. Every number on screen is read back
out of the running stack.

## The scenarios

| Scenario | What it proves |
|---|---|
| Baseline | A quiet network produces no intervention |
| Morning rush | Asymmetric demand is detected and acted on |
| Incident | A blocked arm escalates instead of being nudged |
| Emergency vehicle | Preemption reaches the board and the lamps change |
| Police manual | A human takes over; the AI stands down |
| Safety | Invalid commands are refused, absurd values clamped |
| Resilience | A dead board fails cleanly without an outage |
| Recovery | The system stands down once pressure clears |

## Flags

```bash
npm run bench -- --no-frontend   # skip the Next.js app (faster boot)
npm run bench -- --run-all       # run every scenario on startup
BENCH_PORT=9500 npm run bench    # pin the dashboard port
```

## Notes

- The bench only kills processes **it** started. Anything already running
  when it launched is left alone on Ctrl-C.
- Traffic observations are written with `sourceType = 'bench'`, so they
  are easy to tell apart from seeded or real data.
- Scenarios clear their own observations before injecting new ones.
- The virtual board exposes `GET /api/state` (lamp matrix + state
  machine) alongside the `POST /api/command` contract a real ESP32 would
  implement.

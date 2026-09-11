# ESP32 Simulator — Usage

The host-side simulator is a drop-in stand-in for the real ESP32
firmware while the bench hardware is being built. It implements the
same `POST /api/command` contract documented in
[esp32-led-prototype-plan.md §6](esp32-led-prototype-plan.md) and the
same response shape pinned in
[esp32-prototype-decisions.md](esp32-prototype-decisions.md).

Source: [backend/src/traffic-control/__tests__/esp-simulator/](../backend/src/traffic-control/__tests__/esp-simulator/).
The simulator lives under `__tests__/` so it never ships in the
production build (`tsconfig.build.json` excludes the folder), but the
CLI entry point is fine to run from a dev shell.

---

## 1. Start the simulator

From the [backend/](../backend/) directory:

```bash
npm run sim:esp
```

You will see a banner like:

```
─────────────────────────────────────────────────────
 ESP32 simulator — STLS bench prototype
─────────────────────────────────────────────────────
 Listening on : http://127.0.0.1:8080
              (host=127.0.0.1, port=8080)
 Auth         : open (no token)
 Tick         : 100 ms
 Endpoint     : POST /api/command
…
```

Each incoming request prints a single-line JSON record to stdout —
pipe through `jq` if you want pretty output:

```bash
npm run sim:esp | jq -c '.'
```

### CLI environment variables

All four are optional — the defaults match the LED-prototype plan.

| Variable | Default | Effect |
|----------|---------|--------|
| `ESP_SIM_PORT` | `8080` | TCP port to bind. Use `0` for an OS-assigned random port. |
| `ESP_SIM_HOST` | `127.0.0.1` | Bind address. Set to `0.0.0.0` to expose on the LAN — only safe inside a trusted network, the simulator has no TLS. |
| `ESP_SIM_AUTH_TOKEN` | *(unset)* | When set, the simulator requires `Authorization: Bearer <token>` and returns 401 otherwise. Match the value to the backend's `ESP_AUTH_TOKEN`. |
| `ESP_SIM_TICK_INTERVAL_MS` | `100` | How often the simulator advances its state machine (yellow timers, watchdog, flash). Real bench operation: leave at default. |

Examples:

```bash
# Bind on the LAN with auth.
ESP_SIM_HOST=0.0.0.0 ESP_SIM_PORT=8080 ESP_SIM_AUTH_TOKEN=secret-token \
  npm run sim:esp

# Quick port-shifted second instance.
ESP_SIM_PORT=8081 npm run sim:esp
```

Stop with `Ctrl-C` (SIGINT) or `kill <pid>` (SIGTERM). The CLI closes
the HTTP server and the watchdog tick loop cleanly.

---

## 2. Point the backend at the simulator

The backend already has a working ESP driver
([backend/src/traffic-control/drivers/esp-http-controller-driver.ts](../backend/src/traffic-control/drivers/esp-http-controller-driver.ts)).
To make it talk to the simulator instead of mock/RS-485/TCP, set these
env vars before starting the backend:

```bash
CONTROLLER_DRIVER=esp           # picks the ESP driver out of the registry
ESP_DRIVER_ENABLED=1            # arms the driver (otherwise it throws retryable)
ESP_BASE_URL=http://127.0.0.1:8080
ESP_AUTH_TOKEN=secret-token     # only when ESP_SIM_AUTH_TOKEN is set on the simulator
ESP_TIMEOUT_MS=1500             # default — request timeout per attempt
```

Verify by issuing a command directly first:

```bash
curl -X POST http://127.0.0.1:8080/api/command \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer secret-token' \
  -d '{
    "commandId":"manual-1",
    "kind":"force_phase",
    "intersection":"INT-CAS-001",
    "params":{"direction":"NORTH","holdSeconds":10}
  }'
```

Expected response (HTTP 200):

```json
{
  "commandId": "manual-1",
  "status": "applied",
  "appliedAt": "2026-05-04T15:00:00.000Z",
  "detail": "pending NS (hold=10s) — current=ALL_RED_TRANSITION"
}
```

If you start the NestJS backend with the env above, the agent
scheduler's commands will reach the simulator and you can watch the
state machine progress through ALL_RED → NS_GREEN → YELLOW → ALL_RED
in real time.

---

## 3. Behaviour the simulator enforces

These match the §5 invariants and are exercised by the unit tests in
[backend/src/traffic-control/__tests__/esp-simulator/state-machine.spec.ts](../backend/src/traffic-control/__tests__/esp-simulator/state-machine.spec.ts):

- All-red on boot. No green until first applied command.
- No conflicting greens. Opposing pairs only (NS or EW), never both.
- `MIN_YELLOW_MS` (3 s), `MIN_ALL_RED_MS` (1 s), `MIN_GREEN_MS` (5 s)
  are floors that no command can shorten.
- `MAX_HOLD_SECONDS` (60), `MAX_EXTENSION_SECONDS` (30),
  `MAX_CYCLE_EXTENSION_SECONDS` (60) are ceilings; values above are
  silently clamped.
- `WATCHDOG_MS` (30 s) — sticky deadline pushed forward by every
  applied command and by every committed long-lived state. Trips to
  `FAILSAFE_FLASH` if exceeded. Excluded states: `BOOT_ALL_RED`,
  `MANUAL_HOLD`, `FAILSAFE_FLASH` itself.
- `MANUAL_HOLD_TIMEOUT_MS` (60 s) — auto-release a forgotten manual
  hold back through `ALL_RED_TRANSITION`.
- Idempotency: 16-entry LRU cache, 60 s TTL on `commandId`.
- 4xx responses (malformed body, unknown kind, rejected by invariant)
  surface to the backend driver as `ok:false` with no retry. 5xx
  responses are retryable.

---

## 4. Quitting the bench prototype loop

Once §8 acceptance criteria in
[esp32-led-prototype-plan.md](esp32-led-prototype-plan.md) are met
against real ESP32 silicon, this simulator becomes a regression-test
fixture only — the production path uses the real `EspHttpControllerDriver`
against the actual ESP32 firmware. The simulator stays in the codebase
to keep the test suite hermetic.

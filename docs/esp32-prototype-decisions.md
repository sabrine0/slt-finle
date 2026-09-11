# STLS ESP32 Prototype — Decisions Sheet

Locks in the open questions from
[esp32-led-prototype-plan.md §9](esp32-led-prototype-plan.md), plus a few
implicit ones surfaced while planning the simulator. Everything below is the
**final** position for the LED prototype stage; revisit at the relays / mains
boundary, not before.

The marker in column 4 means:
- **F** — affects firmware only
- **F+S** — must match between firmware and the host-side simulator
- **B** — affects backend `EspHttpControllerDriver` behaviour

| #  | Question | Recommendation | Reason | Final decision | Scope |
|---:|----------|----------------|--------|----------------|------:|
|  1 | Wi-Fi credentials storage | Hard-code in a `secrets.h` (gitignored) | Lab-only network; SmartConfig / captive portal adds firmware complexity for zero current benefit | **Hard-code SSID + password in `secrets.h`** | F |
|  2 | Bearer token storage | Hard-code constant matching backend `ESP_AUTH_TOKEN` | Token rotation = reflash, fine at this stage | **Hard-code `ESP_AUTH_TOKEN` value in `secrets.h`** | F+S |
|  3 | Direction encoding (single vs pair) | Backend keeps emitting single direction (`NORTH`/`SOUTH`/`EAST`/`WEST`); firmware widens to opposing pair (`NORTH`→{N,S} green, `EAST`→{E,W} green) | Single direction is what the agents already send (see [emergency-vehicle.agent.ts](../backend/src/agents/implementations/emergency-vehicle.agent.ts)). Opposing greens never conflict by §5.2 invariant 2. Avoids a backend refactor and keeps the agent layer agnostic to physical lane geometry. | **Single direction in; firmware/simulator widens to opposing-pair green** | F+S+B |
|  4 | HTTP server library (firmware) | Built-in `WebServer.h` from the ESP32 Arduino core | Smallest dependency footprint; sync model is fine for our 1 req/sec budget | **`WebServer.h`** | F |
|  5 | HTTP server library (simulator) | Built-in `node:http` | Zero dependencies; the simulator routes exactly one path | **`node:http`** | S |
|  6 | Time source for `appliedAt` | NTP at boot; if unsynced, return `null` | Backend driver already accepts `null` (see ESP driver tests). Lying about timestamps would corrupt the audit trail. | **NTP on Wi-Fi connect; `null` when unsynced** | F+S+B |
|  7 | Override-pin debounce | 50 ms software debounce | Single tactile button — adding hardware capacitor adds parts for no real benefit | **50 ms in firmware; not modelled in simulator** | F |
|  8 | Default state when no commands have arrived | Hold `BOOT_ALL_RED` indefinitely | Matches §5.1 invariant 1. No automatic cycle, ever, without an explicit command. | **Hold all-red until first valid command** | F+S |
|  9 | LED active level | Active-HIGH (`HIGH` = lit) | Matches the §4 wiring (anode → resistor → GPIO, cathode → GND). Switching to active-LOW would silently mean "all-red on boot" actually drives every LED while running. | **Active-HIGH** | F |
| 10 | Idempotency cache size & TTL | 16 entries, 60 s TTL (LRU) | Backend retries are at most 3 within ~700 ms total; 16 is wildly safe and fits in <1 KB. | **16-entry LRU, 60 s TTL** | F+S |
| 11 | `update_timing` with no `direction` | Optional; if omitted, extend the currently active green | Backend currently includes `direction`, but a future agent might omit it. Be lenient. | **`direction` optional; falls back to active green** | F+S |
| 12 | Response shape when `status="rejected"` | `commandId` echoes request, `appliedAt: null`, `detail` carries the invariant name that was violated | Backend driver already maps non-`applied` to `ok:false` no-retry; the rationale string lands on `traffic_commands.resolutionNote` which operators read. | **{ commandId, status:"rejected", appliedAt:null, detail:"&lt;reason&gt;" }** | F+S+B |
| 13 | Response shape when `status="applied"` | `commandId`, `status:"applied"`, `appliedAt:<ISO>`, `detail:"<short summary>"` | Same audit-trail reason. `detail` should be human-readable enough for the operator console. | **{ commandId, status:"applied", appliedAt, detail }** | F+S+B |
| 14 | Allowed `force_phase` values for `direction` | `"NORTH" \| "SOUTH" \| "EAST" \| "WEST" \| "NS" \| "EW"` (6 forms) | Single-direction widens to pair per #3; explicit pair forms accepted for forward compatibility (e.g. when a future agent thinks in corridors) | **6 accepted forms; everything else rejected** | F+S+B |
| 15 | Behaviour during Wi-Fi reconnect | Stay in current state; do not change lights; reject incoming commands with HTTP 503 once `WATCHDOG_MS` elapses (no commands → failsafe) | Don't blink the lights every time Wi-Fi flickers; rely on the watchdog for a clean cutover | **Hold lights, no auto-flash until watchdog fires** | F |
| 16 | Behaviour during `MANUAL_HOLD` cap | Auto-release back to `ALL_RED_TRANSITION` after 60 s of MANUAL_HOLD without a fresh command | Prevents a forgotten manual hold from pinning the intersection forever | **60 s MANUAL_HOLD watchdog inside the manual mode** | F+S |
| 17 | Logging contract over Serial / HTTP | Every state transition logs: `{at, from, to, reason, commandId?}`; reject responses include the invariant name | We need a debugging log that survives a watchdog reboot in firmware; in the simulator it goes to `console.log` and is captured by tests. | **Structured one-line JSON per transition** | F+S |
| 18 | Backend `appliedAt` interpretation | Stored verbatim on `traffic_commands.resolutionNote`; never used for scheduling decisions | Clock skew between ESP and backend would cause subtle bugs if used as a "real" timestamp | **Audit-only; backend uses its own `Date.now()` for ordering** | B |

## Constants locked

These are the canonical numeric values referenced across firmware + simulator
and tests. Do not change without updating both.

| Constant | Value | Source |
|----------|------:|--------|
| `MIN_YELLOW_MS` | `3000` | §5.2.3 |
| `MIN_ALL_RED_MS` | `1000` | §5.2.4 |
| `MIN_GREEN_MS` | `5000` | §5.2.5 |
| `WATCHDOG_MS` | `30000` | §5.2.6 |
| `IDEMPOTENCY_TTL_MS` | `60000` | this doc, #10 |
| `IDEMPOTENCY_CACHE_SIZE` | `16` | this doc, #10 |
| `MANUAL_HOLD_TIMEOUT_MS` | `60000` | this doc, #16 |
| `OVERRIDE_DEBOUNCE_MS` | `50` | this doc, #7 |
| `MAX_HOLD_SECONDS` | `60` | §5.2.9 |
| `MAX_EXTENSION_SECONDS` | `30` | §5.2.9 |
| `MAX_CYCLE_EXTENSION_SECONDS` | `60` | §5.2.9 |

## Out of scope (explicitly deferred)

- Pedestrian phases, turn arrows, blank-out signs.
- Detector inputs, vehicle counts, or any sensor-driven logic on the ESP.
- HMAC signing of commands; bearer token only at this stage.
- TLS — bench is wired, not exposed to internet.
- OTA firmware updates.
- Multiple intersections per ESP.
- Conflict-monitor card / NEMA TS-2 hardware interlocks.

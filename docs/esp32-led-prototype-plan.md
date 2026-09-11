# STLS ESP32 LED Prototype Plan

Status: planning only. No hardware ordered, no firmware written.

This document scopes a **4-direction LED-only bench prototype** that exercises the
backend → `EspHttpControllerDriver` → ESP32 → light path end-to-end **before**
any vendor cabinet, RS-485 bus, or AC-mains relay is involved.

It is the precursor — and a deliberately smaller scope — than
[realhal-hardware-integration-spec.md](realhal-hardware-integration-spec.md),
which targets industrial DIN-rail hardware. Build this first; promote what
works to the larger spec when LED behaviour is signed off.

---

## 1. Scope & non-goals

**In scope**
- One simulated 4-direction intersection (N, S, E, W).
- Twelve LEDs total — red / yellow / green per direction.
- ESP32 receives JSON-over-HTTP commands from the existing backend
  driver and drives LEDs accordingly.
- Local fail-safe behaviour (all-red flash) when commands stop arriving
  or the watchdog fires.
- Manual override pushbutton that physically forces all-red flash.

**Out of scope (deferred until after LED sign-off)**
- AC-mains relays / real signal heads.
- Detector simulation inputs.
- Conflict-monitor card / NEMA TS-2 hardware interlocks.
- HMAC signing of commands.
- Over-the-air firmware updates.
- Multi-intersection coordination from one ESP32.

**Why LEDs only first**
- No mains wiring → no electrocution / fire risk during prototyping.
- Failures are visible (LED stuck on/off) but harmless.
- Same firmware/contract that we will reuse when relays are added — the
  GPIO outputs simply drive a relay-board input instead of an LED.

---

## 2. Bill of materials

| Qty | Component | Notes |
|----:|-----------|-------|
| 1 | ESP32 dev board (ESP32-WROOM-32, NodeMCU-32S, or DevKitC) | Any board that exposes ≥ 14 free GPIO and Wi-Fi |
| 12 | Through-hole 5 mm LEDs | 4 × red, 4 × yellow/amber, 4 × green |
| 12 | 220 Ω – 330 Ω 1/4 W resistors | One per LED, sized for ~10 mA at 3.3 V |
| 1 | Half-size or full-size breadboard | 830-tie-point recommended |
| ~20 | Male-to-male jumper wires | Multiple colours for clarity |
| 1 | USB cable (data, not charge-only) | For power + flashing the ESP32 |
| 1 | Tactile pushbutton | Manual override / e-stop simulation |
| 1 | 10 kΩ resistor | Pull-up for the override button (or use internal pull-up) |
| 1 | 5 mm LED + 330 Ω resistor (optional) | External heartbeat LED if onboard LED is hard to see |

Approximate cost: under $20 for everything. No mains, no relays, no enclosure.

---

## 3. ESP32 pin mapping

Pin choice avoids the strapping pins (GPIO 0, 2, 5, 12, 15) for outputs, the
SPI flash pins (GPIO 6 – 11, never available), and input-only pins (34 – 39)
for outputs. The list below is the proposed default; lock it in once a board
is on the bench and any conflicts are confirmed.

### 3.1 Signal LEDs (digital outputs)

| Direction | Red | Yellow | Green |
|-----------|----:|-------:|------:|
| North | GPIO 13 | GPIO 14 | GPIO 27 |
| South | GPIO 26 | GPIO 25 | GPIO 33 |
| East  | GPIO 32 | GPIO 23 | GPIO 22 |
| West  | GPIO 21 | GPIO 19 | GPIO 18 |

All pins driven `OUTPUT`. `digitalWrite(HIGH)` lights the LED through its
series resistor to GND.

### 3.2 Auxiliary I/O

| Function | Pin | Mode | Notes |
|----------|----:|------|-------|
| Heartbeat LED | GPIO 2 | OUTPUT | Onboard LED on most boards; blinks 1 Hz when healthy, 5 Hz on watchdog trip |
| Manual override / e-stop button | GPIO 4 | INPUT_PULLUP | LOW = pressed → forces all-red flash |
| Boot / reset | EN | (board) | Hardware reset button — already on dev boards |

### 3.3 Pins reserved (do not use)

- GPIO 0 — boot mode strapping pin.
- GPIO 1, 3 — UART0 (used for serial logging / flashing).
- GPIO 6 – 11 — internal SPI flash.
- GPIO 12 — strapping pin (MTDI), affects flash voltage at boot.
- GPIO 15 — strapping pin.
- GPIO 34 – 39 — input only.

---

## 4. Wiring diagram

ASCII reference. Each LED branch repeats the same pattern.

```
         3.3 V (or USB 5 V via on-board reg)
                │                                 ESP32
                │                                ┌──────────────┐
                │                                │              │
                │  (heartbeat LED on board)      │  GPIO 2 ─────┘ (built-in)
                │
                │
   ┌────────────┴───── ground rail ────────────────────────────────┐
   │                                                                │
   │  ┌──── GPIO 13 ──[ 220 Ω ]──▶|── (red, North) ────┐            │
   │  │                                                ▼            │
   │  ├──── GPIO 14 ──[ 220 Ω ]──▶|── (yellow, North)  GND          │
   │  ├──── GPIO 27 ──[ 220 Ω ]──▶|── (green, North) ──┘            │
   │  │                                                             │
   │  ├──── GPIO 26 ──[ 220 Ω ]──▶|── (red, South) ────┐            │
   │  ├──── GPIO 25 ──[ 220 Ω ]──▶|── (yellow, South)  ▼            │
   │  ├──── GPIO 33 ──[ 220 Ω ]──▶|── (green, South) ──┘            │
   │  │                                                             │
   │  ├──── GPIO 32 ──[ 220 Ω ]──▶|── (red, East) ─────┐            │
   │  ├──── GPIO 23 ──[ 220 Ω ]──▶|── (yellow, East)   ▼            │
   │  ├──── GPIO 22 ──[ 220 Ω ]──▶|── (green, East) ───┘            │
   │  │                                                             │
   │  ├──── GPIO 21 ──[ 220 Ω ]──▶|── (red, West) ─────┐            │
   │  ├──── GPIO 19 ──[ 220 Ω ]──▶|── (yellow, West)   ▼            │
   │  └──── GPIO 18 ──[ 220 Ω ]──▶|── (green, West) ───┘            │
   │                                                                │
   │  ┌──── GPIO 4 ────[ pushbutton ]─── GND                        │
   │  │      (internal pull-up enabled in firmware)                 │
   └──┘                                                              │
                                                                     │
   USB ───── ESP32 5 V / GND ────────────────────────────────────────┘
```

Conventions:
- `▶|` is the LED diode symbol; cathode toward GND.
- Resistor value 220 Ω at 3.3 V keeps current ≈ 10 mA, well under ESP32's
  12 mA per-pin recommended max and 40 mA absolute max.
- All LED grounds tied to a single rail; that rail tied to ESP32 GND
  exactly once (avoid ground loops).

---

## 5. Safe state machine + invariants

The firmware enforces the following invariants on **every** GPIO write.
A single `applyLights(state)` function is the only place that touches the
output pins; every other path goes through it.

### 5.1 States

| State | Meaning | Pattern |
|-------|---------|---------|
| `BOOT_ALL_RED` | Initial, fail-safe | All 4 reds ON, all yellows/greens OFF |
| `NORMAL_NS_GREEN` | North-South have right of way | N+S green, E+W red |
| `NORMAL_NS_YELLOW` | NS clearing | N+S yellow, E+W red |
| `NORMAL_EW_GREEN` | East-West have right of way | E+W green, N+S red |
| `NORMAL_EW_YELLOW` | EW clearing | E+W yellow, N+S red |
| `ALL_RED_TRANSITION` | Brief all-red between yellow→green for safety | All reds ON |
| `MANUAL_HOLD` | Operator pinned to a phase via `force_phase` | As commanded; reds elsewhere |
| `FAILSAFE_FLASH` | Watchdog tripped or override pressed | All reds blink at 1 Hz |

### 5.2 Hard invariants (firmware MUST enforce)

1. **All-red on boot.** Outputs are driven before the network stack starts.
2. **No conflicting greens.** Green for N or S must NEVER be on at the same
   time as green or yellow for E or W (and vice versa). `applyLights`
   refuses to set such a state and falls into `FAILSAFE_FLASH`.
3. **Yellow always between green and red.** Minimum yellow time
   `MIN_YELLOW_MS = 3000`. Any green→red transition that skips yellow is
   rejected and triggers `FAILSAFE_FLASH`.
4. **All-red guard between phase swaps.** `MIN_ALL_RED_MS = 1000` between
   one direction going red and the cross direction going green.
5. **Minimum green.** `MIN_GREEN_MS = 5000` — even a `force_phase` cannot
   shorten an active green below this.
6. **Watchdog.** If no command (and no heartbeat) is received for
   `WATCHDOG_MS = 30000`, transition to `FAILSAFE_FLASH`.
7. **Override pin.** `GPIO 4 == LOW` immediately forces `FAILSAFE_FLASH`,
   regardless of any active command. State persists until pin goes HIGH
   AND a fresh `set_manual_mode enabled=false` command is received.
8. **Idempotent commands.** A `commandId` already executed within the last
   `IDEMPOTENCY_TTL_MS = 60000` returns the cached response and does not
   re-toggle outputs.
9. **Bounded command parameters.**
   - `holdSeconds`: clamped to [`MIN_GREEN_MS`/1000, 60]
   - `extensionSeconds`: clamped to [0, 30]
   - `cycleExtensionSeconds`: clamped to [0, 60]
10. **No green during boot or Wi-Fi reconnection.** If `WiFi.status() != WL_CONNECTED`, the firmware refuses to leave `BOOT_ALL_RED` or `FAILSAFE_FLASH`.

### 5.3 Mapping HTTP commands → states

| Command kind | Required params | Effect |
|--------------|-----------------|--------|
| `force_phase` | `direction ∈ {N, S, E, W, NS, EW}`, `holdSeconds` | Transition to corresponding green for at least `holdSeconds`, observing yellow + all-red guards |
| `update_timing` | `direction`, `extensionSeconds` ∨ `cycleExtensionSeconds` | Extend the currently active green by `extensionSeconds`, capped by clamps above; `cycleExtensionSeconds` re-balances next full cycle |
| `set_manual_mode` | `enabled: bool`, `source: string` | `true` → `MANUAL_HOLD` (held until release); `false` → resume `NORMAL_*` cycle starting from `ALL_RED_TRANSITION` |

Commands that violate any invariant return:
```json
{ "commandId": "<echo>", "status": "rejected", "appliedAt": null,
  "detail": "rejected: <invariant name>" }
```

The backend driver already treats `status != "applied"` as `ok:false` with
no retry — see [esp-http-controller-driver.ts](../backend/src/traffic-control/drivers/esp-http-controller-driver.ts).

### 5.4 Failure response matrix

| Trigger | Action | Recovery |
|---------|--------|----------|
| Wi-Fi drops | Stay in current state until watchdog fires | Auto-reconnect; resume on next valid command |
| Watchdog (`WATCHDOG_MS` no commands) | `FAILSAFE_FLASH` | Resume on next valid command + 1 cycle of `BOOT_ALL_RED` |
| Override button pressed | Immediate `FAILSAFE_FLASH` | Button released **AND** `set_manual_mode false` |
| Power glitch / reset | `BOOT_ALL_RED` for 2 s, then await commands | Backend re-issues last command |
| Unparseable / invalid command | HTTP 400, no state change | None needed |
| Internal exception | `FAILSAFE_FLASH`, log via Serial | Manual reboot |

---

## 6. Firmware skeleton (sketch only)

Not committed code — just the shape we will implement. A single Arduino /
PlatformIO sketch per ESP32. Key pieces:

1. `setup()`
   - `pinMode(OUTPUT)` for all 12 LED pins, `LOW` immediately.
   - `pinMode(INPUT_PULLUP)` for override pin.
   - `pinMode(OUTPUT)` for heartbeat pin.
   - Wi-Fi connect with timeout (no green allowed before `WL_CONNECTED`).
   - Start `WebServer` (built-in `ESPAsyncWebServer` or `WebServer.h`) with one route: `POST /api/command`.
   - Initialise state to `BOOT_ALL_RED`.

2. `loop()`
   - Service HTTP requests.
   - Tick the state machine (yellow timers, green-min, all-red guard, watchdog).
   - Toggle heartbeat LED at 1 Hz (5 Hz in `FAILSAFE_FLASH`).
   - Sample override pin.

3. `handleCommand(JsonDocument req)`
   - Validate Bearer token (`ESP_AUTH_TOKEN`).
   - Validate `commandId` against a tiny ring-buffer of last 16 IDs.
   - Validate `kind`, `intersection`, `params`.
   - Compute target state. Run invariants. Reject or accept.
   - Reply with `{ commandId, status, appliedAt, detail }`.

4. `applyLights(state)`
   - The **only** function that calls `digitalWrite` on signal pins.
   - Asserts invariants 2 and 3 again before writing — defense in depth.

---

## 7. Test scenarios

Order matters: each scenario assumes the previous ones pass. Run each on
the bench and capture a short video for the proof folder.

### 7.1 Bring-up

| # | Scenario | Expected |
|--:|----------|----------|
| 1 | Cold boot, no Wi-Fi | All 4 reds ON within 200 ms; heartbeat LED solid (no Wi-Fi) |
| 2 | Cold boot, Wi-Fi available | After Wi-Fi connects, heartbeat blinks 1 Hz; lights stay all-red until first command |
| 3 | First valid command (`force_phase NS, holdSeconds=10`) | All-red guard 1 s → NS green for ≥ 5 s and ≤ 10 s → NS yellow ≥ 3 s → all-red |

### 7.2 Normal cycle behaviour

| # | Scenario | Expected |
|--:|----------|----------|
| 4 | `force_phase EW, 8s` after #3 settled | All-red 1 s → EW green 8 s → EW yellow 3 s → all-red |
| 5 | `update_timing extensionSeconds=5` mid-NS-green | Active green extends by 5 s; clamped if extension would exceed 30 s |
| 6 | Two `force_phase` commands back-to-back, alternating directions | Second command honoured **only after** first completes its `MIN_GREEN_MS` + yellow + all-red |

### 7.3 Manual control

| # | Scenario | Expected |
|--:|----------|----------|
| 7 | `set_manual_mode true, source="event"` | Transition to `MANUAL_HOLD` (current direction stays green up to 60 s cap) |
| 8 | `force_phase NS` while in `MANUAL_HOLD` | Honoured — operator can pin a specific direction |
| 9 | `set_manual_mode false` | All-red 1 s → resume normal cycle |

### 7.4 Safety + fault injection

| # | Scenario | Expected |
|--:|----------|----------|
| 10 | Press override button mid-green | Immediate `FAILSAFE_FLASH` (all reds blink 1 Hz) |
| 11 | Release override, send `set_manual_mode false` | Resume normal; no green until next `force_phase` |
| 12 | Pull Wi-Fi router during a green | After `WATCHDOG_MS` (30 s), `FAILSAFE_FLASH` |
| 13 | Restore Wi-Fi, backend resumes | Next command re-establishes normal cycle |
| 14 | Send same `commandId` twice | Second response = first response, output does not toggle twice |
| 15 | Send `force_phase` with invalid `direction` (e.g. `"BOTH"`) | HTTP 200 + `status:"rejected"`, no state change |
| 16 | Send malformed JSON | HTTP 400, no state change |
| 17 | Send command with wrong Bearer token | HTTP 401, no state change |
| 18 | Crafted "skip yellow" sequence: `force_phase NS hold=2` | Rejected — `holdSeconds` clamped to `MIN_GREEN_MS`/1000 = 5; OR if firmware accepts the clamp, yellow + all-red guards still observed |
| 19 | Power-cycle ESP mid-yellow | After reboot, all-red 2 s; backend re-issues |
| 20 | Sustained 10 cmd/s for 60 s (all `update_timing` 0 s extensions) | No relay chatter (LED equivalent: no flicker), no missed acks, average response < 200 ms |

### 7.5 Soak

| # | Scenario | Expected |
|--:|----------|----------|
| 21 | Run a continuous NS↔EW cycle (15 s green, 3 s yellow, 1 s all-red) for 8 h | No state corruption; heartbeat steady; memory usage stable; no watchdog trips |

---

## 8. Acceptance criteria — when can we move past this prototype

All of the following must be true before considering relays / mains / vendor
cabinet integration:

- Scenarios 1–20 pass on at least two physically distinct ESP32 boards
  (rules out a single-unit defect).
- Scenario 21 passes end-to-end with no manual intervention.
- Watchdog has been triggered intentionally during a soak run and the
  recovery path was clean (lights returned to a valid state, backend
  marked the missed commands as `failed`).
- Backend logs show a 1-to-1 match between commands sent and `traffic_commands.id`s
  acknowledged by the ESP — i.e. the persisted command audit trail is
  consistent with the physical light history.
- Override button has been tested while every other state is active.
- A non-author has reviewed wiring against this document and confirmed:
  no LED is wired without a resistor, no GPIO is shared, all-red is the
  default on every reset.

---

## 9. Open questions / decisions needed

These are blockers for implementation, not for this plan:

1. **Wi-Fi credentials handling** — hard-code in firmware (simplest, fine for lab) or use ESP32 SmartConfig / captive portal? Recommend: hard-code for the prototype, revisit before any field test.
2. **Bearer token storage** — hard-code, or read from EEPROM on first boot? Recommend: hard-code constant matching backend `ESP_AUTH_TOKEN` for the prototype.
3. **Direction encoding** — does the backend send `"NORTH"` / `"SOUTH"` / `"EAST"` / `"WEST"`, or also pair forms `"NS"` / `"EW"`? The agent layer currently emits single-direction strings (see [emergency-vehicle.agent.ts](../backend/src/agents/implementations/emergency-vehicle.agent.ts) `pickDirection`). Decide whether the firmware translates `"NORTH"` → `"NS"` (hold both) or whether the backend sends pair codes. Recommend: firmware accepts both, treats single direction as "this direction green, opposite also green" since opposing greens never conflict.
4. **HTTP server library** — `WebServer.h` (built-in, blocking) is enough for the prototype; `ESPAsyncWebServer` is more capable but adds a dependency. Recommend: `WebServer.h` for v1.
5. **Time source for `appliedAt`** — ESP32 has no RTC by default. Either NTP-sync on boot (preferred), or omit `appliedAt` and let the backend stamp on receipt. Recommend: NTP at boot, fall back to `null` if unsynced.
6. **Override-pin debounce** — software-only is fine for a tactile button. Recommend: 50 ms debounce in firmware, no extra hardware.

When these are decided, the next deliverable is the actual ESP32 sketch +
a one-shot integration test that runs end-to-end against `npm run start` +
a real ESP32 on the same Wi-Fi.

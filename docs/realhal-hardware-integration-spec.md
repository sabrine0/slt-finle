# STLS RealHAL Hardware Integration Specification

Status: planning only. The current software baseline stays frozen:

- backend unchanged
- deployment signing unchanged
- controller-runtime package contract unchanged
- proof artifacts unchanged
- MockHAL simulation remains the validated reference path

## Hardware Architecture

The hardware boundary stays at the existing `hardware.HAL` interface in [hal.go](C:/Users/Public/STLS finel/controller-runtime/internal/hardware/hal.go#L74). The controller runtime, package verification, phase engine, backend APIs, and deployment contract do not change.

The runtime currently instantiates `MockHAL` in [runtime.go](C:/Users/Public/STLS finel/controller-runtime/internal/runtime/runtime.go#L54). Real hardware integration should replace that with a `RealHAL` implementation of the same interface, selected by configuration only.

Recommended first bench architecture:

1. Compute board runs the existing Go controller runtime unchanged.
2. `RealHAL` maps logical signal groups and detectors to local hardware channels.
3. Digital outputs drive low-voltage lamp simulators or relay inputs.
4. Digital inputs read detector simulators and hardware readback/fault contacts.
5. A local failsafe path forces all-red or flashing-red independently of backend connectivity.
6. Backend communication remains over the current bootstrap/package/heartbeat/telemetry flow.

## Required Modules

Minimum modules for a first real bench prototype:

1. Compute board
   - Industrial Linux SBC or fanless x86 mini-PC.
   - Must run the existing Go runtime reliably and expose Ethernet plus local I/O or USB/serial.
   - Minimum recommendation: 2-core CPU, 4 GB RAM, SSD or eMMC storage.

2. Microcontroller
   - Optional for the first bench if the output board already provides deterministic watchdog and failsafe behavior.
   - Recommended if the compute board does not have hard real-time I/O.
   - Use it as an I/O coprocessor only: output latch, watchdog, flash pattern timing, readback sampling.

3. Relay/output board
   - 24 VDC-compatible digital output stage or relay board.
   - Enough channels for at least one full junction test set:
     - one output per lamp aspect actually driven on the bench
     - one readback/fault input per controlled channel where possible
   - For the first bench, drive lamps or dummy loads, not roadside signal heads.

4. Power conversion
   - Isolated AC/DC or DC/DC supply sized for compute board, I/O board, indicators, and safety margin.
   - Separate protected rails for logic power and output power.
   - Inline fuse, breaker, and emergency stop.

5. Communication module
   - Minimum: onboard Ethernet on the compute board.
   - No cellular requirement for bench work.
   - Field pilot can add industrial LTE/router later without changing runtime behavior.

6. Enclosure
   - DIN-rail or bench enclosure with terminal blocks, grounding, fuse protection, and labeled I/O.
   - Clear separation between logic wiring and output power wiring.

## RealHAL Boundary

The exact software boundary is the existing HAL interface in [hal.go](C:/Users/Public/STLS finel/controller-runtime/internal/hardware/hal.go#L74).

### Inputs from runtime into RealHAL

1. `Configure(signalGroupCodes, detectorCodes)`
   - Called after a signed package is accepted in [runtime.go](C:/Users/Public/STLS finel/controller-runtime/internal/runtime/runtime.go#L310).
   - RealHAL must load or validate local channel mappings for every provided signal group and detector code.
   - It must reject startup if any required hardware channel mapping is missing.

2. `SetSignalState(groupCode, state)`
   - Single-group command path.
   - Used by the signal logger wrapper and should remain supported.

3. `SetAllSignalStates(outputs)`
   - Primary stage execution path.
   - The phase engine builds logical outputs in [phase_engine.go](C:/Users/Public/STLS finel/controller-runtime/internal/engine/phase_engine.go#L464) and applies them in [phase_engine.go](C:/Users/Public/STLS finel/controller-runtime/internal/engine/phase_engine.go#L381).
   - RealHAL must apply the batch as close to atomically as the hardware allows.

4. `AllRed()`
   - Must override normal output control immediately.
   - Used on startup, transition gaps, and fault containment.

5. `AllFlashingRed()`
   - Used by failsafe mode in [phase_engine.go](C:/Users/Public/STLS finel/controller-runtime/internal/engine/phase_engine.go#L346).
   - Must keep flashing active until another valid command or shutdown.

### Outputs from RealHAL back to runtime

1. `ReadDetector(code)` / `ReadAllDetectors()`
   - Provide raw detector occupancy/count snapshots only.
   - No detector decision logic moves into hardware.

2. `GetSystemStatus()`
   - Returns hardware health for telemetry.
   - Minimum fields:
     - `Healthy`
     - `PowerOK`
     - `CabinetTemperatureCelsius`
     - `FaultCodes`

3. `Shutdown()`
   - Must de-energize outputs safely and leave the bench in all-red or power-safe state.

### What must NOT cross the boundary

- No backend API logic
- No HMAC or digest logic
- No deployment package interpretation beyond code-to-channel mapping
- No phase timing logic
- No conflict resolution logic
- No signal plan editing

## Signal Mapping Strategy

RealHAL should keep signal mapping local and static. The deployment package continues to carry only logical signal group codes.

Recommended mapping model:

1. `SignalGroupCode -> physical channel set`
   - Example: `SG-001 -> {red: DO1, yellow: DO2, green: DO3}`
   - Pedestrian groups use their own aspect set, for example `{dont_walk, walk}`.

2. Mapping source
   - Local config file or environment-backed config on the controller host.
   - Not stored in the backend deployment contract.

3. Validation at `Configure`
   - Every signal group in the package must resolve to a known physical channel set.
   - Unknown group or incomplete aspect map is a configuration failure.

4. All-red behavior
   - De-energize all green and yellow outputs.
   - Energize only the red aspect for every configured vehicle signal group.
   - For pedestrian groups, drive the safe stop indication only.

5. Flashing-red behavior
   - De-energize green and yellow outputs.
   - Toggle red aspect on a fixed local cadence.
   - Flash generation should be local to RealHAL or the I/O coprocessor, not dependent on backend timing.

6. Output safety rules
   - Never energize conflicting aspects for the same signal group.
   - Prefer de-energized-safe defaults.
   - If readback disagrees with commanded state, raise a hardware fault and force failsafe.

## Bench Test Plan

Safe bench-test architecture before roadside deployment:

1. Bench wiring
   - Compute board
   - RealHAL output board
   - 24 V lamp simulators or dummy loads
   - detector toggle inputs or detector emulator
   - readback contacts or feedback inputs
   - fused power supply and emergency stop

2. Network
   - Isolated bench LAN to the existing backend.
   - No roadside or cabinet field wiring during this phase.

3. Bench operating modes
   - Start with the current software package flow unchanged.
   - Apply a signed package from backend exactly as already validated in simulation.
   - RealHAL only converts logical outputs to physical I/O.

4. Acceptance checks
   - Bootstrap succeeds.
   - Signed package verifies and applies.
   - `INIT -> NORMAL` occurs unchanged.
   - Each stage command produces the expected physical output pattern.
   - `AllRed()` forces all stop outputs immediately.
   - `AllFlashingRed()` produces continuous flash pattern in failsafe.
   - Detector input changes appear in telemetry without backend changes.
   - Loss of backend connectivity does not change local safe behavior.

5. Fault injection
   - Remove one output fuse.
   - break one readback circuit.
   - drop detector input.
   - power-cycle I/O board while runtime is active.
   - confirm fault is surfaced through `GetSystemStatus()` and runtime falls back safely.

## Rollout Phases

1. Bench simulation
   - Keep `MockHAL` as the reference path.
   - Freeze package signing, backend flow, and proof generation.
   - Define channel map and hardware fault model.
   - Exit criteria: RealHAL design reviewed against existing HAL interface.

2. Lab hardware loop
   - Replace only HAL implementation on a bench harness.
   - Use signed packages from the real backend.
   - Drive lamps/dummy loads and detector emulators.
   - Exit criteria: repeated clean startup, package apply, stage transitions, all-red, flashing-red, and telemetry parity.

3. Cabinet dry run
   - Install compute and I/O hardware in a non-live cabinet or disconnected cabinet test setup.
   - Validate power, grounding, EMI resilience, wiring discipline, readback, and watchdog behavior.
   - Exit criteria: stable operation over extended soak test and safe recovery from induced faults.

4. Controlled field pilot
   - Limited intersection, supervised hours, rollback plan ready.
   - Backend/runtime package flow remains unchanged.
   - RealHAL and local channel map are the only new operational variables.
   - Exit criteria: sustained healthy heartbeat, no unexpected faults, verified output/readback parity, and clean return to all-red or flashing-red on induced safety events.

## Frozen Interfaces

The following stay unchanged through RealHAL introduction:

- backend bootstrap/package/ack/heartbeat/telemetry APIs
- deployment signing and controller-side HMAC verification
- controller-runtime package schema
- phase engine logic
- simulation proof artifacts

RealHAL is a hardware implementation task at the existing HAL seam, not an architecture change.

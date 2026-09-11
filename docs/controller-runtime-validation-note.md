# STLS Controller Runtime Validation Note

## Scope

This note records the current working STLS controller-runtime path after deployment signing and package-application issues were resolved. It captures one full observed traffic cycle, summarizes the deployed architecture, lists the issues solved, and defines the next safe step toward real hardware integration without changing architecture.

## Current Working State

- Backend is running and serving signed deployment packages.
- Controller runtime is bootstrapped, authenticated, and polling successfully.
- Latest accepted package version: `INT001-20260417T122908Z-497b9bf5`
- Controller deployment state: `applied`
- Controller operating state: `NORMAL`
- Phase engine is running and advancing through the timing plan.
- Heartbeat and telemetry are uploading successfully.

## One Full Observed Traffic Cycle

Source of truth:

- Backend telemetry event for controller `CTL-001` at `2026-04-17T12:37:11.377Z`
- Controller runtime log entries around local time `2026-04-17 14:35:11` to `14:36:23`

Observed cycle for timing plan `TP-INT001-NSEW`:

1. `2026-04-17T12:35:11.8324292Z`
   - `SG-001 -> green`
   - `SG-002 -> red`
   - `SG-003 -> red`
   - `SG-004 -> red`
   - Stage: `stage-ns`

2. `2026-04-17T12:35:43.8422565Z`
   - `SG-001 -> yellow`
   - Stage-ns clearance starts

3. `2026-04-17T12:35:49.8632261Z`
   - `SG-001 -> red`
   - `SG-002 -> green`
   - `SG-003 -> red`
   - `SG-004 -> red`
   - Stage: `stage-ew`

4. `2026-04-17T12:36:17.8767347Z`
   - `SG-002 -> yellow`
   - Stage-ew clearance starts

5. `2026-04-17T12:36:23.9002129Z`
   - `SG-001 -> green`
   - `SG-002 -> red`
   - `SG-003 -> red`
   - `SG-004 -> red`
   - Next cycle begins at `stage-ns`

Operational interpretation:

- Configured stage green splits are `32s` for `stage-ns` and `28s` for `stage-ew`.
- Observed wall-clock cycle includes yellow/all-red clearance between stages.
- The signal simulation is changing groups consistently with the timing plan and safety transitions.

## Final Working Architecture

### Backend

- NestJS application with global configuration loading, auth, controller management, engineering, security, traffic, audit, and database modules.
- Controller runtime endpoints provide:
  - bootstrap
  - latest package fetch
  - deployment acknowledgment
  - heartbeat upload
  - telemetry upload
  - alarm upload

### Deployment Signing

- Deployment package is built from intersection, controller, timing plan, detector, and safety context.
- Package digest is computed over the unsigned package document using stable key ordering.
- Package signature is HMAC-SHA256 over the package document with `signature=null` and `signedAt=null`.
- Signing secret is loaded from backend config via `DEPLOYMENT_SIGNING_SECRET`.
- Controller runtime reproduces the same stable-stringify + digest + HMAC procedure during verification.

### Controller Runtime

- Go runtime loads config from `.env`, builds the runtime, and starts:
  - phase engine
  - detector scanner
  - bootstrap/package-fetch loop
  - heartbeat loop
  - telemetry loop
- On package receipt it:
  - verifies schema
  - verifies digest
  - verifies HMAC signature
  - loads package into the phase engine
  - acknowledges the applied deployment back to backend

### Signal Simulation

- `MockHAL` is the current hardware abstraction layer implementation.
- Phase engine drives signal outputs through the HAL.
- `SignalLogger` records recent signal state changes and exposes them for telemetry.
- Backend telemetry stores:
  - controller state
  - recent signal events
  - detector summary
  - cabinet temperature / power status
  - cycle count and current stage summary

## Issues Solved

1. Stale signed deployment was still being served to the controller.
2. That deployment had been signed with the old fallback secret.
3. Controller correctly rejected it with HMAC mismatch and entered failsafe.
4. Stale deployment was removed from active selection.
5. Fresh deployment was created, validated, signed with the correct secret, and published.
6. Backend fallback for `deploymentSigningSecret` was aligned with the local-dev signing secret to avoid recurrence in local operation.

## What the Successful Logs Prove

- `deployment_ack` with state `applied` proves the runtime accepted the published package and acknowledged it back to backend.
- Heartbeat events carrying the new package version prove the runtime stayed healthy after apply.
- Telemetry severity `info` with `state=NORMAL` proves the controller exited failsafe and is operating normally.
- Stage and signal-change logs prove the phase engine is executing the timing plan rather than idling.
- Recent `signalEvents` prove group transitions are occurring in the expected order.

## Next Safe Step Toward Real Hardware Integration

Do not change backend, signing, deployment contract, or runtime state-machine architecture.

Safe next step:

- Implement a real hardware HAL adapter behind the existing `hardware.HAL` interface, alongside `MockHAL`.
- Start on a bench harness or non-live cabinet I/O rig.
- Reuse the same signed package flow, controller runtime, heartbeat, telemetry, and failsafe logic unchanged.
- Validate only:
  - output channel mapping
  - all-red / flashing-red behavior
  - readback of cabinet health
  - signal-state parity between commanded outputs and hardware outputs

This preserves the working architecture and moves only the hardware boundary from simulation to bench-tested physical I/O.

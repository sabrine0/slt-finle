# STLS Working System Note

## Proof Artifacts

- Startup proof: [startup-proof.log](C:/Users/Public/STLS%20finel/docs/proofs/startup-proof.log)
- Full cycle proof: [cycle-proof.log](C:/Users/Public/STLS%20finel/docs/proofs/cycle-proof.log)
- Detailed validation note: [controller-runtime-validation-note.md](C:/Users/Public/STLS%20finel/docs/controller-runtime-validation-note.md)

## Final Working System

### Backend

- NestJS control plane with auth, engineering, controller management, traffic, audit, and database modules.
- Serves controller bootstrap, package fetch, deployment acknowledgment, heartbeat, telemetry, and alarm endpoints.

### Deployment Signing

- Backend builds a runtime package from intersection, controller, timing plan, detector, and safety data.
- Digest is `SHA-256(stableStringify(unsigned package))`.
- Signature is `HMAC-SHA256(stableStringify(package with signature=null,signedAt=null))`.
- Runtime verifies the same digest and HMAC procedure before apply.

### Controller Runtime

- Go runtime loads config, bootstraps to backend, fetches the latest signed deployment, verifies it, loads the phase engine, and starts heartbeat and telemetry loops.
- Working proof shows:
  - `bootstrap successful`
  - `INIT -> NORMAL`
  - `package applied successfully`
  - `signature_verified=true`

### Signal Simulation

- `MockHAL` is the active HAL.
- Phase engine drives signal groups through the HAL.
- `SignalLogger` records recent signal transitions and exposes them in telemetry.
- Telemetry confirms stage progression, cycle count, signal changes, and healthy heartbeat flow.

## Windows PowerShell Log Capture

Run the controller and keep a live log:

```powershell
Set-Location C:\Users\Public\STLS finel\controller-runtime
.\controller.exe 2>&1 | Tee-Object -FilePath .\controller.log
```

Generate a clean startup proof from the current log:

```powershell
$patterns = @(
  '"msg":"controller runtime starting"',
  '"msg":"bootstrap successful"',
  '"msg":"bootstrapped"',
  '"msg":"phase engine: package loaded"',
  '"msg":"state transition"',
  '"msg":"deployment acknowledged"',
  '"msg":"package applied successfully"',
  '"msg":"starting fixed cycle"',
  '"msg":"stage start"'
)

Get-Content .\controller.log |
  Select-String -Pattern $patterns -SimpleMatch |
  Select-Object -First 15 |
  ForEach-Object { $_.Line } |
  Set-Content ..\docs\proofs\startup-proof.log
```

Generate one full cycle proof from the current log:

```powershell
$lines = Get-Content .\controller.log
$cycleStarts = $lines | Select-String '"msg":"starting fixed cycle"'
$start = $cycleStarts[0].LineNumber
$end = $cycleStarts[1].LineNumber

$lines[($start - 1)..($end - 1)] |
  Set-Content ..\docs\proofs\cycle-proof.log
```

## Safest Plan: MockHAL -> RealHAL

1. Keep backend, deployment contract, signing flow, runtime state machine, and phase engine unchanged.
2. Add `RealHAL` beside `MockHAL`, implementing the same `hardware.HAL` interface.
3. Implement the safe operations first:
   - `Configure`
   - `SetSignalState` / `SetAllSignalStates`
   - `AllRed`
   - `AllFlashingRed`
   - `GetSystemStatus`
4. Map signal-group codes to physical output channels in configuration, not in the deployment contract.
5. Bench-test RealHAL on a harness or cabinet simulator before any roadside connection.
6. Verify parity between commanded outputs and physical readback while keeping the current telemetry path unchanged.
7. Switch runtime HAL selection by configuration only after bench validation passes.

This moves only the hardware boundary. The current working flow stays intact.

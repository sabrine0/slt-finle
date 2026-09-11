// Package runtime is the top-level orchestrator for the STLS controller
// runtime. It wires together the backend client, package verifier, HAL,
// simulation modules, state machine, and phase engine, then drives them with
// independent goroutines that run for the lifetime of the process.
package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"stls/controller-runtime/internal/backend"
	"stls/controller-runtime/internal/config"
	"stls/controller-runtime/internal/engine"
	"stls/controller-runtime/internal/hardware"
	"stls/controller-runtime/internal/rtpkg"
	"stls/controller-runtime/internal/simulation"
)

// Runtime is the top-level object. Create one with New, then call Run.
type Runtime struct {
	cfg *config.Config
	log *slog.Logger

	backend *backend.Client
	hal     hardware.HAL
	sm      *engine.StateMachine
	phase   *engine.PhaseEngine
	sigLog  *simulation.SignalLogger
	detScan *simulation.DetectorScanner

	// startTime tracks process uptime for heartbeats.
	startTime time.Time

	// currentPkg is the active deployment package (nil until first fetch).
	pkgMu      sync.RWMutex
	currentPkg *rtpkg.Package

	// lastDeploymentID remembers the most-recently acknowledged deployment so
	// we do not re-acknowledge after a heartbeat loop restart.
	lastAckedDeploymentID atomic.Value // stores string

	// offlinePackagePath is where we cache the package for offline operation.
	offlinePackagePath string
}

// New assembles the runtime from configuration. Call Run to start it.
func New(cfg *config.Config, log *slog.Logger) *Runtime {
	hal := hardware.NewMockHAL(log.WithGroup("hal"))

	sm := engine.NewStateMachine(log.WithGroup("state"))

	sigLog := simulation.NewSignalLogger(hal, 100, log.WithGroup("signal"))
	detScan := simulation.NewDetectorScanner(hal, time.Second, log.WithGroup("detector"))

	phaseEngine := engine.NewPhaseEngine(
		sm, hal, sigLog, detScan,
		log.WithGroup("phase"),
	)

	bc := backend.NewClient(
		cfg.BackendURL,
		cfg.ClientID,
		cfg.ClientSecret,
		cfg.ControllerCode,
		cfg.TokenCachePath,
		log.WithGroup("backend"),
	)

	return &Runtime{
		cfg:                cfg,
		log:                log,
		backend:            bc,
		hal:                hal,
		sm:                 sm,
		phase:              phaseEngine,
		sigLog:             sigLog,
		detScan:            detScan,
		startTime:          time.Now(),
		offlinePackagePath: cfg.PackageCachePath,
	}
}

// Run starts all goroutines and blocks until ctx is cancelled.
func (rt *Runtime) Run(ctx context.Context) error {
	rt.log.Info("controller runtime starting",
		"runtime_version", rt.cfg.RuntimeVersion,
		"firmware_version", rt.cfg.FirmwareVersion,
		"environment", rt.cfg.OperatingEnvironment,
		"backend_url", rt.cfg.BackendURL,
	)

	var wg sync.WaitGroup

	// ── Phase engine ─────────────────────────────────────────────────────
	wg.Add(1)
	go func() {
		defer wg.Done()
		rt.phase.Run(ctx)
	}()

	// ── Detector scanner ─────────────────────────────────────────────────
	wg.Add(1)
	go func() {
		defer wg.Done()
		rt.detScan.Run(ctx)
	}()

	// ── Bootstrap + package fetch loop ───────────────────────────────────
	wg.Add(1)
	go func() {
		defer wg.Done()
		rt.bootstrapLoop(ctx)
	}()

	// ── Heartbeat loop ────────────────────────────────────────────────────
	wg.Add(1)
	go func() {
		defer wg.Done()
		rt.heartbeatLoop(ctx)
	}()

	// ── Telemetry loop ────────────────────────────────────────────────────
	wg.Add(1)
	go func() {
		defer wg.Done()
		rt.telemetryLoop(ctx)
	}()

	wg.Wait()

	// Ensure all signals are safe on shutdown.
	rt.log.Info("shutting down — driving all-red")
	_ = rt.hal.AllRed()
	_ = rt.hal.Shutdown()
	return nil
}

// ─── Bootstrap loop ───────────────────────────────────────────────────────────

// bootstrapLoop repeatedly tries to bootstrap and fetch a package until
// successful, then re-checks for updated packages on every PackagePollInterval.
func (rt *Runtime) bootstrapLoop(ctx context.Context) {
	rt.log.Info("bootstrap loop started")

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := rt.bootstrapOnce(ctx); err != nil {
			rt.log.Error("bootstrap failed, retrying",
				"error", err,
				"delay", rt.cfg.BootstrapRetryDelay,
			)

			// Try to use a cached package for offline operation.
			if rt.currentPkg == nil {
				rt.tryLoadOfflinePackage()
			}

			select {
			case <-ctx.Done():
				return
			case <-time.After(rt.cfg.BootstrapRetryDelay):
			}
			continue
		}

		// Bootstrap succeeded — poll for package updates.
		rt.packagePollLoop(ctx)

		// packagePollLoop exits only when ctx is done or a fatal error occurs.
		if ctx.Err() != nil {
			return
		}
	}
}

// bootstrapOnce performs a single bootstrap attempt and applies the initial
// package if one is returned.
func (rt *Runtime) bootstrapOnce(ctx context.Context) error {
	bootstrapCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	resp, err := rt.backend.Bootstrap(bootstrapCtx)
	if err != nil {
		return fmt.Errorf("bootstrap request: %w", err)
	}

	rt.log.Info("bootstrapped",
		"controller", resp.Controller.Code,
		"env", resp.Controller.OperatingEnvironment,
	)

	// If the bootstrap response already includes a deployment, fetch its package.
	if resp.LatestDeployment != nil {
		return rt.fetchAndApplyPackage(ctx)
	}

	rt.log.Info("no deployment available yet — controller is idle in INIT")
	return nil
}

// packagePollLoop polls for new packages while the runtime is running.
func (rt *Runtime) packagePollLoop(ctx context.Context) {
	ticker := time.NewTicker(rt.cfg.PackagePollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := rt.fetchAndApplyPackage(ctx); err != nil {
				rt.log.Warn("package poll failed (continuing in offline mode)",
					"error", err,
				)
				// Report communication alarm if we've been offline for too long.
				_ = rt.uploadAlarm(ctx, "warning",
					"Backend communication degraded",
					fmt.Sprintf("Package poll failed: %v", err),
				)
			}
		}
	}
}

// fetchAndApplyPackage downloads the latest package and applies it if it is
// newer than the currently running one.
func (rt *Runtime) fetchAndApplyPackage(ctx context.Context) error {
	fetchCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	resp, err := rt.backend.FetchLatestPackage(fetchCtx)
	if err != nil {
		return fmt.Errorf("fetch package: %w", err)
	}

	if len(resp.Package) == 0 || string(resp.Package) == "null" {
		return nil // No package published yet.
	}

	// Skip if same deployment is already running.
	var meta struct {
		DeploymentMetadata struct {
			DeploymentID   string `json:"deploymentId"`
			PackageVersion string `json:"packageVersion"`
		} `json:"deploymentMetadata"`
	}
	if err := json.Unmarshal(resp.Package, &meta); err == nil {
		if meta.DeploymentMetadata.DeploymentID == rt.lastAckedDeploymentID.Load() {
			return nil // Already running this deployment.
		}
	}

	return rt.applyPackage(ctx, resp.Package)
}

// applyPackage verifies and activates a raw package JSON payload.
func (rt *Runtime) applyPackage(ctx context.Context, rawPkg json.RawMessage) error {
	// ── Verify HMAC signature ────────────────────────────────────────────
	result, err := rtpkg.Verify(rawPkg, rt.cfg.DeploymentSigningSecret)
	if err != nil {
		return fmt.Errorf("package verification error: %w", err)
	}

	if !result.SchemaValid {
		return rt.rejectPackage(ctx, rawPkg, "schema version mismatch: "+joinErrors(result.Errors))
	}

	if !result.DigestValid {
		return rt.rejectPackage(ctx, rawPkg, "digest mismatch: "+joinErrors(result.Errors))
	}

	signatureVerified := result.SignatureValid
	if !signatureVerified && result.SignaturePresent {
		rt.log.Error("package HMAC signature invalid", "errors", result.Errors)
		return rt.rejectPackage(ctx, rawPkg, "HMAC signature invalid: "+joinErrors(result.Errors))
	}

	// ── Unmarshal into typed struct ──────────────────────────────────────
	var pkg rtpkg.Package
	if err := json.Unmarshal(rawPkg, &pkg); err != nil {
		return rt.rejectPackage(ctx, rawPkg, fmt.Sprintf("unmarshal error: %v", err))
	}

	// ── Cache package for offline recovery ──────────────────────────────
	rt.cachePackage(rawPkg)

	// ── Configure HAL with package data ─────────────────────────────────
	sgCodes := make([]string, 0, len(pkg.SignalGroups))
	for _, sg := range pkg.SignalGroups {
		sgCodes = append(sgCodes, sg.Code)
	}
	detCodes := make([]string, 0, len(pkg.DetectorsMapping))
	for _, d := range pkg.DetectorsMapping {
		if d.Active {
			detCodes = append(detCodes, d.Code)
		}
	}
	if err := rt.hal.Configure(sgCodes, detCodes); err != nil {
		rt.log.Error("HAL configuration failed", "error", err)
		_, _ = rt.sm.Trigger(engine.TriggerCriticalFault, "HAL configuration failure")
		return err
	}

	// ── Configure detector scanner ───────────────────────────────────────
	rt.detScan.Configure(pkg.DetectorsMapping)

	// ── Load package into phase engine ───────────────────────────────────
	rt.pkgMu.Lock()
	rt.currentPkg = &pkg
	rt.pkgMu.Unlock()

	rt.phase.LoadPackage(&pkg)

	// ── Advance state machine ────────────────────────────────────────────
	state := rt.sm.Current()
	if state == engine.StateInit || state == engine.StateFailsafe {
		if _, err := rt.sm.Trigger(engine.TriggerPackageLoaded, "deployment package applied"); err != nil {
			rt.log.Warn("state transition skipped", "error", err)
		}
	} else {
		// Already operational — the phase engine picks up the new package
		// on the next cycle automatically.
		if _, err := rt.sm.Trigger(engine.TriggerPackageLoaded, "deployment package updated"); err != nil {
			rt.log.Debug("package update trigger ignored (already operational)", "error", err)
		}
	}

	// ── Acknowledge to backend ───────────────────────────────────────────
	ackState := "acknowledged"
	if signatureVerified {
		ackState = "applied"
	}
	rt.acknowledgeDeployment(ctx, &pkg, signatureVerified, ackState)

	rt.log.Info("package applied successfully",
		"deployment_id", pkg.DeploymentMetadata.DeploymentID,
		"package_version", pkg.DeploymentMetadata.PackageVersion,
		"signature_verified", signatureVerified,
		"state", rt.sm.Current(),
	)
	return nil
}

// rejectPackage sends a rejection acknowledgment to the backend and drives
// the state machine to FAILSAFE.
func (rt *Runtime) rejectPackage(ctx context.Context, rawPkg json.RawMessage, reason string) error {
	rt.log.Error("package rejected", "reason", reason)

	// Extract deployment ID if possible.
	var meta struct {
		DeploymentMetadata struct {
			DeploymentID   string `json:"deploymentId"`
			PackageVersion string `json:"packageVersion"`
		} `json:"deploymentMetadata"`
		SignatureMetadata struct {
			Digest string `json:"digest"`
		} `json:"signatureMetadata"`
	}

	ackCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	if json.Unmarshal(rawPkg, &meta) == nil && meta.DeploymentMetadata.DeploymentID != "" {
		_, _ = rt.backend.AcknowledgeDeployment(ackCtx, meta.DeploymentMetadata.DeploymentID,
			backend.AcknowledgeRequest{
				PackageVersion:   meta.DeploymentMetadata.PackageVersion,
				PackageDigest:    meta.SignatureMetadata.Digest,
				SignatureVerified: false,
				State:            "rejected",
				RejectionReason:  reason,
				RuntimeVersion:   rt.cfg.RuntimeVersion,
			},
		)
	}

	if rt.sm.Current() == engine.StateInit {
		_, _ = rt.sm.Trigger(engine.TriggerPackageRejected, reason)
	} else {
		_, _ = rt.sm.Trigger(engine.TriggerCriticalFault, reason)
	}

	_ = rt.uploadAlarm(ctx, "critical", "Package rejected", reason)
	return fmt.Errorf("package rejected: %s", reason)
}

// acknowledgeDeployment sends an ACK to the backend.
func (rt *Runtime) acknowledgeDeployment(
	ctx context.Context,
	pkg *rtpkg.Package,
	sigVerified bool,
	state string,
) {
	ackCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	deploymentID := pkg.DeploymentMetadata.DeploymentID
	resp, err := rt.backend.AcknowledgeDeployment(ackCtx, deploymentID, backend.AcknowledgeRequest{
		PackageVersion:   pkg.DeploymentMetadata.PackageVersion,
		PackageDigest:    pkg.SignatureMetadata.Digest,
		SignatureVerified: sigVerified,
		State:            state,
		RuntimeVersion:   rt.cfg.RuntimeVersion,
	})

	if err != nil {
		rt.log.Error("acknowledge deployment failed", "deployment_id", deploymentID, "error", err)
		return
	}

	rt.lastAckedDeploymentID.Store(deploymentID)
	rt.log.Info("deployment acknowledged",
		"deployment_id", deploymentID,
		"ack_state", resp.State,
	)
}

// ─── Heartbeat loop ───────────────────────────────────────────────────────────

func (rt *Runtime) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(rt.cfg.HeartbeatInterval)
	defer ticker.Stop()

	rt.log.Info("heartbeat loop started", "interval", rt.cfg.HeartbeatInterval)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rt.sendHeartbeat(ctx)
		}
	}
}

func (rt *Runtime) sendHeartbeat(ctx context.Context) {
	hbCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	uptime := int(time.Since(rt.startTime).Hours())

	req := backend.HeartbeatRequest{
		RuntimeVersion:  rt.cfg.RuntimeVersion,
		SoftwareVersion: rt.cfg.FirmwareVersion,
		UptimeHours:     uptime,
	}

	rt.pkgMu.RLock()
	if rt.currentPkg != nil {
		req.PackageVersion = rt.currentPkg.DeploymentMetadata.PackageVersion
	}
	rt.pkgMu.RUnlock()

	// Include a brief telemetry snapshot.
	req.TelemetrySummary = map[string]interface{}{
		"state":       string(rt.sm.Current()),
		"uptimeHours": uptime,
	}

	status := rt.phase.Status()
	if len(status.ActivePhaseSeqNums) > 0 {
		req.TelemetrySummary["activePhases"] = status.ActivePhaseSeqNums
		req.TelemetrySummary["activeStage"] = status.CurrentStageKey
		req.TelemetrySummary["cycleCount"] = status.CycleCount
	}

	_, err := rt.backend.Heartbeat(hbCtx, req)
	if err != nil {
		rt.log.Warn("heartbeat failed (offline mode continues)", "error", err)
		return
	}

	rt.log.Debug("heartbeat sent",
		"uptime_hours", uptime,
		"state", string(rt.sm.Current()),
	)
}

// ─── Telemetry loop ───────────────────────────────────────────────────────────

func (rt *Runtime) telemetryLoop(ctx context.Context) {
	ticker := time.NewTicker(rt.cfg.TelemetryInterval)
	defer ticker.Stop()

	rt.log.Info("telemetry loop started", "interval", rt.cfg.TelemetryInterval)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rt.sendTelemetry(ctx)
		}
	}
}

func (rt *Runtime) sendTelemetry(ctx context.Context) {
	telCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	detPayload := rt.detScan.TelemetrySummary()
	sigPayload := rt.sigLog.TelemetrySummary()

	payload := mergeMaps(detPayload, sigPayload)
	payload["state"] = string(rt.sm.Current())
	payload["uptimeSeconds"] = time.Since(rt.startTime).Seconds()

	hwStatus, err := rt.hal.GetSystemStatus()
	if err == nil {
		payload["cabinetTempC"] = hwStatus.CabinetTemperatureCelsius
		payload["powerOK"] = hwStatus.PowerOK
		if len(hwStatus.FaultCodes) > 0 {
			payload["hwFaultCodes"] = hwStatus.FaultCodes
		}
	}

	severity := "info"
	if rt.sm.IsFailsafe() {
		severity = "critical"
	} else if !rt.sm.IsOperational() {
		severity = "warning"
	}

	status := rt.phase.Status()
	summary := fmt.Sprintf("Controller %s | state=%s | stage=%s | cycles=%d",
		rt.cfg.ControllerCode,
		string(rt.sm.Current()),
		status.CurrentStageKey,
		status.CycleCount,
	)

	if err := rt.backend.UploadTelemetry(telCtx, backend.TelemetryRequest{
		Summary:  summary,
		Severity: severity,
		Payload:  payload,
	}); err != nil {
		rt.log.Warn("telemetry upload failed", "error", err)
	}
}

// ─── Alarm helper ─────────────────────────────────────────────────────────────

func (rt *Runtime) uploadAlarm(
	ctx context.Context,
	severity, title, detail string,
) error {
	alarmCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	return rt.backend.UploadAlarm(alarmCtx, backend.AlarmRequest{
		Severity:    severity,
		Title:       title,
		Detail:      detail,
		TriggeredAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Offline package cache ────────────────────────────────────────────────────

// cachePackage saves the raw package JSON to disk for offline recovery.
func (rt *Runtime) cachePackage(rawPkg json.RawMessage) {
	if rt.offlinePackagePath == "" {
		return
	}
	if err := os.MkdirAll(filepath.Dir(rt.offlinePackagePath), 0o700); err != nil {
		return
	}
	_ = os.WriteFile(rt.offlinePackagePath, rawPkg, 0o600)
}

// tryLoadOfflinePackage attempts to read and apply the cached package.
// This enables continued operation when the backend is unreachable.
func (rt *Runtime) tryLoadOfflinePackage() {
	if rt.offlinePackagePath == "" {
		return
	}
	data, err := os.ReadFile(rt.offlinePackagePath)
	if err != nil {
		return // No cache — stay in INIT.
	}

	rt.log.Warn("backend unreachable — loading cached package for offline operation")

	if err := rt.applyPackage(context.Background(), data); err != nil {
		rt.log.Error("offline package load failed", "error", err)
		return
	}
	rt.log.Info("offline mode: running on cached package")
	_ = rt.uploadAlarm(
		context.Background(),
		"warning",
		"Controller operating in offline mode",
		"Backend unreachable; running on last known deployment package.",
	)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func mergeMaps(maps ...map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{})
	for _, m := range maps {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

func joinErrors(errs []string) string {
	if len(errs) == 0 {
		return "unknown error"
	}
	s := ""
	for i, e := range errs {
		if i > 0 {
			s += "; "
		}
		s += e
	}
	return s
}

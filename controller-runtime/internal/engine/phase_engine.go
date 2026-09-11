package engine

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"stls/controller-runtime/internal/hardware"
	"stls/controller-runtime/internal/rtpkg"
	"stls/controller-runtime/internal/simulation"
)

// ─── Phase execution types ────────────────────────────────────────────────────

// PhaseCommand is sent to the phase engine to request a specific operating mode
// or a manual phase advance.
type PhaseCommand struct {
	Type              PhaseCommandType
	// ManualPhaseSeqNum is set for TypeAdvanceToPhase commands.
	ManualPhaseSeqNum int
	// EmergencyPhaseSeqNums lists phases to keep active during emergency preemption.
	EmergencyPhaseSeqNums []int
}

// PhaseCommandType classifies a PhaseCommand.
type PhaseCommandType string

const (
	CmdAdvanceToPhase   PhaseCommandType = "advance_to_phase"
	CmdEmergencyPreempt PhaseCommandType = "emergency_preempt"
	CmdEmergencyRelease PhaseCommandType = "emergency_release"
	CmdEnterFailsafe    PhaseCommandType = "enter_failsafe"
	CmdReloadPackage    PhaseCommandType = "reload_package"
)

// PhaseStatus is a snapshot of what the phase engine is doing right now.
type PhaseStatus struct {
	ActivePhaseSeqNums   []int
	ActiveSignalGroups   []string
	ActiveSignalState    hardware.SignalState
	CurrentStageKey      string
	CurrentStageIndex    int
	StageElapsedSeconds  float64
	StageSplitSeconds    float64
	CycleCount           int
	LastTransitionAt     time.Time
}

// ─── PhaseEngine ──────────────────────────────────────────────────────────────

// PhaseEngine executes timing plans against the hardware abstraction layer.
// It operates as a goroutine driven by a context and reacts to PhaseCommands
// delivered on its command channel.
type PhaseEngine struct {
	mu  sync.RWMutex
	pkg *rtpkg.Package
	sm  *StateMachine
	hal hardware.HAL
	sig *simulation.SignalLogger
	det *simulation.DetectorScanner
	log *slog.Logger

	cmdCh  chan PhaseCommand
	status PhaseStatus
}

// NewPhaseEngine creates a phase engine. It must be given a loaded package
// before Run is called.
func NewPhaseEngine(
	sm *StateMachine,
	hal hardware.HAL,
	sig *simulation.SignalLogger,
	det *simulation.DetectorScanner,
	log *slog.Logger,
) *PhaseEngine {
	return &PhaseEngine{
		sm:    sm,
		hal:   hal,
		sig:   sig,
		det:   det,
		log:   log,
		cmdCh: make(chan PhaseCommand, 8),
	}
}

// LoadPackage replaces the active runtime package.
// Thread-safe; can be called while Run is executing.
func (pe *PhaseEngine) LoadPackage(pkg *rtpkg.Package) {
	pe.mu.Lock()
	pe.pkg = pkg
	pe.mu.Unlock()
	pe.log.Info("phase engine: package loaded",
		"deployment_id", pkg.DeploymentMetadata.DeploymentID,
		"package_version", pkg.DeploymentMetadata.PackageVersion,
		"timing_plan", pkg.DeploymentMetadata.TimingPlanCode,
	)
}

// Send queues a command to the phase engine.
func (pe *PhaseEngine) Send(cmd PhaseCommand) {
	select {
	case pe.cmdCh <- cmd:
	default:
		pe.log.Warn("phase engine command channel full; command dropped",
			"type", string(cmd.Type))
	}
}

// Status returns a snapshot of the current phase engine state.
func (pe *PhaseEngine) Status() PhaseStatus {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	return pe.status
}

// Run starts the phase engine loop and blocks until ctx is cancelled.
// It reads the current StateMachine state each cycle and behaves accordingly.
func (pe *PhaseEngine) Run(ctx context.Context) {
	pe.log.Info("phase engine started")
	defer pe.log.Info("phase engine stopped")

	for {
		select {
		case <-ctx.Done():
			_ = pe.hal.AllRed()
			return
		default:
		}

		state := pe.sm.Current()
		switch state {
		case StateInit:
			// Waiting for package — hold all-red and poll.
			_ = pe.hal.AllRed()
			select {
			case <-ctx.Done():
				return
			case <-time.After(500 * time.Millisecond):
			}

		case StateNormal:
			pe.runFixedCycle(ctx)

		case StateAdaptive:
			pe.runAdaptiveCycle(ctx)

		case StateManual:
			pe.runManualMode(ctx)

		case StateEmergency:
			pe.runEmergencyMode(ctx)

		case StateFailsafe:
			pe.runFailsafe(ctx)
		}
	}
}

// ─── Fixed cycle (NORMAL) ─────────────────────────────────────────────────────

func (pe *PhaseEngine) runFixedCycle(ctx context.Context) {
	pkg := pe.currentPackage()
	if pkg == nil || len(pkg.TimingPlans) == 0 {
		pe.log.Warn("no timing plan available, holding all-red")
		_ = pe.hal.AllRed()
		sleep(ctx, time.Second)
		return
	}

	plan := pkg.TimingPlans[0]
	if len(plan.StagePlan) == 0 {
		pe.log.Warn("timing plan has no stages", "plan", plan.Code)
		_ = pe.hal.AllRed()
		sleep(ctx, time.Second)
		return
	}

	pe.log.Info("starting fixed cycle", "plan", plan.Code, "stages", len(plan.StagePlan))

	pe.mu.Lock()
	pe.status.CycleCount++
	pe.mu.Unlock()

	for stageIdx, stage := range plan.StagePlan {
		if pe.sm.Current() != StateNormal {
			return
		}

		if !pe.executeStage(ctx, pkg, stage, stageIdx, len(plan.StagePlan)) {
			return // context cancelled or state changed
		}
	}
}

// ─── Adaptive cycle (ADAPTIVE) ────────────────────────────────────────────────

func (pe *PhaseEngine) runAdaptiveCycle(ctx context.Context) {
	pkg := pe.currentPackage()
	if pkg == nil || len(pkg.TimingPlans) == 0 {
		_ = pe.hal.AllRed()
		sleep(ctx, time.Second)
		return
	}

	plan := pkg.TimingPlans[0]
	if len(plan.StagePlan) == 0 {
		_ = pe.hal.AllRed()
		sleep(ctx, time.Second)
		return
	}

	pe.mu.Lock()
	pe.status.CycleCount++
	pe.mu.Unlock()

	for stageIdx, stage := range plan.StagePlan {
		if pe.sm.Current() != StateAdaptive {
			return
		}

		// Determine effective green time based on detector demand.
		effectiveSplit := pe.adaptiveSplit(pkg, stage)
		adaptedStage := rtpkg.TimingStage{
			Key:                  stage.Key,
			Name:                 stage.Name,
			SplitSeconds:         effectiveSplit,
			PhaseSequenceNumbers: stage.PhaseSequenceNumbers,
		}

		if !pe.executeStage(ctx, pkg, adaptedStage, stageIdx, len(plan.StagePlan)) {
			return
		}
	}
}

// adaptiveSplit returns the green time to use for a stage based on current
// detector demand. It extends up to 150% of the base split when demand is high,
// and truncates to the minimum phase green when demand is absent.
func (pe *PhaseEngine) adaptiveSplit(pkg *rtpkg.Package, stage rtpkg.TimingStage) float64 {
	const maxExtendFactor = 1.5
	const minFraction = 0.5

	hasDemand := false
	for _, seqNum := range stage.PhaseSequenceNumbers {
		if pe.det != nil && pe.det.HasDemand(seqNum) {
			hasDemand = true
			break
		}
	}

	if hasDemand {
		return stage.SplitSeconds * maxExtendFactor
	}

	// No demand: find the shortest minimum green among the stage phases.
	minGreen := stage.SplitSeconds * minFraction
	for _, seqNum := range stage.PhaseSequenceNumbers {
		for _, ph := range pkg.Phases {
			if ph.SequenceNumber == seqNum && ph.MinGreenSeconds < minGreen {
				minGreen = ph.MinGreenSeconds
			}
		}
	}
	return minGreen
}

// ─── Manual mode (MANUAL) ─────────────────────────────────────────────────────

func (pe *PhaseEngine) runManualMode(ctx context.Context) {
	// In manual mode the phase engine waits for CmdAdvanceToPhase commands.
	// While waiting, it holds the current signal state (set by the last command).
	pe.log.Info("manual mode: waiting for phase commands")

	for {
		select {
		case <-ctx.Done():
			return
		case cmd := <-pe.cmdCh:
			switch cmd.Type {
			case CmdAdvanceToPhase:
				pe.activateSinglePhase(cmd.ManualPhaseSeqNum)
			case CmdEnterFailsafe:
				_, _ = pe.sm.Trigger(TriggerCriticalFault, "operator requested failsafe")
				return
			}
			if pe.sm.Current() != StateManual {
				return
			}
		case <-time.After(200 * time.Millisecond):
			if pe.sm.Current() != StateManual {
				return
			}
		}
	}
}

// activateSinglePhase drives the named phase GREEN and all others RED.
func (pe *PhaseEngine) activateSinglePhase(seqNum int) {
	pkg := pe.currentPackage()
	if pkg == nil {
		return
	}

	outputs := pe.buildOutputsForPhases(pkg, []int{seqNum}, hardware.SignalGreen)
	if err := pe.sig.SetAll(outputs); err != nil {
		pe.log.Error("manual phase activation failed", "phase", seqNum, "error", err)
	}
	pe.log.Info("manual phase activated", "phase", seqNum)
	pe.updateStatus([]int{seqNum}, "", 0, 0)
}

// ─── Emergency mode (EMERGENCY) ───────────────────────────────────────────────

func (pe *PhaseEngine) runEmergencyMode(ctx context.Context) {
	pkg := pe.currentPackage()
	if pkg == nil {
		_ = pe.hal.AllRed()
		waitStateChange(ctx, pe.sm, StateEmergency)
		return
	}

	pe.log.Warn("emergency mode active: all non-emergency phases RED")
	_ = pe.hal.AllRed()

	// Wait for a release command or state change.
	for {
		select {
		case <-ctx.Done():
			return
		case cmd := <-pe.cmdCh:
			if cmd.Type == CmdEmergencyRelease {
				_, _ = pe.sm.Trigger(TriggerEmergencyResolve, "emergency released")
				return
			}
		case <-time.After(200 * time.Millisecond):
			if pe.sm.Current() != StateEmergency {
				return
			}
		}
	}
}

// ─── Failsafe mode (FAILSAFE) ─────────────────────────────────────────────────

func (pe *PhaseEngine) runFailsafe(ctx context.Context) {
	pe.log.Error("failsafe mode active: all signals flashing red")
	_ = pe.hal.AllFlashingRed()

	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(500 * time.Millisecond):
			if pe.sm.Current() != StateFailsafe {
				return
			}
		}
	}
}

// ─── Stage execution ──────────────────────────────────────────────────────────

// executeStage runs a single timing plan stage. Returns false if the context
// was cancelled or the state machine left the expected running state.
func (pe *PhaseEngine) executeStage(
	ctx context.Context,
	pkg *rtpkg.Package,
	stage rtpkg.TimingStage,
	stageIdx, totalStages int,
) bool {
	pe.log.Info("stage start",
		"stage", stage.Key,
		"split_seconds", stage.SplitSeconds,
		"phases", stage.PhaseSequenceNumbers,
		"index", stageIdx+1,
		"total", totalStages,
	)

	// Activate phases for this stage (GREEN), everything else RED.
	outputs := pe.buildOutputsForPhases(pkg, stage.PhaseSequenceNumbers, hardware.SignalGreen)
	if err := pe.sig.SetAll(outputs); err != nil {
		pe.log.Error("stage signal set failed", "stage", stage.Key, "error", err)
		_, _ = pe.sm.Trigger(TriggerCriticalFault, "signal output failure")
		return false
	}

	pe.updateStatus(stage.PhaseSequenceNumbers, stage.Key, stageIdx, stage.SplitSeconds)

	// Hold green for SplitSeconds, checking for commands/state changes.
	greenEnd := time.Now().Add(time.Duration(stage.SplitSeconds * float64(time.Second)))
	if !pe.waitUntil(ctx, greenEnd) {
		return false
	}

	// ── Interphase: clearance period ─────────────────────────────────────
	clearance := pe.resolveClearance(pkg, stage.PhaseSequenceNumbers)
	if clearance > 0 {
		pe.log.Debug("interphase clearance",
			"stage", stage.Key,
			"clearance_seconds", clearance,
		)
		// Drive active phases to YELLOW.
		yellowOutputs := pe.buildOutputsForPhases(pkg, stage.PhaseSequenceNumbers, hardware.SignalYellow)
		_ = pe.sig.SetAll(yellowOutputs)

		yellowEnd := time.Now().Add(time.Duration(clearance * float64(time.Second)))
		if !pe.waitUntil(ctx, yellowEnd) {
			return false
		}

		// Drive to ALL-RED for remaining clearance (red clearance portion).
		_ = pe.hal.AllRed()
		redClearance := pe.resolveRedClearance(pkg, stage.PhaseSequenceNumbers)
		if redClearance > 0 {
			redEnd := time.Now().Add(time.Duration(redClearance * float64(time.Second)))
			if !pe.waitUntil(ctx, redEnd) {
				return false
			}
		}
	}

	return true
}

// waitUntil blocks until deadline or until the context is cancelled / state
// machine moves away from operational. Returns false if the caller should stop.
func (pe *PhaseEngine) waitUntil(ctx context.Context, deadline time.Time) bool {
	const tickInterval = 100 * time.Millisecond

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return false
		case cmd := <-pe.cmdCh:
			pe.handleAsyncCommand(cmd)
		case <-time.After(tickInterval):
		}

		if !pe.sm.IsOperational() {
			return false
		}
	}
	return true
}

// handleAsyncCommand processes commands that arrive during active green time.
func (pe *PhaseEngine) handleAsyncCommand(cmd PhaseCommand) {
	switch cmd.Type {
	case CmdEnterFailsafe:
		_, _ = pe.sm.Trigger(TriggerCriticalFault, "runtime fault command")
	case CmdEmergencyPreempt:
		_, _ = pe.sm.Trigger(TriggerEmergencyActivate, "emergency preempt command")
	case CmdReloadPackage:
		// Package is already set by LoadPackage; trigger re-entry.
		pe.log.Info("package reload command received")
	}
}

// ─── Signal output builders ───────────────────────────────────────────────────

// buildOutputsForPhases returns a SignalOutput slice that sets all signal groups
// belonging to activePhases to activeState and all others to RED.
func (pe *PhaseEngine) buildOutputsForPhases(
	pkg *rtpkg.Package,
	activePhaseSeqNums []int,
	activeState hardware.SignalState,
) []hardware.SignalOutput {
	activeSet := toSet(activePhaseSeqNums)
	outputs := make([]hardware.SignalOutput, 0, len(pkg.SignalGroups))

	for _, sg := range pkg.SignalGroups {
		state := hardware.SignalRed
		for _, seqNum := range sg.PhaseSequenceNumbers {
			if activeSet[seqNum] {
				state = activeState
				break
			}
		}
		outputs = append(outputs, hardware.SignalOutput{
			SignalGroupCode: sg.Code,
			State:           state,
		})
	}
	return outputs
}

// ─── Clearance resolution ─────────────────────────────────────────────────────

// resolveClearance returns the maximum yellow clearance seconds across all
// phases in the stage.
func (pe *PhaseEngine) resolveClearance(pkg *rtpkg.Package, phaseSeqNums []int) float64 {
	max := 0.0
	active := toSet(phaseSeqNums)
	for _, ph := range pkg.Phases {
		if active[ph.SequenceNumber] && ph.YellowSeconds > max {
			max = ph.YellowSeconds
		}
	}
	return max
}

// resolveRedClearance returns the maximum red clearance seconds for the stage.
func (pe *PhaseEngine) resolveRedClearance(pkg *rtpkg.Package, phaseSeqNums []int) float64 {
	max := 0.0
	active := toSet(phaseSeqNums)
	for _, ph := range pkg.Phases {
		if active[ph.SequenceNumber] && ph.RedClearanceSeconds > max {
			max = ph.RedClearanceSeconds
		}
	}
	return max
}

// ─── Status tracking ──────────────────────────────────────────────────────────

func (pe *PhaseEngine) updateStatus(
	activePhases []int,
	stageKey string,
	stageIdx int,
	splitSeconds float64,
) {
	pe.mu.Lock()
	defer pe.mu.Unlock()

	pe.status.ActivePhaseSeqNums = activePhases
	pe.status.CurrentStageKey = stageKey
	pe.status.CurrentStageIndex = stageIdx
	pe.status.StageSplitSeconds = splitSeconds
	pe.status.StageElapsedSeconds = 0
	pe.status.LastTransitionAt = time.Now()

	// Derive active signal group codes.
	if pe.pkg != nil {
		active := toSet(activePhases)
		codes := make([]string, 0)
		for _, sg := range pe.pkg.SignalGroups {
			for _, seqNum := range sg.PhaseSequenceNumbers {
				if active[seqNum] {
					codes = append(codes, sg.Code)
					break
				}
			}
		}
		pe.status.ActiveSignalGroups = codes
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (pe *PhaseEngine) currentPackage() *rtpkg.Package {
	pe.mu.RLock()
	defer pe.mu.RUnlock()
	return pe.pkg
}

// toSet converts a slice of ints to a presence set.
func toSet(nums []int) map[int]bool {
	m := make(map[int]bool, len(nums))
	for _, n := range nums {
		m[n] = true
	}
	return m
}

// sleep is a context-aware sleep helper.
func sleep(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}

// waitStateChange blocks until the state machine leaves the given state or
// the context is cancelled.
func waitStateChange(ctx context.Context, sm *StateMachine, state State) {
	for sm.Current() == state {
		select {
		case <-ctx.Done():
			return
		case <-time.After(200 * time.Millisecond):
		}
	}
}

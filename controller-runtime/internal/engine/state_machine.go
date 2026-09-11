// Package engine contains the state machine and phase execution engine for
// the controller runtime.
package engine

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// ─── States ───────────────────────────────────────────────────────────────────

// State represents the operating mode of the controller.
type State string

const (
	// StateInit is the entry state. The runtime loads configuration,
	// bootstraps with the backend, and verifies the deployment package.
	StateInit State = "INIT"

	// StateNormal executes the configured fixed-time timing plan.
	StateNormal State = "NORMAL"

	// StateAdaptive uses detector demand to extend or truncate stage green times.
	StateAdaptive State = "ADAPTIVE"

	// StateManual accepts manual phase advance commands from the operator.
	StateManual State = "MANUAL"

	// StateEmergency clears the intersection for emergency vehicle passage.
	// All non-emergency phases are driven to RED.
	StateEmergency State = "EMERGENCY"

	// StateFailsafe is the safe fallback state. All signal heads are driven to
	// ALL-RED (or FLASHING-RED depending on intersection configuration). The
	// controller continues to send heartbeats and waits for recovery.
	StateFailsafe State = "FAILSAFE"
)

// ─── Transitions ──────────────────────────────────────────────────────────────

// Trigger is the reason for a state transition.
type Trigger string

const (
	TriggerBootstrapOK         Trigger = "bootstrap_ok"
	TriggerBootstrapFailed     Trigger = "bootstrap_failed"
	TriggerPackageLoaded       Trigger = "package_loaded"
	TriggerPackageRejected     Trigger = "package_rejected"
	TriggerAdaptiveEnable      Trigger = "adaptive_enable"
	TriggerAdaptiveDisable     Trigger = "adaptive_disable"
	TriggerManualEnable        Trigger = "manual_enable"
	TriggerManualDisable       Trigger = "manual_disable"
	TriggerEmergencyActivate   Trigger = "emergency_activate"
	TriggerEmergencyResolve    Trigger = "emergency_resolve"
	TriggerCriticalFault       Trigger = "critical_fault"
	TriggerRecovery            Trigger = "recovery"
	TriggerShutdown            Trigger = "shutdown"
)

// TransitionEvent is emitted whenever the state machine changes state.
type TransitionEvent struct {
	From      State
	To        State
	Trigger   Trigger
	Reason    string
	OccurredAt time.Time
}

// ─── Allowed transitions ──────────────────────────────────────────────────────

// transitionTable defines valid (from, trigger) → to transitions.
// Any transition not listed is rejected.
var transitionTable = map[State]map[Trigger]State{
	StateInit: {
		TriggerPackageLoaded:   StateNormal,
		TriggerPackageRejected: StateFailsafe,
		TriggerBootstrapFailed: StateFailsafe,
		TriggerCriticalFault:   StateFailsafe,
	},
	StateNormal: {
		TriggerAdaptiveEnable:    StateAdaptive,
		TriggerManualEnable:      StateManual,
		TriggerEmergencyActivate: StateEmergency,
		TriggerCriticalFault:     StateFailsafe,
		TriggerPackageLoaded:     StateNormal, // re-apply updated package
	},
	StateAdaptive: {
		TriggerAdaptiveDisable:   StateNormal,
		TriggerManualEnable:      StateManual,
		TriggerEmergencyActivate: StateEmergency,
		TriggerCriticalFault:     StateFailsafe,
		TriggerPackageLoaded:     StateAdaptive, // re-apply updated package
	},
	StateManual: {
		TriggerManualDisable:     StateNormal,
		TriggerEmergencyActivate: StateEmergency,
		TriggerCriticalFault:     StateFailsafe,
	},
	StateEmergency: {
		TriggerEmergencyResolve: StateNormal,
		TriggerCriticalFault:    StateFailsafe,
	},
	StateFailsafe: {
		TriggerRecovery: StateInit,
	},
}

// ─── StateMachine ─────────────────────────────────────────────────────────────

// StateMachine is a thread-safe state machine for the controller operating mode.
// Callers subscribe to TransitionEvents via the Subscribe method.
type StateMachine struct {
	mu      sync.RWMutex
	current State
	history []TransitionEvent
	subs    []chan<- TransitionEvent
	log     *slog.Logger
}

// NewStateMachine creates a machine starting in StateInit.
func NewStateMachine(log *slog.Logger) *StateMachine {
	return &StateMachine{
		current: StateInit,
		history: make([]TransitionEvent, 0, 32),
		log:     log,
	}
}

// Current returns the current state without locking.
func (sm *StateMachine) Current() State {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.current
}

// Trigger attempts to advance the state machine using the given trigger.
// Returns the new state and nil on success, or the unchanged state and an
// error if the transition is not allowed.
func (sm *StateMachine) Trigger(trigger Trigger, reason string) (State, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	from := sm.current
	targets, ok := transitionTable[from]
	if !ok {
		return from, fmt.Errorf("no transitions defined for state %s", from)
	}

	to, allowed := targets[trigger]
	if !allowed {
		return from, fmt.Errorf("trigger %s not allowed in state %s", trigger, from)
	}

	sm.current = to
	ev := TransitionEvent{
		From:       from,
		To:         to,
		Trigger:    trigger,
		Reason:     reason,
		OccurredAt: time.Now(),
	}
	sm.history = append(sm.history, ev)

	sm.log.Info("state transition",
		"from", string(from),
		"to", string(to),
		"trigger", string(trigger),
		"reason", reason,
	)

	// Notify subscribers without holding the lock.
	subs := sm.subs
	go func() {
		for _, ch := range subs {
			select {
			case ch <- ev:
			default:
				// Drop if subscriber is not consuming fast enough.
			}
		}
	}()

	return to, nil
}

// MustTrigger calls Trigger and panics on invalid transitions.
// Use only for transitions that are guaranteed valid (e.g. FAILSAFE entry).
func (sm *StateMachine) MustTrigger(trigger Trigger, reason string) State {
	state, err := sm.Trigger(trigger, reason)
	if err != nil {
		panic(fmt.Sprintf("invalid transition: %v", err))
	}
	return state
}

// Subscribe returns a channel that receives TransitionEvents.
// The channel is buffered with capacity 8. The caller is responsible for
// consuming events to avoid drops.
func (sm *StateMachine) Subscribe() <-chan TransitionEvent {
	ch := make(chan TransitionEvent, 8)
	sm.mu.Lock()
	sm.subs = append(sm.subs, ch)
	sm.mu.Unlock()
	return ch
}

// IsFailsafe returns true when the current state is FAILSAFE.
func (sm *StateMachine) IsFailsafe() bool {
	return sm.Current() == StateFailsafe
}

// IsOperational returns true when the controller is actively controlling
// traffic (NORMAL, ADAPTIVE, MANUAL, or EMERGENCY).
func (sm *StateMachine) IsOperational() bool {
	switch sm.Current() {
	case StateNormal, StateAdaptive, StateManual, StateEmergency:
		return true
	}
	return false
}

// History returns a copy of all past transition events.
func (sm *StateMachine) History() []TransitionEvent {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	out := make([]TransitionEvent, len(sm.history))
	copy(out, sm.history)
	return out
}

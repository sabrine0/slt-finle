package simulation

import (
	"log/slog"
	"sync"
	"time"

	"stls/controller-runtime/internal/hardware"
)

// SignalGroupEvent records a signal state change for logging/telemetry.
type SignalGroupEvent struct {
	GroupCode string
	PrevState hardware.SignalState
	NextState hardware.SignalState
	OccurredAt time.Time
}

// SignalLogger wraps the HAL and keeps a ring-buffer of recent state changes
// for use in structured telemetry uploads.
type SignalLogger struct {
	hal hardware.HAL
	log *slog.Logger

	mu     sync.Mutex
	recent []SignalGroupEvent
	maxLen int
}

// NewSignalLogger creates a SignalLogger that buffers up to maxLen recent events.
func NewSignalLogger(hal hardware.HAL, maxLen int, log *slog.Logger) *SignalLogger {
	if maxLen <= 0 {
		maxLen = 50
	}
	return &SignalLogger{
		hal:    hal,
		log:    log,
		recent: make([]SignalGroupEvent, 0, maxLen),
		maxLen: maxLen,
	}
}

// SetState drives a signal group to a new state and records the transition.
func (sl *SignalLogger) SetState(groupCode string, state hardware.SignalState) error {
	// We don't have the previous state without a read, so we record the
	// transition with an empty PrevState for now — the MockHAL logs the diff.
	if err := sl.hal.SetSignalState(groupCode, state); err != nil {
		return err
	}
	sl.record(groupCode, "", state)
	return nil
}

// SetAll atomically drives multiple signal groups and records each transition.
func (sl *SignalLogger) SetAll(outputs []hardware.SignalOutput) error {
	if err := sl.hal.SetAllSignalStates(outputs); err != nil {
		return err
	}
	for _, o := range outputs {
		sl.record(o.SignalGroupCode, "", o.State)
	}
	return nil
}

func (sl *SignalLogger) record(groupCode string, prev, next hardware.SignalState) {
	ev := SignalGroupEvent{
		GroupCode:  groupCode,
		PrevState:  prev,
		NextState:  next,
		OccurredAt: time.Now(),
	}

	sl.mu.Lock()
	if len(sl.recent) >= sl.maxLen {
		// Remove oldest entry.
		sl.recent = sl.recent[1:]
	}
	sl.recent = append(sl.recent, ev)
	sl.mu.Unlock()

	sl.log.Debug("signal state change",
		"group", groupCode,
		"state", string(next),
	)
}

// RecentEvents returns a copy of the recent event buffer.
func (sl *SignalLogger) RecentEvents() []SignalGroupEvent {
	sl.mu.Lock()
	defer sl.mu.Unlock()
	out := make([]SignalGroupEvent, len(sl.recent))
	copy(out, sl.recent)
	return out
}

// TelemetrySummary returns a payload-friendly snapshot of recent signal events.
func (sl *SignalLogger) TelemetrySummary() map[string]interface{} {
	events := sl.RecentEvents()
	evMaps := make([]map[string]interface{}, 0, len(events))
	for _, e := range events {
		evMaps = append(evMaps, map[string]interface{}{
			"group":      e.GroupCode,
			"state":      string(e.NextState),
			"occurredAt": e.OccurredAt.UTC().Format(time.RFC3339Nano),
		})
	}
	return map[string]interface{}{
		"signalEvents": evMaps,
	}
}

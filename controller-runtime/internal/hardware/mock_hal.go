package hardware

import (
	"fmt"
	"log/slog"
	"math/rand"
	"sync"
	"time"
)

// MockHAL is a software-only HAL implementation used in SIMULATION mode.
// It logs every signal change and returns randomised detector readings.
// Replace this with a real GPIO implementation for production hardware.
type MockHAL struct {
	mu sync.RWMutex

	// signalStates is keyed by signal group code.
	signalStates map[string]SignalState

	// detectorStates is keyed by detector code.
	detectorStates map[string]detectorState

	log *slog.Logger
}

type detectorState struct {
	occupied     bool
	count        int
	occupancyPct float64
	lastFlip     time.Time
}

// NewMockHAL creates a MockHAL. The logger is used for structured output.
func NewMockHAL(log *slog.Logger) *MockHAL {
	return &MockHAL{
		signalStates:   make(map[string]SignalState),
		detectorStates: make(map[string]detectorState),
		log:            log,
	}
}

// Configure registers the known signal groups and detectors.
func (h *MockHAL) Configure(signalGroupCodes, detectorCodes []string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	for _, code := range signalGroupCodes {
		if _, exists := h.signalStates[code]; !exists {
			h.signalStates[code] = SignalRed
		}
	}
	for _, code := range detectorCodes {
		if _, exists := h.detectorStates[code]; !exists {
			h.detectorStates[code] = detectorState{
				lastFlip: time.Now(),
			}
		}
	}

	h.log.Info("HAL configured",
		"signal_groups", len(h.signalStates),
		"detectors", len(h.detectorStates),
	)
	return nil
}

// SetSignalState drives a single signal group to the requested state.
func (h *MockHAL) SetSignalState(groupCode string, state SignalState) error {
	h.mu.Lock()
	prev := h.signalStates[groupCode]
	h.signalStates[groupCode] = state
	h.mu.Unlock()

	if prev != state {
		h.log.Info("signal state change",
			"group", groupCode,
			"prev", string(prev),
			"next", string(state),
		)
	}
	return nil
}

// SetAllSignalStates atomically updates multiple signal groups.
func (h *MockHAL) SetAllSignalStates(outputs []SignalOutput) error {
	h.mu.Lock()
	changed := make([]SignalOutput, 0, len(outputs))
	for _, o := range outputs {
		prev := h.signalStates[o.SignalGroupCode]
		h.signalStates[o.SignalGroupCode] = o.State
		if prev != o.State {
			changed = append(changed, SignalOutput{SignalGroupCode: o.SignalGroupCode, State: o.State})
		}
	}
	h.mu.Unlock()

	for _, o := range changed {
		h.log.Info("signal state change",
			"group", o.SignalGroupCode,
			"next", string(o.State),
		)
	}
	return nil
}

// AllRed drives every registered signal group to RED immediately.
func (h *MockHAL) AllRed() error {
	h.mu.Lock()
	codes := make([]string, 0, len(h.signalStates))
	for code := range h.signalStates {
		h.signalStates[code] = SignalRed
		codes = append(codes, code)
	}
	h.mu.Unlock()

	h.log.Warn("ALL-RED activated", "groups", codes)
	return nil
}

// AllFlashingRed drives every registered signal group to FLASHING-RED.
func (h *MockHAL) AllFlashingRed() error {
	h.mu.Lock()
	codes := make([]string, 0, len(h.signalStates))
	for code := range h.signalStates {
		h.signalStates[code] = SignalFlashingRed
		codes = append(codes, code)
	}
	h.mu.Unlock()

	h.log.Warn("ALL-FLASHING-RED activated", "groups", codes)
	return nil
}

// ReadDetector returns a simulated detector reading with randomised occupancy.
// The simulation uses a simple probabilistic flip model.
func (h *MockHAL) ReadDetector(code string) (DetectorReading, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	state, ok := h.detectorStates[code]
	if !ok {
		return DetectorReading{}, fmt.Errorf("unknown detector: %s", code)
	}

	now := time.Now()
	// Flip occupancy probabilistically:
	//   - if occupied: 20% chance of clearing each second
	//   - if not occupied: 30% chance of activating each second
	elapsed := now.Sub(state.lastFlip).Seconds()
	if state.occupied {
		if elapsed > 1.0 && rand.Float64() < 0.20 {
			state.occupied = false
			state.lastFlip = now
		}
	} else {
		if elapsed > 1.0 && rand.Float64() < 0.30 {
			state.occupied = true
			state.count++
			state.lastFlip = now
		}
	}

	occ := 0.0
	if state.occupied {
		occ = 60.0 + rand.Float64()*40.0 // 60–100 %
	} else {
		occ = rand.Float64() * 10.0 // 0–10 %
	}
	state.occupancyPct = occ
	h.detectorStates[code] = state

	return DetectorReading{
		DetectorCode: code,
		Occupied:     state.occupied,
		Count:        state.count,
		OccupancyPct: occ,
		Timestamp:    now,
	}, nil
}

// ReadAllDetectors returns readings for every registered detector.
func (h *MockHAL) ReadAllDetectors() ([]DetectorReading, error) {
	h.mu.RLock()
	codes := make([]string, 0, len(h.detectorStates))
	for code := range h.detectorStates {
		codes = append(codes, code)
	}
	h.mu.RUnlock()

	readings := make([]DetectorReading, 0, len(codes))
	for _, code := range codes {
		r, err := h.ReadDetector(code)
		if err != nil {
			return nil, err
		}
		readings = append(readings, r)
	}
	return readings, nil
}

// GetSystemStatus always returns healthy in simulation mode.
func (h *MockHAL) GetSystemStatus() (SystemStatus, error) {
	return SystemStatus{
		Healthy:                   true,
		PowerOK:                   true,
		CabinetTemperatureCelsius: 22.0 + rand.Float64()*5.0,
		FaultCodes:                nil,
	}, nil
}

// Shutdown is a no-op for the mock.
func (h *MockHAL) Shutdown() error {
	h.log.Info("mock HAL shutdown")
	return nil
}

// GetSignalState returns the current state for a group (test/debug helper).
func (h *MockHAL) GetSignalState(code string) (SignalState, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	s, ok := h.signalStates[code]
	return s, ok
}

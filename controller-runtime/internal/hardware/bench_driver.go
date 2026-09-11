package hardware

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// BenchDriver is a safe local RealHALDriver for bench validation. It never
// touches real GPIO; in active mode it only exercises the write path shape.
type BenchDriver struct {
	mu sync.RWMutex

	mode RealHALMode
	log  *slog.Logger

	outputLevels map[string]bool
	inputLevels  map[string]bool

	applyCount  int
	lastApplyAt time.Time
	lastBatch   []ChannelWrite
	shutdown    bool
}

// BenchDriverSnapshot exposes the current bench-driver state to the harness.
type BenchDriverSnapshot struct {
	Mode        RealHALMode     `json:"mode"`
	ApplyCount  int             `json:"applyCount"`
	LastApplyAt *time.Time      `json:"lastApplyAt,omitempty"`
	LastBatch   []ChannelWrite  `json:"lastBatch"`
	Outputs     map[string]bool `json:"outputs"`
	Inputs      map[string]bool `json:"inputs"`
	Shutdown    bool            `json:"shutdown"`
}

// NewBenchDriver creates a safe bench driver from the local channel mapping.
func NewBenchDriver(
	mode RealHALMode,
	signalGroups map[string]SignalGroupMapping,
	detectors map[string]DetectorChannelMapping,
	log *slog.Logger,
) *BenchDriver {
	outputs := make(map[string]bool)
	for _, mapping := range signalGroups {
		for _, channel := range mapping.Aspects {
			outputs[channel.Channel] = resolveOutputLevel(channel, false)
		}
	}

	inputs := make(map[string]bool)
	for _, mapping := range detectors {
		inputs[mapping.Channel] = false
	}

	return &BenchDriver{
		mode:         mode,
		log:          log,
		outputLevels: outputs,
		inputLevels:  inputs,
		lastBatch:    nil,
	}
}

// ApplyBatch records the requested output image. In active mode the path is
// still stubbed: it only records the batch and logs that active writes were
// exercised locally.
func (d *BenchDriver) ApplyBatch(writes []ChannelWrite) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.shutdown {
		return fmt.Errorf("bench driver is shut down")
	}

	for _, write := range writes {
		d.outputLevels[write.Channel] = write.Level
	}

	d.applyCount++
	d.lastApplyAt = time.Now()
	d.lastBatch = cloneChannelWrites(writes)

	if d.mode == RealHALModeActive {
		d.log.Info("bench driver active stub apply",
			"count", len(writes),
			"writes", writes,
		)
		return nil
	}

	d.log.Info("bench driver dry-run apply",
		"count", len(writes),
		"writes", writes,
	)
	return nil
}

// ReadInput returns the raw input level for a configured channel.
func (d *BenchDriver) ReadInput(channel string) (bool, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	level, ok := d.inputLevels[channel]
	if !ok {
		return false, fmt.Errorf("unknown input channel: %s", channel)
	}
	return level, nil
}

// ReadSystemStatus returns bench diagnostics through the existing HAL status
// contract. FaultCodes carries the local bench metadata.
func (d *BenchDriver) ReadSystemStatus() (SystemStatus, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()

	faultCodes := []string{
		"bench_mode=" + string(d.mode),
		fmt.Sprintf("apply_count=%d", d.applyCount),
		fmt.Sprintf("output_channels=%d", len(d.outputLevels)),
		fmt.Sprintf("input_channels=%d", len(d.inputLevels)),
	}
	if !d.lastApplyAt.IsZero() {
		faultCodes = append(faultCodes, "last_apply="+d.lastApplyAt.UTC().Format(time.RFC3339Nano))
	}
	if d.mode == RealHALModeActive {
		faultCodes = append(faultCodes, "hardware_path=stubbed_active")
	} else {
		faultCodes = append(faultCodes, "hardware_path=dry_run")
	}
	if d.shutdown {
		faultCodes = append(faultCodes, "driver_state=shutdown")
	}

	return SystemStatus{
		Healthy:                   true,
		PowerOK:                   true,
		CabinetTemperatureCelsius: 24.0,
		FaultCodes:                faultCodes,
	}, nil
}

// Shutdown marks the bench driver as stopped.
func (d *BenchDriver) Shutdown() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.shutdown = true
	d.log.Info("bench driver shutdown")
	return nil
}

// SetInputLevel is a bench helper for local detector simulation.
func (d *BenchDriver) SetInputLevel(channel string, level bool) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if _, ok := d.inputLevels[channel]; !ok {
		return fmt.Errorf("unknown input channel: %s", channel)
	}
	d.inputLevels[channel] = level
	return nil
}

// Snapshot returns a copy of the current bench-driver state.
func (d *BenchDriver) Snapshot() BenchDriverSnapshot {
	d.mu.RLock()
	defer d.mu.RUnlock()

	snapshot := BenchDriverSnapshot{
		Mode:       d.mode,
		ApplyCount: d.applyCount,
		LastBatch:  cloneChannelWrites(d.lastBatch),
		Outputs:    cloneBoolMap(d.outputLevels),
		Inputs:     cloneBoolMap(d.inputLevels),
		Shutdown:   d.shutdown,
	}
	if !d.lastApplyAt.IsZero() {
		t := d.lastApplyAt
		snapshot.LastApplyAt = &t
	}
	return snapshot
}

func cloneChannelWrites(in []ChannelWrite) []ChannelWrite {
	out := make([]ChannelWrite, len(in))
	copy(out, in)
	return out
}

func cloneBoolMap(in map[string]bool) map[string]bool {
	out := make(map[string]bool, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}

// Package simulation provides higher-level simulation helpers built on top of
// the MockHAL. The DetectorScanner polls the HAL and aggregates readings into
// a summary suitable for telemetry uploads.
package simulation

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"stls/controller-runtime/internal/hardware"
	"stls/controller-runtime/internal/rtpkg"
)

// DetectorSnapshot is an aggregated detector reading collected during one scan.
type DetectorSnapshot struct {
	Code         string
	PhaseNums    []int
	Occupied     bool
	OccupancyPct float64
	Count        int
	ScannedAt    time.Time
}

// DetectorScanner continuously polls HAL detectors and makes the latest
// snapshots available for the phase engine and telemetry.
type DetectorScanner struct {
	hal      hardware.HAL
	interval time.Duration
	log      *slog.Logger

	mu        sync.RWMutex
	snapshots map[string]DetectorSnapshot

	// detectorPhaseMap maps detector code → phase sequence numbers.
	detectorPhaseMap map[string][]int
}

// NewDetectorScanner creates a scanner backed by the provided HAL.
func NewDetectorScanner(hal hardware.HAL, interval time.Duration, log *slog.Logger) *DetectorScanner {
	return &DetectorScanner{
		hal:              hal,
		interval:         interval,
		log:              log,
		snapshots:        make(map[string]DetectorSnapshot),
		detectorPhaseMap: make(map[string][]int),
	}
}

// Configure registers detector-to-phase relationships from the runtime package.
func (s *DetectorScanner) Configure(detectors []rtpkg.DetectorMapping) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, d := range detectors {
		if d.Active {
			s.detectorPhaseMap[d.Code] = d.AssignedPhaseSequenceNumbers
		}
	}
}

// Run starts the scanning loop and blocks until ctx is cancelled.
func (s *DetectorScanner) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	s.log.Info("detector scanner started", "interval", s.interval)
	for {
		select {
		case <-ctx.Done():
			s.log.Info("detector scanner stopped")
			return
		case <-ticker.C:
			s.scan()
		}
	}
}

func (s *DetectorScanner) scan() {
	readings, err := s.hal.ReadAllDetectors()
	if err != nil {
		s.log.Error("detector scan failed", "error", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, r := range readings {
		phases := s.detectorPhaseMap[r.DetectorCode]
		s.snapshots[r.DetectorCode] = DetectorSnapshot{
			Code:         r.DetectorCode,
			PhaseNums:    phases,
			Occupied:     r.Occupied,
			OccupancyPct: r.OccupancyPct,
			Count:        r.Count,
			ScannedAt:    r.Timestamp,
		}
	}
}

// GetAll returns a copy of the latest detector snapshots.
func (s *DetectorScanner) GetAll() []DetectorSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]DetectorSnapshot, 0, len(s.snapshots))
	for _, snap := range s.snapshots {
		out = append(out, snap)
	}
	return out
}

// HasDemand returns true if any active detector assigned to the given phase
// sequence number currently shows vehicle presence.
func (s *DetectorScanner) HasDemand(phaseSeqNum int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, snap := range s.snapshots {
		for _, p := range snap.PhaseNums {
			if p == phaseSeqNum && snap.Occupied {
				return true
			}
		}
	}
	return false
}

// TelemetrySummary builds a map suitable for TelemetryRequest.Payload.
func (s *DetectorScanner) TelemetrySummary() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	detectors := make([]map[string]interface{}, 0, len(s.snapshots))
	for _, snap := range s.snapshots {
		detectors = append(detectors, map[string]interface{}{
			"code":         snap.Code,
			"occupied":     snap.Occupied,
			"occupancyPct": snap.OccupancyPct,
			"count":        snap.Count,
		})
	}
	return map[string]interface{}{
		"detectors":  detectors,
		"scannedAt":  time.Now().UTC().Format(time.RFC3339),
	}
}

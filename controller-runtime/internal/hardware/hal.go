// Package hardware defines the Hardware Abstraction Layer (HAL) used by the
// phase engine and simulation modules. All physical I/O is routed through this
// interface so that the rest of the runtime is completely decoupled from
// hardware specifics.
//
// When real GPIO support is required (e.g. Raspberry Pi, PLC), implement a
// new type that satisfies HAL and pass it to the runtime instead of MockHAL.
package hardware

import "time"

// ─── Signal types ─────────────────────────────────────────────────────────────

// SignalState represents the logical output state of a signal group head.
type SignalState string

const (
	// Vehicle signals
	SignalGreen         SignalState = "green"
	SignalYellow        SignalState = "yellow"
	SignalRed           SignalState = "red"
	SignalFlashingRed   SignalState = "flashing_red"
	SignalFlashingYellow SignalState = "flashing_yellow"
	SignalOff           SignalState = "off"

	// Pedestrian signals
	SignalWalk             SignalState = "walk"
	SignalPedClearance     SignalState = "ped_clearance"
	SignalDontWalk         SignalState = "dont_walk"
)

// SignalOutput pairs a signal group code with its desired output state.
type SignalOutput struct {
	SignalGroupCode string
	State           SignalState
}

// ─── Detector types ───────────────────────────────────────────────────────────

// DetectorReading is a snapshot of a single detector's state.
type DetectorReading struct {
	// DetectorCode matches DetectorMapping.Code in the runtime package.
	DetectorCode string
	// Occupied is true when the detector senses a vehicle or pedestrian.
	Occupied bool
	// Count is the cumulative vehicle count since last reset.
	Count int
	// OccupancyPct is the detector occupancy percentage (0–100) over the
	// last measurement window.
	OccupancyPct float64
	// Timestamp is when this reading was taken.
	Timestamp time.Time
}

// ─── System status ────────────────────────────────────────────────────────────

// SystemStatus summarises the hardware health.
type SystemStatus struct {
	// Healthy is false when any critical subsystem has failed.
	Healthy bool
	// PowerOK is false when backup power is in use.
	PowerOK bool
	// CabinetTemperatureCelsius is the internal cabinet temperature.
	CabinetTemperatureCelsius float64
	// FaultCodes is a list of active hardware fault codes.
	FaultCodes []string
}

// ─── HAL interface ────────────────────────────────────────────────────────────

// HAL is the Hardware Abstraction Layer interface.
// All interactions with physical signal heads, detectors, and system hardware
// must go through this interface.
type HAL interface {
	// SetSignalState drives a single signal group to the requested state.
	// Returns an error if the hardware reports a fault.
	SetSignalState(groupCode string, state SignalState) error

	// SetAllSignalStates atomically applies multiple signal outputs.
	// Implementations should apply them as close to simultaneously as possible.
	SetAllSignalStates(outputs []SignalOutput) error

	// AllRed drives all known signal groups to SignalRed immediately.
	// This is the primary failsafe operation and must complete atomically.
	AllRed() error

	// AllFlashingRed drives all known signal groups to SignalFlashingRed.
	AllFlashingRed() error

	// ReadDetector returns the current reading for the named detector.
	ReadDetector(code string) (DetectorReading, error)

	// ReadAllDetectors returns readings for every configured detector.
	ReadAllDetectors() ([]DetectorReading, error)

	// GetSystemStatus returns current hardware health.
	GetSystemStatus() (SystemStatus, error)

	// Configure loads the list of signal groups and detectors from the
	// runtime package so the HAL knows which channels exist.
	Configure(signalGroupCodes []string, detectorCodes []string) error

	// Shutdown gracefully powers down HAL-managed hardware.
	Shutdown() error
}

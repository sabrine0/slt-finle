package hardware

import (
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// RealHALMode controls whether RealHAL only logs writes or drives outputs.
type RealHALMode string

const (
	RealHALModeDryRun RealHALMode = "dry_run"
	RealHALModeActive RealHALMode = "active"
)

// OutputChannel describes one physical output line.
type OutputChannel struct {
	Channel    string
	ActiveHigh bool
}

// SignalGroupMapping maps one logical signal group to its physical aspects.
type SignalGroupMapping struct {
	Aspects map[SignalState]OutputChannel
}

// DetectorChannelMapping maps one logical detector to a physical input line.
type DetectorChannelMapping struct {
	Channel    string
	ActiveHigh bool
}

// ChannelWrite is one hardware write in the output batch.
type ChannelWrite struct {
	Channel string
	Level   bool
}

// RealHALDriver abstracts the actual I/O board, relay board, or GPIO layer.
// The runtime never sees this interface directly; it remains behind HAL.
type RealHALDriver interface {
	ApplyBatch(writes []ChannelWrite) error
	ReadInput(channel string) (bool, error)
	ReadSystemStatus() (SystemStatus, error)
	Shutdown() error
}

// MCUWatchdog is an optional coprocessor/watchdog integration point.
type MCUWatchdog interface {
	Arm(mode RealHALMode) error
	Kick() error
	EnterAllRed() error
	EnterFlashingRed() error
	Disarm() error
}

// RealHALConfig contains the local-only hardware mapping and driver handles.
type RealHALConfig struct {
	Mode          RealHALMode
	FlashInterval time.Duration
	SignalGroups  map[string]SignalGroupMapping
	Detectors     map[string]DetectorChannelMapping
	Driver        RealHALDriver
	Watchdog      MCUWatchdog
}

// RealHAL is a first-prototype hardware HAL skeleton. It keeps the current
// controller runtime contract unchanged and limits all hardware behavior to the
// existing HAL interface.
type RealHAL struct {
	mu sync.RWMutex

	mode          RealHALMode
	flashInterval time.Duration
	driver        RealHALDriver
	watchdog      MCUWatchdog
	log           *slog.Logger

	configured bool

	availableSignalGroups map[string]SignalGroupMapping
	availableDetectors    map[string]DetectorChannelMapping

	activeSignalGroups map[string]SignalGroupMapping
	activeDetectors    map[string]DetectorChannelMapping

	signalStates   map[string]SignalState
	detectorStates map[string]detectorSnapshot

	flasherStop chan struct{}
}

type detectorSnapshot struct {
	occupied  bool
	count     int
	timestamp time.Time
}

// NewRealHAL creates a RealHAL skeleton. It is intentionally not wired into
// runtime.New yet so the validated MockHAL path stays unchanged.
func NewRealHAL(cfg RealHALConfig, log *slog.Logger) (*RealHAL, error) {
	if log == nil {
		return nil, fmt.Errorf("logger is required")
	}

	mode := cfg.Mode
	if mode == "" {
		mode = RealHALModeDryRun
	}
	if mode != RealHALModeDryRun && mode != RealHALModeActive {
		return nil, fmt.Errorf("invalid RealHAL mode: %s", mode)
	}
	if mode == RealHALModeActive && cfg.Driver == nil {
		return nil, fmt.Errorf("active RealHAL requires a driver")
	}

	flashInterval := cfg.FlashInterval
	if flashInterval <= 0 {
		flashInterval = 500 * time.Millisecond
	}

	return &RealHAL{
		mode:                  mode,
		flashInterval:         flashInterval,
		driver:                cfg.Driver,
		watchdog:              cfg.Watchdog,
		log:                   log,
		availableSignalGroups: cloneSignalMappings(cfg.SignalGroups),
		availableDetectors:    cloneDetectorMappings(cfg.Detectors),
		activeSignalGroups:    make(map[string]SignalGroupMapping),
		activeDetectors:       make(map[string]DetectorChannelMapping),
		signalStates:          make(map[string]SignalState),
		detectorStates:        make(map[string]detectorSnapshot),
	}, nil
}

// Configure validates the package-selected codes against local hardware
// mappings, arms the optional watchdog, and always forces ALL-RED first.
func (h *RealHAL) Configure(signalGroupCodes []string, detectorCodes []string) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.stopFlasherLocked()

	activeSignals := make(map[string]SignalGroupMapping, len(signalGroupCodes))
	activeDetectors := make(map[string]DetectorChannelMapping, len(detectorCodes))
	signalStates := make(map[string]SignalState, len(signalGroupCodes))
	detectorStates := make(map[string]detectorSnapshot, len(detectorCodes))

	for _, code := range signalGroupCodes {
		mapping, ok := h.availableSignalGroups[code]
		if !ok {
			return fmt.Errorf("missing signal group mapping for %s", code)
		}
		if _, ok := mapping.Aspects[SignalRed]; !ok {
			return fmt.Errorf("signal group %s is missing a red output mapping", code)
		}
		activeSignals[code] = mapping
		signalStates[code] = SignalRed
	}

	for _, code := range detectorCodes {
		mapping, ok := h.availableDetectors[code]
		if !ok {
			return fmt.Errorf("missing detector mapping for %s", code)
		}
		activeDetectors[code] = mapping
		detectorStates[code] = detectorSnapshot{}
	}

	h.activeSignalGroups = activeSignals
	h.activeDetectors = activeDetectors
	h.signalStates = signalStates
	h.detectorStates = detectorStates
	h.configured = true

	if h.watchdog != nil {
		if err := h.watchdog.Arm(h.mode); err != nil {
			return fmt.Errorf("arm watchdog: %w", err)
		}
	}

	if err := h.forceAllRedLocked("configure"); err != nil {
		return err
	}

	h.log.Info("real HAL configured",
		"mode", string(h.mode),
		"signal_groups", len(h.activeSignalGroups),
		"detectors", len(h.activeDetectors),
	)
	return nil
}

// SetSignalState applies one logical state change.
func (h *RealHAL) SetSignalState(groupCode string, state SignalState) error {
	return h.SetAllSignalStates([]SignalOutput{{
		SignalGroupCode: groupCode,
		State:           state,
	}})
}

// SetAllSignalStates merges the requested updates into the current output image
// and applies one hardware batch.
func (h *RealHAL) SetAllSignalStates(outputs []SignalOutput) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.configured {
		return fmt.Errorf("RealHAL not configured")
	}

	h.stopFlasherLocked()

	nextImage := cloneSignalStates(h.signalStates)
	for _, output := range outputs {
		if _, ok := h.activeSignalGroups[output.SignalGroupCode]; !ok {
			return fmt.Errorf("unknown signal group: %s", output.SignalGroupCode)
		}
		nextImage[output.SignalGroupCode] = output.State
	}

	if err := h.applySignalImageLocked(nextImage, true); err != nil {
		return err
	}

	h.signalStates = nextImage
	if imageHasFlashing(nextImage) {
		h.startFlasherLocked()
	}

	h.log.Debug("real HAL output image applied", "groups", len(outputs))
	return nil
}

// AllRed is the primary safe-state operation.
func (h *RealHAL) AllRed() error {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.forceAllRedLocked("command")
}

// AllFlashingRed enters flashing-red mode for every configured group.
func (h *RealHAL) AllFlashingRed() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.configured {
		return fmt.Errorf("RealHAL not configured")
	}

	h.stopFlasherLocked()

	nextImage := make(map[string]SignalState, len(h.activeSignalGroups))
	for code := range h.activeSignalGroups {
		nextImage[code] = SignalFlashingRed
	}

	h.signalStates = nextImage
	if h.watchdog != nil {
		if err := h.watchdog.EnterFlashingRed(); err != nil {
			return fmt.Errorf("watchdog enter flashing red: %w", err)
		}
	}

	if err := h.applySignalImageLocked(nextImage, true); err != nil {
		return err
	}
	h.startFlasherLocked()

	h.log.Warn("ALL-FLASHING-RED activated", "groups", len(h.activeSignalGroups))
	return nil
}

// ReadDetector returns one detector reading. When a driver is present, the
// input level is read from the local bench/hardware layer in both dry-run and
// active modes.
func (h *RealHAL) ReadDetector(code string) (DetectorReading, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.configured {
		return DetectorReading{}, fmt.Errorf("RealHAL not configured")
	}

	mapping, ok := h.activeDetectors[code]
	if !ok {
		return DetectorReading{}, fmt.Errorf("unknown detector: %s", code)
	}

	now := time.Now()
	snapshot := h.detectorStates[code]
	if h.driver != nil {
		level, err := h.driver.ReadInput(mapping.Channel)
		if err != nil {
			return DetectorReading{}, err
		}
		occupied := resolveInputLevel(mapping, level)
		if occupied && !snapshot.occupied {
			snapshot.count++
		}
		snapshot.occupied = occupied
		snapshot.timestamp = now
		h.detectorStates[code] = snapshot
	}

	occupancyPct := 0.0
	if snapshot.occupied {
		occupancyPct = 100.0
	}

	return DetectorReading{
		DetectorCode: code,
		Occupied:     snapshot.occupied,
		Count:        snapshot.count,
		OccupancyPct: occupancyPct,
		Timestamp:    now,
	}, nil
}

// ReadAllDetectors returns readings for every configured detector.
func (h *RealHAL) ReadAllDetectors() ([]DetectorReading, error) {
	h.mu.RLock()
	codes := make([]string, 0, len(h.activeDetectors))
	for code := range h.activeDetectors {
		codes = append(codes, code)
	}
	h.mu.RUnlock()

	readings := make([]DetectorReading, 0, len(codes))
	for _, code := range codes {
		reading, err := h.ReadDetector(code)
		if err != nil {
			return nil, err
		}
		readings = append(readings, reading)
	}
	return readings, nil
}

// GetSystemStatus returns a skeleton health snapshot without changing the
// existing telemetry contract.
func (h *RealHAL) GetSystemStatus() (SystemStatus, error) {
	if h.driver != nil {
		return h.driver.ReadSystemStatus()
	}
	return SystemStatus{
		Healthy:                   true,
		PowerOK:                   true,
		CabinetTemperatureCelsius: 0,
		FaultCodes:                nil,
	}, nil
}

// Shutdown stops flashing, forces ALL-RED, and then powers down the driver.
func (h *RealHAL) Shutdown() error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.stopFlasherLocked()
	if h.configured {
		if err := h.forceAllRedLocked("shutdown"); err != nil {
			return err
		}
	}
	if h.watchdog != nil {
		if err := h.watchdog.Disarm(); err != nil {
			return err
		}
	}
	if h.driver != nil {
		if err := h.driver.Shutdown(); err != nil {
			return err
		}
	}

	h.log.Info("real HAL shutdown complete")
	return nil
}

func (h *RealHAL) forceAllRedLocked(reason string) error {
	if !h.configured {
		return fmt.Errorf("RealHAL not configured")
	}

	h.stopFlasherLocked()

	nextImage := make(map[string]SignalState, len(h.activeSignalGroups))
	for code := range h.activeSignalGroups {
		nextImage[code] = SignalRed
	}

	if h.watchdog != nil {
		if err := h.watchdog.EnterAllRed(); err != nil {
			return fmt.Errorf("watchdog enter all-red: %w", err)
		}
	}
	if err := h.applySignalImageLocked(nextImage, true); err != nil {
		return err
	}

	h.signalStates = nextImage
	h.log.Warn("ALL-RED activated", "reason", reason, "groups", len(h.activeSignalGroups))
	return nil
}

func (h *RealHAL) startFlasherLocked() {
	if h.mode != RealHALModeActive || h.driver == nil {
		h.log.Warn("flashing outputs requested in dry-run mode")
		return
	}

	h.stopFlasherLocked()

	stopCh := make(chan struct{})
	h.flasherStop = stopCh

	go h.runFlasher(stopCh)
}

func (h *RealHAL) stopFlasherLocked() {
	if h.flasherStop == nil {
		return
	}
	close(h.flasherStop)
	h.flasherStop = nil
}

func (h *RealHAL) runFlasher(stopCh chan struct{}) {
	ticker := time.NewTicker(h.flashInterval)
	defer ticker.Stop()

	flashOn := true
	if err := h.applyCurrentFlashFrame(flashOn); err != nil {
		h.log.Error("initial flash frame failed", "error", err)
	}

	for {
		select {
		case <-stopCh:
			return
		case <-ticker.C:
			flashOn = !flashOn
			if err := h.applyCurrentFlashFrame(flashOn); err != nil {
				h.log.Error("flash frame failed", "error", err)
			}
		}
	}
}

func (h *RealHAL) applyCurrentFlashFrame(flashOn bool) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.configured {
		return nil
	}
	return h.applySignalImageLocked(h.signalStates, flashOn)
}

func (h *RealHAL) applySignalImageLocked(image map[string]SignalState, flashOn bool) error {
	writes, err := h.buildWritesForImageLocked(image, flashOn)
	if err != nil {
		return err
	}
	if err := h.applyWritesLocked(writes); err != nil {
		return err
	}
	if h.watchdog != nil {
		if err := h.watchdog.Kick(); err != nil {
			return fmt.Errorf("watchdog kick: %w", err)
		}
	}
	return nil
}

func (h *RealHAL) buildWritesForImageLocked(image map[string]SignalState, flashOn bool) ([]ChannelWrite, error) {
	writes := make([]ChannelWrite, 0)
	for code, mapping := range h.activeSignalGroups {
		state, ok := image[code]
		if !ok {
			state = SignalRed
		}
		groupWrites, err := buildGroupWrites(mapping, state, flashOn)
		if err != nil {
			return nil, fmt.Errorf("build writes for %s: %w", code, err)
		}
		writes = append(writes, groupWrites...)
	}
	return writes, nil
}

func (h *RealHAL) applyWritesLocked(writes []ChannelWrite) error {
	if h.driver == nil {
		h.log.Info("real HAL dry-run write batch",
			"count", len(writes),
			"writes", writes,
		)
		return nil
	}
	if h.mode == RealHALModeDryRun {
		h.log.Info("real HAL dry-run write batch",
			"count", len(writes),
			"writes", writes,
		)
	}
	return h.driver.ApplyBatch(writes)
}

func buildGroupWrites(mapping SignalGroupMapping, state SignalState, flashOn bool) ([]ChannelWrite, error) {
	if len(mapping.Aspects) == 0 {
		return nil, fmt.Errorf("signal group mapping has no aspects")
	}

	targetState := state
	switch state {
	case SignalPedClearance:
		if _, ok := mapping.Aspects[SignalPedClearance]; !ok {
			if _, ok := mapping.Aspects[SignalDontWalk]; ok {
				targetState = SignalDontWalk
			}
		}
	case SignalFlashingRed:
		targetState = SignalRed
	case SignalFlashingYellow:
		targetState = SignalYellow
	}

	writes := make([]ChannelWrite, 0, len(mapping.Aspects))
	for aspect, channel := range mapping.Aspects {
		energize := false
		switch state {
		case SignalFlashingRed:
			energize = aspect == SignalRed && flashOn
		case SignalFlashingYellow:
			energize = aspect == SignalYellow && flashOn
		case SignalOff:
			energize = false
		default:
			energize = aspect == targetState
		}

		writes = append(writes, ChannelWrite{
			Channel: channel.Channel,
			Level:   resolveOutputLevel(channel, energize),
		})
	}
	return writes, nil
}

func resolveOutputLevel(channel OutputChannel, energize bool) bool {
	if channel.ActiveHigh {
		return energize
	}
	return !energize
}

func resolveInputLevel(mapping DetectorChannelMapping, level bool) bool {
	if mapping.ActiveHigh {
		return level
	}
	return !level
}

func cloneSignalMappings(in map[string]SignalGroupMapping) map[string]SignalGroupMapping {
	out := make(map[string]SignalGroupMapping, len(in))
	for code, mapping := range in {
		aspectCopy := make(map[SignalState]OutputChannel, len(mapping.Aspects))
		for state, channel := range mapping.Aspects {
			aspectCopy[state] = channel
		}
		out[code] = SignalGroupMapping{Aspects: aspectCopy}
	}
	return out
}

func cloneDetectorMappings(in map[string]DetectorChannelMapping) map[string]DetectorChannelMapping {
	out := make(map[string]DetectorChannelMapping, len(in))
	for code, mapping := range in {
		out[code] = mapping
	}
	return out
}

func cloneSignalStates(in map[string]SignalState) map[string]SignalState {
	out := make(map[string]SignalState, len(in))
	for code, state := range in {
		out[code] = state
	}
	return out
}

func imageHasFlashing(image map[string]SignalState) bool {
	for _, state := range image {
		if state == SignalFlashingRed || state == SignalFlashingYellow {
			return true
		}
	}
	return false
}

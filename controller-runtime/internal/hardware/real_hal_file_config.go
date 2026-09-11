package hardware

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"
)

// RealHALFileConfig is the local bench/hardware config file shape.
type RealHALFileConfig struct {
	Mode          RealHALMode                       `json:"mode"`
	FlashInterval string                            `json:"flashInterval"`
	SignalGroups  map[string]RealHALFileSignalGroup `json:"signalGroups"`
	Detectors     map[string]DetectorChannelMapping `json:"detectors"`
}

// RealHALFileSignalGroup maps a logical signal group to per-aspect channels.
type RealHALFileSignalGroup struct {
	Aspects map[string]OutputChannel `json:"aspects"`
}

// LoadRealHALFileConfig reads a local JSON config file for bench or hardware
// mapping. This is intentionally local-only and independent from the backend
// deployment contract.
func LoadRealHALFileConfig(path string) (*RealHALFileConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read RealHAL config: %w", err)
	}

	var cfg RealHALFileConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse RealHAL config: %w", err)
	}

	if cfg.Mode == "" {
		cfg.Mode = RealHALModeDryRun
	}
	if cfg.Mode != RealHALModeDryRun && cfg.Mode != RealHALModeActive {
		return nil, fmt.Errorf("invalid mode %q", cfg.Mode)
	}
	if len(cfg.SignalGroups) == 0 {
		return nil, fmt.Errorf("signalGroups is required")
	}

	return &cfg, nil
}

// BuildConfig converts the file-backed config to the runtime RealHALConfig.
func (cfg *RealHALFileConfig) BuildConfig(driver RealHALDriver, watchdog MCUWatchdog) (RealHALConfig, error) {
	flashInterval := 500 * time.Millisecond
	if cfg.FlashInterval != "" {
		parsed, err := time.ParseDuration(cfg.FlashInterval)
		if err != nil {
			return RealHALConfig{}, fmt.Errorf("parse flashInterval: %w", err)
		}
		flashInterval = parsed
	}

	signalGroups := make(map[string]SignalGroupMapping, len(cfg.SignalGroups))
	for code, group := range cfg.SignalGroups {
		if code == "" {
			return RealHALConfig{}, fmt.Errorf("signal group code cannot be empty")
		}
		if len(group.Aspects) == 0 {
			return RealHALConfig{}, fmt.Errorf("signal group %s has no aspects", code)
		}

		aspects := make(map[SignalState]OutputChannel, len(group.Aspects))
		for aspect, channel := range group.Aspects {
			if aspect == "" {
				return RealHALConfig{}, fmt.Errorf("signal group %s has an empty aspect key", code)
			}
			if channel.Channel == "" {
				return RealHALConfig{}, fmt.Errorf("signal group %s aspect %s has an empty channel", code, aspect)
			}
			aspects[SignalState(aspect)] = channel
		}
		signalGroups[code] = SignalGroupMapping{Aspects: aspects}
	}

	detectors := make(map[string]DetectorChannelMapping, len(cfg.Detectors))
	for code, detector := range cfg.Detectors {
		if code == "" {
			return RealHALConfig{}, fmt.Errorf("detector code cannot be empty")
		}
		if detector.Channel == "" {
			return RealHALConfig{}, fmt.Errorf("detector %s has an empty channel", code)
		}
		detectors[code] = detector
	}

	return RealHALConfig{
		Mode:          cfg.Mode,
		FlashInterval: flashInterval,
		SignalGroups:  signalGroups,
		Detectors:     detectors,
		Driver:        driver,
		Watchdog:      watchdog,
	}, nil
}

// SignalGroupCodes returns the sorted logical signal groups from the file.
func (cfg *RealHALFileConfig) SignalGroupCodes() []string {
	codes := make([]string, 0, len(cfg.SignalGroups))
	for code := range cfg.SignalGroups {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

// DetectorCodes returns the sorted logical detector codes from the file.
func (cfg *RealHALFileConfig) DetectorCodes() []string {
	codes := make([]string, 0, len(cfg.Detectors))
	for code := range cfg.Detectors {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

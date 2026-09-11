package main

import (
	"encoding/json"
	"flag"
	"log/slog"
	"os"
	"time"

	"stls/controller-runtime/internal/hardware"
)

func main() {
	configPath := flag.String("config", "./bench.realhal.example.json", "path to the local RealHAL bench config file")
	logLevel := flag.String("log-level", "info", "log level: debug|info|warn|error")
	flashWait := flag.Duration("flash-wait", 1200*time.Millisecond, "time to observe flashing-red before shutdown")
	flag.Parse()

	log := buildLogger(*logLevel)

	fileCfg, err := hardware.LoadRealHALFileConfig(*configPath)
	if err != nil {
		log.Error("failed to load bench config", "error", err)
		os.Exit(1)
	}

	halCfg, err := fileCfg.BuildConfig(nil, nil)
	if err != nil {
		log.Error("failed to build RealHAL config", "error", err)
		os.Exit(1)
	}

	driver := hardware.NewBenchDriver(halCfg.Mode, halCfg.SignalGroups, halCfg.Detectors, log.WithGroup("bench_driver"))
	halCfg.Driver = driver

	hal, err := hardware.NewRealHAL(halCfg, log.WithGroup("real_hal"))
	if err != nil {
		log.Error("failed to construct RealHAL", "error", err)
		os.Exit(1)
	}

	signalGroupCodes := fileCfg.SignalGroupCodes()
	detectorCodes := fileCfg.DetectorCodes()

	log.Info("starting RealHAL bench harness",
		"mode", string(halCfg.Mode),
		"signal_groups", signalGroupCodes,
		"detectors", detectorCodes,
	)

	if err := hal.Configure(signalGroupCodes, detectorCodes); err != nil {
		log.Error("Configure failed", "error", err)
		os.Exit(1)
	}
	logSnapshot(log, "after_configure", hal, driver)

	if len(signalGroupCodes) > 0 {
		if err := hal.SetSignalState(signalGroupCodes[0], hardware.SignalGreen); err != nil {
			log.Error("SetSignalState failed", "error", err)
			_ = hal.Shutdown()
			os.Exit(1)
		}
		logSnapshot(log, "after_set_signal_state", hal, driver)
	}

	if outputs := demoOutputs(signalGroupCodes); len(outputs) > 0 {
		if err := hal.SetAllSignalStates(outputs); err != nil {
			log.Error("SetAllSignalStates failed", "error", err)
			_ = hal.Shutdown()
			os.Exit(1)
		}
		logSnapshot(log, "after_set_all_signal_states", hal, driver)
	}

	if err := hal.AllRed(); err != nil {
		log.Error("AllRed failed", "error", err)
		_ = hal.Shutdown()
		os.Exit(1)
	}
	logSnapshot(log, "after_all_red", hal, driver)

	if err := hal.AllFlashingRed(); err != nil {
		log.Error("AllFlashingRed failed", "error", err)
		_ = hal.Shutdown()
		os.Exit(1)
	}
	time.Sleep(*flashWait)
	logSnapshot(log, "after_all_flashing_red", hal, driver)

	if err := hal.Shutdown(); err != nil {
		log.Error("Shutdown failed", "error", err)
		os.Exit(1)
	}
	logSnapshot(log, "after_shutdown", hal, driver)

	log.Info("RealHAL bench harness completed")
}

func demoOutputs(signalGroupCodes []string) []hardware.SignalOutput {
	outputs := make([]hardware.SignalOutput, 0, len(signalGroupCodes))
	for idx, code := range signalGroupCodes {
		state := hardware.SignalRed
		switch idx {
		case 0:
			state = hardware.SignalYellow
		case 1:
			state = hardware.SignalGreen
		}
		outputs = append(outputs, hardware.SignalOutput{
			SignalGroupCode: code,
			State:           state,
		})
	}
	return outputs
}

func logSnapshot(log *slog.Logger, step string, hal hardware.HAL, driver *hardware.BenchDriver) {
	status, err := hal.GetSystemStatus()
	if err != nil {
		log.Error("failed to read HAL status", "step", step, "error", err)
		return
	}

	snapshotJSON, err := json.Marshal(driver.Snapshot())
	if err != nil {
		log.Error("failed to marshal bench snapshot", "step", step, "error", err)
		return
	}

	log.Info("bench step complete",
		"step", step,
		"healthy", status.Healthy,
		"power_ok", status.PowerOK,
		"cabinet_temp_c", status.CabinetTemperatureCelsius,
		"fault_codes", status.FaultCodes,
		"driver_snapshot", string(snapshotJSON),
	)
}

func buildLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:     lvl,
		AddSource: lvl == slog.LevelDebug,
	}))
}

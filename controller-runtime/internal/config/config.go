// Package config loads controller runtime configuration from environment variables
// and an optional .env file. No external libraries are used.
package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"
)

// Config holds all runtime configuration for the controller.
type Config struct {
	// Backend connectivity
	BackendURL string

	// Controller credentials (issued by engineering admin)
	ClientID     string
	ClientSecret string

	// Optional: hardware controller code for identity verification
	ControllerCode string

	// Shared deployment signing secret (must match DEPLOYMENT_SIGNING_SECRET on backend)
	DeploymentSigningSecret string

	// Self-reported versions
	RuntimeVersion  string
	FirmwareVersion string

	// Polling and heartbeat intervals
	HeartbeatInterval   time.Duration
	TelemetryInterval   time.Duration
	PackagePollInterval time.Duration
	BootstrapRetryDelay time.Duration

	// Operating environment: "real" or "simulation"
	OperatingEnvironment string

	// Logging: "debug", "info", "warn", "error"
	LogLevel string

	// Persistence paths (for offline / token caching)
	PackageCachePath string
	TokenCachePath   string
}

// Load reads configuration from environment variables, falling back to .env
// file values when environment variables are absent. Returns an error if any
// required variable is missing.
func Load() (*Config, error) {
	loadDotEnv(".env")

	cfg := &Config{
		BackendURL:              getEnv("STLS_BACKEND_URL", "http://localhost:4010"),
		ClientID:                getEnv("STLS_CLIENT_ID", ""),
		ClientSecret:            getEnv("STLS_CLIENT_SECRET", ""),
		ControllerCode:          getEnv("STLS_CONTROLLER_CODE", ""),
		DeploymentSigningSecret: getEnv("STLS_DEPLOYMENT_SIGNING_SECRET", "local-dev-deployment-signing-secret"),
		RuntimeVersion:          getEnv("STLS_RUNTIME_VERSION", "1.0.0"),
		FirmwareVersion:         getEnv("STLS_FIRMWARE_VERSION", "1.0.0"),
		HeartbeatInterval:       parseDuration(getEnv("STLS_HEARTBEAT_INTERVAL", "30s"), 30*time.Second),
		TelemetryInterval:       parseDuration(getEnv("STLS_TELEMETRY_INTERVAL", "60s"), 60*time.Second),
		PackagePollInterval:     parseDuration(getEnv("STLS_PACKAGE_POLL_INTERVAL", "10s"), 10*time.Second),
		BootstrapRetryDelay:     parseDuration(getEnv("STLS_BOOTSTRAP_RETRY_DELAY", "10s"), 10*time.Second),
		OperatingEnvironment:    getEnv("STLS_OPERATING_ENVIRONMENT", "simulation"),
		LogLevel:                getEnv("STLS_LOG_LEVEL", "info"),
		PackageCachePath:        getEnv("STLS_PACKAGE_CACHE_PATH", "cache/package.json"),
		TokenCachePath:          getEnv("STLS_TOKEN_CACHE_PATH", "cache/token.json"),
	}

	if cfg.ClientID == "" {
		return nil, fmt.Errorf("STLS_CLIENT_ID is required")
	}
	if cfg.ClientSecret == "" {
		return nil, fmt.Errorf("STLS_CLIENT_SECRET is required")
	}

	return cfg, nil
}

// getEnv returns the value of the environment variable named by key,
// or fallback if the variable is not set or empty.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// parseDuration parses a duration string such as "30s" or "2m".
// Returns fallback on parse failure.
func parseDuration(s string, fallback time.Duration) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return fallback
	}
	return d
}

// loadDotEnv reads key=value pairs from the named file and sets them in the
// process environment if they are not already set. This makes .env files
// optional without requiring a third-party library.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		// File is optional — silently skip if missing.
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Strip surrounding quotes from the value.
		val = strings.Trim(val, `"'`)

		// Only set if not already overridden in the environment.
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}

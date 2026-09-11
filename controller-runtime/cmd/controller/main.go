// Command controller is the STLS controller runtime binary.
// It boots the controller, bootstraps with the backend, verifies and applies
// the deployment package, and then runs the signal timing loop.
//
// Usage:
//
//	STLS_CLIENT_ID=ctrl_xxx STLS_CLIENT_SECRET=yyy ./controller
//
// All configuration is read from environment variables or a .env file in the
// working directory. See .env.example for the full list of variables.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stls/controller-runtime/internal/config"
	"stls/controller-runtime/internal/runtime"
)

func main() {
	// ── Logger ────────────────────────────────────────────────────────────
	// Bootstrap with a basic logger first so we can report config errors.
	baseLog := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	// ── Configuration ─────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		baseLog.Error("configuration error", "error", err)
		os.Exit(1)
	}

	// Re-create logger at the configured log level.
	log := buildLogger(cfg.LogLevel)

	// ── Graceful shutdown ─────────────────────────────────────────────────
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// ── Runtime ───────────────────────────────────────────────────────────
	rt := runtime.New(cfg, log)

	// Give the runtime a generous shutdown window so heartbeats and
	// pending acknowledgements can drain.
	shutdownTimeout := 15 * time.Second
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		<-ctx.Done()
		log.Info("shutdown signal received",
			"timeout", shutdownTimeout,
		)
		time.AfterFunc(shutdownTimeout, cancel)
	}()

	if err := rt.Run(runCtx); err != nil {
		log.Error("runtime exited with error", "error", err)
		os.Exit(1)
	}

	log.Info("controller runtime stopped cleanly")
}

// buildLogger creates a JSON structured logger at the requested level.
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
		Level: lvl,
		// AddSource makes log lines point to the source file. Useful in prod.
		AddSource: lvl == slog.LevelDebug,
	}))
}

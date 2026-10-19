// Command crew-api is the job board's transport on Cloud Run: the Worker gateway ported to Go, plus R2
// signing. Postgres decides everything (apps/job-board/db/api.sql); this process proves identity, moves
// bodies, and holds the two secrets Postgres must not: the Google client secret and the R2 key.
//
//	crew-api          serve HTTP on $PORT
//	crew-api sweep    one orphan sweep as bt_sweeper, then exit (nightly, GitHub Actions)
//
// Cold start: a static binary, config from env only, no remote call before listening. The pool dials in the
// background at boot, so the first request usually finds Neon already resuming.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	"boromtech.com/crew-api/internal/gate"
	"boromtech.com/crew-api/internal/r2"
	"boromtech.com/crew-api/internal/server"
	"boromtech.com/crew-api/internal/sweep"
)

func main() {
	log := newLogger()
	mode := "serve"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}
	cfg, err := loadConfig(mode, os.Getenv)
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	store, err := r2.New(cfg.R2, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(2)
	}
	g, err := gate.Open(cfg.DatabaseURL)
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(2)
	}
	defer g.Close() // ends our Neon sessions the moment Cloud Run retires the instance

	if mode == "sweep" {
		n, err := sweep.Run(ctx, g, store, log)
		log.Info("sweep: done", "deleted", n)
		if err != nil {
			log.Error("sweep", "err", err)
			g.Close()
			os.Exit(1)
		}
		return
	}

	go func() { // pre-dial: never blocks listening
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		if err := g.Ping(ctx); err != nil {
			log.Warn("pre-dial", "err", err)
		}
	}()
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.New(cfg.Server, g, store, log),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second, // bodies are ≤ 32 KiB; file bytes never come through here
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 8*time.Second) // Cloud Run allows 10 s
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("http", "err", err)
		os.Exit(1)
	}
}

type config struct {
	Port        string
	DatabaseURL string // bt_gateway (serve) or bt_sweeper (sweep)
	Server      server.Config
	R2          r2.Config
}

// loadConfig reads and validates the environment. Invalid config exits before listening, so a bad deploy
// fails Cloud Run's startup check instead of serving errors.
func loadConfig(mode string, getenv func(string) string) (config, error) {
	env := func(k, def string) string {
		if v := getenv(k); v != "" {
			return v
		}
		return def
	}
	c := config{Port: env("PORT", "8080")}
	c.R2 = r2.Config{
		Endpoint:        env("R2_ENDPOINT", ""),
		Region:          env("R2_REGION", "auto"),
		Bucket:          env("R2_BUCKET", "bt-crew-files"),
		AccessKeyID:     getenv("R2_ACCESS_KEY_ID"),
		SecretAccessKey: getenv("R2_SECRET_ACCESS_KEY"),
	}
	if c.R2.Endpoint == "" && getenv("R2_ACCOUNT_ID") != "" {
		c.R2.Endpoint = "https://" + getenv("R2_ACCOUNT_ID") + ".r2.cloudflarestorage.com"
	}
	var need []string
	switch mode {
	case "sweep":
		c.DatabaseURL = getenv("SWEEPER_DATABASE_URL")
		need = []string{"SWEEPER_DATABASE_URL"}
	case "serve":
		c.DatabaseURL = getenv("DATABASE_URL")
		c.Server = server.Config{
			PublicOrigin:       getenv("PUBLIC_ORIGIN"),
			EdgeKey:            getenv("EDGE_KEY"),
			GoogleClientID:     getenv("GOOGLE_CLIENT_ID"),
			GoogleClientSecret: getenv("GOOGLE_CLIENT_SECRET"),
		}
		need = []string{"DATABASE_URL", "PUBLIC_ORIGIN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}
	default:
		return c, fmt.Errorf("unknown command %q (want: sweep, or none to serve)", mode)
	}
	need = append(need, "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
	for _, k := range need {
		if getenv(k) == "" {
			return c, fmt.Errorf("%s is required", k)
		}
	}
	if c.R2.Endpoint == "" {
		return c, errors.New("R2_ACCOUNT_ID or R2_ENDPOINT is required")
	}
	if mode == "serve" {
		u, err := url.Parse(c.Server.PublicOrigin)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.Path != "" {
			return c, fmt.Errorf("PUBLIC_ORIGIN %q must be an origin like https://crew.boromtech.com", c.Server.PublicOrigin)
		}
		// Without the edge key anyone who finds the *.run.app URL skips Cloudflare. Only local dev may.
		if c.Server.EdgeKey == "" && !(u.Scheme == "http" && u.Hostname() == "localhost") {
			return c, errors.New("EDGE_KEY is required unless PUBLIC_ORIGIN is http://localhost")
		}
	}
	return c, nil
}

// newLogger writes JSON lines Cloud Logging understands (severity, message); Cloud Run adds the timestamp.
func newLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if len(groups) > 0 {
				return a
			}
			switch a.Key {
			case slog.TimeKey:
				return slog.Attr{}
			case slog.LevelKey: // Cloud Logging's names: WARN is WARNING there
				a.Key = "severity"
				if a.Value.Any() == slog.LevelWarn {
					a.Value = slog.StringValue("WARNING")
				}
			case slog.MessageKey:
				a.Key = "message"
			}
			return a
		},
	}))
}

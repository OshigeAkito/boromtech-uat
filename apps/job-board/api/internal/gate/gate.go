// Package gate is the whole database surface: one method per gate.* function in apps/job-board/db/api.sql,
// one SQL round trip each. bt_gateway can execute those functions and nothing else, so this is also all the
// service could ever ask Postgres for. Envelopes come back as raw JSON; callers read `status` (and a few
// transport fields) and forward the rest untouched.
package gate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"boromtech.co/crew-api/internal/r2"
)

type Gate struct{ pool *pgxpool.Pool }

// Open configures the pool without dialing. Tuned for scale-to-zero on both sides (Cloud Run, Neon):
//
//	MinConns 0          never dial without a request, so Neon is free to suspend
//	MaxConns 4          a poll holds a conn for a few ms; four serve one instance's ~80 concurrent requests
//	MaxConnIdleTime 30s give conns back well inside Neon's suspend window
//	MaxConnLifetime 5m  bound a conn that outlived a Neon suspend unnoticed
//	ShouldPing > 10s    a conn idle that long may have been cut by Neon or PgBouncer: ping before reuse
//	QueryExecModeExec   one round trip, no named prepared statements: safe on PgBouncer transaction mode
func Open(url string) (*Gate, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MinConns = 0
	cfg.MaxConns = 4
	cfg.MaxConnIdleTime = 30 * time.Second
	cfg.MaxConnLifetime = 5 * time.Minute
	cfg.ShouldPing = func(_ context.Context, p pgxpool.ShouldPingParams) bool { return p.IdleDuration > 10*time.Second }
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	if cfg.ConnConfig.ConnectTimeout == 0 {
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second // covers a Neon wake (~0.5–1 s) with margin
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg) // lazy: dials on first use
	if err != nil {
		return nil, err
	}
	return &Gate{pool: pool}, nil
}

func (g *Gate) Close() { g.pool.Close() }

// Ping acquires a pooled connection and runs `select 1`: dials the pool and resumes a suspended Neon.
// Used once at boot (in the background) and by /api/warm.
func (g *Gate) Ping(ctx context.Context) error {
	_, err := g.pool.Exec(ctx, "select 1")
	return err
}

// The SQL is a closed set of constants; arguments are always bound, never formatted in.
func (g *Gate) Call(ctx context.Context, token string, body []byte) (json.RawMessage, error) {
	return g.one(ctx, `select gate.call($1, $2::jsonb)`, token, string(body))
}

// SignIn takes claims the transport verified ({sub, email, email_verified, name, picture} as JSON).
func (g *Gate) SignIn(ctx context.Context, identity []byte) (json.RawMessage, error) {
	return g.one(ctx, `select gate.sign_in($1::jsonb)`, string(identity))
}

func (g *Gate) SignOut(ctx context.Context, token string) (json.RawMessage, error) {
	return g.one(ctx, `select gate.sign_out($1)`, token)
}

func (g *Gate) Upload(ctx context.Context, token string, body []byte) (json.RawMessage, error) {
	return g.one(ctx, `select gate.upload($1, $2::jsonb)`, token, string(body))
}

func (g *Gate) UploadDone(ctx context.Context, token string, body []byte) (json.RawMessage, error) {
	return g.one(ctx, `select gate.upload_done($1, $2::jsonb)`, token, string(body))
}

// File: id must already be a well-formed uuid (the route 404s anything else without asking).
func (g *Gate) File(ctx context.Context, token, id, variant string) (json.RawMessage, error) {
	return g.one(ctx, `select gate.file($1, $2::uuid, $3)`, token, id, variant)
}

// Sweep runs as bt_sweeper (a Gate opened on SWEEPER_DATABASE_URL).
func (g *Gate) Sweep(ctx context.Context, purged []string) (json.RawMessage, error) {
	return g.one(ctx, `select gate.sweep($1::uuid[])`, purged)
}

// one runs a gate function and returns its envelope. A connection-level failure (a pooled conn Neon cut
// while suspended, a reset) is retried once; an SQL error never is. Retrying a call that did reach Postgres
// is safe: gate.call is exactly-once per requestId, gate.upload is idempotent on id, the rest only read or
// converge.
func (g *Gate) one(ctx context.Context, sql string, args ...any) (json.RawMessage, error) {
	var raw []byte
	err := g.pool.QueryRow(ctx, sql, args...).Scan(&raw)
	var pgErr *pgconn.PgError
	if err != nil && ctx.Err() == nil && !errors.As(err, &pgErr) {
		err = g.pool.QueryRow(ctx, sql, args...).Scan(&raw)
	}
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, errors.New("gate: null envelope")
	}
	return raw, nil
}

// Envelope is the part of a gate.* result the transport reads. Everything else is the browser's.
type Envelope struct {
	Status int                    `json:"status"`
	Token  string                 `json:"token"` // gate.sign_in only
	Error  *struct{ Code string } `json:"error"`
	// presign: { label: spec }. The transport replaces it with signed: { label: {method, url, headers} }.
	Presign map[string]r2.Spec `json:"presign"`
}

// Parse reads an envelope. A status outside 200–599 is a bug in api.sql, reported as an error.
func Parse(raw json.RawMessage) (Envelope, error) {
	var e Envelope
	if err := json.Unmarshal(raw, &e); err != nil {
		return e, fmt.Errorf("gate: bad envelope: %w", err)
	}
	if e.Status < 200 || e.Status > 599 {
		return e, fmt.Errorf("gate: bad envelope status %d", e.Status)
	}
	return e, nil
}

// Code is error.code, or "" when there is none.
func (e Envelope) Code() string {
	if e.Error == nil {
		return ""
	}
	return e.Error.Code
}

// WithSigned returns raw with `presign` and `token` removed and `signed` added. Other keys pass through as
// the exact bytes Postgres produced.
func WithSigned(raw json.RawMessage, signed map[string]r2.Signed) (json.RawMessage, error) {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, err
	}
	delete(obj, "presign")
	delete(obj, "token")
	s, err := marshal(signed)
	if err != nil {
		return nil, err
	}
	obj["signed"] = s
	return marshal(obj)
}

// marshal without HTML escaping, so signed URLs keep a literal '&' (and RawMessage values are not rewritten).
func marshal(v any) (json.RawMessage, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

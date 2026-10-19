// Package server is the HTTP transport: a deliberately dumb port of the Worker gateway
// (apps/job-board/gateway/src/index.ts) plus R2 signing. It knows how to prove who is calling (Google OIDC →
// gate.sign_in), how to move a body to a gate.* function and its envelope back, how to sign the specs
// Postgres hands out, and how to measure an uploaded object. It knows no command names, roles, kinds, states
// or tables: Postgres answers every "may they?".
//
// Routes (the edge Worker forwards /api and /api/* unchanged and adds X-BT-Edge):
//
//	POST /api                    gate.call(session, body): polls and commands alike
//	GET  /api/auth/google        302 to Google (state + PKCE verifier in a short-lived cookie)
//	GET  /api/auth/callback      code → id_token → gate.sign_in → avatar copy → session cookie → 302 /
//	POST /api/auth/logout        gate.sign_out, clear the cookie
//	POST /api/files              gate.upload → presigned PUTs
//	POST /api/files/{id}/done    measure the stored objects → gate.upload_done
//	GET  /api/files/{id}?v=      gate.file → 302 to a presigned GET
//	GET  /api/warm               204; with a session cookie, also dial the pool / resume Neon
//	GET  /healthz                200 ok, no database
//
// Anything else, and any request without the edge key, is a plain 404, as on the Worker.
package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"boromtech.co/crew-api/internal/gate"
	"boromtech.co/crew-api/internal/r2"
)

type Config struct {
	// https://crew.boromtech.co in production, http://localhost:5173 in dev. The only Origin accepted on a
	// state-changing request, and the base of the OAuth redirect URI.
	PublicOrigin       string
	EdgeKey            string // empty only for http://localhost (main refuses to start otherwise)
	GoogleClientID     string
	GoogleClientSecret string
}

type Server struct {
	cfg   Config
	gate  *gate.Gate
	store *r2.Client
	log   *slog.Logger

	// Seams for tests; production values set by New.
	googleAuthURL, googleTokenURL string
	googleHTTP, avatarHTTP        *http.Client
	now                           func() time.Time
}

func New(cfg Config, g *gate.Gate, store *r2.Client, log *slog.Logger) *Server {
	return &Server{
		cfg: cfg, gate: g, store: store, log: log,
		googleAuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
		googleTokenURL: "https://oauth2.googleapis.com/token",
		googleHTTP:     &http.Client{Timeout: 10 * time.Second},
		avatarHTTP:     avatarClient(),
		now:            time.Now,
	}
}

const (
	maxBody       = 32 << 10
	sessionMaxAge = 30 * 86400
)

var uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Not an auth boundary (sessions are): it keeps the *.run.app URL from being a second front door that
	// skips Cloudflare. Constant-time so the key can't be guessed byte by byte.
	if s.cfg.EdgeKey != "" && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-BT-Edge")), []byte(s.cfg.EdgeKey)) != 1 {
		text(w, http.StatusNotFound, "Not found")
		return
	}
	p, m := r.URL.Path, r.Method
	switch {
	case p == "/api" && m == http.MethodPost:
		s.rpc(w, r)
	case p == "/api/auth/google" && m == http.MethodGet:
		s.startLogin(w, r)
	case p == "/api/auth/callback" && m == http.MethodGet:
		s.finishLogin(w, r)
	case p == "/api/auth/logout" && m == http.MethodPost:
		s.logout(w, r)
	case p == "/api/files" && m == http.MethodPost:
		s.upload(w, r)
	case p == "/api/warm" && m == http.MethodGet:
		s.warm(w, r)
	case p == "/healthz" && m == http.MethodGet:
		text(w, http.StatusOK, "ok")
	case strings.HasPrefix(p, "/api/files/"):
		rest := strings.ToLower(p[len("/api/files/"):])
		if id, ok := strings.CutSuffix(rest, "/done"); ok && m == http.MethodPost && uuidRE.MatchString(id) {
			s.uploadDone(w, r, id)
		} else if m == http.MethodGet && uuidRE.MatchString(rest) {
			s.file(w, r, rest)
		} else {
			text(w, http.StatusNotFound, "Not found")
		}
	default:
		text(w, http.StatusNotFound, "Not found")
	}
}

// rpc is index.ts rpc(): Origin, JSON, ≤ 32 KiB, parses, then the body goes to Postgres as text and is
// cast there; its shape is Postgres's business. The envelope comes back byte for byte.
func (s *Server) rpc(w http.ResponseWriter, r *http.Request) {
	body, ok := s.readJSON(w, r)
	if !ok {
		return
	}
	raw, err := s.gate.Call(r.Context(), s.session(r), body)
	s.reply(w, raw, err)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != s.cfg.PublicOrigin {
		text(w, http.StatusForbidden, "Bad origin")
		return
	}
	if token := s.session(r); token != "" {
		if _, err := s.gate.SignOut(r.Context(), token); err != nil {
			s.fail(w, "sign_out", err)
			return
		}
	}
	w.Header().Add("Set-Cookie", s.clearCookie(s.sessionCookie()))
	w.WriteHeader(http.StatusNoContent)
}

// warm is preloaded by index.html so the first page load wakes Cloud Run, and (for a signed-in visitor) the
// pool and Neon, while the SPA's JS downloads. Without a cookie it never touches the database: an anonymous
// visitor or a crawler must not keep Neon awake. Synchronous, because Cloud Run throttles CPU once a
// response is sent.
func (s *Server) warm(w http.ResponseWriter, r *http.Request) {
	if s.session(r) != "" {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		if err := s.gate.Ping(ctx); err != nil {
			s.log.Warn("warm", "err", err)
		}
		cancel()
	}
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// readJSON applies the POST /api checks: Origin == PublicOrigin (403), JSON content type (415),
// ≤ 32 KiB (413), well-formed (400).
func (s *Server) readJSON(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	if r.Header.Get("Origin") != s.cfg.PublicOrigin {
		text(w, http.StatusForbidden, "Bad origin")
		return nil, false
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		text(w, http.StatusUnsupportedMediaType, "JSON only")
		return nil, false
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil {
		text(w, http.StatusBadRequest, "Bad body")
		return nil, false
	}
	if len(body) > maxBody {
		text(w, http.StatusRequestEntityTooLarge, "Too large")
		return nil, false
	}
	if !json.Valid(body) {
		text(w, http.StatusBadRequest, "Bad JSON")
		return nil, false
	}
	return body, true
}

// reply sends an envelope verbatim with its own status.
func (s *Server) reply(w http.ResponseWriter, raw json.RawMessage, err error) {
	if err != nil {
		s.fail(w, "gate", err)
		return
	}
	env, err := gate.Parse(raw)
	if err != nil {
		s.fail(w, "gate", err)
		return
	}
	writeJSON(w, env.Status, raw)
}

// fail is every unexpected error: logged, and a non-JSON 500 the client already treats as "network, retry".
func (s *Server) fail(w http.ResponseWriter, what string, err error) {
	s.log.Error(what, "err", err)
	text(w, http.StatusInternalServerError, "Server error")
}

func writeJSON(w http.ResponseWriter, status int, raw []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(raw)
}

func text(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain;charset=UTF-8")
	w.WriteHeader(status)
	_, _ = io.WriteString(w, body)
}

// ---- cookies, exactly as index.ts --------------------------------------------------------------------

func (s *Server) secure() bool { return strings.HasPrefix(s.cfg.PublicOrigin, "https://") }

// __Host- pins the cookie to this origin (Secure, Path=/, no Domain). Plain http://localhost can't use it.
func (s *Server) sessionCookie() string {
	if s.secure() {
		return "__Host-bt_session"
	}
	return "bt_session"
}

func (s *Server) oauthCookie() string {
	if s.secure() {
		return "__Host-bt_oauth"
	}
	return "bt_oauth"
}

func (s *Server) setCookie(name, value string, maxAge int, sameSite string) string {
	c := name + "=" + value + "; Path=/; HttpOnly; SameSite=" + sameSite + "; Max-Age=" + strconv.Itoa(maxAge)
	if s.secure() {
		c += "; Secure"
	}
	return c
}

func (s *Server) clearCookie(name string) string { return s.setCookie(name, "", 0, "Lax") }

// readCookie returns the first cookie with this name, "" when absent (index.ts readCookie).
func readCookie(r *http.Request, name string) string {
	for _, part := range strings.Split(strings.Join(r.Header.Values("Cookie"), ";"), ";") {
		k, v, _ := strings.Cut(strings.TrimSpace(part), "=")
		if k == name {
			return v
		}
	}
	return ""
}

func (s *Server) session(r *http.Request) string { return readCookie(r, s.sessionCookie()) }

func redirect(w http.ResponseWriter, location string, cookies ...string) {
	w.Header().Set("Location", location)
	w.Header().Set("Cache-Control", "no-store")
	for _, c := range cookies {
		w.Header().Add("Set-Cookie", c)
	}
	w.WriteHeader(http.StatusFound)
}

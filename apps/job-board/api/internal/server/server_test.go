package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"boromtech.co/crew-api/internal/facts"
)

// A server with no database and no storage: every request these tests make must be answered before either
// is touched (a nil *gate.Gate panics if used).
func offline(edgeKey, origin string) *Server {
	return New(Config{PublicOrigin: origin, EdgeKey: edgeKey, GoogleClientID: "cid", GoogleClientSecret: "secret"},
		nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func serve(h http.Handler, method, target string, body string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestEdgeKeyGate(t *testing.T) {
	s := offline("k3y", "https://crew.boromtech.co")
	for _, h := range []map[string]string{nil, {"X-BT-Edge": "nope"}, {"X-BT-Edge": "k3y "}} {
		if rec := serve(s, "GET", "/healthz", "", h); rec.Code != 404 {
			t.Errorf("%v: %d", h, rec.Code)
		}
	}
	if rec := serve(s, "GET", "/healthz", "", map[string]string{"X-BT-Edge": "k3y"}); rec.Code != 200 || rec.Body.String() != "ok" {
		t.Errorf("with key: %d %q", rec.Code, rec.Body)
	}
}

func TestRoutesOutsideTheTableAre404(t *testing.T) {
	s := offline("", "http://localhost:5173")
	for _, c := range [][2]string{
		{"GET", "/api"}, {"PUT", "/api"}, {"POST", "/api/auth/google"}, {"GET", "/api/auth/logout"},
		{"GET", "/api/files"}, {"GET", "/api/files/not-a-uuid"}, {"POST", "/api/files/not-a-uuid/done"},
		{"GET", "/api/files/0b6b4e0e-6f43-4a39-9d3c-3d7a3c7a0c11/done"}, {"GET", "/"}, {"GET", "/api/other"},
		{"POST", "/api/warm"},
	} {
		if rec := serve(s, c[0], c[1], "", nil); rec.Code != 404 {
			t.Errorf("%s %s: %d", c[0], c[1], rec.Code)
		}
	}
}

func TestPostChecksBeforeTheDatabase(t *testing.T) {
	s := offline("", "http://localhost:5173")
	ok := map[string]string{"Origin": "http://localhost:5173", "Content-Type": "application/json; charset=utf-8"}
	with := func(k, v string) map[string]string {
		h := map[string]string{}
		for a, b := range ok {
			h[a] = b
		}
		h[k] = v
		return h
	}
	for _, path := range []string{"/api", "/api/files"} {
		for name, c := range map[string]struct {
			body   string
			header map[string]string
			want   int
		}{
			"no origin":    {`{}`, with("Origin", ""), 403},
			"other origin": {`{}`, with("Origin", "https://evil.example"), 403},
			"form post":    {`a=b`, with("Content-Type", "application/x-www-form-urlencoded"), 415},
			"text/plain":   {`{}`, with("Content-Type", "text/plain"), 415},
			"too large":    {`"` + strings.Repeat("x", 32<<10) + `"`, ok, 413},
			"bad json":     {`{"since":`, ok, 400},
		} {
			if rec := serve(s, "POST", path, c.body, c.header); rec.Code != c.want {
				t.Errorf("%s %s: %d, want %d", path, name, rec.Code, c.want)
			}
		}
	}
	for _, path := range []string{"/api/auth/logout", "/api/files/0b6b4e0e-6f43-4a39-9d3c-3d7a3c7a0c11/done"} {
		if rec := serve(s, "POST", path, "", map[string]string{"Origin": "https://evil.example"}); rec.Code != 403 {
			t.Errorf("%s: %d", path, rec.Code)
		}
	}
}

func TestWarmWithoutCookieNeverTouchesTheDatabase(t *testing.T) {
	rec := serve(offline("", "http://localhost:5173"), "GET", "/api/warm", "", map[string]string{"Cookie": "other=1"})
	if rec.Code != 204 {
		t.Fatalf("%d", rec.Code)
	}
}

func TestStartLogin(t *testing.T) {
	rec := serve(offline("k", "https://crew.boromtech.co"), "GET", "/api/auth/google", "", map[string]string{"X-BT-Edge": "k"})
	if rec.Code != 302 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("%d %v", rec.Code, rec.Header())
	}
	loc, _ := url.Parse(rec.Header().Get("Location"))
	q := loc.Query()
	if loc.Host != "accounts.google.com" || q.Get("client_id") != "cid" || q.Get("response_type") != "code" ||
		q.Get("redirect_uri") != "https://crew.boromtech.co/api/auth/callback" || q.Get("scope") != "openid email profile" ||
		q.Get("code_challenge_method") != "S256" || q.Get("prompt") != "select_account" {
		t.Fatalf("authorize URL %s", loc)
	}
	cookie := rec.Header().Get("Set-Cookie")
	name, rest, _ := strings.Cut(cookie, "=")
	value, attrs, _ := strings.Cut(rest, ";")
	state, verifier, _ := strings.Cut(value, ".")
	if name != "__Host-bt_oauth" || attrs != " Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure" || state != q.Get("state") || len(state) != 32 {
		t.Fatalf("cookie %q", cookie)
	}
	sum := sha256.Sum256([]byte(verifier))
	if q.Get("code_challenge") != base64.RawURLEncoding.EncodeToString(sum[:]) {
		t.Fatal("challenge is not S256(verifier)")
	}
}

func TestCallbackRefusals(t *testing.T) {
	// A fake token endpoint that returns whatever claims the case sets.
	var payload string
	google := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("code_verifier") != "v" || r.Form.Get("client_secret") != "secret" {
			w.WriteHeader(400)
			return
		}
		_, _ = io.WriteString(w, `{"id_token":"h.`+base64.RawURLEncoding.EncodeToString([]byte(payload))+`.s"}`)
	}))
	defer google.Close()
	s := offline("", "http://localhost:5173")
	s.googleTokenURL = google.URL
	cb := func(query, cookie string) *httptest.ResponseRecorder {
		return serve(s, "GET", "/api/auth/callback?"+query, "", map[string]string{"Cookie": cookie})
	}
	for name, c := range map[string]struct{ query, cookie, claims string }{
		"no cookie":       {"code=c&state=s", "", ""},
		"state mismatch":  {"code=c&state=x", "bt_oauth=s.v", ""},
		"no code":         {"state=s", "bt_oauth=s.v", ""},
		"wrong verifier":  {"code=c&state=s", "bt_oauth=s.w", `{}`},
		"wrong audience":  {"code=c&state=s", "bt_oauth=s.v", `{"iss":"accounts.google.com","aud":"other","exp":9999999999,"sub":"A"}`},
		"wrong issuer":    {"code=c&state=s", "bt_oauth=s.v", `{"iss":"evil.example","aud":"cid","exp":9999999999,"sub":"A"}`},
		"expired":         {"code=c&state=s", "bt_oauth=s.v", `{"iss":"https://accounts.google.com","aud":"cid","exp":1,"sub":"A"}`},
		"no expiry claim": {"code=c&state=s", "bt_oauth=s.v", `{"iss":"https://accounts.google.com","aud":"cid","sub":"A"}`},
	} {
		payload = c.claims
		rec := cb(c.query, c.cookie)
		if rec.Code != 302 || rec.Header().Get("Location") != "/?auth_error=sign_in_failed" ||
			rec.Header().Get("Set-Cookie") != "bt_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" {
			t.Errorf("%s: %d %v", name, rec.Code, rec.Header())
		}
	}
}

func TestAvatarSource(t *testing.T) {
	for in, want := range map[string]string{
		"https://lh3.googleusercontent.com/a/ACg8ocK=s96-c":  "https://lh3.googleusercontent.com/a/ACg8ocK=s256-c",
		"https://lh3.googleusercontent.com/a/ACg8ocK=s96":    "https://lh3.googleusercontent.com/a/ACg8ocK=s256-c",
		"https://lh3.googleusercontent.com/-x/AAA/photo.jpg": "https://lh3.googleusercontent.com/-x/AAA/photo.jpg",
		"http://lh3.googleusercontent.com/a/x":               "",
		"https://googleusercontent.com.evil.example/a/x":     "",
		"https://evil.example/lh3.googleusercontent.com/a/x": "",
		"https://user@lh3.googleusercontent.com/a/x":         "",
		"https://lh3.googleusercontent.com:8443/a/x":         "",
		"https://lh3.googleusercontent.com@evil.example/a/x": "",
		"https://LH3.googleusercontent.com/a/x":              "",
	} {
		got, ok := avatarSource(in)
		if got != want || ok != (want != "") {
			t.Errorf("avatarSource(%q) = %q %v, want %q", in, got, ok, want)
		}
	}
}

func TestReencodeJPEG(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 96, 96))
	img.Set(5, 5, color.NRGBA{200, 10, 10, 255}) // the rest is transparent
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	out, err := reencodeJPEG(b.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	f, err := facts.Measure(t.Context(), func(_ context.Context, from, n int64) ([]byte, int64, error) {
		return out[from:min(from+n, int64(len(out)))], int64(len(out)), nil
	})
	if err != nil || f.Type != "image/jpeg" || !f.Clean {
		t.Fatalf("%+v %v", f, err)
	}
	back, _ := jpeg.Decode(bytes.NewReader(out))
	if r, g, bl, _ := back.At(50, 50).RGBA(); r>>8 < 240 || g>>8 < 240 || bl>>8 < 240 {
		t.Fatalf("transparency should be white, got %d %d %d", r>>8, g>>8, bl>>8)
	}
	huge := image.NewGray(image.Rect(0, 0, 5000, 5000))
	b.Reset()
	_ = png.Encode(&b, huge)
	if _, err := reencodeJPEG(b.Bytes()); err == nil {
		t.Fatal("a 25-megapixel source must be refused before decoding")
	}
	if _, err := reencodeJPEG([]byte("GIF89a")); err == nil {
		t.Fatal("GIF accepted")
	}
}

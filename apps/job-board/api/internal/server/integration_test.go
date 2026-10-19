package server

// End to end against real Postgres (a database migrated by apps/job-board/db/migrate.sh) and an S3-compatible
// store. Skipped unless both are configured:
//
//	TEST_DATABASE_URL   owner URL of the migrated database; bt_gateway / bt_sweeper must have password 'test'
//	TEST_R2_ENDPOINT    e.g. http://localhost:59000
//	TEST_R2_REGION, TEST_R2_ACCESS_KEY_ID, TEST_R2_SECRET_ACCESS_KEY (default us-east-1, minio, minio12345)

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"boromtech.co/crew-api/internal/facts"
	"boromtech.co/crew-api/internal/gate"
	"boromtech.co/crew-api/internal/r2"
	"boromtech.co/crew-api/internal/sweep"
)

const origin = "http://localhost:5173"

type rig struct {
	t       *testing.T
	srv     *Server
	owner   *pgx.Conn
	gw, sw  *gate.Gate
	store   *r2.Client
	admin   string // session token
	storage *http.Client
}

func newRig(t *testing.T) *rig {
	dbURL, endpoint := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_R2_ENDPOINT")
	if dbURL == "" || endpoint == "" {
		t.Skip("TEST_DATABASE_URL and TEST_R2_ENDPOINT not set")
	}
	env := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	ctx := t.Context()
	owner, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { owner.Close(context.Background()) })
	as := func(role string) *gate.Gate {
		u, _ := url.Parse(dbURL)
		u.User = url.UserPassword(role, "test")
		g, err := gate.Open(u.String())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(g.Close)
		return g
	}
	store, err := r2.New(r2.Config{Endpoint: endpoint, Region: env("TEST_R2_REGION", "us-east-1"), Bucket: "bt-crew-files",
		AccessKeyID: env("TEST_R2_ACCESS_KEY_ID", "minio"), SecretAccessKey: env("TEST_R2_SECRET_ACCESS_KEY", "minio12345")},
		&http.Client{Timeout: 10 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	r := &rig{t: t, owner: owner, gw: as("bt_gateway"), sw: as("bt_sweeper"), store: store, storage: &http.Client{Timeout: 10 * time.Second}}
	r.srv = New(Config{PublicOrigin: origin, EdgeKey: "edge", GoogleClientID: "cid", GoogleClientSecret: "secret"},
		r.gw, store, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})))

	// The bucket (200 created, 409 already there).
	req, _ := http.NewRequest(http.MethodPut, store.BucketURL(http.MethodPut, 60), nil)
	res, err := r.storage.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 200 && res.StatusCode != 409 {
		t.Fatalf("create bucket: %s", res.Status)
	}
	// A session made the way the callback makes one, minus Google.
	raw, err := r.gw.SignIn(ctx, []byte(`{"sub":"A","email":"pongwasin@gmail.com","email_verified":true}`))
	if err != nil {
		t.Fatal(err)
	}
	env1, _ := gate.Parse(raw)
	if env1.Token == "" {
		t.Fatalf("sign_in: %s", raw)
	}
	r.admin = env1.Token
	return r
}

// do sends a request through the edge with the admin's session unless the header map says otherwise.
func (r *rig) do(method, target string, body any, header map[string]string) *httptest.ResponseRecorder {
	var rd io.Reader = http.NoBody
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, target, rd)
	req.Header.Set("X-BT-Edge", "edge")
	req.Header.Set("Origin", origin)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "bt_session="+r.admin)
	for k, v := range header {
		if v == "" {
			req.Header.Del(k)
		} else {
			req.Header.Set(k, v)
		}
	}
	rec := httptest.NewRecorder()
	r.srv.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("%d %q: %v", rec.Code, rec.Body, err)
	}
	return m
}

func (r *rig) command(name string, args map[string]any) map[string]any {
	rec := r.do("POST", "/api", map[string]any{"since": 0, "command": map[string]any{"name": name, "args": args, "requestId": uuid()}}, nil)
	if rec.Code != 200 {
		r.t.Fatalf("%s: %d %s", name, rec.Code, rec.Body)
	}
	return decode(r.t, rec)
}

// upload declares a file, PUTs the given bytes to the signed URLs exactly as a browser would, and returns
// the id and the /done response.
func (r *rig) upload(kind, name string, file, thumb []byte) (string, *httptest.ResponseRecorder) {
	t := r.t
	id := uuid()
	body := map[string]any{"id": id, "kind": kind, "name": name, "mime": facts.Sniff(file), "bytes": len(file)}
	if thumb != nil {
		body["thumbBytes"] = len(thumb)
	}
	rec := r.do("POST", "/api/files", body, nil)
	if rec.Code != 200 {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	var env struct {
		Signed  map[string]r2.Signed
		Presign any
		File    struct{ ID string }
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	if env.Presign != nil || env.File.ID != id || len(env.Signed) != map[bool]int{true: 2, false: 1}[thumb != nil] {
		t.Fatalf("upload envelope %s", rec.Body)
	}
	if rec := r.do("POST", "/api/files/"+id+"/done", nil, nil); rec.Code != 409 {
		t.Fatalf("done before PUT: %d %s", rec.Code, rec.Body)
	}
	r.put(env.Signed["file"], file, 200)
	if thumb != nil {
		r.put(env.Signed["thumb"], thumb, 200)
	}
	return id, r.do("POST", "/api/files/"+id+"/done", nil, nil)
}

func (r *rig) put(sg r2.Signed, body []byte, want int) {
	req, _ := http.NewRequest(sg.Method, sg.URL, bytes.NewReader(body))
	for k, v := range sg.Headers {
		req.Header.Set(k, v)
	}
	res, err := r.storage.Do(req)
	if err != nil {
		r.t.Fatal(err)
	}
	msg, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != want {
		r.t.Fatalf("PUT: %s %s", res.Status, msg)
	}
}

func (r *rig) stored(key string) int64 {
	_, total, err := r.store.ReadRange(r.t.Context(), key, 0, 1)
	if err != nil {
		r.t.Fatal(err)
	}
	return total
}

func uuid() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func jpegOf(t *testing.T, w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := range img.Pix {
		img.Pix[i] = byte(i)
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func withExif(j []byte) []byte {
	seg := append([]byte{0xFF, 0xE1, 0, 0}, "Exif\x00\x00MM\x00*"...)
	binary.BigEndian.PutUint16(seg[2:], uint16(len(seg)-2))
	return append(append(append([]byte{}, j[:2]...), seg...), j[2:]...)
}

func TestIntegration(t *testing.T) {
	r := newRig(t)
	jobID := r.command("create_job", map[string]any{"title": "Site", "customer": "Acme", "description": "",
		"customerDeadline": "2026-12-31"})["result"].(map[string]any)["id"].(string)

	var brief string
	t.Run("upload, verify, attach, view", func(t *testing.T) {
		file, thumb := jpegOf(t, 640, 480), jpegOf(t, 120, 90)
		id, done := r.upload("brief", "แบบ ร่าง.jpg", file, thumb)
		if done.Code != 200 || decode(t, done)["file"].(map[string]any)["state"] != "ready" {
			t.Fatalf("done: %d %s", done.Code, done.Body)
		}
		r.command("attach_files", map[string]any{"jobId": jobID, "fileIds": []string{id}})
		brief = id

		for v, want := range map[string][]byte{"": file, "?v=thumb": thumb} {
			rec := r.do("GET", "/api/files/"+id+v, nil, map[string]string{"Origin": "", "Content-Type": ""})
			if rec.Code != 302 || rec.Header().Get("Cache-Control") != "private, max-age=3600" {
				t.Fatalf("view%s: %d %v", v, rec.Code, rec.Header())
			}
			again := r.do("GET", "/api/files/"+id+v, nil, nil)
			if again.Header().Get("Location") != rec.Header().Get("Location") {
				t.Fatal("the signed URL must be stable within the hour")
			}
			res, err := r.storage.Get(rec.Header().Get("Location"))
			if err != nil {
				t.Fatal(err)
			}
			got, _ := io.ReadAll(res.Body)
			res.Body.Close()
			if res.StatusCode != 200 || !bytes.Equal(got, want) {
				t.Fatalf("GET signed%s: %s, %d bytes", v, res.Status, len(got))
			}
			if cd := res.Header.Get("Content-Disposition"); cd != "inline; filename*=UTF-8''%E0%B9%81%E0%B8%9A%E0%B8%9A%20%E0%B8%A3%E0%B9%88%E0%B8%B2%E0%B8%87.jpg" {
				t.Errorf("Content-Disposition %q", cd)
			}
		}
		for name, c := range map[string]struct {
			path, cookie string
			want         int
		}{
			"signed out":   {"/api/files/" + id, "x=1", 401},
			"unknown id":   {"/api/files/" + uuid(), "", 404},
			"bad variant":  {"/api/files/" + id + "?v=orig", "", 404},
			"malformed id": {"/api/files/" + id + "x", "", 404},
		} {
			h := map[string]string{}
			if c.cookie != "" {
				h["Cookie"] = c.cookie
			}
			// The envelope's status with no body; a malformed id is the router's plain 404.
			if rec := r.do("GET", c.path, nil, h); rec.Code != c.want || (rec.Body.Len() != 0 && name != "malformed id") {
				t.Errorf("%s: %d %q", name, rec.Code, rec.Body)
			}
		}
	})

	t.Run("storage enforces the signature and the signed headers", func(t *testing.T) {
		id := uuid()
		rec := r.do("POST", "/api/files", map[string]any{"id": id, "kind": "brief", "name": "a.pdf", "mime": "application/pdf", "bytes": 9}, nil)
		var env struct{ Signed map[string]r2.Signed }
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		sg := env.Signed["file"]
		r.put(r2.Signed{Method: "PUT", URL: sg.URL, Headers: map[string]string{"content-type": "text/html", "cache-control": sg.Headers["cache-control"]}}, []byte("%PDF-1.4\n"), 403)
		r.put(r2.Signed{Method: "PUT", URL: strings.Replace(sg.URL, "X-Amz-Expires=600", "X-Amz-Expires=7200", 1), Headers: sg.Headers}, []byte("%PDF-1.4\n"), 403)
		r.put(sg, []byte("%PDF-1.4"), 403) // content-length is signed: a different body size is refused
		r.put(sg, []byte("%PDF-1.4\n"), 200)
	})

	t.Run("metadata left in → 422, failed for good", func(t *testing.T) {
		id, done := r.upload("brief", "exif.jpg", withExif(jpegOf(t, 64, 64)), nil)
		if done.Code != 422 || !strings.Contains(done.Body.String(), "metadata") {
			t.Fatalf("%d %s", done.Code, done.Body)
		}
		if again := r.do("POST", "/api/files/"+id+"/done", nil, nil); again.Code != 422 {
			t.Fatalf("again: %d", again.Code)
		}
	})

	t.Run("content that is not what was declared → 422", func(t *testing.T) {
		pngBytes := func() []byte {
			var b bytes.Buffer
			_ = png.Encode(&b, image.NewGray(image.Rect(0, 0, 4, 4)))
			return b.Bytes()
		}()
		id := uuid()
		rec := r.do("POST", "/api/files", map[string]any{"id": id, "kind": "brief", "name": "x.jpg", "mime": "image/jpeg", "bytes": len(pngBytes)}, nil)
		var env struct{ Signed map[string]r2.Signed }
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		r.put(env.Signed["file"], pngBytes, 200)
		if done := r.do("POST", "/api/files/"+id+"/done", nil, nil); done.Code != 422 || !strings.Contains(done.Body.String(), "not image/jpeg") {
			t.Fatalf("%d %s", done.Code, done.Body)
		}
	})

	t.Run("rpc envelope is forwarded verbatim with its status", func(t *testing.T) {
		rec := r.do("POST", "/api", map[string]any{"since": 0}, nil)
		if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" || decode(t, rec)["me"].(map[string]any)["uid"] != "A" {
			t.Fatalf("%d %s", rec.Code, rec.Body)
		}
		if rec := r.do("POST", "/api", map[string]any{"since": 0}, map[string]string{"Cookie": "bt_session=" + strings.Repeat("0", 64)}); rec.Code != 401 {
			t.Fatalf("bad session: %d", rec.Code)
		}
		bad := r.do("POST", "/api", map[string]any{"since": 0, "command": map[string]any{"name": "drop_tables", "requestId": uuid()}}, nil)
		if bad.Code != 400 || decode(t, bad)["error"].(map[string]any)["code"] != "unknown_command" {
			t.Fatalf("unknown command: %d %s", bad.Code, bad.Body)
		}
		for name, c := range map[string]struct {
			h    map[string]string
			body string
			want int
		}{
			"no edge key":  {map[string]string{"X-BT-Edge": ""}, `{}`, 404},
			"bad origin":   {map[string]string{"Origin": "https://evil.example"}, `{}`, 403},
			"not JSON":     {map[string]string{"Content-Type": "text/plain"}, `{}`, 415},
			"too large":    {nil, `"` + strings.Repeat("x", 33<<10) + `"`, 413},
			"invalid JSON": {nil, `{`, 400},
		} {
			req := httptest.NewRequest("POST", "/api", strings.NewReader(c.body))
			for k, v := range map[string]string{"X-BT-Edge": "edge", "Origin": origin, "Content-Type": "application/json"} {
				req.Header.Set(k, v)
			}
			for k, v := range c.h {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			r.srv.ServeHTTP(rec, req)
			if rec.Code != c.want {
				t.Errorf("%s: %d", name, rec.Code)
			}
		}
	})

	t.Run("warm", func(t *testing.T) {
		for _, cookie := range []string{"", "bt_session=" + r.admin} {
			if rec := r.do("GET", "/api/warm", nil, map[string]string{"Cookie": cookie}); rec.Code != 204 {
				t.Fatalf("cookie %q: %d", cookie, rec.Code)
			}
		}
	})

	t.Run("callback: claims → session, avatar copied to storage", func(t *testing.T) {
		picture := "https://lh3.googleusercontent.com/a/it-" + uuid()[:8] + "=s96-c"
		claims, _ := json.Marshal(map[string]any{"iss": "https://accounts.google.com", "aud": "cid", "exp": time.Now().Add(time.Hour).Unix(),
			"sub": "A", "email": "pongwasin@gmail.com", "email_verified": true, "name": "Pong", "picture": picture})
		google := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.URL.Path == "/token" {
				_, _ = io.WriteString(w, `{"id_token":"h.`+base64.RawURLEncoding.EncodeToString(claims)+`.s"}`)
				return
			}
			if !strings.HasSuffix(req.URL.Path, "=s256-c") {
				w.WriteHeader(404)
				return
			}
			img := image.NewNRGBA(image.Rect(0, 0, 256, 256))
			img.Set(3, 3, color.NRGBA{1, 2, 3, 255})
			_ = png.Encode(w, img)
		}))
		defer google.Close()
		r.srv.googleTokenURL = google.URL + "/token"
		r.srv.avatarHTTP.Transport = &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", google.Listener.Addr().String())
		}, DialTLSContext: func(ctx context.Context, _, _ string) (net.Conn, error) { // the test server speaks plain HTTP
			return (&net.Dialer{}).DialContext(ctx, "tcp", google.Listener.Addr().String())
		}}
		rec := r.do("GET", "/api/auth/callback?code=c&state=s", nil, map[string]string{"Cookie": "bt_oauth=s.v"})
		cookies := rec.Header().Values("Set-Cookie")
		if rec.Code != 302 || rec.Header().Get("Location") != "/" || len(cookies) != 2 ||
			cookies[0] != "bt_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" || !strings.HasPrefix(cookies[1], "bt_session=") ||
			!strings.HasSuffix(cookies[1], "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000") {
			t.Fatalf("%d %v", rec.Code, rec.Header())
		}
		session := strings.TrimPrefix(strings.Split(cookies[1], ";")[0], "bt_session=")
		me := decode(t, r.do("POST", "/api", map[string]any{"since": 0}, map[string]string{"Cookie": "bt_session=" + session}))["me"].(map[string]any)
		photo, _ := me["photoId"].(string)
		f, err := facts.Measure(t.Context(), func(ctx context.Context, from, n int64) ([]byte, int64, error) {
			return r.store.ReadRange(ctx, "f/"+photo, from, n)
		})
		if err != nil || photo == "" || f.Bytes == 0 || f.Type != "image/jpeg" || !f.Clean {
			t.Fatalf("avatar %q: %+v %v", photo, f, err)
		}

		// Logout ends that session.
		if rec := r.do("POST", "/api/auth/logout", nil, map[string]string{"Cookie": "bt_session=" + session}); rec.Code != 204 ||
			rec.Header().Get("Set-Cookie") != "bt_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" {
			t.Fatalf("logout: %d %v", rec.Code, rec.Header())
		}
		if rec := r.do("POST", "/api", map[string]any{"since": 0}, map[string]string{"Cookie": "bt_session=" + session}); rec.Code != 401 {
			t.Fatalf("after logout: %d", rec.Code)
		}
	})

	t.Run("sweep deletes abandoned objects and never attached ones", func(t *testing.T) {
		abandoned, done := r.upload("brief", "draft.jpg", jpegOf(t, 32, 32), jpegOf(t, 8, 8))
		if done.Code != 200 {
			t.Fatalf("%d %s", done.Code, done.Body)
		}
		if r.stored("f/"+abandoned) == 0 || r.stored("t/"+abandoned) == 0 {
			t.Fatal("objects should exist before the sweep")
		}
		if _, err := r.owner.Exec(t.Context(), `update app.files set created_at = now() - interval '31 days',
			detached_at = case when state = 'detached' then now() - interval '31 days' end where purged_at is null`); err != nil {
			t.Fatal(err)
		}
		n, err := sweep.Run(t.Context(), r.sw, r.store, slog.New(slog.NewTextHandler(io.Discard, nil)))
		if err != nil || n < 2 {
			t.Fatalf("sweep: %d deletes, %v", n, err)
		}
		if r.stored("f/"+abandoned) != 0 || r.stored("t/"+abandoned) != 0 {
			t.Fatal("abandoned objects survived the sweep")
		}
		var purged bool
		_ = r.owner.QueryRow(t.Context(), `select purged_at is not null from app.files where id = $1`, abandoned).Scan(&purged)
		if !purged {
			t.Fatal("not marked purged")
		}
		if r.stored("f/"+brief) == 0 {
			t.Fatal("the attached brief must never be swept")
		}
		if n, err := sweep.Run(t.Context(), r.sw, r.store, slog.New(slog.NewTextHandler(io.Discard, nil))); n != 0 || err != nil {
			t.Fatalf("second sweep: %d, %v", n, err)
		}
	})
}

package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"

	"boromtech.co/crew-api/internal/facts"
	"boromtech.co/crew-api/internal/gate"
	"boromtech.co/crew-api/internal/r2"
)

// upload: the /api checks, gate.upload, and on 200 its presign specs become signed PUTs:
// { status, file: {id}, signed: { file: {method, url, headers}, thumb?: … } }. The bytes then go browser → R2.
func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	body, ok := s.readJSON(w, r)
	if !ok {
		return
	}
	raw, err := s.gate.Upload(r.Context(), s.session(r), body)
	if err != nil {
		s.fail(w, "upload", err)
		return
	}
	env, err := gate.Parse(raw)
	if err != nil {
		s.fail(w, "upload", err)
		return
	}
	if env.Status == http.StatusOK {
		if raw, err = s.sign(raw, env.Presign); err != nil {
			s.fail(w, "upload", err)
			return
		}
	}
	writeJSON(w, env.Status, raw)
}

// sign swaps an envelope's presign map for signed URLs. A spec the signer refuses is a bug in api.sql.
func (s *Server) sign(raw json.RawMessage, specs map[string]r2.Spec) (json.RawMessage, error) {
	signed := make(map[string]r2.Signed, len(specs))
	for label, spec := range specs {
		sg, err := s.store.Presign(spec)
		if err != nil {
			return nil, err
		}
		signed[label] = sg
	}
	return gate.WithSigned(raw, signed)
}

// uploadDone measures what is actually stored at f/{id} and t/{id} and reports it to gate.upload_done,
// which compares it with what was declared and decides. Both keys are always measured and reported (a
// missing object is bytes 0): whether a thumbnail was declared is Postgres's knowledge, not ours.
func (s *Server) uploadDone(w http.ResponseWriter, r *http.Request, id string) {
	if r.Header.Get("Origin") != s.cfg.PublicOrigin {
		text(w, http.StatusForbidden, "Bad origin")
		return
	}
	token := s.session(r)
	var report struct {
		ID    string      `json:"id"`
		File  facts.Facts `json:"file"`
		Thumb facts.Facts `json:"thumb"`
	}
	report.ID = id
	// No cookie: gate.upload_done answers 401 whatever the facts say, so don't spend R2 reads on it.
	if token != "" {
		var errF, errT error
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); report.File, errF = s.measure(r.Context(), "f/"+id) }()
		go func() { defer wg.Done(); report.Thumb, errT = s.measure(r.Context(), "t/"+id) }()
		wg.Wait()
		if errF != nil || errT != nil {
			s.log.Error("measure", "id", id, "file", errF, "thumb", errT)
			text(w, http.StatusBadGateway, "Storage unavailable")
			return
		}
	}
	body, _ := json.Marshal(report)
	raw, err := s.gate.UploadDone(r.Context(), token, body)
	s.reply(w, raw, err)
}

func (s *Server) measure(ctx context.Context, key string) (facts.Facts, error) {
	return facts.Measure(ctx, func(ctx context.Context, from, n int64) ([]byte, int64, error) {
		return s.store.ReadRange(ctx, key, from, n)
	})
}

// file: for <img src> and download links, so no Origin check (image loads send none); the Strict session
// cookie still arrives because the request is same-site. 200 → 302 to the signed GET, cacheable for an hour
// (the signed URL is identical within the hour, so the browser also caches the bytes). Otherwise the
// envelope's status with no body: the <img> falls back to initials or a file icon.
func (s *Server) file(w http.ResponseWriter, r *http.Request, id string) {
	variant := r.URL.Query().Get("v")
	if variant == "" {
		variant = "file"
	}
	raw, err := s.gate.File(r.Context(), s.session(r), id, variant)
	if err != nil {
		s.fail(w, "file", err)
		return
	}
	env, err := gate.Parse(raw)
	if err != nil {
		s.fail(w, "file", err)
		return
	}
	if env.Status != http.StatusOK {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(env.Status)
		return
	}
	spec, ok := env.Presign["get"]
	if !ok || spec.Method != http.MethodGet {
		s.fail(w, "file", errors.New("file: envelope has no presign.get"))
		return
	}
	sg, err := s.store.Presign(spec)
	if err != nil {
		s.fail(w, "file", err)
		return
	}
	w.Header().Set("Location", sg.URL)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusFound)
}

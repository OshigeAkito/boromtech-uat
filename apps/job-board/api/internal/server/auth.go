package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"boromtech.com/crew-api/internal/gate"
)

var googleIssuers = map[string]bool{"accounts.google.com": true, "https://accounts.google.com": true}

func (s *Server) redirectURI() string { return s.cfg.PublicOrigin + "/api/auth/callback" }

// startLogin: state and a PKCE (S256) verifier go in a 10-minute Lax cookie (Lax so it survives the
// top-level redirect back from Google), and the browser goes to Google.
func (s *Server) startLogin(w http.ResponseWriter, _ *http.Request) {
	state := hex.EncodeToString(random(16))
	verifier := base64.RawURLEncoding.EncodeToString(random(32))
	sum := sha256.Sum256([]byte(verifier))
	q := url.Values{
		"client_id":             {s.cfg.GoogleClientID},
		"redirect_uri":          {s.redirectURI()},
		"response_type":         {"code"},
		"scope":                 {"openid email profile"},
		"state":                 {state},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(sum[:])},
		"code_challenge_method": {"S256"},
		"prompt":                {"select_account"},
	}
	redirect(w, s.googleAuthURL+"?"+q.Encode(), s.setCookie(s.oauthCookie(), state+"."+verifier, 600, "Lax"))
}

// claims of a Google id_token. EmailVerified stays raw: only a JSON `true` counts, as in index.ts.
type claims struct {
	Iss           string          `json:"iss"`
	Aud           string          `json:"aud"`
	Exp           float64         `json:"exp"`
	Sub           string          `json:"sub"`
	Email         string          `json:"email"`
	EmailVerified json.RawMessage `json:"email_verified"`
	Name          string          `json:"name"`
	Picture       string          `json:"picture"`
}

// identity is gate.sign_in's argument. Empty fields are omitted, as JSON.stringify drops undefined, so a
// claim Google did not send arrives as SQL null (and gate.sign_in refuses a missing sub or email).
type identity struct {
	Sub           string `json:"sub,omitempty"`
	Email         string `json:"email,omitempty"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name,omitempty"`
	Picture       string `json:"picture,omitempty"`
}

// finishLogin: check state, exchange the code, check the claims, gate.sign_in, copy the avatar if Postgres
// asked for it, set the session cookie, 302 to /. Any failure → /?auth_error=<code>.
func (s *Server) finishLogin(w http.ResponseWriter, r *http.Request) {
	fail := func(code string) {
		redirect(w, "/?auth_error="+url.QueryEscape(code), s.clearCookie(s.oauthCookie()))
	}
	q := r.URL.Query()
	parts := strings.Split(readCookie(r, s.oauthCookie()), ".")
	state, verifier := parts[0], ""
	if len(parts) > 1 {
		verifier = parts[1]
	}
	code := q.Get("code")
	if state == "" || verifier == "" || code == "" || q.Get("state") != state {
		fail("sign_in_failed")
		return
	}

	c, ok := s.exchange(r.Context(), code, verifier)
	// The id_token came straight from Google's token endpoint over TLS, authenticated by our client secret,
	// so OIDC Core §3.1.3.7 lets us skip the signature check. The claims still have to be for us and current.
	if !ok || !googleIssuers[c.Iss] || c.Aud != s.cfg.GoogleClientID || c.Exp*1000 < float64(s.now().UnixMilli()) {
		fail("sign_in_failed")
		return
	}

	id, _ := json.Marshal(identity{Sub: c.Sub, Email: c.Email, EmailVerified: string(c.EmailVerified) == "true",
		Name: c.Name, Picture: c.Picture})
	raw, err := s.gate.SignIn(r.Context(), id)
	if err != nil {
		s.fail(w, "sign_in", err)
		return
	}
	env, err := gate.Parse(raw)
	if err != nil {
		s.fail(w, "sign_in", err)
		return
	}
	if env.Status != http.StatusOK || env.Token == "" {
		code := env.Code()
		if code == "" {
			code = "sign_in_failed"
		}
		fail(code)
		return
	}
	// Before the redirect, not after: Cloud Run throttles CPU once the response is sent. Fail open: the row
	// is already attached, the <img> 404s until the next sign-in PUTs the same key again.
	if spec, ok := env.Presign["avatar"]; ok {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		if err := s.copyAvatar(ctx, c.Picture, spec); err != nil {
			s.log.Warn("avatar", "err", err)
		}
		cancel()
	}
	redirect(w, "/", s.clearCookie(s.oauthCookie()),
		s.setCookie(s.sessionCookie(), env.Token, sessionMaxAge, "Strict"))
}

// exchange swaps the code for tokens and decodes the id_token's payload.
func (s *Server) exchange(ctx context.Context, code, verifier string) (claims, bool) {
	form := url.Values{
		"code":          {code},
		"client_id":     {s.cfg.GoogleClientID},
		"client_secret": {s.cfg.GoogleClientSecret},
		"redirect_uri":  {s.redirectURI()},
		"grant_type":    {"authorization_code"},
		"code_verifier": {verifier},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return claims{}, false
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.googleHTTP.Do(req)
	if err != nil {
		s.log.Warn("google token", "err", err)
		return claims{}, false
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return claims{}, false
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 1<<20)).Decode(&tok) != nil || tok.IDToken == "" {
		return claims{}, false
	}
	return decodeJWTPayload(tok.IDToken)
}

func decodeJWTPayload(jwt string) (claims, bool) {
	parts := strings.Split(jwt, ".")
	if len(parts) < 2 {
		return claims{}, false
	}
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	var c claims
	if err != nil || json.Unmarshal(b, &c) != nil {
		return claims{}, false
	}
	return c, true
}

func random(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b) // never fails (crypto/rand panics instead)
	return b
}

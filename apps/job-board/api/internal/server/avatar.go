package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png" // registers the PNG decoder for image.Decode
	"io"
	"net/http"
	"net/url"
	"regexp"

	"boromtech.co/crew-api/internal/r2"
)

const (
	avatarMaxRead   = 5 << 20
	avatarMaxPixels = 4096 * 4096 // decode budget: a small PNG can claim enormous dimensions
	avatarMaxStored = 1 << 20     // lib.file_rules(): avatar max_bytes
)

var (
	googleHostRE = regexp.MustCompile(`^[a-z0-9.-]+\.googleusercontent\.com$`)
	sizeSuffixRE = regexp.MustCompile(`=s\d+(-c)?$`)
)

// avatarSource re-checks the picture URL (gate.sign_in checked it too) and asks Google for 256 px.
// Only https on *.googleusercontent.com, default port, no credentials.
func avatarSource(picture string) (string, bool) {
	u, err := url.Parse(picture)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !googleHostRE.MatchString(u.Host) {
		return "", false
	}
	u.Path = sizeSuffixRE.ReplaceAllString(u.Path, "=s256-c")
	u.RawPath = ""
	return u.String(), true
}

func avatarClient() *http.Client {
	return &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if _, ok := avatarSource(req.URL.String()); !ok || len(via) > 3 {
			return errors.New("avatar: redirect off googleusercontent.com")
		}
		return nil
	}}
}

// copyAvatar fetches the member's Google photo and PUTs it to the spec gate.sign_in returned, re-encoded as
// JPEG: the stdlib encoder writes no metadata, so avatars follow the same "no EXIF in R2" rule as uploads.
// The whole call is bounded by ctx (2 s at the call site).
func (s *Server) copyAvatar(ctx context.Context, picture string, spec r2.Spec) error {
	src, ok := avatarSource(picture)
	if !ok {
		return fmt.Errorf("avatar: refused source %q", picture)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "image/jpeg,image/png")
	res, err := s.avatarHTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("avatar: fetch %s", res.Status)
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, avatarMaxRead+1))
	if err != nil {
		return err
	}
	if len(b) > avatarMaxRead {
		return errors.New("avatar: source too large")
	}
	out, err := reencodeJPEG(b)
	if err != nil {
		return err
	}
	status, err := s.store.Execute(ctx, spec, out)
	if err != nil {
		return err
	}
	if status < 200 || status > 299 {
		return fmt.Errorf("avatar: PUT %d", status)
	}
	return nil
}

// reencodeJPEG decodes a JPEG or PNG and encodes it as a metadata-free JPEG (q85), transparency on white.
func reencodeJPEG(src []byte) ([]byte, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	if (format != "jpeg" && format != "png") || cfg.Width*cfg.Height > avatarMaxPixels {
		return nil, fmt.Errorf("avatar: refused %s %dx%d", format, cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(bytes.NewReader(src))
	if err != nil {
		return nil, err
	}
	flat := image.NewRGBA(img.Bounds())
	draw.Draw(flat, flat.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), img, img.Bounds().Min, draw.Over)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, flat, &jpeg.Options{Quality: 85}); err != nil {
		return nil, err
	}
	if out.Len() > avatarMaxStored {
		return nil, errors.New("avatar: encoded too large")
	}
	return out.Bytes(), nil
}

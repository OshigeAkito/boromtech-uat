// Package r2 signs and performs requests against the R2 bucket (S3 API, SigV4). It holds the R2 secret and
// decides only HOW to sign: WHAT may be signed, for whom and for how long arrives as a spec from Postgres
// (lib.presign_put, lib.presign_get, gate.sign_in, gate.sweep in apps/job-board/db/api.sql).
//
// No SDK: three verbs and one signature scheme are ~150 lines, and the binary stays small for cold starts.
// Every request, the browser's and our own, goes out as a presigned URL, so there is one signing path.
package r2

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// https://<account>.r2.cloudflarestorage.com, or a MinIO URL in dev. Path-style: <endpoint>/<bucket>/<key>.
	Endpoint        string
	Region          string // "auto" for R2; MinIO wants its own (us-east-1 by default)
	Bucket          string
	AccessKeyID     string
	SecretAccessKey string
}

// Spec is a signing request from Postgres. Shape fixed by api.sql:
// { method: PUT|GET|DELETE, key: f/<uuid>|t/<uuid>, ttl, contentType?, contentLength?, contentMD5?, cacheControl?,
//
//	disposition? }
type Spec struct {
	Method        string `json:"method"`
	Key           string `json:"key"`
	TTL           int    `json:"ttl"`
	ContentType   string `json:"contentType,omitempty"`
	ContentLength *int64 `json:"contentLength,omitempty"`
	ContentMD5    string `json:"contentMD5,omitempty"` // base64; storage refuses a body with any other digest
	CacheControl  string `json:"cacheControl,omitempty"`
	Disposition   string `json:"disposition,omitempty"`
}

// Signed is what the caller sends: the URL, plus the signed headers it must set itself. Host and
// Content-Length are signed but not listed, because the client derives them from the URL and the body.
type Signed struct {
	Method  string            `json:"method"`
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

var keyRE = regexp.MustCompile(`^[ft]/[0-9a-f-]{36}$`)

// maxTTL bounds every URL. lib.presign_get asks for 7200 (an hour of browser caching plus an hour of use).
const maxTTL = 7200

type Client struct {
	cfg  Config
	base *url.URL
	http *http.Client
	now  func() time.Time
}

func New(cfg Config, hc *http.Client) (*Client, error) {
	u, err := url.Parse(strings.TrimRight(cfg.Endpoint, "/"))
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.Path != "" {
		return nil, fmt.Errorf("r2: bad endpoint %q", cfg.Endpoint)
	}
	if cfg.Bucket == "" || cfg.AccessKeyID == "" || cfg.SecretAccessKey == "" || cfg.Region == "" {
		return nil, errors.New("r2: bucket, region and credentials are required")
	}
	return &Client{cfg: cfg, base: u, http: hc, now: time.Now}, nil
}

// Presign validates a spec from Postgres and signs it. Validation is defense in depth against a bug in
// api.sql, not policy: a refused spec is an error for the caller to log as a 500.
//
//   - PUT signs content-type, and content-length, content-md5 and cache-control when given, so storage
//     refuses any other body: a URL that is still valid after verification can only rewrite the same bytes.
//     Signed at now, valid for ttl.
//   - GET is signed at the start of the current UTC hour for ttl, so the same key gives the same URL for an
//     hour (the browser caches the bytes) and every URL handed out has at least ttl-1h left.
//   - DELETE is signed at now (the sweep executes it itself).
func (c *Client) Presign(s Spec) (Signed, error) {
	if !keyRE.MatchString(s.Key) || s.TTL < 1 || s.TTL > maxTTL {
		return Signed{}, fmt.Errorf("r2: refused spec %s %q ttl %d", s.Method, s.Key, s.TTL)
	}
	now := c.now().UTC()
	headers := map[string]string{}
	var query map[string]string
	switch s.Method {
	case http.MethodPut:
		if s.ContentType == "" {
			return Signed{}, fmt.Errorf("r2: PUT %q without contentType", s.Key)
		}
		headers["content-type"] = s.ContentType
		if s.CacheControl != "" {
			headers["cache-control"] = s.CacheControl
		}
		if s.ContentMD5 != "" {
			headers["content-md5"] = s.ContentMD5
		}
	case http.MethodGet:
		now = now.Truncate(time.Hour)
		if s.Disposition != "" {
			query = map[string]string{"response-content-disposition": s.Disposition}
		}
	case http.MethodDelete:
	default:
		return Signed{}, fmt.Errorf("r2: refused method %q", s.Method)
	}
	signedHeaders := headers
	if s.ContentLength != nil {
		signedHeaders = map[string]string{"content-length": strconv.FormatInt(*s.ContentLength, 10)}
		for k, v := range headers {
			signedHeaders[k] = v
		}
	}
	return Signed{Method: s.Method, URL: c.url(s.Method, s.Key, s.TTL, now, signedHeaders, query), Headers: headers}, nil
}

func (c *Client) url(method, key string, ttl int, t time.Time, headers, query map[string]string) string {
	path := "/" + c.cfg.Bucket + "/" + key
	q, _, _ := presign(presignInput{
		Method: method, Host: c.base.Host, Path: path, Region: c.cfg.Region, Service: "s3",
		AccessKeyID: c.cfg.AccessKeyID, Secret: c.cfg.SecretAccessKey,
		Time: t, Expires: ttl, Headers: headers, Query: query,
	})
	return c.base.Scheme + "://" + c.base.Host + uriEncode(path, false) + "?" + q
}

// Execute signs a spec and performs it from this process: the avatar PUT at sign-in, the sweep's DELETEs.
// It returns the HTTP status; only transport failures are errors.
func (c *Client) Execute(ctx context.Context, s Spec, body []byte) (int, error) {
	sg, err := c.Presign(s)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequestWithContext(ctx, sg.Method, sg.URL, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.ContentLength = int64(len(body))
	if body == nil {
		req.Body = http.NoBody
	}
	for k, v := range sg.Headers {
		req.Header.Set(k, v)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	return res.StatusCode, nil
}

// ReadRange GETs bytes [from, from+n) of the object at key. total is the object's size, 0 when it does not
// exist. Fewer than n bytes come back at the end of the object. Used only to measure uploads, never to
// serve them: the browser reads objects from R2 directly.
func (c *Client) ReadRange(ctx context.Context, key string, from, n int64) (data []byte, total int64, err error) {
	if !keyRE.MatchString(key) || from < 0 || n < 1 {
		return nil, 0, fmt.Errorf("r2: bad range read %q %d+%d", key, from, n)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url(http.MethodGet, key, 60, c.now().UTC(), map[string]string{}, nil), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", from, from+n-1))
	res, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusNotFound:
		return nil, 0, nil
	case http.StatusRequestedRangeNotSatisfiable: // "bytes */<size>": from is at or past the end
		total, _ = rangeTotal(res.Header.Get("Content-Range"))
		return nil, total, nil
	case http.StatusPartialContent:
		total, err = rangeTotal(res.Header.Get("Content-Range"))
		if err != nil {
			return nil, 0, err
		}
	case http.StatusOK: // range ignored: the whole object follows
		total = res.ContentLength
	default:
		return nil, 0, fmt.Errorf("r2: GET %s: %s", key, res.Status)
	}
	data, err = io.ReadAll(io.LimitReader(res.Body, n))
	if err != nil {
		return nil, 0, err
	}
	if res.StatusCode == http.StatusOK {
		if total < 0 {
			return nil, 0, fmt.Errorf("r2: GET %s: no length", key)
		}
		if from >= int64(len(data)) {
			return nil, total, nil
		}
		data = data[from:] // a server that ignores Range sends from 0; only reachable for small objects
	}
	return data, total, nil
}

// rangeTotal parses the size from "bytes 0-99/1234" or "bytes */1234".
func rangeTotal(h string) (int64, error) {
	_, after, ok := strings.Cut(h, "/")
	if !ok || after == "*" {
		return 0, fmt.Errorf("r2: bad Content-Range %q", h)
	}
	return strconv.ParseInt(after, 10, 64)
}

// Bucket-level operations for tests and dev setup (create the bucket in MinIO). Not reachable from a route.
func (c *Client) BucketURL(method string, ttl int) string {
	q, _, _ := presign(presignInput{
		Method: method, Host: c.base.Host, Path: "/" + c.cfg.Bucket, Region: c.cfg.Region, Service: "s3",
		AccessKeyID: c.cfg.AccessKeyID, Secret: c.cfg.SecretAccessKey, Time: c.now().UTC(), Expires: ttl,
	})
	return c.base.Scheme + "://" + c.base.Host + "/" + uriEncode(c.cfg.Bucket, true) + "?" + q
}

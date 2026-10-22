package r2

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

// AWS's published example: "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)",
// GET examplebucket/test.txt, 2013-05-24, 86400 s.
func TestPresignAWSExample(t *testing.T) {
	q, creq, sts := presign(presignInput{
		Method: "GET", Host: "examplebucket.s3.amazonaws.com", Path: "/test.txt",
		Region: "us-east-1", Service: "s3",
		AccessKeyID: "AKIAIOSFODNN7EXAMPLE", Secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		Time: time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC), Expires: 86400,
	})
	wantCreq := "GET\n/test.txt\n" +
		"X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host\n" +
		"host:examplebucket.s3.amazonaws.com\n\nhost\nUNSIGNED-PAYLOAD"
	if creq != wantCreq {
		t.Fatalf("canonical request:\n%s\nwant:\n%s", creq, wantCreq)
	}
	wantSts := "AWS4-HMAC-SHA256\n20130524T000000Z\n20130524/us-east-1/s3/aws4_request\n" +
		"3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04"
	if sts != wantSts {
		t.Fatalf("string to sign:\n%s\nwant:\n%s", sts, wantSts)
	}
	if !strings.HasSuffix(q, "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404") {
		t.Fatalf("signature: %s", q)
	}
}

func testClient(t *testing.T, now time.Time) *Client {
	t.Helper()
	c, err := New(Config{Endpoint: "https://acct.r2.cloudflarestorage.com", Region: "auto", Bucket: "bt-crew-files",
		AccessKeyID: "AK", SecretAccessKey: "SK"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	c.now = func() time.Time { return now }
	return c
}

const id = "0b6b4e0e-6f43-4a39-9d3c-3d7a3c7a0c11"

func TestPresignPutSignsTypeLengthAndCache(t *testing.T) {
	c := testClient(t, time.Date(2026, 10, 19, 8, 30, 0, 0, time.UTC))
	n := int64(1234)
	sg, err := c.Presign(Spec{Method: "PUT", Key: "f/" + id, TTL: 600, ContentType: "image/jpeg", ContentLength: &n,
		CacheControl: "private, max-age=31536000, immutable"})
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(sg.URL)
	if u.Host != "acct.r2.cloudflarestorage.com" || u.Path != "/bt-crew-files/f/"+id {
		t.Fatalf("url %s", sg.URL)
	}
	q := u.Query()
	if q.Get("X-Amz-SignedHeaders") != "cache-control;content-length;content-type;host" || q.Get("X-Amz-Expires") != "600" ||
		q.Get("X-Amz-Date") != "20261019T083000Z" || q.Get("X-Amz-Credential") != "AK/20261019/auto/s3/aws4_request" {
		t.Fatalf("query %v", q)
	}
	want := map[string]string{"content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable"}
	if len(sg.Headers) != 2 || sg.Headers["content-type"] != want["content-type"] || sg.Headers["cache-control"] != want["cache-control"] {
		t.Fatalf("headers %v", sg.Headers)
	}
}

func TestPresignGetIsStableWithinTheHour(t *testing.T) {
	spec := Spec{Method: "GET", Key: "t/" + id, TTL: 7200, Disposition: "attachment; filename*=UTF-8''%E0%B9%81 a.pdf"}
	a, err := testClient(t, time.Date(2026, 10, 19, 8, 1, 0, 0, time.UTC)).Presign(spec)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := testClient(t, time.Date(2026, 10, 19, 8, 59, 59, 0, time.UTC)).Presign(spec)
	c, _ := testClient(t, time.Date(2026, 10, 19, 9, 0, 0, 0, time.UTC)).Presign(spec)
	if a.URL != b.URL || a.URL == c.URL {
		t.Fatalf("same hour must give the same URL, the next hour a new one:\n%s\n%s\n%s", a.URL, b.URL, c.URL)
	}
	u, _ := url.Parse(a.URL)
	if u.Query().Get("X-Amz-Date") != "20261019T080000Z" || u.Query().Get("response-content-disposition") != spec.Disposition {
		t.Fatalf("query %v", u.Query())
	}
	// SigV4 encoding, not form encoding: a space is %20, and an existing %XX is re-encoded.
	if !strings.Contains(a.URL, "response-content-disposition=attachment%3B%20filename%2A%3DUTF-8%27%27%25E0%25B9%2581%20a.pdf&") {
		t.Fatalf("disposition encoding: %s", a.URL)
	}
}

func TestPresignRefusesBadSpecs(t *testing.T) {
	c := testClient(t, time.Now())
	for _, s := range []Spec{
		{Method: "POST", Key: "f/" + id, TTL: 60},
		{Method: "GET", Key: "x/" + id, TTL: 60},
		{Method: "GET", Key: "f/../" + id[3:], TTL: 60},
		{Method: "GET", Key: "f/" + id, TTL: 7201},
		{Method: "GET", Key: "f/" + id, TTL: 0},
		{Method: "PUT", Key: "f/" + id, TTL: 60}, // no content type
	} {
		if _, err := c.Presign(s); err == nil {
			t.Errorf("accepted %+v", s)
		}
	}
}

func TestRangeTotal(t *testing.T) {
	for h, want := range map[string]int64{"bytes 0-99/1234": 1234, "bytes */0": 0} {
		if got, err := rangeTotal(h); err != nil || got != want {
			t.Errorf("%q → %d, %v", h, got, err)
		}
	}
	if _, err := rangeTotal("bytes 0-1/*"); err == nil {
		t.Error("unknown size accepted")
	}
}

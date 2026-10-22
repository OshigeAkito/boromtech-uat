package r2

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"
	"time"
)

// presignInput is one SigV4 query-string signature (AWS "Authenticating Requests: Using Query Parameters").
// Host and Path are explicit so the AWS virtual-hosted test vector and our path-style R2 URLs share one code
// path. Headers are lowercase names; host is added here and always signed.
type presignInput struct {
	Method, Host, Path  string
	Region, Service     string
	AccessKeyID, Secret string
	Time                time.Time
	Expires             int
	Headers             map[string]string // signed; the caller must send exactly these values
	Query               map[string]string // extra parameters (response-content-disposition)
}

// presign returns the canonical query string with X-Amz-Signature appended, ready to follow "?".
// The payload is UNSIGNED-PAYLOAD, as for every presigned URL: the signed headers (type, length) bound the
// body instead.
func presign(in presignInput) (query string, canonicalRequest, stringToSign string) {
	t := in.Time.UTC()
	amzDate := t.Format("20060102T150405Z")
	scope := t.Format("20060102") + "/" + in.Region + "/" + in.Service + "/aws4_request"

	headers := map[string]string{"host": in.Host}
	for k, v := range in.Headers {
		headers[strings.ToLower(k)] = strings.TrimSpace(v)
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	signedHeaders := strings.Join(names, ";")
	var canonHeaders strings.Builder
	for _, k := range names {
		canonHeaders.WriteString(k + ":" + headers[k] + "\n")
	}

	params := map[string]string{
		"X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
		"X-Amz-Credential":    in.AccessKeyID + "/" + scope,
		"X-Amz-Date":          amzDate,
		"X-Amz-Expires":       strconv.Itoa(in.Expires),
		"X-Amz-SignedHeaders": signedHeaders,
	}
	for k, v := range in.Query {
		params[k] = v
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys) // byte order of the (unreserved-only) names = byte order of their encodings
	pairs := make([]string, len(keys))
	for i, k := range keys {
		pairs[i] = uriEncode(k, true) + "=" + uriEncode(params[k], true)
	}
	canonQuery := strings.Join(pairs, "&")

	canonicalRequest = strings.Join([]string{
		in.Method, uriEncode(in.Path, false), canonQuery, canonHeaders.String(), signedHeaders, "UNSIGNED-PAYLOAD",
	}, "\n")
	sum := sha256.Sum256([]byte(canonicalRequest))
	stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hex.EncodeToString(sum[:])

	k := hmacSHA256([]byte("AWS4"+in.Secret), t.Format("20060102"))
	k = hmacSHA256(k, in.Region)
	k = hmacSHA256(k, in.Service)
	k = hmacSHA256(k, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(k, stringToSign))
	return canonQuery + "&X-Amz-Signature=" + sig, canonicalRequest, stringToSign
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

// uriEncode is SigV4's UriEncode: every byte except A-Z a-z 0-9 - . _ ~ becomes %XX (uppercase), and '/'
// too unless it separates path segments. url.QueryEscape differs (space → '+'), which would break the
// signature of a Content-Disposition with a space in it.
func uriEncode(s string, encodeSlash bool) string {
	const hexdigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case 'A' <= c && c <= 'Z', 'a' <= c && c <= 'z', '0' <= c && c <= '9', c == '-', c == '.', c == '_', c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexdigits[c>>4])
			b.WriteByte(hexdigits[c&15])
		}
	}
	return b.String()
}

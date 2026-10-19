// Package facts measures a stored upload: its size, the format its magic bytes claim, and whether an image
// still carries a metadata segment. It reports; gate.upload_done (api.sql) compares the report with what was
// declared and decides. Nothing here knows kinds, declared types or limits.
package facts

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
)

// Facts is the shape gate.upload_done reads: { bytes, type, clean }.
type Facts struct {
	Bytes int64  `json:"bytes"` // the stored object's size; 0 when it is missing
	Type  string `json:"type"`  // image/jpeg | image/png | application/pdf | application/zip | unknown
	Clean bool   `json:"clean"` // no metadata segment found; always true for formats not inspected
}

// Reader returns bytes [from, from+n) of one object (fewer at its end) and the object's total size, 0 when it
// does not exist. r2.Client.ReadRange bound to a key.
type Reader func(ctx context.Context, from, n int64) ([]byte, int64, error)

const (
	window = 64 << 10 // one ranged GET; canvas output reaches SOS within ~1 KB
	// A JPEG whose metadata-free header needs more than this many reads is reported as not clean rather than
	// read to its end: no browser canvas writes one, and a crafted file must not cost 400 GETs.
	maxReads = 16
)

// Measure reads the start of the object (more only for a JPEG that needs it) and reports.
func Measure(ctx context.Context, read Reader) (Facts, error) {
	head, total, err := read(ctx, 0, window)
	if err != nil {
		return Facts{}, err
	}
	if total == 0 {
		return Facts{Bytes: 0, Type: "unknown", Clean: true}, nil
	}
	f := Facts{Bytes: total, Type: Sniff(head), Clean: true}
	switch f.Type {
	case "image/jpeg":
		f.Clean, err = jpegClean(ctx, read, head, total)
	case "image/png":
		f.Clean = pngClean(head)
	}
	return f, err
}

// Sniff names a format by its magic bytes alone.
func Sniff(b []byte) string {
	switch {
	case bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg"
	case bytes.HasPrefix(b, []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}):
		return "image/png"
	case bytes.HasPrefix(b, []byte("%PDF-")):
		return "application/pdf"
	case bytes.HasPrefix(b, []byte("PK\x03\x04")):
		return "application/zip"
	}
	return "unknown"
}

// The rejected markers and chunks must equal what apps/job-board/web/src/prepare.ts strips (JPEG_DROP, PNG_DROP).
// jpegClean walks marker segments from SOI to SOS. APP1 (Exif/XMP), APP2 (ICC/FlashPix), APP13 (IPTC) or COM
// before SOS → false; reaching SOS → true; an object that ends first, or is not well formed → false.
// Segments are skipped by their length, so only the bytes around each marker are fetched.
func jpegClean(ctx context.Context, read Reader, head []byte, total int64) (bool, error) {
	buf, off := head, int64(0) // buf holds object bytes [off, off+len(buf))
	reads := 1
	// at returns the object byte at pos, fetching the window that starts there when needed.
	at := func(pos int64) (byte, bool, error) {
		if pos >= total {
			return 0, false, nil
		}
		if pos < off || pos >= off+int64(len(buf)) {
			if reads >= maxReads {
				return 0, false, nil
			}
			reads++
			b, _, err := read(ctx, pos, window)
			if err != nil || len(b) == 0 {
				return 0, false, err
			}
			buf, off = b, pos
		}
		return buf[pos-off], true, nil
	}
	pos := int64(2) // after SOI (FF D8), which Sniff already matched
	for {
		b, ok, err := at(pos)
		if !ok || err != nil || b != 0xFF {
			return false, err
		}
		m := byte(0xFF)
		for m == 0xFF { // fill bytes may precede a marker
			pos++
			if m, ok, err = at(pos); !ok || err != nil {
				return false, err
			}
		}
		switch {
		case m == 0xDA: // SOS: entropy-coded data follows; no metadata segment came before it
			return true, nil
		case m == 0xE1 || m == 0xE2 || m == 0xED || m == 0xFE:
			return false, nil
		case m == 0xD9 || m == 0x00 || m == 0xD8: // EOI, a stuffed byte, or a second SOI: not a header
			return false, nil
		case m == 0x01 || (m >= 0xD0 && m <= 0xD7): // standalone markers carry no length
			pos++
			continue
		}
		hi, ok1, err1 := at(pos + 1)
		lo, ok2, err2 := at(pos + 2)
		if !ok1 || !ok2 || err1 != nil || err2 != nil {
			return false, errors.Join(err1, err2)
		}
		n := int64(hi)<<8 | int64(lo)
		if n < 2 {
			return false, nil
		}
		pos += 1 + n // pos is at the marker byte; the length counts itself but not the marker
	}
}

// pngClean walks the chunks present in head (best effort: later chunks are not fetched). eXIf, tEXt, iTXt,
// zTXt → false. iCCP is allowed: a colour profile identifies no one.
func pngClean(head []byte) bool {
	p := 8
	for p+8 <= len(head) {
		n := int(binary.BigEndian.Uint32(head[p:]))
		switch string(head[p+4 : p+8]) {
		case "eXIf", "tEXt", "iTXt", "zTXt":
			return false
		case "IEND":
			return true
		}
		if n < 0 || n > len(head) {
			return true
		}
		p += 12 + n
	}
	return true
}

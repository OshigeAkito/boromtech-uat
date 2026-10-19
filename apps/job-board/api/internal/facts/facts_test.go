package facts

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

// memReader serves an in-memory object, at most `max` bytes per read, counting reads.
func memReader(obj []byte, max int64, reads *int) Reader {
	return func(_ context.Context, from, n int64) ([]byte, int64, error) {
		*reads++
		if n > max {
			n = max
		}
		if from >= int64(len(obj)) {
			return nil, int64(len(obj)), nil
		}
		end := min(from+n, int64(len(obj)))
		return obj[from:end], int64(len(obj)), nil
	}
}

func measure(t *testing.T, obj []byte, max int64) (Facts, int) {
	t.Helper()
	reads := 0
	f, err := Measure(context.Background(), memReader(obj, max, &reads))
	if err != nil {
		t.Fatal(err)
	}
	return f, reads
}

func testImage() image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, 64, 48))
	for i := range img.Pix {
		img.Pix[i] = byte(i * 7)
	}
	return img
}

func stdJPEG(t *testing.T) []byte {
	var b bytes.Buffer
	if err := jpeg.Encode(&b, testImage(), &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// withSegment inserts a marker segment right after SOI, as cameras put APP1 Exif.
func withSegment(j []byte, marker byte, payload []byte) []byte {
	seg := []byte{0xFF, marker, 0, 0}
	binary.BigEndian.PutUint16(seg[2:], uint16(len(payload)+2))
	out := append([]byte{}, j[:2]...)
	out = append(out, append(seg, payload...)...)
	return append(out, j[2:]...)
}

func TestJPEG(t *testing.T) {
	clean := stdJPEG(t)
	exif := withSegment(clean, 0xE1, append([]byte("Exif\x00\x00"), make([]byte, 100)...))
	sos := bytes.Index(clean, []byte{0xFF, 0xDA})
	for name, c := range map[string]struct {
		obj  []byte
		want bool
	}{
		"stdlib encoder":           {clean, true},
		"APP0 JFIF is fine":        {withSegment(clean, 0xE0, []byte("JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")), true},
		"APP1 Exif":                {exif, false},
		"APP2 ICC":                 {withSegment(clean, 0xE2, []byte("ICC_PROFILE\x00")), false},
		"APP13 IPTC":               {withSegment(clean, 0xED, []byte("Photoshop 3.0\x00")), false},
		"COM":                      {withSegment(clean, 0xFE, []byte("hello")), false},
		"truncated before SOS":     {clean[:sos], false},
		"truncated inside a seg":   {clean[:20], false},
		"fill bytes before marker": {append([]byte{0xFF, 0xD8, 0xFF}, clean[2:]...), true},
	} {
		f, _ := measure(t, c.obj, window)
		if f.Type != "image/jpeg" || f.Clean != c.want || f.Bytes != int64(len(c.obj)) {
			t.Errorf("%s: %+v, want clean=%v", name, f, c.want)
		}
	}
}

// A long non-metadata segment (APP3) pushes SOS past the first window: more ranges are fetched, and only up
// to maxReads of them.
func TestJPEGFetchesMoreRanges(t *testing.T) {
	clean := stdJPEG(t)
	padded := withSegment(clean, 0xE3, make([]byte, 60000))
	if f, reads := measure(t, padded, 1024); !f.Clean || reads < 2 {
		t.Fatalf("padded: %+v after %d reads", f, reads)
	}
	exifLate := withSegment(withSegment(clean, 0xE1, []byte("Exif\x00\x00")), 0xE3, make([]byte, 60000))
	if f, _ := measure(t, exifLate, 1024); f.Clean {
		t.Fatal("APP1 after a long segment must be found")
	}
	huge := clean
	for range 40 { // ~2.4 MB of APP3 before SOS
		huge = withSegment(huge, 0xE3, make([]byte, 60000))
	}
	if f, reads := measure(t, huge, window); f.Clean || reads > maxReads {
		t.Fatalf("huge header: %+v after %d reads", f, reads)
	}
}

func pngChunk(typ string, data []byte) []byte {
	c := binary.BigEndian.AppendUint32(nil, uint32(len(data)))
	c = append(c, typ...)
	c = append(c, data...)
	return binary.BigEndian.AppendUint32(c, crc32.ChecksumIEEE(append([]byte(typ), data...)))
}

func TestPNG(t *testing.T) {
	var b bytes.Buffer
	img := image.NewNRGBA(image.Rect(0, 0, 8, 8))
	img.Set(1, 1, color.NRGBA{255, 0, 0, 128})
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	clean := b.Bytes()
	insert := func(typ string, data []byte) []byte { // after IHDR (8 sig + 25 IHDR)
		return append(append(append([]byte{}, clean[:33]...), pngChunk(typ, data)...), clean[33:]...)
	}
	for name, c := range map[string]struct {
		obj  []byte
		want bool
	}{
		"stdlib encoder":  {clean, true},
		"tEXt":            {insert("tEXt", []byte("Author\x00me")), false},
		"eXIf":            {insert("eXIf", []byte("MM\x00*")), false},
		"iTXt":            {insert("iTXt", []byte("k\x00\x00\x00\x00\x00v")), false},
		"zTXt":            {insert("zTXt", []byte("k\x00\x00x")), false},
		"iCCP is allowed": {insert("iCCP", []byte("p\x00\x00x")), true},
	} {
		f, _ := measure(t, c.obj, window)
		if f.Type != "image/png" || f.Clean != c.want {
			t.Errorf("%s: %+v, want clean=%v", name, f, c.want)
		}
	}
}

func TestSniff(t *testing.T) {
	for in, want := range map[string]string{
		"\xFF\xD8\xFF\xE0":      "image/jpeg",
		"\x89PNG\r\n\x1a\n\x00": "image/png",
		"%PDF-1.7\n":            "application/pdf",
		"PK\x03\x04\x14\x00":    "application/zip",
		"PK\x05\x06":            "unknown", // empty zip: not an upload we accept
		"\xFF\xD8":              "unknown",
		"<svg xmlns=":           "unknown",
		"GIF89a":                "unknown",
		"":                      "unknown",
	} {
		if got := Sniff([]byte(in)); got != want {
			t.Errorf("Sniff(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestMissingAndUninspected(t *testing.T) {
	if f, _ := measure(t, nil, window); f != (Facts{Bytes: 0, Type: "unknown", Clean: true}) {
		t.Errorf("missing: %+v", f)
	}
	pdf := []byte("%PDF-1.4\n/Author (someone)\n")
	if f, _ := measure(t, pdf, window); f != (Facts{Bytes: int64(len(pdf)), Type: "application/pdf", Clean: true}) {
		t.Errorf("pdf: %+v", f)
	}
}

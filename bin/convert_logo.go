//go:build ignore

// convert_logo.go — read a JPEG/PNG and write a PNG with white pixels
// keyed to transparent. Intended for the "logo ppg us" branding asset.
//
//   go run bin/convert_logo.go logo-ppg-us.jpeg internal/store/seed-data/logo_ppg_us.png
//
// Threshold: any pixel where R, G, B ≥ 240 becomes fully transparent.
// Close to that threshold the alpha is faded for a softer edge.
package main

import (
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) < 3 {
		log.Fatalf("usage: convert_logo INPUT OUTPUT.png")
	}
	in, out := os.Args[1], os.Args[2]
	f, err := os.Open(in)
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer f.Close()
	var img image.Image
	switch strings.ToLower(filepath.Ext(in)) {
	case ".jpg", ".jpeg":
		img, err = jpeg.Decode(f)
	case ".png":
		img, err = png.Decode(f)
	default:
		img, _, err = image.Decode(f)
	}
	if err != nil {
		log.Fatalf("decode: %v", err)
	}
	b := img.Bounds()
	dst := image.NewNRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, _ := img.At(x, y).RGBA()
			// rgba returns 16-bit. Down-shift to 8.
			r8, g8, b8 := uint8(r>>8), uint8(g>>8), uint8(bl>>8)
			// Whiteness: how close is min(r,g,b) to 255.
			m := r8
			if g8 < m {
				m = g8
			}
			if b8 < m {
				m = b8
			}
			var a uint8
			switch {
			case m >= 240:
				a = 0
			case m >= 220:
				a = uint8(float64(240-m) / 20.0 * 255.0)
			default:
				a = 255
			}
			dst.SetNRGBA(x, y, color.NRGBA{r8, g8, b8, a})
		}
	}
	w, err := os.Create(out)
	if err != nil {
		log.Fatalf("create: %v", err)
	}
	defer w.Close()
	if err := png.Encode(w, dst); err != nil {
		log.Fatalf("encode: %v", err)
	}
	log.Printf("wrote %s (%dx%d)", out, b.Dx(), b.Dy())
}

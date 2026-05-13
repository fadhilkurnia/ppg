package auth

import "testing"

func TestGeneratePathConformsToShape(t *testing.T) {
	for i := 0; i < 50; i++ {
		got, err := GeneratePath()
		if err != nil {
			t.Fatalf("GeneratePath: %v", err)
		}
		if !IsValidPath(got) {
			t.Fatalf("GeneratePath returned non-conforming value: %q", got)
		}
	}
}

func TestGeneratePathDistinct(t *testing.T) {
	a, err := GeneratePath()
	if err != nil {
		t.Fatalf("GeneratePath: %v", err)
	}
	b, err := GeneratePath()
	if err != nil {
		t.Fatalf("GeneratePath: %v", err)
	}
	if a == b {
		t.Fatalf("expected distinct paths, got %q twice", a)
	}
}

func TestIsValidPath(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{"empty", "", false},
		{"too short", "abc", false},
		{"too long", "0123456", false},
		{"uppercase", "A3F8D2", false},
		{"mixed case", "a3F8d2", false},
		{"symbol", "a3f8d!", false},
		{"trailing space", "a3f8d ", false},
		{"valid hex-style", "a3f8d2", true},
		{"valid letters past f", "xyz789", true},
		{"all letters rejected", "abcxyz", false},
		{"natural word rejected", "assets", false},
		{"valid zeros", "000000", true},
		{"valid mixed", "g1h2i3", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsValidPath(tc.in); got != tc.want {
				t.Errorf("IsValidPath(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestEqualPath(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"a3f8d2", "a3f8d2", true},
		{"a3f8d2", "b3f8d2", false},
		{"a3f8d2", "a3f8d", false}, // length mismatch
		{"", "", true},              // documented behaviour: identical empties match
	}
	for _, tc := range cases {
		t.Run(tc.a+"_vs_"+tc.b, func(t *testing.T) {
			if got := EqualPath(tc.a, tc.b); got != tc.want {
				t.Errorf("EqualPath(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
			}
		})
	}
}

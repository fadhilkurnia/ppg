package importer

import (
	"testing"
	"time"
)

func TestParseIndoDate(t *testing.T) {
	must := func(y int, m time.Month, d int) *time.Time {
		v := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
		return &v
	}
	cases := []struct {
		in      string
		want    *time.Time
		wantErr bool
	}{
		{"", nil, false},
		{"   ", nil, false},
		{"2024", must(2024, time.January, 1), false},
		{"September 2023", must(2023, time.September, 1), false},
		{"september 2023", must(2023, time.September, 1), false},
		{"DESEMBER 2025", must(2025, time.December, 1), false},
		{"2024-03-15", must(2024, time.March, 15), false},
		{"unknown", nil, true},
		{"Foo 2024", nil, true},
		{"99", nil, true}, // out of range
	}
	for _, tc := range cases {
		got, err := parseIndoDate(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseIndoDate(%q): want error, got %v", tc.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseIndoDate(%q): unexpected error: %v", tc.in, err)
			continue
		}
		if (got == nil) != (tc.want == nil) {
			t.Errorf("parseIndoDate(%q): nil mismatch (got %v, want %v)", tc.in, got, tc.want)
			continue
		}
		if got != nil && !got.Equal(*tc.want) {
			t.Errorf("parseIndoDate(%q) = %v, want %v", tc.in, *got, *tc.want)
		}
	}
}

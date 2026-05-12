package bulk

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseIndoDate accepts the human-friendly forms used in existing exports:
//
//   - empty                → nil, nil
//   - "2024"               → 2024-01-01
//   - "September 2023"     → 2023-09-01 (month name in Indonesian, any case)
//   - "2024-03-15"         → that ISO date
//
// Anything else returns an error.
func ParseIndoDate(raw string) (*time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return &t, nil
	}
	parts := strings.Fields(s)
	switch len(parts) {
	case 1:
		y, err := strconv.Atoi(parts[0])
		if err != nil || y < 1900 || y > 2200 {
			return nil, fmt.Errorf("unrecognized date %q", s)
		}
		t := time.Date(y, time.January, 1, 0, 0, 0, 0, time.UTC)
		return &t, nil
	case 2:
		m, ok := indoMonths[strings.ToLower(parts[0])]
		if !ok {
			return nil, fmt.Errorf("unknown month %q in date %q", parts[0], s)
		}
		y, err := strconv.Atoi(parts[1])
		if err != nil || y < 1900 || y > 2200 {
			return nil, fmt.Errorf("invalid year in date %q", s)
		}
		t := time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
		return &t, nil
	default:
		return nil, fmt.Errorf("unrecognized date %q", s)
	}
}

// FormatDateOrEmpty renders t as YYYY-MM-DD, or "" if t is nil. Exporters
// use this so nil dates round-trip through an import unchanged.
func FormatDateOrEmpty(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

var indoMonths = map[string]time.Month{
	"januari":   time.January,
	"februari":  time.February,
	"maret":     time.March,
	"april":     time.April,
	"mei":       time.May,
	"juni":      time.June,
	"juli":      time.July,
	"agustus":   time.August,
	"september": time.September,
	"oktober":   time.October,
	"november":  time.November,
	"desember":  time.December,
}

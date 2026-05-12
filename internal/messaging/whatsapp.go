// Package messaging provides outbound WhatsApp send adapters used by the
// public /absen submission handler. The Sender interface keeps the handler
// provider-agnostic; switch implementations by env (WHATSAPP_PROVIDER).
package messaging

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Sender delivers a plain-text WhatsApp message to a phone number. The
// `to` argument is expected to be in the provider's accepted format
// (Fonnte accepts both "62…" and "+62…"; callers should normalise to
// "62…" via Normalize before calling).
type Sender interface {
	Send(ctx context.Context, to, body string) error
}

// Noop returns a sender that does nothing but log at debug level. Used
// when no provider is configured so the handler can stay agnostic.
type Noop struct{}

func (Noop) Send(_ context.Context, to, body string) error {
	slog.Debug("whatsapp send skipped (noop)", "to", to, "bytes", len(body))
	return nil
}

// Fonnte calls https://api.fonnte.com/send with the device token. Token
// is per-device; obtain one from the Fonnte dashboard after connecting
// a WhatsApp number.
type Fonnte struct {
	Token  string
	Client *http.Client
}

const fonnteEndpoint = "https://api.fonnte.com/send"

func (f *Fonnte) Send(ctx context.Context, to, body string) error {
	if f.Token == "" {
		return errors.New("fonnte: token not configured")
	}
	if to == "" {
		return errors.New("fonnte: empty target")
	}
	form := url.Values{}
	form.Set("target", to)
	form.Set("message", body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fonnteEndpoint,
		strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", f.Token)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := f.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		return fmt.Errorf("fonnte: status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// Normalize coerces Indonesian phone input to the "62…" form Fonnte and
// most WhatsApp gateways expect. Accepts "+62…", "62…", and "0…".
// Returns "" for input it can't recognise so callers can skip the send.
func Normalize(in string) string {
	s := strings.Map(func(r rune) rune {
		switch {
		case r >= '0' && r <= '9':
			return r
		case r == '+':
			return r
		}
		return -1
	}, in)
	s = strings.TrimSpace(s)
	switch {
	case strings.HasPrefix(s, "+62"):
		return s[1:]
	case strings.HasPrefix(s, "62"):
		return s
	case strings.HasPrefix(s, "0"):
		return "62" + s[1:]
	}
	return ""
}

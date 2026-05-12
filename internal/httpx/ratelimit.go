package httpx

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// IPRateLimiter is a tiny per-IP token bucket. Tokens regenerate at
// `refill` per `window` and are capped at `burst`. Suitable for guarding
// public unauthenticated POST endpoints; not meant as a general-purpose
// limiter. Bound state grows with unique IPs; callers should keep the
// limit small for short-lived processes.
type IPRateLimiter struct {
	burst  int
	window time.Duration

	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

// NewIPRateLimiter caps each IP at `burst` requests per `window` (e.g.
// burst=10, window=1*time.Minute → ~10/min, refilling continuously).
func NewIPRateLimiter(burst int, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{
		burst:   burst,
		window:  window,
		buckets: make(map[string]*bucket),
	}
}

func (l *IPRateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: float64(l.burst), last: now}
		l.buckets[key] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	refillPerSec := float64(l.burst) / l.window.Seconds()
	b.tokens += elapsed * refillPerSec
	if b.tokens > float64(l.burst) {
		b.tokens = float64(l.burst)
	}
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// Middleware returns a chi-compatible middleware that 429s when the
// caller's IP exceeds the bucket. RealIP middleware should run first so
// r.RemoteAddr reflects the proxied client.
func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		if !l.allow(ip, time.Now()) {
			Error(w, http.StatusTooManyRequests, "rate_limited",
				"Terlalu banyak permintaan, coba lagi sebentar lagi.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port            int
	DatabasePath    string
	JWTSecret       []byte
	JWTTTL          time.Duration
	CookieSecure    bool
	SeedAdminEmail  string
	SeedAdminPass   string
	Dev             bool
}

func Load() (Config, error) {
	c := Config{
		Port:           getInt("PORT", 8080),
		DatabasePath:   getString("DATABASE_PATH", "./data/app.db"),
		JWTTTL:         getDuration("JWT_TTL", 24*time.Hour),
		CookieSecure:   getBool("COOKIE_SECURE", false),
		SeedAdminEmail: os.Getenv("SEED_ADMIN_EMAIL"),
		SeedAdminPass:  os.Getenv("SEED_ADMIN_PASSWORD"),
		Dev:            getBool("DEV", false),
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return c, fmt.Errorf("JWT_SECRET is required")
	}
	if len(secret) < 32 {
		return c, fmt.Errorf("JWT_SECRET must be at least 32 bytes")
	}
	c.JWTSecret = []byte(secret)

	return c, nil
}

func getString(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func getBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

func getDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

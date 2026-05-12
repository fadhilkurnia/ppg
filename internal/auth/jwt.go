package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

type Claims struct {
	UserID string     `json:"sub"`
	Role   model.Role `json:"role"`
	Roles  []string   `json:"roles,omitempty"`
	jwt.RegisteredClaims
}

// RefreshClaims is the long-lived refresh token issued alongside the access
// token. Its jti is stored on users.refresh_jti to allow revocation.
type RefreshClaims struct {
	UserID string `json:"sub"`
	Typ    string `json:"typ"`
	jwt.RegisteredClaims
}

type JWT struct {
	secret     []byte
	ttl        time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

func NewJWT(secret []byte, ttl time.Duration) *JWT {
	return &JWT{secret: secret, ttl: ttl, refreshTTL: 30 * 24 * time.Hour, now: time.Now}
}

// SetRefreshTTL overrides the default 30-day refresh-token lifetime.
func (j *JWT) SetRefreshTTL(d time.Duration) { j.refreshTTL = d }

func (j *JWT) TTL() time.Duration        { return j.ttl }
func (j *JWT) RefreshTTL() time.Duration { return j.refreshTTL }

func (j *JWT) Issue(userID string, role model.Role) (string, error) {
	return j.IssueWithRoles(userID, role, nil)
}

// IssueWithRoles mints an access token that also carries the user's full
// role list (capped to keep tokens small).
func (j *JWT) IssueWithRoles(userID string, role model.Role, roles []string) (string, error) {
	now := j.now()
	claims := Claims{
		UserID: userID,
		Role:   role,
		Roles:  capStrings(roles, 10),
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(j.ttl)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(j.secret)
}

// IssueRefresh mints a refresh token. The caller stores the returned jti on
// users.refresh_jti so subsequent rotations can detect replay.
func (j *JWT) IssueRefresh(userID, jti string) (string, error) {
	now := j.now()
	claims := RefreshClaims{
		UserID: userID,
		Typ:    "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(j.refreshTTL)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString(j.secret)
}

func capStrings(in []string, max int) []string {
	if len(in) <= max {
		return in
	}
	return in[:max]
}

func (j *JWT) Verify(tokenStr string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return j.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (j *JWT) VerifyRefresh(tokenStr string) (*RefreshClaims, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &RefreshClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return j.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*RefreshClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid refresh token")
	}
	if claims.Typ != "refresh" {
		return nil, errors.New("not a refresh token")
	}
	return claims, nil
}

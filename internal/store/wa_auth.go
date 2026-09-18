package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type WAChallengeStatus string

const (
	WAChallengePending  WAChallengeStatus = "pending"
	WAChallengeApproved WAChallengeStatus = "approved"
	WAChallengeConsumed WAChallengeStatus = "consumed"
)

type WAChallenge struct {
	Code       string            `json:"code"`
	PollToken  string            `json:"pollToken"`
	Phone      *string           `json:"phone,omitempty"`
	UserID     *string           `json:"userId,omitempty"`
	Status     WAChallengeStatus `json:"status"`
	MagicToken *string           `json:"magicToken,omitempty"`
	ExpiresAt  time.Time         `json:"expiresAt"`
	CreatedAt  time.Time         `json:"createdAt"`
}

func (c *WAChallenge) IsExpired() bool {
	return time.Now().UTC().After(c.ExpiresAt)
}

type WAChallenges struct {
	db *sql.DB
}

func NewWAChallenges(db *sql.DB) *WAChallenges {
	return &WAChallenges{db: db}
}

const selectWAChallenge = `SELECT code, poll_token, phone, user_id, status, magic_token, expires_at, created_at FROM wa_auth_challenges`

func (s *WAChallenges) Create(ctx context.Context, code, pollToken string, ttl time.Duration) (*WAChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	now := time.Now().UTC()
	expiresAt := now.Add(ttl)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO wa_auth_challenges (code, poll_token, status, expires_at, created_at)
		 VALUES (?, ?, 'pending', ?, ?)`,
		code, pollToken, expiresAt, now)
	if err != nil {
		return nil, err
	}

	return &WAChallenge{
		Code:      code,
		PollToken: pollToken,
		Status:    WAChallengePending,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}, nil
}

func (s *WAChallenges) CreateForUser(ctx context.Context, code, pollToken, userID, phone string, ttl time.Duration) (*WAChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	now := time.Now().UTC()
	expiresAt := now.Add(ttl)

	var uID, ph any
	if userID != "" {
		uID = userID
	}
	if phone != "" {
		ph = phone
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO wa_auth_challenges (code, poll_token, user_id, phone, status, expires_at, created_at)
		 VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
		code, pollToken, uID, ph, expiresAt, now)
	if err != nil {
		return nil, err
	}

	var uPtr, phPtr *string
	if userID != "" {
		uPtr = &userID
	}
	if phone != "" {
		phPtr = &phone
	}

	return &WAChallenge{
		Code:      code,
		PollToken: pollToken,
		UserID:    uPtr,
		Phone:     phPtr,
		Status:    WAChallengePending,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}, nil
}

func (s *WAChallenges) GetByCode(ctx context.Context, code string) (*WAChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	row := s.db.QueryRowContext(ctx, selectWAChallenge+` WHERE code = ?`, code)
	return scanWAChallenge(row)
}

func (s *WAChallenges) GetByPoll(ctx context.Context, code, pollToken string) (*WAChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	row := s.db.QueryRowContext(ctx, selectWAChallenge+` WHERE code = ? AND poll_token = ?`, code, pollToken)
	return scanWAChallenge(row)
}

func (s *WAChallenges) Approve(ctx context.Context, code, phone, userID, magicToken string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	res, err := s.db.ExecContext(ctx,
		`UPDATE wa_auth_challenges
		 SET phone = ?, user_id = ?, magic_token = ?, status = 'approved'
		 WHERE code = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`,
		phone, userID, magicToken, code)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("challenge not found, already approved, or expired")
	}
	return nil
}

func (s *WAChallenges) GetByMagicToken(ctx context.Context, magicToken string) (*WAChallenge, error) {
	row := s.db.QueryRowContext(ctx, selectWAChallenge+` WHERE magic_token = ?`, magicToken)
	return scanWAChallenge(row)
}

func (s *WAChallenges) MarkConsumed(ctx context.Context, code string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	_, err := s.db.ExecContext(ctx,
		`UPDATE wa_auth_challenges SET status = 'consumed' WHERE code = ?`,
		code)
	return err
}

func (s *WAChallenges) PruneExpired(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM wa_auth_challenges WHERE expires_at < datetime('now', '-1 day')`)
	return err
}

func scanWAChallenge(row *sql.Row) (*WAChallenge, error) {
	var c WAChallenge
	var status string
	if err := row.Scan(&c.Code, &c.PollToken, &c.Phone, &c.UserID, &status, &c.MagicToken, &c.ExpiresAt, &c.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	c.Status = WAChallengeStatus(status)
	return &c, nil
}

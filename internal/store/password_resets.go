package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

type PasswordResets struct {
	db *sql.DB
}

func NewPasswordResets(db *sql.DB) *PasswordResets {
	return &PasswordResets{db: db}
}

func (s *PasswordResets) Create(ctx context.Context, userID, phone, otpCode, resetToken string, ttl time.Duration) (*model.PasswordResetChallenge, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()
	expiresAt := now.Add(ttl)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO password_reset_challenges (id, user_id, otp_code, phone, reset_token, status, expires_at, created_at)
		 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
		id, userID, otpCode, phone, resetToken, expiresAt, now)
	if err != nil {
		return nil, err
	}

	return &model.PasswordResetChallenge{
		ID:         id,
		UserID:     userID,
		OTPCode:    otpCode,
		Phone:      phone,
		ResetToken: resetToken,
		Status:     "pending",
		ExpiresAt:  expiresAt,
		CreatedAt:  now,
	}, nil
}

func (s *PasswordResets) GetByToken(ctx context.Context, resetToken string) (*model.PasswordResetChallenge, error) {
	var c model.PasswordResetChallenge
	err := s.db.QueryRowContext(ctx,
		`SELECT id, user_id, otp_code, phone, reset_token, status, expires_at, created_at
		 FROM password_reset_challenges
		 WHERE reset_token = ?`, resetToken).Scan(
		&c.ID, &c.UserID, &c.OTPCode, &c.Phone, &c.ResetToken, &c.Status, &c.ExpiresAt, &c.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func (s *PasswordResets) VerifyAndConsume(ctx context.Context, resetToken, otpCode string) (*model.PasswordResetChallenge, error) {
	c, err := s.GetByToken(ctx, resetToken)
	if err != nil {
		return nil, err
	}

	if c.Status != "pending" {
		return nil, errors.New("sesi reset kata sandi sudah digunakan")
	}

	if time.Now().UTC().After(c.ExpiresAt) {
		return nil, errors.New("kode OTP telah kedaluwarsa, silakan minta kode baru")
	}

	cleanInput := strings.TrimSpace(otpCode)
	cleanStored := strings.TrimSpace(c.OTPCode)
	if cleanInput != cleanStored {
		return nil, errors.New("kode OTP salah atau tidak valid")
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE password_reset_challenges SET status = 'consumed' WHERE id = ? AND status = 'pending'`, c.ID)
	if err != nil {
		return nil, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, errors.New("sesi reset kata sandi tidak valid")
	}

	c.Status = "consumed"
	return c, nil
}

type WAOutbox struct {
	db *sql.DB
}

func NewWAOutbox(db *sql.DB) *WAOutbox {
	return &WAOutbox{db: db}
}

func (s *WAOutbox) Enqueue(ctx context.Context, phone, message string) (*model.WAOutboxItem, error) {
	id := ulid.Make().String()
	now := time.Now().UTC()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO wa_outbox (id, phone, message, status, created_at)
		 VALUES (?, ?, ?, 'pending', ?)`,
		id, phone, message, now)
	if err != nil {
		return nil, err
	}

	return &model.WAOutboxItem{
		ID:        id,
		Phone:     phone,
		Message:   message,
		Status:    "pending",
		CreatedAt: now,
	}, nil
}

func (s *WAOutbox) GetPending(ctx context.Context, limit int) ([]model.WAOutboxItem, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, phone, message, status, error, created_at, sent_at
		 FROM wa_outbox
		 WHERE status = 'pending'
		 ORDER BY created_at ASC
		 LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.WAOutboxItem
	for rows.Next() {
		var it model.WAOutboxItem
		var errStr sql.NullString
		var sentAt sql.NullTime
		if err := rows.Scan(&it.ID, &it.Phone, &it.Message, &it.Status, &errStr, &it.CreatedAt, &sentAt); err != nil {
			return nil, err
		}
		if errStr.Valid {
			it.Error = &errStr.String
		}
		if sentAt.Valid {
			it.SentAt = &sentAt.Time
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (s *WAOutbox) MarkSent(ctx context.Context, id string) error {
	now := time.Now().UTC()
	_, err := s.db.ExecContext(ctx,
		`UPDATE wa_outbox SET status = 'sent', sent_at = ?, error = NULL WHERE id = ?`, now, id)
	return err
}

func (s *WAOutbox) MarkFailed(ctx context.Context, id, errStr string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE wa_outbox SET status = 'failed', error = ? WHERE id = ?`, errStr, id)
	return err
}

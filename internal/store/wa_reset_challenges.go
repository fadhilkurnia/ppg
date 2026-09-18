package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

type WAResetStatus string

const (
	WAResetPending  WAResetStatus = "pending"
	WAResetOTPSent  WAResetStatus = "otp_sent"
	WAResetVerified WAResetStatus = "verified"
	WAResetConsumed WAResetStatus = "consumed"
)

type WAResetChallenge struct {
	Code              string        `json:"code"`
	PollToken         string        `json:"pollToken"`
	Phone             *string       `json:"phone,omitempty"`
	UserID            *string       `json:"userId,omitempty"`
	OTPCode           *string       `json:"-"`
	ResetSessionToken *string       `json:"resetSessionToken,omitempty"`
	Status            WAResetStatus `json:"status"`
	ExpiresAt         time.Time     `json:"expiresAt"`
	CreatedAt         time.Time     `json:"createdAt"`
}

func (c *WAResetChallenge) IsExpired() bool {
	return time.Now().UTC().After(c.ExpiresAt)
}

type WAResetChallenges struct {
	db *sql.DB
}

func NewWAResetChallenges(db *sql.DB) *WAResetChallenges {
	return &WAResetChallenges{db: db}
}

const selectWAReset = `SELECT code, poll_token, phone, user_id, otp_code, reset_session_token, status, expires_at, created_at FROM wa_reset_challenges`

func (s *WAResetChallenges) Create(ctx context.Context, code, pollToken string, ttl time.Duration) (*WAResetChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	now := time.Now().UTC()
	expiresAt := now.Add(ttl)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO wa_reset_challenges (code, poll_token, status, expires_at, created_at)
		 VALUES (?, ?, 'pending', ?, ?)`,
		code, pollToken, expiresAt, now)
	if err != nil {
		return nil, err
	}

	return &WAResetChallenge{
		Code:      code,
		PollToken: pollToken,
		Status:    WAResetPending,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}, nil
}

func (s *WAResetChallenges) GetByCode(ctx context.Context, code string) (*WAResetChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	row := s.db.QueryRowContext(ctx, selectWAReset+` WHERE code = ?`, code)
	return scanWAReset(row)
}

func (s *WAResetChallenges) GetByPoll(ctx context.Context, code, pollToken string) (*WAResetChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	row := s.db.QueryRowContext(ctx, selectWAReset+` WHERE code = ? AND poll_token = ?`, code, pollToken)
	return scanWAReset(row)
}

func (s *WAResetChallenges) GetByResetSessionToken(ctx context.Context, token string) (*WAResetChallenge, error) {
	token = strings.TrimSpace(token)
	row := s.db.QueryRowContext(ctx, selectWAReset+` WHERE reset_session_token = ?`, token)
	return scanWAReset(row)
}

func (s *WAResetChallenges) RecordOTPSent(ctx context.Context, code, phone, userID, otpCode string) error {
	code = strings.ToUpper(strings.TrimSpace(code))
	res, err := s.db.ExecContext(ctx,
		`UPDATE wa_reset_challenges
		 SET phone = ?, user_id = ?, otp_code = ?, status = 'otp_sent'
		 WHERE code = ? AND status IN ('pending', 'otp_sent') AND expires_at > CURRENT_TIMESTAMP`,
		phone, userID, otpCode, code)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("sesi reset tidak ditemukan atau sudah kedaluwarsa")
	}
	return nil
}

func (s *WAResetChallenges) VerifyOTP(ctx context.Context, code, pollToken, otpCode, resetSessionToken string) (*WAResetChallenge, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	c, err := s.GetByPoll(ctx, code, pollToken)
	if err != nil {
		return nil, err
	}

	if c.IsExpired() {
		return nil, errors.New("sesi reset telah kedaluwarsa, silakan buat permintaan baru")
	}

	if c.Status == WAResetPending {
		return nil, errors.New("pesan belum diterima oleh Bot WhatsApp PPG. Silakan kirim pesan ke WhatsApp terlebih dahulu.")
	}

	if c.Status == WAResetConsumed {
		return nil, errors.New("sesi reset kata sandi sudah digunakan")
	}

	if c.OTPCode == nil || strings.TrimSpace(*c.OTPCode) != strings.TrimSpace(otpCode) {
		return nil, errors.New("kode OTP salah. Silakan periksa kembali pesan WhatsApp Anda.")
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE wa_reset_challenges
		 SET status = 'verified', reset_session_token = ?
		 WHERE code = ? AND poll_token = ? AND status = 'otp_sent'`,
		resetSessionToken, code, pollToken)
	if err != nil {
		return nil, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return nil, err
	}
	if n == 0 {
		if c.Status == WAResetVerified && c.ResetSessionToken != nil && *c.ResetSessionToken == resetSessionToken {
			return c, nil
		}
		return nil, errors.New("gagal memverifikasi OTP")
	}

	c.Status = WAResetVerified
	c.ResetSessionToken = &resetSessionToken
	return c, nil
}

func (s *WAResetChallenges) MarkConsumed(ctx context.Context, resetSessionToken string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE wa_reset_challenges SET status = 'consumed' WHERE reset_session_token = ? AND status = 'verified'`,
		resetSessionToken)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("sesi reset tidak valid atau sudah digunakan")
	}
	return nil
}

func scanWAReset(row *sql.Row) (*WAResetChallenge, error) {
	var c WAResetChallenge
	var status string
	if err := row.Scan(&c.Code, &c.PollToken, &c.Phone, &c.UserID, &c.OTPCode, &c.ResetSessionToken, &status, &c.ExpiresAt, &c.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	c.Status = WAResetStatus(status)
	return &c, nil
}

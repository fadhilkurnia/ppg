package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"

	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
)

type UserPhones struct {
	db *sql.DB
}

func NewUserPhones(db *sql.DB) *UserPhones {
	return &UserPhones{db: db}
}

func (s *UserPhones) ListByUserID(ctx context.Context, userID string) ([]model.UserPhone, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, phone, is_primary, verified_at, created_at
		 FROM user_phones
		 WHERE user_id = ?
		 ORDER BY is_primary DESC, created_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []model.UserPhone
	for rows.Next() {
		var p model.UserPhone
		var isPrim int
		if err := rows.Scan(&p.ID, &p.UserID, &p.Phone, &isPrim, &p.VerifiedAt, &p.CreatedAt); err != nil {
			return nil, err
		}
		p.IsPrimary = isPrim != 0
		items = append(items, p)
	}
	return items, rows.Err()
}

func (s *UserPhones) IsPhoneTaken(ctx context.Context, phone string, excludeUserID string) (bool, error) {
	candidates := NormalizePhone(phone)
	if len(candidates) == 0 {
		return false, nil
	}

	query := `SELECT COUNT(*) FROM user_phones WHERE (`
	args := make([]any, 0, len(candidates)*2+1)
	for i, c := range candidates {
		if i > 0 {
			query += " OR "
		}
		query += "phone = ? OR replace(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), '''', '') = ?"
		args = append(args, c, c)
	}
	query += `)`
	if excludeUserID != "" {
		query += ` AND user_id != ?`
		args = append(args, excludeUserID)
	}

	var count int
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&count); err != nil {
		return false, err
	}
	if count > 0 {
		return true, nil
	}

	// Also check users table legacy phone column
	uQuery := `SELECT COUNT(*) FROM users WHERE (`
	uArgs := make([]any, 0, len(candidates)*2+1)
	for i, c := range candidates {
		if i > 0 {
			uQuery += " OR "
		}
		uQuery += "phone = ? OR replace(replace(replace(replace(phone, '+', ''), '-', ''), ' ', ''), '''', '') = ?"
		uArgs = append(uArgs, c, c)
	}
	uQuery += `)`
	if excludeUserID != "" {
		uQuery += ` AND id != ?`
		uArgs = append(uArgs, excludeUserID)
	}

	var uCount int
	if err := s.db.QueryRowContext(ctx, uQuery, uArgs...).Scan(&uCount); err != nil {
		return false, err
	}
	return uCount > 0, nil
}

func (s *UserPhones) AddPhone(ctx context.Context, userID, phone string, makePrimary bool) (*model.UserPhone, error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return nil, errors.New("nomor telepon wajib diisi")
	}

	taken, err := s.IsPhoneTaken(ctx, phone, userID)
	if err != nil {
		return nil, fmt.Errorf("check phone: %w", err)
	}
	if taken {
		return nil, errors.New("nomor WhatsApp ini sudah terdaftar pada akun lain")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// If user has no existing phone, make this primary automatically
	var existingCount int
	_ = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_phones WHERE user_id = ?`, userID).Scan(&existingCount)
	if existingCount == 0 {
		makePrimary = true
	}

	if makePrimary {
		_, _ = tx.ExecContext(ctx, `UPDATE user_phones SET is_primary = 0 WHERE user_id = ?`, userID)
	}

	id := "ph_" + ulid.Make().String()
	now := time.Now().UTC()
	primVal := 0
	if makePrimary {
		primVal = 1
	}

	_, err = tx.ExecContext(ctx,
		`INSERT INTO user_phones (id, user_id, phone, is_primary, verified_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id, phone) DO UPDATE SET is_primary = ?, verified_at = ?`,
		id, userID, phone, primVal, now, now, primVal, now)
	if err != nil {
		return nil, err
	}

	if makePrimary {
		_, _ = tx.ExecContext(ctx, `UPDATE users SET phone = ?, updated_at = ? WHERE id = ?`, phone, now, userID)
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &model.UserPhone{
		ID:         id,
		UserID:     userID,
		Phone:      phone,
		IsPrimary:  makePrimary,
		VerifiedAt: now,
		CreatedAt:  now,
	}, nil
}

func (s *UserPhones) SetPrimary(ctx context.Context, userID, phoneID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var targetPhone string
	err = tx.QueryRowContext(ctx,
		`SELECT phone FROM user_phones WHERE id = ? AND user_id = ?`, phoneID, userID).Scan(&targetPhone)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	_, _ = tx.ExecContext(ctx, `UPDATE user_phones SET is_primary = 0 WHERE user_id = ?`, userID)
	res, err := tx.ExecContext(ctx, `UPDATE user_phones SET is_primary = 1 WHERE id = ? AND user_id = ?`, phoneID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}

	now := time.Now().UTC()
	_, _ = tx.ExecContext(ctx, `UPDATE users SET phone = ?, updated_at = ? WHERE id = ?`, targetPhone, now, userID)

	return tx.Commit()
}

func (s *UserPhones) Delete(ctx context.Context, userID, phoneID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var isPrim int
	var deletedPhone string
	err = tx.QueryRowContext(ctx,
		`SELECT is_primary, phone FROM user_phones WHERE id = ? AND user_id = ?`, phoneID, userID).Scan(&isPrim, &deletedPhone)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	_, err = tx.ExecContext(ctx, `DELETE FROM user_phones WHERE id = ? AND user_id = ?`, phoneID, userID)
	if err != nil {
		return err
	}

	// If deleted phone was primary, elect the oldest remaining phone as primary
	if isPrim != 0 {
		var nextID string
		var nextPhone string
		row := tx.QueryRowContext(ctx,
			`SELECT id, phone FROM user_phones WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`, userID)
		if err := row.Scan(&nextID, &nextPhone); err == nil {
			_, _ = tx.ExecContext(ctx, `UPDATE user_phones SET is_primary = 1 WHERE id = ?`, nextID)
			_, _ = tx.ExecContext(ctx, `UPDATE users SET phone = ?, updated_at = ? WHERE id = ?`, nextPhone, time.Now().UTC(), userID)
		} else {
			// No phones left
			_, _ = tx.ExecContext(ctx, `UPDATE users SET phone = NULL, updated_at = ? WHERE id = ?`, time.Now().UTC(), userID)
		}
	}

	return tx.Commit()
}

package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/fadhilkurnia/ppg-dashboard/internal/auth"
	"github.com/fadhilkurnia/ppg-dashboard/internal/bulk"
	"github.com/fadhilkurnia/ppg-dashboard/internal/config"
	"github.com/fadhilkurnia/ppg-dashboard/internal/handler"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/model"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
	"github.com/fadhilkurnia/ppg-dashboard/web"
)

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "import-teachers":
			if err := runImportTeachers(os.Args[2:]); err != nil {
				fmt.Fprintln(os.Stderr, "import-teachers:", err)
				os.Exit(1)
			}
			return
		case "-h", "--help", "help":
			fmt.Println("usage: server                       (start the HTTP server)")
			fmt.Println("       server import-teachers FILE  (import teachers CSV)")
			return
		}
	}

	if err := run(); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func runImportTeachers(args []string) error {
	if len(args) < 1 {
		return errors.New("usage: server import-teachers <path-to-csv>")
	}
	csvPath := args[0]

	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./data/app.db"
	}

	db, err := store.Open(dbPath)
	if err != nil {
		return fmt.Errorf("open db at %s: %w", dbPath, err)
	}
	defer db.Close()
	if err := store.Migrate(db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	f, err := os.Open(csvPath)
	if err != nil {
		return fmt.Errorf("open csv: %w", err)
	}
	defer f.Close()

	adapter := store.NewTeachersBulk(store.NewTeachers(db))
	report, err := bulk.Process[store.TeacherInput](context.Background(), f, adapter, bulk.ModeUpsert)
	if err != nil {
		return err
	}
	s := report.Summary
	fmt.Printf("created: %d\nupdated: %d\nskipped: %d\nfailed:  %d\ntotal:   %d\n",
		s.Created, s.Updated, s.Skipped, s.Failed, s.Total)
	for _, r := range report.Results {
		if r.Outcome == bulk.OutcomeFailed {
			fmt.Printf("  row %d: %s\n", r.Row, r.Error)
		}
	}
	return nil
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	db, err := store.Open(cfg.DatabasePath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	if err := store.Migrate(db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	if _, err := store.SeedKurikulum(context.Background(), db); err != nil {
		return fmt.Errorf("seed kurikulum: %w", err)
	}

	if _, err := store.SeedStudentTeachers(context.Background(), db); err != nil {
		return fmt.Errorf("seed student teachers: %w", err)
	}

	users := store.NewUsers(db)
	userPhones := store.NewUserPhones(db)
	students := store.NewStudents(db)
	teachers := store.NewTeachers(db)
	studentTeachers := store.NewStudentTeachers(db)
	attendances := store.NewAttendances(db)
	roles := store.NewRoles(db)
	kurikulum := store.NewKurikulum(db)
	pencapaian := store.NewPencapaian(db)
	waChallenges := store.NewWAChallenges(db)
	waResets := store.NewWAResetChallenges(db)
	pwResets := store.NewPasswordResets(db)
	waOutbox := store.NewWAOutbox(db)

	botPhone := os.Getenv("WA_BOT_PHONE")
	if botPhone == "" {
		botPhone = "6287781485093"
	}
	appBaseURL := os.Getenv("APP_BASE_URL")
	if appBaseURL == "" {
		appBaseURL = "https://ppg.tail31c665.ts.net"
	}
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")

	if cfg.SeedAdminEmail != "" && cfg.SeedAdminPass != "" {
		if err := store.SeedAdmin(context.Background(), users, cfg.SeedAdminEmail, cfg.SeedAdminUsername, cfg.SeedAdminPass); err != nil {
			return fmt.Errorf("seed admin: %w", err)
		}
	}

	jwtSvc := auth.NewJWT(cfg.JWTSecret, cfg.JWTTTL)

	publicAttRL := httpx.NewIPRateLimiter(10, time.Minute)

	authH := handler.NewAuth(users, userPhones, waChallenges, waResets, pwResets, waOutbox, roles, jwtSvc, cfg.CookieSecure, cfg.DynamicAPIPath, botPhone, appBaseURL, googleClientID)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger)
	r.Use(auth.DynamicAPIPath(cfg.DynamicAPIPath))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/magic", authH.MagicLogin)

	r.Route("/api", func(api chi.Router) {
		api.Post("/auth/login", authH.Login)
		api.Post("/auth/logout", authH.Logout)
		api.Get("/auth/google/config", authH.GetGoogleConfig)
		api.Post("/auth/google/verify", authH.VerifyGoogleCredential)
		api.Post("/auth/wa/challenge", authH.CreateWAChallenge)
		api.Get("/auth/wa/poll", authH.PollWAChallenge)
		api.Post("/auth/password/reset-challenge", authH.CreateResetWAChallenge)
		api.Get("/auth/password/reset-challenge/status", authH.PollResetWAStatus)
		api.Post("/auth/password/reset-challenge/verify-otp", authH.VerifyResetWAOTP)
		api.Post("/auth/password/reset-challenge/complete", authH.CompleteResetWAPassword)
		api.Post("/auth/password/forgot/request", authH.RequestPasswordReset)
		api.Post("/auth/password/forgot/reset", authH.ResetPasswordWithOTP)
		api.Post("/internal/wa-verify", authH.InternalWAVerify)
		api.Get("/internal/wa-outbox", authH.GetPendingWAOutbox)
		api.Post("/internal/wa-outbox/{id}/sent", authH.MarkWAOutboxSent)
		api.Post("/internal/wa-outbox/{id}/failed", authH.MarkWAOutboxFailed)
		api.Get("/auth/magic", authH.MagicLogin)

		pubAttH := handler.NewPublicAttendance(attendances, students, teachers)
		api.Get("/public/teachers", pubAttH.ListTeachers)
		api.Get("/public/students", pubAttH.ListStudents)
		api.With(publicAttRL.Middleware).Post("/public/attendances", pubAttH.Create)

		authMw := auth.Middleware(jwtSvc)
		api.Group(func(p chi.Router) {
			p.Use(authMw)
			p.Get("/auth/me", authH.Me)
			p.Post("/auth/me/first-login", authH.FirstLogin)
			p.Post("/auth/me/wa/challenge", authH.CreateUserWAChallenge)
			p.Delete("/auth/me/wa", authH.DeleteUserWAPhone)
			p.Post("/auth/me/google/link", authH.LinkGoogleCredential)
			p.Get("/auth/me/phones", authH.ListUserPhones)
			p.Post("/auth/me/phones/{id}/primary", authH.SetPrimaryUserPhone)
			p.Delete("/auth/me/phones/{id}", authH.DeleteUserPhone)

			studentsH := handler.NewStudents(students)
			p.Get("/students", studentsH.List)
			p.Get("/students/{id}", studentsH.Get)

			teachersH := handler.NewTeachers(teachers)
			p.Get("/teachers", teachersH.List)
			p.Get("/teachers/{id}", teachersH.Get)

			studentTeachersH := handler.NewStudentTeachers(studentTeachers)
			p.Get("/student-teachers", studentTeachersH.List)
			p.Get("/students/{id}/teachers", studentTeachersH.GetTeachersForStudent)
			p.Get("/teachers/{id}/students", studentTeachersH.GetStudentsForTeacher)

			statsH := handler.NewStats(students, teachers, attendances)
			p.Get("/stats/dashboard", statsH.Dashboard)
			p.Get("/stats/attendance", statsH.Attendance)

			attendancesH := handler.NewAttendances(attendances)
			p.Get("/attendances", attendancesH.List)
			p.Get("/attendances/{id}", attendancesH.Get)

			kurikulumH := handler.NewKurikulum(kurikulum)
			p.Get("/tingkat", kurikulumH.ListTingkat)
			p.Get("/materi-ajar", kurikulumH.ListMateriAjar)

			pencapaianH := handler.NewPencapaian(pencapaian)
			p.Get("/pencapaian", pencapaianH.List)
			p.Get("/achievement/report", pencapaianH.ClassReport)

			p.Group(func(adm chi.Router) {
				adm.Use(auth.RequireRole("admin"))
				adm.Post("/tingkat", kurikulumH.CreateTingkat)
				adm.Put("/tingkat/{id}", kurikulumH.UpdateTingkat)
				adm.Delete("/tingkat/{id}", kurikulumH.DeleteTingkat)
				adm.Post("/materi-ajar", kurikulumH.CreateMateriAjar)
				adm.Put("/materi-ajar/{id}", kurikulumH.UpdateMateriAjar)
				adm.Delete("/materi-ajar/{id}", kurikulumH.DeleteMateriAjar)
				adm.Delete("/pencapaian/{id}", pencapaianH.Delete)
				adm.Delete("/pencapaian/notes/{id}", pencapaianH.DeleteNote)
			})

			p.Post("/pencapaian", pencapaianH.Upsert)
			p.Get("/pencapaian/notes", pencapaianH.ListNotes)
			p.Post("/pencapaian/notes", pencapaianH.CreateNote)

			bulkH := handler.NewBulk(handler.BulkOptions{
				MaxBytes:    handler.ParseMaxBytesEnv(os.Getenv("BULK_MAX_BYTES")),
				Teachers:    store.NewTeachersBulk(teachers),
				Students:    store.NewStudentsBulk(students),
				Attendances: store.NewAttendancesBulk(attendances),
				Pencapaian:  store.NewPencapaianBulk(db, pencapaian),
				Users:       store.NewUsersBulk(users),
			})
			usersH := handler.NewUsers(users, roles)
			rolesH := handler.NewRoles(roles)

			p.Get("/users/check-username", usersH.CheckUsername)
			p.Patch("/users/{id}", usersH.Update)
			p.Post("/users/{id}/password", usersH.Password)
			p.With(auth.RequireAnyRole(model.RoleAdmin, model.RoleGuru, model.RoleTeacher, model.RoleStaff)).Post("/attendances", attendancesH.Create)

			for _, entity := range handler.BulkEntities {
				p.Get("/"+entity+"/export.csv", bulkH.ExportFor(entity))
				p.Get("/"+entity+"/bulk/schema", bulkH.SchemaFor(entity))
			}

			p.Group(func(adm chi.Router) {
				adm.Use(auth.RequireRole("admin"))
				adm.Get("/users", usersH.List)
				adm.Post("/users", usersH.Create)
				adm.Get("/users/{id}", usersH.Get)
				adm.Post("/users/{id}/archive", usersH.Archive)
				adm.Post("/users/{id}/roles", usersH.AddRole)
				adm.Delete("/users/{id}/roles/{roleId}", usersH.RemoveRole)

				adm.Get("/roles", rolesH.List)
				adm.Post("/roles", rolesH.Create)
				adm.Get("/roles/{id}", rolesH.Get)
				adm.Patch("/roles/{id}", rolesH.Update)
				adm.Put("/roles/{id}", rolesH.Update)
				adm.Delete("/roles/{id}", rolesH.Delete)

				adm.Post("/students", studentsH.Create)
				adm.Patch("/students/{id}", studentsH.Update)
				adm.Delete("/students/{id}", studentsH.Delete)

				adm.Post("/teachers", teachersH.Create)
				adm.Patch("/teachers/{id}", teachersH.Update)
				adm.Delete("/teachers/{id}", teachersH.Delete)

				adm.Post("/student-teachers", studentTeachersH.Assign)
				adm.Delete("/student-teachers", studentTeachersH.Unassign)
				adm.Delete("/student-teachers/{id}", studentTeachersH.Unassign)
				adm.Put("/students/{id}/teachers", studentTeachersH.SetTeachersForStudent)
				adm.Put("/teachers/{id}/students", studentTeachersH.SetStudentsForTeacher)

				adm.Post("/pencapaian/matrix/import", pencapaianH.MatrixImport)

				adm.Patch("/attendances/{id}", attendancesH.Update)
				adm.Delete("/attendances/{id}", attendancesH.Delete)

				for _, entity := range handler.BulkEntities {
					adm.Post("/"+entity+"/bulk", bulkH.ImportFor(entity))
					adm.Delete("/"+entity+"/bulk", bulkH.DeleteFor(entity))
				}
			})
		})

		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Endpoint tidak ditemukan")
		})
	})

	if !cfg.Dev {
		spa, err := web.Handler(web.Config{
			APIBaseFor: apiBaseResolver(cfg.DynamicAPIPath),
		})
		if err != nil {
			return fmt.Errorf("spa handler: %w", err)
		}
		r.Handle("/*", spa)
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("server starting", "addr", srv.Addr, "dev", cfg.Dev)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("listen", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

// apiBaseResolver returns the function the SPA handler uses to compute the
// per-request API base for index.html substitution. When the dynamic-path
// feature is disabled it always reports the canonical /api prefix.
func apiBaseResolver(enabled bool) func(r *http.Request) string {
	if !enabled {
		return func(*http.Request) string { return "/api" }
	}
	return func(r *http.Request) string {
		if p, ok := auth.ReadAPIPathCookie(r); ok {
			return "/" + p
		}
		return "/api"
	}
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration", time.Since(start).String(),
			"request_id", middleware.GetReqID(r.Context()),
		)
	})
}

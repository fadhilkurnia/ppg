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
	"github.com/fadhilkurnia/ppg-dashboard/internal/config"
	"github.com/fadhilkurnia/ppg-dashboard/internal/handler"
	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
	"github.com/fadhilkurnia/ppg-dashboard/internal/store"
	"github.com/fadhilkurnia/ppg-dashboard/web"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
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

	users := store.NewUsers(db)
	students := store.NewStudents(db)

	if cfg.SeedAdminEmail != "" && cfg.SeedAdminPass != "" {
		if err := store.SeedAdmin(context.Background(), users, cfg.SeedAdminEmail, cfg.SeedAdminUsername, cfg.SeedAdminPass); err != nil {
			return fmt.Errorf("seed admin: %w", err)
		}
	}

	jwtSvc := auth.NewJWT(cfg.JWTSecret, cfg.JWTTTL)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(requestLogger)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		authH := handler.NewAuth(users, jwtSvc, cfg.CookieSecure)
		api.Post("/auth/login", authH.Login)
		api.Post("/auth/logout", authH.Logout)

		authMw := auth.Middleware(jwtSvc)
		api.Group(func(p chi.Router) {
			p.Use(authMw)
			p.Get("/auth/me", authH.Me)

			studentsH := handler.NewStudents(students)
			p.Get("/students", studentsH.List)
			p.Get("/students/{id}", studentsH.Get)

			p.Group(func(adm chi.Router) {
				adm.Use(auth.RequireRole("admin"))
				adm.Post("/students", studentsH.Create)
				adm.Patch("/students/{id}", studentsH.Update)
				adm.Delete("/students/{id}", studentsH.Delete)
			})
		})

		api.NotFound(func(w http.ResponseWriter, r *http.Request) {
			httpx.Error(w, http.StatusNotFound, "not_found", "Endpoint tidak ditemukan")
		})
	})

	if !cfg.Dev {
		spa, err := web.Handler()
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

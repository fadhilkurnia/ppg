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
	"github.com/fadhilkurnia/ppg-dashboard/internal/importer"
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
		case "backfill-emails":
			if err := runBackfillEmails(); err != nil {
				fmt.Fprintln(os.Stderr, "backfill-emails:", err)
				os.Exit(1)
			}
			return
		case "-h", "--help", "help":
			fmt.Println("usage: server                        (start the HTTP server)")
			fmt.Println("       server import-teachers FILE   (import teachers CSV)")
			fmt.Println("       server backfill-emails         (reset every user's email to <nickname>@gnrs.com)")
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

	res, err := importer.Teachers(context.Background(), f, store.NewTeachers(db))
	if err != nil {
		return err
	}
	fmt.Printf("inserted: %d\nskipped:  %d\n", res.Inserted, res.Skipped)
	for _, e := range res.Errors {
		fmt.Printf("  line %d: %v\n", e.Line, e.Err)
	}
	return nil
}

// runBackfillEmails resets every user's email to a slug of their nickname
// (falling back to name) at the default domain, deduplicated with a numeric
// suffix. Idempotent — safe to re-run. See store.Users.BackfillEmails.
func runBackfillEmails() error {
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

	n, err := store.NewUsers(db).BackfillEmails(context.Background())
	if err != nil {
		return err
	}
	fmt.Printf("backfilled emails for %d users (domain: @%s)\n", n, store.DefaultEmailDomain)
	return nil
}

func run() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	if err := os.MkdirAll(cfg.PhotosDir, 0o755); err != nil {
		return fmt.Errorf("create photos dir: %w", err)
	}

	db, err := store.Open(cfg.DatabasePath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	if err := store.Migrate(db); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	// One-time data migration from the renamed legacy students/teachers
	// tables into the unified users table (migration 008). Idempotent.
	migratedStudents, migratedTeachers, err := store.MigrateLegacyData(context.Background(), db)
	if err != nil {
		return fmt.Errorf("migrate legacy data: %w", err)
	}
	if migratedStudents > 0 || migratedTeachers > 0 {
		slog.Info("legacy data migrated to users table",
			"students", migratedStudents,
			"teachers", migratedTeachers,
			"default_password", "changeme")
	}

	tingkatCount, err := store.SeedKurikulum(context.Background(), db)
	if err != nil {
		return fmt.Errorf("seed kurikulum: %w", err)
	}
	slog.Info("kurikulum ready", "tingkat", tingkatCount)

	canonTingkat, foldedRefs, err := store.NormalizeKurikulumAges(context.Background(), db)
	if err != nil {
		return fmt.Errorf("normalize tingkat ages: %w", err)
	}
	if foldedRefs > 0 {
		slog.Info("tingkat normalized to age-based names",
			"canonical_tingkat", canonTingkat, "rewritten_materi_refs", foldedRefs)
	}

	users := store.NewUsers(db)
	students := store.NewStudents(db)
	teachers := store.NewTeachers(db)
	kurikulum := store.NewKurikulum(db)
	sesi := store.NewSesi(db)
	kelas := store.NewKelas(db)
	rencana := store.NewRencana(db)
	sesi.AttachRencana(rencana)
	kelas.AttachSesi(sesi)
	karakter := store.NewKarakter(db)
	haditsStore := store.NewHadits(db)
	doaStore := store.NewDoa(db)
	manqulStore := store.NewManqul(db)
	manqulShareStore := store.NewManqulShare(db)
	tahunAjaran := store.NewTahunAjaran(db)
	bacaan := store.NewBacaan(db)
	pencapaian := store.NewPencapaian(db)
	settings := store.NewSettings(db)
	attendances := store.NewAttendances(db)
	diajarkan := store.NewDiajarkan(db)
	wilayah := store.NewWilayah(db)

	if err := store.SeedKarakter(context.Background(), db); err != nil {
		return fmt.Errorf("seed karakter: %w", err)
	}
	if k, b, h, c, err := store.SeedHadits(context.Background(), db); err != nil {
		return fmt.Errorf("seed hadits: %w", err)
	} else if k > 0 || c > 0 {
		slog.Info("hadits + doa seeded", "kitab", k, "bab", b, "hadits", h, "compact_ajar", c)
	}
	if n, err := store.SeedHaditsHimpunan(context.Background(), db); err != nil {
		return fmt.Errorf("seed hadits himpunan: %w", err)
	} else if n > 0 {
		slog.Info("hadits himpunan seeded", "added", n)
	}
	if n, err := store.SeedInstansiLogo(context.Background(), db); err != nil {
		slog.Warn("seed instansi logo failed", "err", err)
	} else if n > 0 {
		slog.Info("instansi logo seeded")
	}

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
			p.Patch("/auth/me", authH.UpdateMe)
			p.Post("/auth/me/password", authH.SetMyPassword)
			// self-service photo upload/delete; uses claims, no admin role needed
			// (see photosH.UploadMe — defined after Photos handler init below)

			studentsH := handler.NewStudents(students)
			p.Get("/students", studentsH.List)
			p.Get("/students/{id}", studentsH.Get)

			teachersH := handler.NewTeachers(teachers)
			p.Get("/teachers", teachersH.List)
			p.Get("/teachers/{id}", teachersH.Get)

			statsH := handler.NewStats(students, teachers)
			p.Get("/stats/dashboard", statsH.Dashboard)

			kurikulumH := handler.NewKurikulum(kurikulum)
			p.Get("/tingkat", kurikulumH.ListTingkat)
			p.Get("/tingkat/{id}", kurikulumH.GetTingkat)
			p.Get("/materi/ajar", kurikulumH.ListMateriAjar)
			p.Get("/materi/ajar/{id}", kurikulumH.GetMateriAjar)
			p.Get("/materi/ajar/{id}/library-refs", kurikulumH.ListLibraryRefs)
			p.Get("/materi/ajar/{id}/relations", kurikulumH.ListRelations)

			sesiH := handler.NewSesi(sesi, kelas, bacaan, attendances, pencapaian, diajarkan)
			p.Get("/sesi", sesiH.List)
			p.Get("/sesi/{id}", sesiH.Get)
			p.Post("/sesi", sesiH.Create)
			p.Patch("/sesi/{id}", sesiH.Update)
			p.Delete("/sesi/{id}", sesiH.Delete)
			p.Post("/sesi/{id}/start", sesiH.Start)
			p.Post("/sesi/{id}/end", sesiH.End)
			p.Patch("/sesi/{id}/live", sesiH.SetLive)

			diajarkanH := handler.NewDiajarkan(diajarkan)
			p.Get("/sesi/{id}/diajarkan", diajarkanH.List)
			p.Post("/sesi/{id}/diajarkan", diajarkanH.Create)
			p.Patch("/sesi/{id}/diajarkan/{itemId}", diajarkanH.Update)
			p.Delete("/sesi/{id}/diajarkan/{itemId}", diajarkanH.Delete)

			bacaanH := handler.NewBacaan(bacaan, users)
			p.Get("/bacaan", bacaanH.List)
			p.Get("/bacaan/summary", bacaanH.Summary)
			p.Get("/bacaan/per-surah", bacaanH.PerSurah)
			p.Post("/bacaan", bacaanH.Create)
			p.Delete("/bacaan/{id}", bacaanH.Delete)

			pencapaianH := handler.NewPencapaian(pencapaian, users)
			p.Get("/pencapaian", pencapaianH.List)
			p.Get("/pencapaian/library", pencapaianH.ListLibrary)
			p.Post("/pencapaian", pencapaianH.Upsert)
			p.Delete("/pencapaian/{id}", pencapaianH.Delete)

			settingsH := handler.NewSettings(settings)
			p.Get("/settings", settingsH.List)

			attendancesH := handler.NewAttendances(attendances)
			p.Get("/attendances", attendancesH.List)
			p.Get("/attendances/stats", attendancesH.Stats)
			p.Get("/attendances/{id}", attendancesH.Get)
			p.Post("/attendances", attendancesH.Create)
			p.Patch("/attendances/{id}", attendancesH.Update)
			p.Delete("/attendances/{id}", attendancesH.Delete)

			kelasH := handler.NewKelas(kelas)
			p.Get("/kelas", kelasH.List)
			p.Get("/kelas/{id}", kelasH.Get)
			p.Get("/kelas/{id}/anggota", kelasH.ListAnggota)
			p.Get("/kelas/{id}/guru", kelasH.ListGuruAnggota)
			// Jadwal rutin — read open to any authenticated user; writes are
			// admin-or-wali (enforced inside the handlers, not via RequireRole).
			p.Get("/kelas/{id}/jadwal", kelasH.GetJadwal)
			p.Put("/kelas/{id}/jadwal", kelasH.PutJadwal)
			p.Delete("/kelas/{id}/jadwal", kelasH.DeleteJadwal)
			p.Post("/kelas/{id}/jadwal/generate", kelasH.GenerateJadwal)

			rencanaH := handler.NewRencana(rencana)
			p.Get("/rencana-bulanan", rencanaH.List)
			p.Get("/rencana-bulanan/{id}", rencanaH.Get)

			karakterH := handler.NewKarakter(karakter)
			p.Get("/karakter-luhur", karakterH.List)

			haditsH := handler.NewHadits(haditsStore)
			p.Get("/hadits/kitab", haditsH.ListKitab)
			p.Get("/hadits/kitab/{slug}", haditsH.GetKitab)
			p.Get("/hadits/kitab/{slug}/bab", haditsH.ListBab)
			p.Get("/hadits/kitab/{slug}/hadits", haditsH.ListHadits)

			quranH := handler.NewQuran()
			p.Get("/quran/translations", quranH.Translations)
			p.Get("/quran/surahs", quranH.Surahs)
			p.Get("/quran/surahs/{id}", quranH.Surah)
			p.Get("/quran/pages/{n}", quranH.Page)

			doaH := handler.NewDoa(doaStore)
			p.Get("/compact-ajar", doaH.List)
			p.Get("/compact-ajar/{id}", doaH.Get)

			manqulH := handler.NewManqul(manqulStore)
			p.Get("/quran/manqul-notes", manqulH.List)
			p.Post("/quran/manqul-notes", manqulH.Upsert)

			manqulShareH := handler.NewManqulShare(manqulShareStore, users)
			p.Get("/quran/manqul-shares/available", manqulShareH.Available)
			p.Get("/quran/manqul-shares/shared", manqulShareH.Shared)
			p.Get("/quran/manqul-shares/mine", manqulShareH.Mine)
			p.Post("/quran/manqul-shares", manqulShareH.Set)
			p.Get("/quran/manqul-recipients", manqulShareH.SearchRecipients)

			tahunAjaranH := handler.NewTahunAjaran(tahunAjaran)
			p.Get("/tahun-ajaran", tahunAjaranH.List)
			p.Get("/tahun-ajaran/active", tahunAjaranH.Active)

			wilayahH := handler.NewWilayah(wilayah)
			p.Get("/wilayah", wilayahH.Tree)

			usersH := handler.NewUsers(users)
			photosH := handler.NewPhotos(users, cfg.PhotosDir)
			p.Get("/files/photos/{filename}", photosH.Serve)
			p.Post("/auth/me/photo", photosH.UploadMe)
			p.Delete("/auth/me/photo", photosH.DeleteMe)

			p.Group(func(adm chi.Router) {
				adm.Use(auth.RequireRole("admin"))
				adm.Post("/students", studentsH.Create)
				adm.Patch("/students/{id}", studentsH.Update)
				adm.Delete("/students/{id}", studentsH.Delete)

				adm.Post("/teachers", teachersH.Create)
				adm.Patch("/teachers/{id}", teachersH.Update)
				adm.Delete("/teachers/{id}", teachersH.Delete)

				adm.Post("/wilayah/daerah", wilayahH.CreateDaerah)
				adm.Patch("/wilayah/daerah/{id}", wilayahH.RenameDaerah)
				adm.Delete("/wilayah/daerah/{id}", wilayahH.DeleteDaerah)
				adm.Post("/wilayah/daerah/{daerahId}/desa", wilayahH.CreateDesa)
				adm.Patch("/wilayah/desa/{id}", wilayahH.RenameDesa)
				adm.Delete("/wilayah/desa/{id}", wilayahH.DeleteDesa)
				adm.Post("/wilayah/desa/{desaId}/kelompok", wilayahH.CreateKelompok)
				adm.Patch("/wilayah/kelompok/{id}", wilayahH.RenameKelompok)
				adm.Delete("/wilayah/kelompok/{id}", wilayahH.DeleteKelompok)

				adm.Post("/tingkat", kurikulumH.CreateTingkat)
				adm.Patch("/tingkat/{id}", kurikulumH.UpdateTingkat)
				adm.Delete("/tingkat/{id}", kurikulumH.DeleteTingkat)

				adm.Post("/materi/ajar", kurikulumH.CreateMateriAjar)
				adm.Patch("/materi/ajar/{id}", kurikulumH.UpdateMateriAjar)
				adm.Delete("/materi/ajar/{id}", kurikulumH.DeleteMateriAjar)
				adm.Delete("/materi/ajar/by-tema/{tema}", kurikulumH.DeleteTema)
				adm.Delete("/materi/ajar/by-tema/{tema}/sub/{subTema}", kurikulumH.DeleteSubTema)
				adm.Post("/materi/ajar/{id}/library-refs", kurikulumH.AddLibraryRef)
				adm.Delete("/materi/ajar/{id}/library-refs/{refId}", kurikulumH.DeleteLibraryRef)
				adm.Post("/materi/ajar/{id}/relations", kurikulumH.AddRelation)
				adm.Delete("/materi/ajar/{id}/relations/{otherId}", kurikulumH.DeleteRelation)

				adm.Get("/users", usersH.List)
				adm.Post("/users", usersH.Create)
				adm.Get("/users/{id}", usersH.Get)
				adm.Patch("/users/{id}", usersH.Update)
				adm.Delete("/users/{id}", usersH.Delete)
				adm.Post("/users/{id}/password", usersH.SetPassword)
				adm.Post("/users/{id}/photo", photosH.Upload)
				adm.Delete("/users/{id}/photo", photosH.Delete)

				adm.Post("/kelas", kelasH.Create)
				adm.Patch("/kelas/{id}", kelasH.Update)
				adm.Delete("/kelas/{id}", kelasH.Delete)
				adm.Post("/kelas/{id}/anggota", kelasH.AddAnggota)
				adm.Delete("/kelas/{id}/anggota/{muridId}", kelasH.RemoveAnggota)
				adm.Post("/kelas/{id}/guru", kelasH.AddGuruAnggota)
				adm.Delete("/kelas/{id}/guru/{guruId}", kelasH.RemoveGuruAnggota)

				adm.Post("/rencana-bulanan", rencanaH.Create)
				adm.Delete("/rencana-bulanan/{id}", rencanaH.Delete)
				adm.Post("/rencana-bulanan/{id}/items", rencanaH.AddItems)
				adm.Post("/rencana-bulanan/{id}/items/library", rencanaH.AddLibraryItem)
				adm.Patch("/rencana-bulanan/items/{itemId}", rencanaH.ToggleItem)
				adm.Delete("/rencana-bulanan/items/{itemId}", rencanaH.RemoveItem)

				adm.Post("/karakter-luhur", karakterH.Create)
				adm.Patch("/karakter-luhur/{id}", karakterH.Update)
				adm.Delete("/karakter-luhur/{id}", karakterH.Delete)
				adm.Patch("/karakter-luhur/groups/{parent}", karakterH.RenameGroup)
				adm.Delete("/karakter-luhur/groups/{parent}", karakterH.DeleteGroup)

				adm.Post("/compact-ajar", doaH.Create)
				adm.Patch("/compact-ajar/{id}", doaH.Update)
				adm.Delete("/compact-ajar/{id}", doaH.Delete)

				adm.Patch("/settings", settingsH.Update)

				adm.Post("/hadits/kitab", haditsH.CreateKitab)
				adm.Patch("/hadits/kitab/{slug}", haditsH.UpdateKitab)
				adm.Delete("/hadits/kitab/{slug}", haditsH.DeleteKitab)

				adm.Post("/tahun-ajaran", tahunAjaranH.Create)
				adm.Patch("/tahun-ajaran/{id}", tahunAjaranH.Update)
				adm.Delete("/tahun-ajaran/{id}", tahunAjaranH.Delete)
				adm.Post("/tahun-ajaran/{id}/activate", tahunAjaranH.SetActive)
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

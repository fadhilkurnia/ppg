package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/fadhilkurnia/ppg-dashboard/internal/httpx"
)

// Quran proxies quran.com's public API. Responses are cached in-memory with
// a TTL so repeated SPA navigations don't hammer the upstream. No database
// storage — the full Mushaf lives on quran.com.
type Quran struct {
	base   string
	client *http.Client
	mu     sync.RWMutex
	cache  map[string]quranEntry
}

type quranEntry struct {
	data any
	at   time.Time
}

const quranTTL = 6 * time.Hour

// Default Indonesian Kemenag translation id from quran.com.
const defaultTranslation = "33"

// Curated translation list exposed to the FE — keep in sync with frontend
// dropdown labels.
var quranTranslations = []map[string]any{
	{"id": 33, "code": "id-kemenag", "label": "Indonesia — Kemenag", "lang": "id"},
	{"id": 134, "code": "id-islamhouse", "label": "Indonesia — IslamHouse", "lang": "id"},
	{"id": 20, "code": "en-sahih", "label": "English — Sahih International", "lang": "en"},
	{"id": 19, "code": "en-pickthall", "label": "English — Pickthall", "lang": "en"},
	{"id": 85, "code": "en-haleem", "label": "English — Abdel Haleem", "lang": "en"},
	{"id": 57, "code": "ms-basmeih", "label": "Malay — Abdullah Basmeih", "lang": "ms"},
}

func NewQuran() *Quran {
	base := "https://api.quran.com/api/v4"
	return &Quran{
		base:   base,
		client: &http.Client{Timeout: 15 * time.Second},
		cache:  map[string]quranEntry{},
	}
}

func (q *Quran) cachedGet(ctx context.Context, path string) (any, error) {
	q.mu.RLock()
	if e, ok := q.cache[path]; ok && time.Since(e.at) < quranTTL {
		q.mu.RUnlock()
		return e.data, nil
	}
	q.mu.RUnlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, q.base+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	res, err := q.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		body, _ := io.ReadAll(res.Body)
		return nil, &httpUpstreamErr{status: res.StatusCode, body: string(body)}
	}
	var data any
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	q.mu.Lock()
	q.cache[path] = quranEntry{data: data, at: time.Now()}
	q.mu.Unlock()
	return data, nil
}

type httpUpstreamErr struct {
	status int
	body   string
}

func (e *httpUpstreamErr) Error() string {
	return "quran.com upstream " + http.StatusText(e.status)
}

// Translations exposes the curated list of translation IDs.
func (q *Quran) Translations(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, quranTranslations)
}

// Surahs returns the chapter list (114 entries).
func (q *Quran) Surahs(w http.ResponseWriter, r *http.Request) {
	data, err := q.cachedGet(r.Context(), "/chapters?language=id")
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "upstream", "Gagal mengambil daftar surat")
		return
	}
	// Repackage to a flat list with the fields the FE needs.
	body, ok := data.(map[string]any)
	if !ok {
		httpx.JSON(w, http.StatusOK, []any{})
		return
	}
	chapters, _ := body["chapters"].([]any)
	out := make([]map[string]any, 0, len(chapters))
	for _, c := range chapters {
		m, ok := c.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, map[string]any{
			"id":              m["id"],
			"nama":            m["name_simple"],
			"namaArab":        m["name_arabic"],
			"namaTerjemahan":  m["translated_name"],
			"jumlahAyat":      m["verses_count"],
			"revelationPlace": m["revelation_place"],
			// quran.com returns the mushaf page range as `pages: [start, end]`.
			// Expose it as paginasi for the mushaf reader's surah-jump dropdown.
			"paginasi": m["pages"],
		})
	}
	httpx.JSON(w, http.StatusOK, out)
}

// Page returns all verses on a mushaf page (1-604) with translation and
// optional word-by-word breakdown. Used by the mushaf reader.
//
// Query params:
//   - translations: comma-separated translation IDs (default 33 / Kemenag)
//   - words: "true" to include perKata word-by-word array (default false)
//   - wordTrans: word-by-word translation language code (default "id")
func (q *Quran) Page(w http.ResponseWriter, r *http.Request) {
	pageNum := chi.URLParam(r, "n")
	if pageNum == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Page wajib")
		return
	}
	qry := r.URL.Query()
	tr := strings.TrimSpace(qry.Get("translations"))
	if tr == "" {
		tr = defaultTranslation
	}
	wantWords := qry.Get("words") == "true"
	wordTrans := qry.Get("wordTrans")
	if wordTrans == "" {
		wordTrans = "id"
	}
	// quran.com keys the per-word glosses off the `language` param (NOT
	// `word_translation_language`, which it ignores here), so drive `language`
	// from the requested word-by-word language. Defaults to "id".
	url := "/verses/by_page/" + pageNum +
		"?language=" + wordTrans + "&translations=" + tr +
		"&fields=text_uthmani,verse_key,page_number,juz_number&per_page=50"
	if wantWords {
		url += "&words=true&word_fields=text_uthmani,translation,transliteration&word_translation_language=" + wordTrans
	}
	data, err := q.cachedGet(r.Context(), url)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "upstream", "Gagal mengambil halaman mushaf")
		return
	}
	body, _ := data.(map[string]any)
	versesList, _ := body["verses"].([]any)
	slim := make([]map[string]any, 0, len(versesList))
	for _, vAny := range versesList {
		v, ok := vAny.(map[string]any)
		if !ok {
			continue
		}
		// Translations is an array — return all so FE can show multiple.
		tList, _ := v["translations"].([]any)
		var trList []map[string]any
		for _, tItem := range tList {
			if tm, ok := tItem.(map[string]any); ok {
				trList = append(trList, map[string]any{
					"id":   tm["resource_id"],
					"teks": tm["text"],
				})
			}
		}
		var words []map[string]any
		if wantWords {
			if wList, ok := v["words"].([]any); ok {
				for _, wAny := range wList {
					wm, ok := wAny.(map[string]any)
					if !ok {
						continue
					}
					var tj, tl string
					if t, ok := wm["translation"].(map[string]any); ok {
						if s, ok := t["text"].(string); ok {
							tj = s
						}
					}
					if t, ok := wm["transliteration"].(map[string]any); ok {
						if s, ok := t["text"].(string); ok {
							tl = s
						}
					}
					words = append(words, map[string]any{
						"arab":           wm["text_uthmani"],
						"terjemahan":     tj,
						"transliterasi":  tl,
					})
				}
			}
		}
		slim = append(slim, map[string]any{
			"id":          v["id"],
			"kunciAyat":   v["verse_key"],
			"halaman":     v["page_number"],
			"juz":         v["juz_number"],
			"arab":        v["text_uthmani"],
			"terjemahan":  trList,
			"perKata":     words,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"halaman": atoi(pageNum),
		"ayat":    slim,
	})
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// Surah returns one chapter's metadata + verses with translation.
// Query params:
//   - translation: comma-separated translation IDs (default 33 / Kemenag)
//   - language: UI language code (defaults to "id")
func (q *Quran) Surah(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "bad_request", "Surah id wajib")
		return
	}
	q.Get(r.Context(), id, r.URL.Query(), w)
}

func (q *Quran) Get(ctx context.Context, surahID string, query url.Values, w http.ResponseWriter) {
	tr := query.Get("translation")
	if strings.TrimSpace(tr) == "" {
		tr = defaultTranslation
	}
	lang := query.Get("language")
	if lang == "" {
		lang = "id"
	}
	// chapter meta
	meta, err := q.cachedGet(ctx, "/chapters/"+surahID+"?language="+lang)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "upstream", "Gagal mengambil surat")
		return
	}
	// verses with translation
	verses, err := q.cachedGet(ctx,
		"/verses/by_chapter/"+surahID+"?language="+lang+"&fields=text_uthmani,verse_key,verse_number&words=false&translations="+tr+"&per_page=300",
	)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "upstream", "Gagal mengambil ayat")
		return
	}
	// Slim payload for FE.
	metaBody, _ := meta.(map[string]any)
	chapter, _ := metaBody["chapter"].(map[string]any)
	versesBody, _ := verses.(map[string]any)
	versesList, _ := versesBody["verses"].([]any)
	slimVerses := make([]map[string]any, 0, len(versesList))
	for _, vAny := range versesList {
		v, ok := vAny.(map[string]any)
		if !ok {
			continue
		}
		// Translations is an array — collect text.
		var translation string
		if tList, ok := v["translations"].([]any); ok {
			for _, tItem := range tList {
				if tm, ok := tItem.(map[string]any); ok {
					if txt, ok := tm["text"].(string); ok && txt != "" {
						translation = txt
						break
					}
				}
			}
		}
		slimVerses = append(slimVerses, map[string]any{
			"id":          v["id"],
			"verseKey":    v["verse_key"],
			"verseNumber": v["verse_number"],
			"textUthmani": v["text_uthmani"],
			"translation": translation,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"chapter": chapter,
		"verses":  slimVerses,
	})
}

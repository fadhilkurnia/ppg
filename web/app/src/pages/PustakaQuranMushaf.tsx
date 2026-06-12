import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Languages, PencilLine, Save, Search, Share2, X } from 'lucide-react'

import {
  getQuranPage,
  getSharedManqul,
  listAvailableManqulSources,
  listManqulNotes,
  listMyShareRecipients,
  listQuranSurahs,
  listQuranTranslations,
  searchManqulRecipients,
  setManqulShare,
  upsertManqulNote,
  type ManqulNote,
  type ManqulRecipientCandidate,
  type ManqulSource,
  type QuranAyah,
  type QuranPageResponse,
  type QuranSurah,
  type QuranTranslation,
  type QuranTranslationText,
  type ShareRecipient,
} from '@/api/quran'
import { LibraryShell } from '@/components/LibraryShell'
import { cn } from '@/lib/cn'

const TOTAL_PAGES = 604
const MANQUL_AYAH_IDX = -1
// Translation-dropdown value for a shared manqul source: `manqul:<ownerUserId>`.
const MANQUL_SOURCE_PREFIX = 'manqul:'

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return desktop
}

/**
 * PustakaQuranMushaf — mushaf-style Qur'an viewer ported from sitrac-v3 with
 * matching cream/gold paper styling and the Amiri Arabic typeface. Full-
 * screen layout: only a floating back arrow and bottom toolbar; no PageShell
 * title to maximise reading area.
 *
 * Desktop spreads two pages (right page = lower number, RTL flow); mobile
 * shows one page at a time. Manqul mode enables per-ayah note taking; notes
 * are persisted via /api/quran/manqul-notes.
 */
export function PustakaQuranMushafPage({
  surahId: surahIdProp,
  embedded = false,
}: { surahId?: string; embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const params = useParams()
  const surahId = surahIdProp ?? params.surahId
  const [currentPage, setCurrentPage] = useState(1)
  const [translationIds, setTranslationIds] = useState<string>('20') // English — Sahih International
  const [manqulMode, setManqulMode] = useState(false)
  const [wordByWord, setWordByWord] = useState(false)
  const [popup, setPopup] = useState<QuranAyah | null>(null)
  const [fontSize, setFontSize] = useState(26)
  const isDesktop = useIsDesktop()

  const { data: surahs = [] } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 24 * 60 * 60 * 1000,
  })
  const { data: translations = [] } = useQuery({
    queryKey: ['quran-translations'],
    queryFn: listQuranTranslations,
    staleTime: 24 * 60 * 60 * 1000,
  })

  // Auto-jump on /pustaka/quran/:id deep link.
  const jumpedRef = useRef(false)
  useEffect(() => {
    if (jumpedRef.current) return
    if (!surahId || surahs.length === 0) return
    const n = Number(surahId)
    if (!Number.isFinite(n) || n < 1 || n > 114) return
    const target = surahs.find((s) => s.id === n)
    if (target?.paginasi?.[0]) {
      setCurrentPage(target.paginasi[0])
      jumpedRef.current = true
    }
  }, [surahId, surahs])

  // RTL spread convention: right page = odd (lower number), left = even.
  const rightPage = useMemo(() => {
    if (!isDesktop) return currentPage
    return currentPage % 2 === 1 ? currentPage : currentPage - 1
  }, [currentPage, isDesktop])
  const leftPage = isDesktop ? Math.min(rightPage + 1, TOTAL_PAGES) : null

  const jumpPage = useCallback(
    (n: number) => setCurrentPage(Math.max(1, Math.min(TOTAL_PAGES, n))),
    [],
  )
  const nextSpread = useCallback(
    () => jumpPage(currentPage + (isDesktop ? 2 : 1)),
    [currentPage, isDesktop, jumpPage],
  )
  const prevSpread = useCallback(
    () => jumpPage(currentPage - (isDesktop ? 2 : 1)),
    [currentPage, isDesktop, jumpPage],
  )

  // Keyboard nav (RTL): ArrowLeft = NEXT, ArrowRight = PREV.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (e.key === 'Escape' && popup) {
        setPopup(null)
        return
      }
      if (popup) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nextSpread()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        prevSpread()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nextSpread, prevSpread, popup])

  // Swipe (mobile).
  useEffect(() => {
    if (isDesktop) return
    let startX = 0
    let startY = 0
    let moved = false
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      moved = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true
    }
    const onEnd = (e: TouchEvent) => {
      if (!moved) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
      if (dx < 0) nextSpread()
      else prevSpread()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [isDesktop, nextSpread, prevSpread])

  const currentSurah = useMemo(
    () => surahs.find((s) => s.paginasi && currentPage >= s.paginasi[0] && currentPage <= s.paginasi[1]),
    [surahs, currentPage],
  )

  // Shared-manqul sources others have exposed to me for the current surah —
  // these become extra "{name}'s Manqul" entries in the translation dropdown.
  const surahNum = currentSurah ? String(currentSurah.id) : ''
  const { data: manqulSources = [] } = useQuery({
    queryKey: ['manqul-sources', surahNum],
    queryFn: () => listAvailableManqulSources(surahNum),
    enabled: !!surahNum,
    staleTime: 60_000,
  })

  // If the selected source vanishes (navigated to a surah where nobody shared
  // with me), fall back to the default translation so the dropdown stays valid.
  useEffect(() => {
    if (!translationIds.startsWith(MANQUL_SOURCE_PREFIX)) return
    if (!surahNum) return
    const owner = translationIds.slice(MANQUL_SOURCE_PREFIX.length)
    if (manqulSources.length > 0 && !manqulSources.some((m) => m.ownerUserId === owner)) {
      setTranslationIds('33')
    }
  }, [translationIds, manqulSources, surahNum])

  return (
    <LibraryShell backTo="/pustaka" bgClassName="bg-[#f0ece0]" hideBack={embedded}>
      {/* Top floating toolbar — sits below the back-button. */}
      <div className="sticky top-0 z-30 flex justify-center px-2 pt-3">
        <Toolbar
          surahs={surahs}
          currentSurah={currentSurah}
          currentPage={currentPage}
          translations={translations}
          translationIds={translationIds}
          setTranslationIds={setTranslationIds}
          manqulSources={manqulSources}
          manqulMode={manqulMode}
          setManqulMode={setManqulMode}
          wordByWord={wordByWord}
          setWordByWord={setWordByWord}
          fontSize={fontSize}
          setFontSize={setFontSize}
          onJumpSurah={(s) => s.paginasi && setCurrentPage(s.paginasi[0])}
          onJumpPage={jumpPage}
        />
      </div>

      {/* Mushaf spread. Desktop = 2-col grid (no wrap). Mobile = single. */}
      <div
        className={cn(
          'mx-auto max-w-[1400px] px-3 pb-24 pt-3',
          isDesktop && leftPage ? 'grid grid-cols-2 gap-4' : 'flex justify-center',
        )}
      >
        {isDesktop && leftPage && leftPage !== rightPage ? (
          <MushafPage
            pageNum={leftPage}
            translationIds={translationIds}
            translations={translations}
            manqulMode={manqulMode}
            wordByWord={wordByWord}
            fontSize={fontSize}
            onClickAyah={setPopup}
          />
        ) : null}
        <MushafPage
          pageNum={rightPage}
          translationIds={translationIds}
          translations={translations}
          manqulMode={manqulMode}
          wordByWord={wordByWord}
          fontSize={fontSize}
          onClickAyah={setPopup}
        />
      </div>

      {/* Floating bottom nav. */}
      <div className="sticky bottom-3 z-30 mx-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={prevSpread}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          title={t('pustaka.quran.tbPrev')}
        >
          <ChevronLeft size={14} /> {t('pustaka.quran.tbBack')}
        </button>
        <span className="px-2 text-xs font-medium tabular-nums text-slate-700">
          {leftPage && leftPage !== rightPage
            ? t('pustaka.quran.tbPageRange', { right: rightPage, left: leftPage, total: TOTAL_PAGES })
            : t('pustaka.quran.tbPageNum', { right: rightPage, total: TOTAL_PAGES })}
        </span>
        <button
          type="button"
          onClick={nextSpread}
          disabled={currentPage >= TOTAL_PAGES}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          title={t('pustaka.quran.tbNext')}
        >
          {t('pustaka.quran.tbForward')} <ChevronRight size={14} />
        </button>
      </div>

      {popup ? (
        <AyahPopup
          ayah={popup}
          translations={translations}
          manqulMode={manqulMode}
          onClose={() => setPopup(null)}
        />
      ) : null}
    </LibraryShell>
  )
}

// ---------------------------------------------------------------------------

function Toolbar({
  surahs,
  currentSurah,
  currentPage,
  translations,
  translationIds,
  setTranslationIds,
  manqulSources,
  manqulMode,
  setManqulMode,
  wordByWord,
  setWordByWord,
  fontSize,
  setFontSize,
  onJumpSurah,
  onJumpPage,
}: {
  surahs: QuranSurah[]
  currentSurah?: QuranSurah
  currentPage: number
  translations: QuranTranslation[]
  translationIds: string
  setTranslationIds: (v: string) => void
  manqulSources: ManqulSource[]
  manqulMode: boolean
  setManqulMode: (v: boolean) => void
  wordByWord: boolean
  setWordByWord: (v: boolean) => void
  fontSize: number
  setFontSize: (n: number) => void
  onJumpSurah: (s: QuranSurah) => void
  onJumpPage: (n: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-auto flex w-full max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full border border-amber-300 bg-amber-50/95 px-2 py-1.5 shadow-lg backdrop-blur sm:w-auto sm:flex-wrap sm:gap-2 sm:px-3">
      <select
        value={currentSurah?.id ?? ''}
        onChange={(e) => {
          const s = surahs.find((x) => x.id === Number(e.target.value))
          if (s) onJumpSurah(s)
        }}
        className="h-8 min-w-0 max-w-[7rem] shrink truncate rounded-full border border-amber-200 bg-white px-2 text-xs sm:max-w-[180px]"
      >
        <option value="">{t('pustaka.quran.tbSelectSurat')}</option>
        {surahs.map((s) => (
          <option key={s.id} value={s.id}>
            {t('pustaka.quran.tbSurahOpt', { id: s.id, nama: s.nama })}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        max={TOTAL_PAGES}
        value={currentPage}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onJumpPage(n)
        }}
        className="h-8 w-12 shrink-0 rounded-full border border-amber-200 bg-white px-2 text-center text-xs tabular-nums sm:w-16"
        title={t('pustaka.quran.tbJumpPageTitle')}
      />
      <select
        value={translationIds}
        onChange={(e) => setTranslationIds(e.target.value)}
        className="h-8 min-w-0 max-w-[5.5rem] shrink truncate rounded-full border border-amber-200 bg-white px-2 text-xs sm:max-w-[180px]"
        title={t('pustaka.quran.tbTranslationTitle')}
      >
        {translations.map((tr) => (
          <option key={tr.id} value={String(tr.id)}>
            {tr.label}
          </option>
        ))}
        {manqulSources.length > 0 ? (
          <optgroup label={t('pustaka.quran.tbManqulSourceGroup')}>
            {manqulSources.map((m) => (
              <option key={m.ownerUserId} value={`${MANQUL_SOURCE_PREFIX}${m.ownerUserId}`}>
                {t('pustaka.quran.tbManqulSourceOpt', { name: m.ownerName, count: m.ayatCount })}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs">
        <button
          type="button"
          onClick={() => setFontSize(Math.max(18, fontSize - 2))}
          className="px-1 text-slate-600 hover:text-slate-900"
          aria-label={t('pustaka.quran.tbShrinkAria')}
        >
          A−
        </button>
        <span className="tabular-nums text-slate-500">{fontSize}</span>
        <button
          type="button"
          onClick={() => setFontSize(Math.min(48, fontSize + 2))}
          className="px-1 text-slate-600 hover:text-slate-900"
          aria-label={t('pustaka.quran.tbGrowAria')}
        >
          A+
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          const next = !wordByWord
          setWordByWord(next)
          if (next) setManqulMode(false)
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition sm:px-3',
          wordByWord
            ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
            : 'border-amber-200 bg-white text-slate-700 hover:bg-amber-100',
        )}
        title={t('pustaka.quran.tbWordTitle')}
        aria-pressed={wordByWord}
      >
        <Languages size={12} className="shrink-0" />
        <span className="hidden sm:inline">
          {wordByWord ? t('pustaka.quran.tbWordOn') : t('pustaka.quran.tbWord')}
        </span>
        <span className="sm:hidden">{t('pustaka.quran.tbWordShort')}{wordByWord ? '✓' : ''}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          const next = !manqulMode
          setManqulMode(next)
          if (next) setWordByWord(false)
        }}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition sm:px-3',
          manqulMode
            ? 'border-violet-400 bg-violet-100 text-violet-800'
            : 'border-amber-200 bg-white text-slate-700 hover:bg-amber-100',
        )}
        title={t('pustaka.quran.tbManqulTitle')}
        aria-pressed={manqulMode}
      >
        <PencilLine size={12} className="shrink-0" />
        <span className="hidden sm:inline">{manqulMode ? t('pustaka.quran.tbManqulOn') : t('pustaka.quran.tbManqul')}</span>
        <span className="sm:hidden">M{manqulMode ? '✓' : ''}</span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MushafPage({
  pageNum,
  translationIds,
  translations,
  manqulMode,
  wordByWord,
  fontSize,
  onClickAyah,
}: {
  pageNum: number
  translationIds: string
  translations: QuranTranslation[]
  manqulMode: boolean
  wordByWord: boolean
  fontSize: number
  onClickAyah: (a: QuranAyah) => void
}) {
  const { t } = useTranslation()
  // A shared-manqul source is selected when the dropdown value is
  // `manqul:<ownerUserId>`. The page still loads against a real quran.com
  // translation; the manqul overlay (below) replaces what's displayed.
  const manqulOwner = translationIds.startsWith(MANQUL_SOURCE_PREFIX)
    ? translationIds.slice(MANQUL_SOURCE_PREFIX.length)
    : null
  const baseTranslation = manqulOwner ? '33' : translationIds
  // Word-by-word glosses follow the selected translation's language (en/id/ms),
  // not a hardcoded one. Manqul note-taking stays Indonesian (base '33').
  const wordLang = translations.find((tr) => String(tr.id) === baseTranslation)?.lang ?? 'id'
  // Fetch the per-word breakdown when a word-level view is active (manqul
  // note-taking, read-only word-by-word, or a shared-manqul source whose
  // per-word glosses we overlay). It's ~5x bigger, so lazy-load it.
  const wantWords = manqulMode || wordByWord || !!manqulOwner
  const { data, isPending } = useQuery<QuranPageResponse>({
    queryKey: ['quran-page', pageNum, baseTranslation, wantWords, wordLang],
    queryFn: () =>
      getQuranPage(pageNum, {
        translations: baseTranslation,
        words: wantWords,
        wordTrans: wordLang,
      }),
    staleTime: 60 * 60 * 1000,
  })

  // When a shared-manqul source is selected, fetch that owner's notes for the
  // ayat on this page (only ones shared with me come back) and overlay them.
  const ayatKeys = useMemo(() => (data?.ayat ?? []).map((a) => a.kunciAyat), [data])
  const { data: sharedNotes = [] } = useQuery({
    queryKey: ['manqul-shared', manqulOwner, ayatKeys.join(',')],
    queryFn: () => getSharedManqul(manqulOwner as string, ayatKeys),
    enabled: !!manqulOwner && ayatKeys.length > 0,
    staleTime: 60_000,
  })

  // displayAyat = the page's ayat with the sharer's manqul overlaid (verse
  // translation ← per-ayah note, each word's gloss ← per-word note). Without a
  // manqul source it's just the raw ayat. Manqul note-taking mode ignores this
  // (it always edits the viewer's own notes against the raw ayat).
  const displayAyat = useMemo<QuranAyah[]>(() => {
    const ayat = data?.ayat ?? []
    if (!manqulOwner) return ayat
    const byAyah = new Map<string, { perAyah?: string; words: Map<number, string> }>()
    for (const n of sharedNotes) {
      let e = byAyah.get(n.kunciAyat)
      if (!e) {
        e = { words: new Map() }
        byAyah.set(n.kunciAyat, e)
      }
      if (n.wordIdx === MANQUL_AYAH_IDX) e.perAyah = n.teks
      else if (n.wordIdx >= 0) e.words.set(n.wordIdx, n.teks)
    }
    return ayat.map((a) => {
      const e = byAyah.get(a.kunciAyat)
      return {
        ...a,
        // Empty → no verse-translation block / blank popup for ayat the sharer
        // didn't annotate (honest; the dropdown shows their shared-ayat count).
        terjemahan: e?.perAyah ? [{ id: 0, teks: e.perAyah }] : [],
        perKata: (a.perKata ?? []).map((wd, idx) => ({ ...wd, terjemahan: e?.words.get(idx) })),
      }
    })
  }, [data, manqulOwner, sharedNotes])

  return (
    <div className="mushaf-page">
      <div className="mb-3 flex items-center justify-between text-xs text-[#8b7355]">
        <span>{t('pustaka.quran.pageLabel', { n: pageNum })}</span>
        {data?.ayat[0] ? <span>{t('pustaka.quran.juzLabel', { n: data.ayat[0].juz })}</span> : null}
      </div>
      {isPending ? (
        <p className="py-10 text-center text-sm text-slate-500">{t('pustaka.quran.loadingPage', { n: pageNum })}</p>
      ) : manqulMode ? (
        // Manqul mode — every Arabic WORD gets its own translation chip and
        // an inline note input. Per-ayah note also stays available at the
        // bottom of each ayah block.
        <div className="space-y-4">
          {data?.ayat.map((ayah) => (
            <ManqulAyahBlock
              key={ayah.kunciAyat}
              ayah={ayah}
              fontSize={fontSize}
              onClickAyah={onClickAyah}
            />
          ))}
        </div>
      ) : wordByWord ? (
        // Word-by-word mode — read-only: every Arabic word is shown with its
        // transliteration and translation, no note inputs (that's manqul mode).
        // With a shared-manqul source selected, the glosses are the sharer's.
        <div className="space-y-4">
          {displayAyat.map((ayah) => (
            <WordByWordAyahBlock
              key={ayah.kunciAyat}
              ayah={ayah}
              fontSize={fontSize}
              onClickAyah={onClickAyah}
            />
          ))}
        </div>
      ) : (
        <div
          lang="ar"
          dir="rtl"
          className="font-arab text-justify"
          style={{ fontSize, lineHeight: 2.3, color: '#1a1512', padding: '4px 6px' }}
        >
          {displayAyat.map((ayah, i) => (
            <span
              key={ayah.kunciAyat}
              onClick={() => onClickAyah(ayah)}
              title={t('pustaka.quran.ayahTitle', { key: ayah.kunciAyat })}
              className="cursor-pointer rounded px-0.5 transition hover:bg-amber-200/40"
            >
              {i > 0 ? ' ' : ''}
              {ayah.arab}
              <AyahMark nomor={Number(ayah.kunciAyat.split(':')[1])} />
            </span>
          ))}
        </div>
      )}
      <div
        className="mt-4 border-t pt-2 text-center text-xs"
        style={{ borderColor: '#cbb58e', color: '#8b7355', fontFamily: 'system-ui' }}
      >
        — {pageNum} —
      </div>
    </div>
  )
}

/**
 * WordByWordAyahBlock — read-only per-word translation for a single ayah.
 *
 * Mirrors the manqul layout (Arabic word + transliteration + translation in
 * an RTL flex-wrap grid) but without the per-word note inputs, so it's a
 * lightweight "what does each word mean" view. The header stays clickable to
 * open the full-verse translation popup.
 */
function WordByWordAyahBlock({
  ayah,
  fontSize,
  onClickAyah,
}: {
  ayah: QuranAyah
  fontSize: number
  onClickAyah: (a: QuranAyah) => void
}) {
  const { t } = useTranslation()
  const ayahNum = Number(ayah.kunciAyat.split(':')[1])
  const words = ayah.perKata && ayah.perKata.length > 0 ? ayah.perKata : []
  // Page endpoint returns terjemahan as an array (by-id returns a bare string;
  // empty/no translation can arrive as null). Normalise all three to a list.
  const verseTranslations: QuranTranslationText[] = Array.isArray(ayah.terjemahan)
    ? ayah.terjemahan
    : typeof ayah.terjemahan === 'string' && ayah.terjemahan
      ? [{ id: 0, teks: ayah.terjemahan }]
      : []

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onClickAyah(ayah)}
          className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 transition hover:underline"
          title={t('pustaka.quran.ayahViewTitle', { key: ayah.kunciAyat })}
        >
          <AyahMark nomor={ayahNum} />
          <span>QS {ayah.kunciAyat}</span>
        </button>
      </div>

      <div dir="rtl" className="flex flex-wrap items-stretch gap-2 rounded-md bg-white/60 p-2">
        {words.map((w, idx) => (
          <div
            key={`${ayah.kunciAyat}-${idx}`}
            className="flex min-w-[84px] flex-col items-center gap-0.5 rounded-md border border-emerald-100 bg-white px-2 py-1.5"
          >
            <span
              className="font-arab text-center text-slate-900"
              style={{ fontSize: Math.max(20, fontSize - 4), lineHeight: 1.6 }}
            >
              {w.arab}
            </span>
            {w.transliterasi ? (
              <span className="text-[10px] italic text-slate-400" dir="ltr">
                {w.transliterasi}
              </span>
            ) : null}
            {w.terjemahan ? (
              <span className="text-center text-[11px] font-medium text-emerald-800" dir="ltr">
                {w.terjemahan}
              </span>
            ) : null}
          </div>
        ))}
        {words.length === 0 && (
          <p className="px-2 py-1 text-xs italic text-slate-500" dir="ltr">
            {t('pustaka.quran.wordsUnavailable')}
          </p>
        )}
      </div>

      {/* Full per-ayah translation — the whole-verse meaning, shown under the
          per-word grid so both the word-by-word glosses and the complete
          translation are visible at once. */}
      {verseTranslations.length > 0 ? (
        <div className="mt-2 border-t border-emerald-200/70 pt-2">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70">
            {t('pustaka.quran.wbwVerseLabel')}
          </p>
          <div className="space-y-1.5">
            {verseTranslations.map((tr) => (
              <div
                key={tr.id}
                dir="ltr"
                className="text-sm leading-relaxed text-slate-700"
                dangerouslySetInnerHTML={{ __html: tr.teks }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * ManqulAyahBlock — sitrac-style word-by-word UI for a single ayah.
 *
 * Layout (RTL flow):
 *   • Header row: ayah number + click to open popup
 *   • Word grid: each word card has the Arabic word + its translation + a
 *     tiny note input bound to manqul wordIdx = N. Drag to reorder is not
 *     supported (Quran word order is canonical).
 *   • Footer: per-ayah note (wordIdx = -1) for free-form thoughts.
 */
function ManqulAyahBlock({
  ayah,
  fontSize,
  onClickAyah,
}: {
  ayah: QuranAyah
  fontSize: number
  onClickAyah: (a: QuranAyah) => void
}) {
  const { t } = useTranslation()
  const surahNum = ayah.kunciAyat.split(':')[0]
  const ayahNum = Number(ayah.kunciAyat.split(':')[1])
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
      {/* Ayah header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onClickAyah(ayah)}
          className="inline-flex items-center gap-2 text-xs font-medium text-violet-700 transition hover:underline"
          title={t('pustaka.quran.ayahViewTitle', { key: ayah.kunciAyat })}
        >
          <AyahMark nomor={ayahNum} />
          <span>QS {ayah.kunciAyat}</span>
        </button>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-200 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100"
          title={t('pustaka.quran.shareBtnTitle')}
        >
          <Share2 size={12} className="shrink-0" />
          <span>{t('pustaka.quran.shareBtn')}</span>
        </button>
      </div>

      {/* Word grid — flex-wrap with RTL flow so words run right→left. */}
      <div
        dir="rtl"
        className="flex flex-wrap items-stretch gap-2 rounded-md bg-white/60 p-2"
      >
        {(ayah.perKata && ayah.perKata.length > 0 ? ayah.perKata : []).map((w, idx) => (
          <ManqulWordCell
            key={`${ayah.kunciAyat}-${idx}`}
            kunciAyat={ayah.kunciAyat}
            surahNum={surahNum}
            wordIdx={idx}
            word={w}
            fontSize={fontSize}
          />
        ))}
        {(!ayah.perKata || ayah.perKata.length === 0) && (
          <p className="px-2 py-1 text-xs italic text-slate-500" dir="ltr">
            {t('pustaka.quran.wordsUnavailable')}
          </p>
        )}
      </div>

      {/* Per-ayah note footer (wordIdx = -1). */}
      <div className="mt-2">
        <ManqulPerAyahNote ayah={ayah} surahNum={surahNum} />
      </div>

      {shareOpen ? (
        <ShareManqulDialog kunciAyat={ayah.kunciAyat} onClose={() => setShareOpen(false)} />
      ) : null}
    </div>
  )
}

/**
 * ShareManqulDialog — pick which users can see this ayah's manqul. Their
 * selection surfaces for each recipient as a "{name}'s Manqul" entry in the
 * translation dropdown. Recipient set is replace-on-save (empty = unshare).
 */
function ShareManqulDialog({
  kunciAyat,
  onClose,
}: {
  kunciAyat: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  // Current recipients — seed the editable selection once so a background
  // refetch can't clobber in-progress edits.
  const { data: current } = useQuery({
    queryKey: ['manqul-share-mine', kunciAyat],
    queryFn: () => listMyShareRecipients(kunciAyat),
    staleTime: 30_000,
  })
  const [selected, setSelected] = useState<ShareRecipient[]>([])
  const seededRef = useRef(false)
  useEffect(() => {
    if (!seededRef.current && current) {
      setSelected(current)
      seededRef.current = true
    }
  }, [current])

  // Debounced recipient search (>=2 chars).
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(id)
  }, [query])
  const { data: candidates = [], isFetching } = useQuery({
    queryKey: ['manqul-recipients', debounced],
    queryFn: () => searchManqulRecipients(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  const selectedIds = new Set(selected.map((s) => s.id))
  const fresh = candidates.filter((c) => !selectedIds.has(c.id))
  const add = (c: ManqulRecipientCandidate) =>
    setSelected((prev) => (prev.some((s) => s.id === c.id) ? prev : [...prev, { id: c.id, name: c.name }]))
  const remove = (id: string) => setSelected((prev) => prev.filter((s) => s.id !== id))

  const saveMut = useMutation({
    mutationFn: () => setManqulShare({ kunciAyat, recipientUserIds: selected.map((s) => s.id) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manqul-share-mine', kunciAyat] })
      qc.invalidateQueries({ queryKey: ['manqul-sources'] })
      onClose()
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="my-2 w-full max-w-md rounded-lg bg-white shadow-xl sm:my-12">
        <div className="flex items-center justify-between border-b border-slate-200 bg-violet-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-violet-900">
            {t('pustaka.quran.shareTitle', { key: kunciAyat })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('pustaka.quran.popupTitleClose')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-xs text-slate-500">{t('pustaka.quran.shareDesc')}</p>

          {/* Recipient search */}
          <div>
            <div className="flex items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:ring-2 focus-within:ring-violet-300">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('pustaka.quran.shareSearchPh')}
                className="h-9 w-full bg-transparent text-sm focus-visible:outline-none"
              />
            </div>
            {debounced.length < 2 ? (
              <p className="mt-1 px-1 text-[11px] text-slate-400">{t('pustaka.quran.shareSearchHint')}</p>
            ) : isFetching ? (
              <p className="mt-1 px-1 text-[11px] text-slate-400">{t('pustaka.quran.shareSearching')}</p>
            ) : fresh.length === 0 ? (
              <p className="mt-1 px-1 text-[11px] text-slate-400">{t('pustaka.quran.shareNoResults')}</p>
            ) : (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-100">
                {fresh.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => add(c)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-violet-50"
                    >
                      <span className="truncate">
                        {c.name}
                        {c.nickname ? <span className="text-slate-400"> · {c.nickname}</span> : null}
                      </span>
                      <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                        {c.role}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Selected recipients */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('pustaka.quran.shareRecipients')}
            </p>
            {selected.length === 0 ? (
              <p className="text-xs italic text-slate-400">{t('pustaka.quran.shareNobody')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-violet-100 py-0.5 pl-2.5 pr-1 text-xs text-violet-800"
                  >
                    {r.name}
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="rounded-full p-0.5 hover:bg-violet-200"
                      aria-label={t('pustaka.quran.shareRemoveAria', { name: r.name })}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={12} /> {saveMut.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManqulWordCell({
  kunciAyat,
  surahNum,
  wordIdx,
  word,
  fontSize,
}: {
  kunciAyat: string
  surahNum: string
  wordIdx: number
  word: { arab: string; terjemahan?: string; transliterasi?: string }
  fontSize: number
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: notes = [] } = useQuery({
    queryKey: ['manqul', surahNum],
    queryFn: () => listManqulNotes(surahNum),
    staleTime: 60_000,
  })
  const existing = notes.find(
    (n: ManqulNote) => n.kunciAyat === kunciAyat && n.wordIdx === wordIdx,
  )
  const [text, setText] = useState(existing?.teks ?? '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    setText(existing?.teks ?? '')
  }, [existing?.id, kunciAyat, wordIdx])

  const save = async () => {
    const fresh = (text ?? '').trim()
    if (fresh === (existing?.teks ?? '').trim()) return
    setSaved('saving')
    try {
      await upsertManqulNote({ kunciAyat, wordIdx, teks: fresh })
      qc.invalidateQueries({ queryKey: ['manqul', surahNum] })
      setSaved('saved')
      setTimeout(() => setSaved('idle'), 1200)
    } catch {
      setSaved('error')
    }
  }

  return (
    <div className="flex min-w-[120px] flex-col items-center gap-1 rounded-md border border-violet-100 bg-white px-2 py-1.5">
      <span
        className="font-arab text-center text-slate-900"
        style={{ fontSize: Math.max(20, fontSize - 4), lineHeight: 1.6 }}
      >
        {word.arab}
      </span>
      {word.transliterasi ? (
        <span className="text-[10px] italic text-slate-400" dir="ltr">
          {word.transliterasi}
        </span>
      ) : null}
      {word.terjemahan ? (
        <span className="text-center text-[11px] font-medium text-slate-700" dir="ltr">
          {word.terjemahan}
        </span>
      ) : null}
      <textarea
        dir="ltr"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={1}
        placeholder={t('pustaka.quran.wordPh')}
        className="w-full resize-y rounded border border-violet-200 bg-violet-50/50 px-1.5 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-300"
      />
      <span className="text-[9px] font-medium">
        {saved === 'saving' ? (
          <span className="text-slate-400">{t('pustaka.quran.savingShort')}</span>
        ) : saved === 'saved' ? (
          <span className="text-emerald-600">✓</span>
        ) : saved === 'error' ? (
          <span className="text-rose-600">{t('pustaka.quran.failedShort')}</span>
        ) : existing ? (
          <span className="text-violet-500">●</span>
        ) : (
          <span className="text-slate-200">—</span>
        )}
      </span>
    </div>
  )
}

function ManqulPerAyahNote({
  ayah,
  surahNum,
}: {
  ayah: QuranAyah
  surahNum: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: notes = [] } = useQuery({
    queryKey: ['manqul', surahNum],
    queryFn: () => listManqulNotes(surahNum),
    staleTime: 60_000,
  })
  const existing = notes.find(
    (n: ManqulNote) => n.kunciAyat === ayah.kunciAyat && n.wordIdx === MANQUL_AYAH_IDX,
  )
  const [text, setText] = useState(existing?.teks ?? '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  useEffect(() => {
    setText(existing?.teks ?? '')
  }, [existing?.id, ayah.kunciAyat])

  const save = async () => {
    const fresh = (text ?? '').trim()
    if (fresh === (existing?.teks ?? '').trim()) return
    setSaved('saving')
    try {
      await upsertManqulNote({ kunciAyat: ayah.kunciAyat, wordIdx: MANQUL_AYAH_IDX, teks: fresh })
      qc.invalidateQueries({ queryKey: ['manqul', surahNum] })
      setSaved('saved')
      setTimeout(() => setSaved('idle'), 1200)
    } catch {
      setSaved('error')
    }
  }

  return (
    <div className="flex items-start gap-2">
      <textarea
        dir="ltr"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder={t('pustaka.quran.ayahNotePh', { key: ayah.kunciAyat })}
        className="flex-1 resize-y rounded-md border border-violet-200 bg-white px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      />
      <div className="flex w-16 flex-shrink-0 items-center justify-center text-[10px]">
        {saved === 'saving' ? (
          <span className="text-slate-400">{t('pustaka.quran.saveSavingLong')}</span>
        ) : saved === 'saved' ? (
          <span className="text-emerald-600">{t('pustaka.quran.saveSaved')}</span>
        ) : saved === 'error' ? (
          <span className="text-rose-600">{t('pustaka.quran.saveFailed')}</span>
        ) : existing ? (
          <span className="text-violet-600">{t('pustaka.quran.ayatNoteSaved')}</span>
        ) : (
          <span className="text-slate-300">{t('pustaka.quran.ayatNoteEmpty')}</span>
        )}
      </div>
    </div>
  )
}

function AyahMark({ nomor }: { nomor: number }) {
  return (
    <span
      className="mx-1 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold"
      style={{ borderColor: '#b08d57', color: '#8b6914', background: '#fdfaf3' }}
    >
      {toArabicDigits(nomor)}
    </span>
  )
}

function toArabicDigits(n: number): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  return String(n)
    .split('')
    .map((c) => (c >= '0' && c <= '9' ? map[Number(c)] : c))
    .join('')
}

// ---------------------------------------------------------------------------

function AyahPopup({
  ayah,
  translations,
  manqulMode,
  onClose,
}: {
  ayah: QuranAyah
  translations: QuranTranslation[]
  manqulMode: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const surahNum = ayah.kunciAyat.split(':')[0]
  const qc = useQueryClient()

  // Notes are always fetched when the popup opens; they're cheap and the
  // existing-note pre-fill should work even on the first manqul toggle.
  const { data: notes = [] } = useQuery({
    queryKey: ['manqul', surahNum],
    queryFn: () => listManqulNotes(surahNum),
    staleTime: 60_000,
  })
  const existing = notes.find(
    (n: ManqulNote) => n.kunciAyat === ayah.kunciAyat && n.wordIdx === MANQUL_AYAH_IDX,
  )
  const [noteText, setNoteText] = useState(existing?.teks ?? '')
  useEffect(() => {
    setNoteText(existing?.teks ?? '')
  }, [existing?.id, ayah.kunciAyat])

  const saveMut = useMutation({
    mutationFn: () =>
      upsertManqulNote({ kunciAyat: ayah.kunciAyat, wordIdx: MANQUL_AYAH_IDX, teks: noteText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manqul', surahNum] })
      onClose()
    },
  })

  // by-id endpoint returns string; by-page endpoint returns array. Normalise.
  const renderedTranslations: QuranTranslationText[] = useMemo(() => {
    if (typeof ayah.terjemahan === 'string') return [{ id: 0, teks: ayah.terjemahan }]
    return ayah.terjemahan
  }, [ayah.terjemahan])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="my-2 w-full max-w-2xl rounded-lg bg-white shadow-xl sm:my-8">
        <div className="flex items-center justify-between border-b border-slate-200 bg-amber-50 px-4 py-3">
          <h3 className="text-base font-semibold">QS {ayah.kunciAyat}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('pustaka.quran.popupTitleClose')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div lang="ar" dir="rtl" className="font-arab text-right text-3xl" style={{ lineHeight: 2.2 }}>
            {ayah.arab}
          </div>
          {renderedTranslations.map((t) => {
            const meta = translations.find((x) => x.id === t.id)
            return (
              <div key={t.id} className="border-t border-slate-100 pt-3">
                {meta ? (
                  <p className="mb-1 text-xs font-semibold text-slate-500">{meta.label}</p>
                ) : null}
                <div
                  className="text-sm leading-relaxed text-slate-700"
                  dangerouslySetInnerHTML={{ __html: t.teks }}
                />
              </div>
            )
          })}

          {manqulMode ? (
            <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-violet-700">
                {t('pustaka.quran.manqulSection')}
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-violet-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                placeholder={t('pustaka.quran.manqulInputPh')}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-violet-700">
                  {existing
                    ? t('pustaka.quran.manqulSavedAt', {
                        when: new Date(existing.updatedAt).toLocaleString(
                          i18n.language === 'en' ? 'en-US' : 'id-ID',
                          { dateStyle: 'short', timeStyle: 'short' },
                        ),
                      })
                    : t('pustaka.quran.manqulNoNote')}
                </p>
                <button
                  type="button"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={12} /> {saveMut.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

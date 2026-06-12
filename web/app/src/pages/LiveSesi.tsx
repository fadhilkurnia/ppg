import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  ChevronLeft,
  EyeOff,
  History,
  LayoutPanelTop,
  Maximize2,
  Minimize2,
  PanelTopClose,
  PanelTopOpen,
  Radio,
  Replace,
  Square,
  Type,
} from 'lucide-react'

import {
  addDiajarkan,
  listDiajarkan,
  updateDiajarkan,
  type DiajarkanKind,
  type MateriDiajarkan,
  type MateriDiajarkanInput,
} from '@/api/diajarkan'
import { getSesi, setSesiLive } from '@/api/sesi'
import { getDoa } from '@/api/doa'
import { getMateriAjar } from '@/api/kurikulum'
import { PustakaQuranMushafPage } from '@/pages/PustakaQuranMushaf'
import { PustakaTilawatiPage } from '@/pages/PustakaTilawati'
import { MateriPicker } from '@/components/MateriPicker'
import { LibraryRefLabel } from '@/components/LibraryRefLabel'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { useToast } from '@/lib/toast'

type DisplayMode = 'full' | 'title' | 'hidden'

// Maps a planned library aspect to its i18n label key (Bacaan / Hafalan /
// Mengulang / Manqul). Shared by the stage, title view, and history panel.
const ASPECT_KEY: Record<string, string> = {
  reciting: 'achievement.aspectReciting',
  memorizing: 'achievement.aspectMemorizing',
  review: 'achievement.aspectReview',
  manqul: 'achievement.aspectManqul',
}

function formatElapsed(startedAt: string | null | undefined, now: number) {
  if (!startedAt) return '00:00'
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return '00:00'
  const sec = Math.max(0, Math.floor((now - start) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function kindLabelKey(k: DiajarkanKind) {
  return `live.kind.${k}` as const
}

const AUTO_HIDE_KEY = 'gnrs.live.autoHideChrome'
const EDGE_REVEAL_PX = 36 // pointer within this many px of the top/bottom edge reveals that bar
const TOUCH_REVEAL_MS = 3500 // touch has no hover-out, so an edge-tapped bar re-hides after this

// Edge-reveal for the live-stage chrome. When `enabled` (auto-hide on) and not
// `suspended`, the header and footer start hidden and reveal independently: the
// header only when the pointer reaches the top edge, the footer only at the
// bottom edge. Moving the mouse through the centre — or typing — never reveals
// them. Mouse: a window pointermove near an edge reveals that bar, and the bar
// hides on its own pointer-leave (wired in the page). Touch: an edge tap reveals
// the bar, which auto-hides after TOUCH_REVEAL_MS (touch has no hover-out). When
// disabled or suspended, both bars are forced visible.
function useEdgeChrome({
  enabled,
  suspended,
}: {
  enabled: boolean
  suspended: boolean
}) {
  const active = enabled && !suspended
  const [headerShown, setHeaderShown] = useState(true)
  const [footerShown, setFooterShown] = useState(true)
  const hTouch = useRef<number | null>(null)
  const fTouch = useRef<number | null>(null)

  useEffect(() => {
    const clearTimers = () => {
      if (hTouch.current !== null) {
        window.clearTimeout(hTouch.current)
        hTouch.current = null
      }
      if (fTouch.current !== null) {
        window.clearTimeout(fTouch.current)
        fTouch.current = null
      }
    }
    if (!active) {
      clearTimers()
      setHeaderShown(true)
      setFooterShown(true)
      return
    }
    // Auto-hide engaged: start hidden, reveal only at the edges.
    setHeaderShown(false)
    setFooterShown(false)
    const atTop = (y: number) => y <= EDGE_REVEAL_PX
    const atBottom = (y: number) => y >= window.innerHeight - EDGE_REVEAL_PX
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (atTop(e.clientY)) setHeaderShown(true)
      if (atBottom(e.clientY)) setFooterShown(true)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      if (atTop(e.clientY)) {
        setHeaderShown(true)
        if (hTouch.current !== null) window.clearTimeout(hTouch.current)
        hTouch.current = window.setTimeout(() => setHeaderShown(false), TOUCH_REVEAL_MS)
      }
      if (atBottom(e.clientY)) {
        setFooterShown(true)
        if (fTouch.current !== null) window.clearTimeout(fTouch.current)
        fTouch.current = window.setTimeout(() => setFooterShown(false), TOUCH_REVEAL_MS)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      clearTimers()
    }
  }, [active])

  const hideHeader = () => {
    if (active) setHeaderShown(false)
  }
  const hideFooter = () => {
    if (active) setFooterShown(false)
  }

  return { active, headerShown, footerShown, hideHeader, hideFooter }
}

export function LiveSesiPage() {
  const { sesiId } = useParams<{ kelasId: string; sesiId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t } = useTranslation()

  const sesiQ = useQuery({
    queryKey: ['sesi', sesiId],
    queryFn: () => getSesi(sesiId!),
    enabled: !!sesiId,
    refetchInterval: 5000,
  })
  const diajarkanQ = useQuery({
    queryKey: ['diajarkan', sesiId],
    queryFn: () => listDiajarkan(sesiId!),
    enabled: !!sesiId,
    refetchInterval: 5000,
  })
  const sesi = sesiQ.data
  const diajarkan = diajarkanQ.data ?? []
  const current = diajarkan.length > 0 ? diajarkan[diajarkan.length - 1] : null

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tm = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tm)
  }, [])

  const displayMode: DisplayMode = (sesi?.liveDisplayMode as DisplayMode | null) ?? 'full'

  const setMode = useMutation({
    mutationFn: (mode: DisplayMode) => setSesiLive(sesiId!, { liveDisplayMode: mode }),
    onSuccess: (data) => qc.setQueryData(['sesi', sesiId], data),
    onError: (e: any) => toast(e?.message ?? t('live.changeModeFailed'), 'error'),
  })

  const add = useMutation({
    mutationFn: (input: MateriDiajarkanInput) => addDiajarkan(sesiId!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diajarkan', sesiId] }),
    onError: (e: any) => toast(e?.message ?? t('live.addMateriFailed'), 'error'),
  })

  const markComplete = useMutation({
    mutationFn: (itemId: string) =>
      updateDiajarkan(sesiId!, itemId, { completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diajarkan', sesiId] }),
    onError: (e: any) => toast(e?.message ?? t('live.markCompleteFailed'), 'error'),
  })

  // Fullscreen
  const [isFs, setIsFs] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => {})
  }

  const [pickerOpen, setPickerOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [replaceConfirm, setReplaceConfirm] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Per-operator viewing preference (not server-synced like liveDisplayMode):
  // when on, the stage chrome auto-hides while idle. Persisted in localStorage.
  const [autoHide, setAutoHide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(AUTO_HIDE_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_HIDE_KEY, autoHide ? '1' : '0')
    } catch {
      /* ignore storage errors (private mode, disabled storage, etc.) */
    }
  }, [autoHide])
  const toggleAutoHide = () => setAutoHide((v) => !v)

  const requestPickMateri = () => {
    if (current && !current.completed) setReplaceConfirm(true)
    else setPickerOpen(true)
  }

  const liveStatus: 'pre' | 'live' | 'done' = !sesi
    ? 'pre'
    : sesi.endedAt
      ? 'done'
      : sesi.startedAt
        ? 'live'
        : 'pre'

  const anyOverlayOpen = pickerOpen || endOpen || replaceConfirm || historyOpen
  const edge = useEdgeChrome({
    enabled: autoHide,
    suspended: !current || anyOverlayOpen,
  })
  // Overlay layout (materi as a full-screen canvas with the bars floating over
  // it) only when auto-hide is on. When off, the bars sit in normal flow and the
  // materi is contained between them.
  const overlay = autoHide
  const headerBase =
    'flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/80 px-4 py-2.5 backdrop-blur'
  const footerBase =
    'flex flex-wrap items-center gap-2 border-t border-neutral-800 bg-neutral-900/80 px-3 py-2 backdrop-blur'
  const overlayBar =
    'absolute inset-x-0 z-20 transition-all duration-300 ease-out motion-reduce:transition-none'

  if (sesiQ.isLoading || !sesi) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950 text-neutral-200">
        {t('live.loadingSesi')}
      </div>
    )
  }
  if (sesiQ.isError) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950 text-neutral-200">
        <div className="space-y-3 text-center">
          <p>{t('live.loadFailed')}</p>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`fixed inset-0 z-50 bg-neutral-950 text-neutral-100${overlay ? '' : ' flex flex-col'}`}>
      {/* Top bar */}
      <header
        aria-hidden={overlay && !edge.headerShown}
        onPointerLeave={
          overlay
            ? (e) => {
                if (e.pointerType === 'mouse') edge.hideHeader()
              }
            : undefined
        }
        className={
          overlay
            ? `${headerBase} ${overlayBar} top-0 ${
                edge.headerShown ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
              }`
            : headerBase
        }
      >
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          aria-label={t('common.back')}
        >
          <ChevronLeft size={18} />
        </button>
        {liveStatus === 'live' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {t('live.statusLive')}
          </span>
        ) : liveStatus === 'done' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
            <CheckCircle2 size={12} /> {t('live.statusDone')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            {t('live.statusPre')}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{sesi.topik}</div>
          {sesi.tingkat && (
            <div className="truncate text-[11px] text-neutral-400">{sesi.tingkat}</div>
          )}
        </div>
        <div className="font-mono text-sm tabular-nums text-neutral-300">
          {formatElapsed(sesi.startedAt, now)}
        </div>
        {liveStatus === 'live' && (
          <button
            onClick={() => setEndOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
          >
            <Square size={14} fill="currentColor" /> {t('live.endSesi')}
          </button>
        )}
      </header>

      {/* Stage */}
      <main className={overlay ? 'absolute inset-0 overflow-hidden' : 'relative flex-1 overflow-hidden'}>
        <Stage
          mode={displayMode}
          current={current}
          onPick={requestPickMateri}
          canEdit={liveStatus === 'live'}
        />
      </main>

      {/* Bottom toolbar */}
      <footer
        aria-hidden={overlay && !edge.footerShown}
        onPointerLeave={
          overlay
            ? (e) => {
                if (e.pointerType === 'mouse') edge.hideFooter()
              }
            : undefined
        }
        className={
          overlay
            ? `${footerBase} ${overlayBar} bottom-0 ${
                edge.footerShown ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
              }`
            : footerBase
        }
      >
        <button
          onClick={requestPickMateri}
          disabled={liveStatus !== 'live'}
          title={current ? t('live.replaceMateri') : t('live.pickMateri')}
          aria-label={current ? t('live.replaceMateri') : t('live.pickMateri')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-800 disabled:opacity-50 sm:px-3"
        >
          <Replace size={14} />
          <span className="hidden sm:inline">{current ? t('live.replaceMateri') : t('live.pickMateri')}</span>
        </button>
        <div className="flex items-center gap-0.5 rounded-lg border border-neutral-700 p-0.5">
          <ModeBtn
            active={displayMode === 'full'}
            onClick={() => setMode.mutate('full')}
            disabled={liveStatus !== 'live'}
            label={t('live.modeFull')}
            icon={<LayoutPanelTop size={14} />}
          />
          <ModeBtn
            active={displayMode === 'title'}
            onClick={() => setMode.mutate('title')}
            disabled={liveStatus !== 'live'}
            label={t('live.modeTitle')}
            icon={<Type size={14} />}
          />
          <ModeBtn
            active={displayMode === 'hidden'}
            onClick={() => setMode.mutate('hidden')}
            disabled={liveStatus !== 'live'}
            label={t('live.modeHidden')}
            icon={<EyeOff size={14} />}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {diajarkan.length > 0 ? (
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              title={t('live.history', { count: diajarkan.length })}
              aria-label={t('live.history', { count: diajarkan.length })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800 sm:px-2.5"
              aria-expanded={historyOpen}
            >
              <History size={14} />
              <span className="hidden sm:inline">{t('live.history', { count: diajarkan.length })}</span>
            </button>
          ) : null}
          <button
            onClick={toggleAutoHide}
            aria-pressed={autoHide}
            aria-label={t('live.autoHide')}
            title={t('live.autoHide')}
            className={`rounded-lg border p-1.5 transition ${
              autoHide
                ? 'border-emerald-600/60 bg-emerald-500/20 text-emerald-300'
                : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {autoHide ? <PanelTopClose size={14} /> : <PanelTopOpen size={14} />}
          </button>
          <button
            onClick={toggleFs}
            className="rounded-lg border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
            aria-label={t('live.fullscreen')}
          >
            {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </footer>

      {historyOpen && diajarkan.length > 0 ? (
        <HistoryPanel
          items={diajarkan}
          currentId={current?.id ?? null}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {replaceConfirm && current ? (
        <ReplaceConfirmDialog
          current={current}
          onCancel={() => setReplaceConfirm(false)}
          onGantiSaja={() => {
            setReplaceConfirm(false)
            setPickerOpen(true)
          }}
          onSelesai={() => {
            markComplete.mutate(current.id)
            setReplaceConfirm(false)
            setPickerOpen(true)
          }}
        />
      ) : null}

      {pickerOpen && (
        <MateriPicker
          sesi={sesi}
          onClose={() => setPickerOpen(false)}
          onPick={(input) => {
            add.mutate(input)
            setPickerOpen(false)
          }}
        />
      )}

      {endOpen && (
        <EndSesiSummaryDialog
          sesi={sesi}
          onClose={() => setEndOpen(false)}
          onEnded={() => {
            setEndOpen(false)
            navigate('/kelas/list')
          }}
        />
      )}
    </div>
  )
}

function ModeBtn({
  active,
  onClick,
  disabled,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50 sm:px-2.5 ${
        active ? 'bg-emerald-500/20 text-emerald-300' : 'text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// Stage ----------------------------------------------------------------------

function Stage({
  mode,
  current,
  onPick,
  canEdit,
}: {
  mode: DisplayMode
  current: MateriDiajarkan | null
  onPick: () => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  if (!current) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="space-y-4">
          <Radio size={48} className="mx-auto text-neutral-700" />
          <p className="text-neutral-400">{t('live.noMateriYet')}</p>
          {canEdit && (
            <button
              onClick={onPick}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              {t('live.pickMateriCta')}
            </button>
          )}
        </div>
      </div>
    )
  }
  if (mode === 'hidden') {
    return (
      <div className="grid h-full place-items-center text-neutral-700">
        <EyeOff size={64} />
      </div>
    )
  }
  if (mode === 'title') {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            {t(kindLabelKey(current.kind))}
            {current.libraryAspect ? ` · ${t(ASPECT_KEY[current.libraryAspect])}` : ''}
          </div>
          <h1 className="mt-3 text-4xl font-bold leading-tight md:text-6xl">
            {current.label ?? t('live.untitled')}
          </h1>
        </div>
      </div>
    )
  }
  // Full mode — render per kind
  switch (current.kind) {
    case 'kurikulum':
      return <KurikulumStage item={current} />
    case 'quran':
      return <QuranStage item={current} />
    case 'hadits':
      return <HaditsStage item={current} />
    case 'tilawati':
      return <TilawatiStage item={current} />
    case 'doa':
      return <DoaStage item={current} />
    default:
      return null
  }
}

function KurikulumStage({ item }: { item: MateriDiajarkan }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['materi-ajar', item.materiAjarId],
    queryFn: () => getMateriAjar(item.materiAjarId!),
    enabled: !!item.materiAjarId,
  })
  if (q.isLoading) return <Centered>{t('live.loadingMateri')}</Centered>
  if (!q.data) return <Centered>{t('live.materiNotFound')}</Centered>
  const m = q.data
  return (
    <div className="h-full overflow-auto px-8 py-10 md:px-16 md:py-14">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            {m.tingkat} · {t('live.semesterShort', { n: m.semester })} ·{' '}
            <span className="text-emerald-400">{m.kategori}</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold md:text-5xl">{m.tema}</h1>
          {m.subTema && <h2 className="mt-2 text-xl text-neutral-300 md:text-2xl">{m.subTema}</h2>}
        </div>
        {m.kelompokMateri && <div className="text-sm text-neutral-400">{m.kelompokMateri}</div>}
        <div className="whitespace-pre-wrap text-lg leading-relaxed text-neutral-200 md:text-xl">
          {m.detailMateri}
        </div>
      </div>
    </div>
  )
}

function QuranStage({ item }: { item: MateriDiajarkan }) {
  // Reuse the library mushaf reader (2-page spread + all features), jumped to
  // this item's surah. `key` forces a re-jump when the displayed surah changes.
  const surahId = item.ref?.split(':')[0]
  return <PustakaQuranMushafPage key={surahId} surahId={surahId} embedded />
}

function HaditsStage({ item }: { item: MateriDiajarkan }) {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div className="space-y-4">
        <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">{t('live.kind.hadits')}</div>
        <h1 className="text-3xl font-bold text-neutral-100 md:text-5xl">
          {item.label ?? item.ref ?? t('live.emptyTitle')}
        </h1>
      </div>
    </div>
  )
}

function TilawatiStage({ item }: { item: MateriDiajarkan }) {
  // Reuse the library Tilawati reader. ref = "jilid" or "jilid/halaman".
  const [jilid, halaman] = (item.ref ?? '').split('/')
  const page = halaman ? Number(halaman) : undefined
  return (
    <PustakaTilawatiPage
      key={item.ref}
      jilidId={jilid || undefined}
      page={page}
      embedded
    />
  )
}

function DoaStage({ item }: { item: MateriDiajarkan }) {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['doa', item.ref],
    queryFn: () => getDoa(item.ref!),
    enabled: !!item.ref,
  })
  if (q.isLoading) return <Centered>{t('live.loadingDoa')}</Centered>
  if (!q.data) return <Centered>{t('live.doaNotFound')}</Centered>
  const d = q.data
  return (
    <div className="h-full overflow-auto px-8 py-10 md:px-16 md:py-14">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">{t('live.kind.doa')}</div>
        <h1 className="text-2xl font-bold md:text-4xl">{d.nama}</h1>
        {d.teksArab && (
          <div className="font-arabic text-3xl leading-loose text-neutral-100 md:text-5xl" dir="rtl">
            {d.teksArab}
          </div>
        )}
        {d.teksLatin && (
          <div className="italic text-neutral-300 md:text-xl">{d.teksLatin}</div>
        )}
        {d.terjemahan && (
          <div className="text-neutral-400 md:text-lg">{d.terjemahan}</div>
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center text-neutral-500">{children}</div>
}

// Replace confirm — ditampilkan saat guru mengklik "Ganti Materi" dan
// materi saat ini belum ditandai selesai. Tawarkan dua jalur: menyelesaikan
// materi sebelumnya (mark completed), atau melewatkan (replace tanpa selesai).
function ReplaceConfirmDialog({
  current,
  onCancel,
  onGantiSaja,
  onSelesai,
}: {
  current: MateriDiajarkan
  onCancel: () => void
  onGantiSaja: () => void
  onSelesai: () => void
}) {
  const { t } = useTranslation()
  const title =
    current.label ??
    current.ref ??
    (current.kind === 'kurikulum' ? t('live.kurikulumMateri') : current.kind)
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl">
        <h2 className="text-base font-semibold">{t('live.replaceTitle')}</h2>
        <p className="mt-2 text-sm text-neutral-400">
          {t('live.replaceCurrent')}{' '}
          <span className="font-medium text-neutral-200">{title}</span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">{t('live.replaceHint')}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onSelesai}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <CheckCircle2 size={16} /> {t('live.completeAndReplace')}
          </button>
          <button
            onClick={onGantiSaja}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
          >
            {t('live.replaceWithoutComplete')}
          </button>
          <button
            onClick={onCancel}
            className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryPanel({
  items,
  currentId,
  onClose,
}: {
  items: MateriDiajarkan[]
  currentId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-x-0 bottom-12 z-50 mx-3 mb-1 max-h-[40vh] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {t('live.historyTitle')}
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          aria-label={t('live.closeHistory')}
        >
          ×
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const isCurrent = it.id === currentId
          const title = it.label ?? it.ref ?? t('live.untitled')
          return (
            <li
              key={it.id}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
                isCurrent
                  ? 'border-emerald-600/60 bg-emerald-600/10'
                  : 'border-neutral-800 bg-neutral-900/60'
              }`}
            >
              <span className="w-5 text-right text-xs text-neutral-500">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-emerald-400">
                  {t(kindLabelKey(it.kind))}
                  {it.libraryAspect ? ` · ${t(ASPECT_KEY[it.libraryAspect])}` : ''}
                  {isCurrent ? ` · ${t('live.onStage')}` : ''}
                </div>
                {it.kind !== 'kurikulum' && it.ref ? (
                  <LibraryRefLabel
                    libraryKind={it.kind}
                    libraryRef={it.ref}
                    showKind={false}
                    className="block truncate text-neutral-100"
                  />
                ) : (
                  <div className="truncate text-neutral-100">{title}</div>
                )}
              </div>
              {it.completed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <CheckCircle2 size={10} /> {t('live.itemDone')}
                </span>
              ) : isCurrent ? null : (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  {t('live.itemNotDone')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

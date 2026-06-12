import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'

import { getMateriAjar, listMateriAjar, type MateriAjar } from '@/api/kurikulum'
import { listQuranSurahs } from '@/api/quran'
import { listKitab, listBab } from '@/api/hadits'
import { listDoa } from '@/api/doa'
import type { Sesi, SesiLibraryItem } from '@/api/sesi'
import type { DiajarkanKind, MateriDiajarkanInput } from '@/api/diajarkan'
import { LibraryRefLabel, formatQuranRef } from '@/components/LibraryRefLabel'

// Tab labels & ids ----------------------------------------------------------

const TAB_IDS = ['sesi', 'kurikulum', 'library', 'lainnya'] as const
type TabId = (typeof TAB_IDS)[number]

// Library sub-pickers --------------------------------------------------------

type LibraryKind = 'quran' | 'hadits' | 'tilawati' | 'doa'

export function MateriPicker({
  sesi,
  onPick,
  onClose,
}: {
  sesi: Sesi
  onPick: (input: MateriDiajarkanInput) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabId>('sesi')

  const TABS: { id: TabId; label: string }[] = [
    { id: 'sesi', label: t('materiComp.picker.tabSesi') },
    { id: 'kurikulum', label: t('materiComp.picker.tabKurikulum') },
    { id: 'library', label: t('materiComp.picker.tabLibrary') },
    { id: 'lainnya', label: t('materiComp.picker.tabLainnya') },
  ]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(640px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
          <h3 className="flex-1 text-sm font-semibold text-neutral-100">
            {t('materiComp.picker.title')}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            aria-label={t('materiComp.picker.closeAria')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                tab === tb.id
                  ? 'border-b-2 border-emerald-500 text-emerald-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {tab === 'sesi' && <SesiTab sesi={sesi} onPick={onPick} />}
          {tab === 'kurikulum' && <KurikulumTab sesi={sesi} onPick={onPick} />}
          {tab === 'library' && <LibraryTab onPick={onPick} />}
          {tab === 'lainnya' && <LainnyaTab onPick={onPick} />}
        </div>
      </div>
    </div>
  )
}

// Tab 1: Rencana Ajar Sesi Ini ----------------------------------------------

function SesiTab({ sesi, onPick }: { sesi: Sesi; onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const ids = useMemo(() => {
    const list = sesi.materiAjarIds ?? []
    return list.length > 0 ? list : sesi.materiAjarId ? [sesi.materiAjarId] : []
  }, [sesi])

  // Planned library refs — prefer the multi-item list, fall back to the legacy
  // single library_* columns. Each carries the aspect it was planned with.
  const libItems = useMemo<SesiLibraryItem[]>(() => {
    const items = (sesi.libraryItems ?? []).filter(
      (it) => Boolean(it.libraryKind && it.libraryRef),
    )
    if (items.length > 0) return items
    if (sesi.libraryKind && sesi.libraryKind !== 'kurikulum' && sesi.libraryRef) {
      return [
        {
          libraryKind: sesi.libraryKind as SesiLibraryItem['libraryKind'],
          libraryAspect: sesi.libraryAspect ?? null,
          libraryRef: sesi.libraryRef,
        },
      ]
    }
    return []
  }, [sesi])

  // Surah names so the picked label reads "An-Nahl (16) : 1-10" rather than a
  // bare "16:1-10". Cached app-wide under the same query key.
  const surahs = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
    enabled: libItems.some((it) => it.libraryKind === 'quran'),
  })
  const surahMap = useMemo(() => {
    const m: Record<number, string> = {}
    for (const s of surahs.data ?? []) m[s.id] = s.nama
    return m
  }, [surahs.data])

  const buildLibraryInput = (it: SesiLibraryItem): MateriDiajarkanInput => {
    let label = `${it.libraryKind.toUpperCase()} · ${it.libraryRef}`
    if (it.libraryKind === 'quran') {
      label = formatQuranRef(it.libraryRef, surahMap, t('pustaka.refLabel.surahFallback'))
    }
    return {
      kind: it.libraryKind as DiajarkanKind,
      ref: it.libraryRef,
      label,
      libraryAspect: it.libraryAspect ?? null,
    }
  }

  if (ids.length === 0 && libItems.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-sm text-neutral-500">
        {t('materiComp.picker.sesiEmpty')}
      </div>
    )
  }

  return (
    <div className="p-3">
      {ids.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {t('materiComp.picker.sesiKurikulumHeading')}
          </div>
          <ul className="space-y-1">
            {ids.map((id) => (
              <MateriAjarRow
                key={id}
                id={id}
                onPick={(m) =>
                  onPick({
                    kind: 'kurikulum',
                    materiAjarId: m.id,
                    label: m.subTema ? `${m.tema} — ${m.subTema}` : m.tema,
                  })
                }
              />
            ))}
          </ul>
        </div>
      )}
      {libItems.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {t('materiComp.picker.sesiLibraryHeading')}
          </div>
          <ul className="space-y-1">
            {libItems.map((it, i) => (
              <li key={it.id ?? `${it.libraryKind}:${it.libraryRef}:${i}`}>
                <button
                  onClick={() => onPick(buildLibraryInput(it))}
                  className="block w-full rounded-lg px-3 py-2 text-left hover:bg-neutral-800"
                >
                  <LibraryRefLabel
                    libraryKind={it.libraryKind}
                    libraryRef={it.libraryRef}
                    libraryAspect={it.libraryAspect}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MateriAjarRow({ id, onPick }: { id: string; onPick: (m: MateriAjar) => void }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['materi-ajar', id], queryFn: () => getMateriAjar(id) })
  return (
    <li>
      <button
        onClick={() => q.data && onPick(q.data)}
        disabled={!q.data}
        className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-neutral-800 disabled:opacity-50"
      >
        {q.isLoading ? (
          <span className="text-xs text-neutral-500">{t('materiComp.picker.materiLoading')}</span>
        ) : q.data ? (
          <div>
            <div className="truncate text-[10px] uppercase tracking-wider text-neutral-500">
              {[q.data.tema, q.data.subTema, q.data.kelompokMateri].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-0.5 text-sm font-medium text-neutral-100">
              {q.data.detailMateri || '—'}
            </div>
          </div>
        ) : (
          <span className="text-xs text-neutral-500">{t('materiComp.picker.materiNotFound')}</span>
        )}
      </button>
    </li>
  )
}

// Tab 2: Kurikulum -----------------------------------------------------------

function KurikulumTab({ sesi, onPick }: { sesi: Sesi; onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const list = useQuery({
    queryKey: ['materi-ajar', 'list', sesi.tingkat, q],
    queryFn: () => listMateriAjar({ tingkat: sesi.tingkat ?? undefined, q: q || undefined }),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              sesi.tingkat
                ? t('materiComp.picker.kurikulumSearchPhTingkat', { tingkat: sesi.tingkat })
                : t('materiComp.picker.kurikulumSearchPh')
            }
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 py-1.5 pl-8 pr-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {list.isLoading ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.loading')}</div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.noMatch')}</div>
        ) : (
          <ul className="space-y-1">
            {(list.data ?? []).map((m) => (
              <li key={m.id}>
                <button
                  onClick={() =>
                    onPick({
                      kind: 'kurikulum',
                      materiAjarId: m.id,
                      label: m.subTema ? `${m.tema} — ${m.subTema}` : m.tema,
                    })
                  }
                  className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-neutral-800"
                >
                  <div className="truncate text-[10px] uppercase tracking-wider text-neutral-500">
                    {[m.tema, m.subTema, m.kelompokMateri].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-0.5 text-sm font-medium text-neutral-100">
                    {m.detailMateri || '—'}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
                    {m.tingkat} · {t('materiComp.picker.semShort', { n: m.semester })} · {m.kategori}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Tab 3: Library -------------------------------------------------------------

function LibraryTab({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<LibraryKind>('quran')
  const LIBRARY_LABELS: Record<LibraryKind, string> = {
    quran: t('materiComp.picker.libKindQuran'),
    hadits: t('materiComp.picker.libKindHadits'),
    tilawati: t('materiComp.picker.libKindTilawati'),
    doa: t('materiComp.picker.libKindDoa'),
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-neutral-800 p-2">
        {(Object.keys(LIBRARY_LABELS) as LibraryKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              kind === k
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
          >
            {LIBRARY_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        {kind === 'quran' && <QuranPicker onPick={onPick} />}
        {kind === 'hadits' && <HaditsPicker onPick={onPick} />}
        {kind === 'tilawati' && <TilawatiPicker onPick={onPick} />}
        {kind === 'doa' && <DoaPicker onPick={onPick} />}
      </div>
    </div>
  )
}

function QuranPicker({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const surahs = useQuery({ queryKey: ['quran-surahs'], queryFn: listQuranSurahs })
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const list = surahs.data ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (s) =>
        String(s.id) === needle ||
        s.nama.toLowerCase().includes(needle),
    )
  }, [surahs.data, q])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('materiComp.picker.quranSearchPh')}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-auto p-2">
        {surahs.isLoading ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.loading')}</div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() =>
                    onPick({
                      kind: 'quran',
                      ref: String(s.id),
                      label: `QS. ${s.nama} (${s.id})`,
                    })
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-neutral-800"
                >
                  <span className="w-7 text-right text-xs tabular-nums text-neutral-500">{s.id}.</span>
                  <span className="flex-1 text-sm text-neutral-100">{s.nama}</span>
                  <span className="text-xs text-neutral-400">{s.namaArab}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function HaditsPicker({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const kitabQ = useQuery({ queryKey: ['hadits-kitab'], queryFn: () => listKitab() })
  const [slug, setSlug] = useState<string | null>(null)
  const babQ = useQuery({
    queryKey: ['hadits-bab', slug],
    queryFn: () => listBab(slug!),
    enabled: !!slug,
  })
  const activeKitab = useMemo(
    () => (kitabQ.data ?? []).find((k) => k.slug === slug) ?? null,
    [kitabQ.data, slug],
  )

  if (!slug) {
    return (
      <div className="p-2">
        {kitabQ.isLoading ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.loading')}</div>
        ) : (
          <ul className="space-y-0.5">
            {(kitabQ.data ?? []).map((k) => (
              <li key={k.slug}>
                <button
                  onClick={() => setSlug(k.slug)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800"
                >
                  {k.nama}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <button
          onClick={() => setSlug(null)}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          {t('materiComp.picker.haditsBackKitab')}
        </button>
        <span className="text-sm font-medium text-neutral-100">{activeKitab?.nama ?? slug}</span>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {babQ.isLoading ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.loading')}</div>
        ) : (
          <ul className="space-y-0.5">
            {(babQ.data ?? []).map((b: any) => (
              <li key={b.id}>
                <button
                  onClick={() =>
                    onPick({
                      kind: 'hadits',
                      ref: `${slug}/${b.id}`,
                      label: `${activeKitab?.nama ?? slug} · ${b.nama}`,
                    })
                  }
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800"
                >
                  {b.nama}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TilawatiPicker({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  // Only Jilid 1–6 have page images on disk. Pra/Gharib/Tajwid were
  // previously listed but have no assets, so picking them silently fell
  // back to Jilid 1 in the reader — removed until their pages exist.
  const TILAWATI_JILID = [
    { value: '1', label: t('materiComp.picker.tilawatiJilidN', { n: 1 }) },
    { value: '2', label: t('materiComp.picker.tilawatiJilidN', { n: 2 }) },
    { value: '3', label: t('materiComp.picker.tilawatiJilidN', { n: 3 }) },
    { value: '4', label: t('materiComp.picker.tilawatiJilidN', { n: 4 }) },
    { value: '5', label: t('materiComp.picker.tilawatiJilidN', { n: 5 }) },
    { value: '6', label: t('materiComp.picker.tilawatiJilidN', { n: 6 }) },
  ]
  const [jilid, setJilid] = useState<string>('1')
  const [halaman, setHalaman] = useState<string>('')
  return (
    <div className="space-y-4 p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">{t('materiComp.picker.tilawatiJilid')}</label>
        <select
          value={jilid}
          onChange={(e) => setJilid(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
        >
          {TILAWATI_JILID.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-400">
          {t('materiComp.picker.tilawatiHalaman')} <span className="text-neutral-600">{t('materiComp.picker.tilawatiHalamanOpt')}</span>
        </label>
        <input
          type="number"
          min={1}
          value={halaman}
          onChange={(e) => setHalaman(e.target.value)}
          placeholder={t('materiComp.picker.tilawatiHalamanPh')}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <button
        onClick={() => {
          const label = TILAWATI_JILID.find((j) => j.value === jilid)?.label ?? jilid
          onPick({
            kind: 'tilawati',
            ref: halaman ? `${jilid}/${halaman}` : jilid,
            label: halaman ? t('materiComp.picker.tilawatiHal', { label, n: halaman }) : label,
          })
        }}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
      >
        {t('materiComp.picker.tilawatiPick')}
      </button>
    </div>
  )
}

function DoaPicker({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const list = useQuery({
    queryKey: ['doa-list', q],
    queryFn: () => listDoa({ q: q || undefined }),
  })
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('materiComp.picker.doaSearchPh')}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <div className="flex-1 overflow-auto p-2">
        {list.isLoading ? (
          <div className="p-4 text-center text-sm text-neutral-500">{t('materiComp.picker.loading')}</div>
        ) : (
          <ul className="space-y-0.5">
            {(list.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => onPick({ kind: 'doa', ref: d.id, label: d.nama })}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-100 hover:bg-neutral-800"
                >
                  {d.nama}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Tab 4: Lainnya — quick-pick options that don't fit kurikulum/library.
// Used when the pengajian was purely conversational (nasihat, sharing) so
// the guru can still mark something taught.
function LainnyaTab({ onPick }: { onPick: (i: MateriDiajarkanInput) => void }) {
  const { t } = useTranslation()
  const options = [
    {
      label: t('materiComp.picker.lainnyaConversation'),
      hint: t('materiComp.picker.lainnyaConversationHint'),
      kind: 'kurikulum' as DiajarkanKind,
    },
    {
      label: t('materiComp.picker.lainnyaPembukaan'),
      hint: t('materiComp.picker.lainnyaPembukaanHint'),
      kind: 'kurikulum' as DiajarkanKind,
    },
    {
      label: t('materiComp.picker.lainnyaReview'),
      hint: t('materiComp.picker.lainnyaReviewHint'),
      kind: 'kurikulum' as DiajarkanKind,
    },
  ]
  return (
    <div className="space-y-2 p-3">
      <p className="px-1 text-[11px] text-neutral-500">
        {t('materiComp.picker.lainnyaHint')}
      </p>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onPick({ kind: opt.kind, label: opt.label })}
          className="block w-full rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-left transition hover:bg-neutral-800"
        >
          <div className="text-sm font-medium text-neutral-100">{opt.label}</div>
          <div className="mt-0.5 text-xs text-neutral-400">{opt.hint}</div>
        </button>
      ))}
    </div>
  )
}

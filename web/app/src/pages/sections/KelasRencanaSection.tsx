import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronRight, Plus, X } from 'lucide-react'

import {
  addRencanaItems,
  addRencanaLibraryItem,
  ensureRencana,
  listRencana,
  removeRencanaItem,
  toggleRencanaItem,
  type Rencana,
} from '@/api/rencana'
import {
  MateriSourcePicker,
  emptyMateriSourceValue,
  type MateriSourceValue,
} from '@/components/MateriSourcePicker'
import { listKelas, type Kelas } from '@/api/kelas'
import { listMateriAjar, listTingkat, type MateriAjar } from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { LibraryRefLabel } from '@/components/LibraryRefLabel'
import { PageShell } from '@/components/PageShell'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasRencanaSection — Rencana Ajar Bulanan (Monthly Teaching Plan), ported
 * from sitrac-v3's `MateriAjar.tsx`. Pick a kelas + year + month; the page
 * shows the rencana_bulanan_item rows grouped by tema (Alim/Faqih/Akhlaqul
 * Karimah/Kemandirian). Admin can add materi from kurikulum, toggle selesai,
 * and remove items. Coverage stats are derived client-side (total kurikulum
 * vs already-planned/done in this semester) to avoid a backend endpoint.
 */

const TEMA_ORDER = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']
const TEMA_LABEL: Record<string, string> = {
  ALIM: '🕌 Alim',
  FAQIH: '📚 Faqih',
  'AKHLAQUL KARIMAH': '✨ Akhlaqul Karimah',
  KEMANDIRIAN: '🎯 Kemandirian',
  LIBRARY: '📖 Library',
}
const TEMA_COLOR: Record<string, string> = {
  ALIM: '#5b6f4e',
  FAQIH: '#b88a3a',
  'AKHLAQUL KARIMAH': '#8a5cd6',
  KEMANDIRIAN: '#3a8a8a',
  LIBRARY: '#0284c7',
}

// PPG Indonesia default semester start months (Sem1 = Jul, Sem2 = Jan).
const SEM1_START = 7
const SEM2_START = 1

export function KelasRencanaSection() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { t, i18n } = useTranslation()
  const BULAN = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'long' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  }, [i18n.language])
  const BULAN_PENDEK = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: 'short' })
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)))
  }, [i18n.language])

  const now = new Date()
  const [kelasId, setKelasId] = useState('')
  const [kelasMode, setKelasMode] = useState<'all' | 'mine'>('all')
  const [tahun, setTahun] = useState(now.getFullYear())
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [picking, setPicking] = useState(false)
  const [pickingLibrary, setPickingLibrary] = useState(false)
  const [collapsedTemas, setCollapsedTemas] = useState<Set<string>>(new Set())

  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
  })

  // "Kelas saya" mode narrows the kelas dropdown to those where the current
  // user is the guru. The teaching-plan view itself is still per-kelas.
  const visibleKelasList = useMemo(
    () =>
      kelasMode === 'mine'
        ? kelasList.filter((k) => user?.id && (k.guruUserIds ?? []).includes(user.id))
        : kelasList,
    [kelasList, kelasMode, user?.id],
  )

  // Auto-pick the first kelas if none selected or if mode change orphaned it.
  useMemo(() => {
    if (visibleKelasList.length === 0) {
      if (kelasId) setKelasId('')
      return
    }
    if (!kelasId || !visibleKelasList.some((k) => k.id === kelasId)) {
      setKelasId(visibleKelasList[0].id)
    }
  }, [visibleKelasList, kelasId])

  const selKelas: Kelas | undefined = kelasList.find((k) => k.id === kelasId)

  // Sem-1 / Sem-2 month strip (12 months starting from SEM1_START).
  const monthOrder = useMemo(() => {
    const out: { month: number; isSem2Start: boolean; semester: 1 | 2 }[] = []
    let semester: 1 | 2 = 1
    for (let i = 0; i < 12; i++) {
      const month = ((SEM1_START - 1 + i) % 12) + 1
      const isSem2Start = month === SEM2_START && i > 0
      if (isSem2Start) semester = 2
      out.push({ month, isSem2Start, semester })
    }
    return out
  }, [])

  // The rencana for the picked (kelas, tahun, bulan).
  const { data: rencanaList = [] } = useQuery({
    queryKey: ['rencana', kelasId, tahun, bulan],
    queryFn: () => listRencana({ kelasId, tahun, bulan }),
    enabled: !!kelasId,
  })
  const rencana: Rencana | null = rencanaList[0] ?? null
  const { data: rencanaDetail } = useQuery({
    queryKey: ['rencana-detail', rencana?.id],
    queryFn: () => (rencana ? listRencana({ kelasId, tahun, bulan }).then((l) => l[0] ?? null) : null),
    enabled: !!rencana?.id,
  })
  // Use the listed rencana directly if it already carries items, else fetch.
  const { data: fullRencana } = useQuery({
    queryKey: ['rencana-full', rencana?.id],
    queryFn: async () => {
      if (!rencana) return null
      // Reuse the GET-by-id route via the api/rencana helper.
      const { getRencana } = await import('@/api/rencana')
      return getRencana(rencana.id)
    },
    enabled: !!rencana?.id,
  })
  // Suppress unused rencanaDetail (kept for query coalescing).
  void rencanaDetail

  const items = fullRencana?.items ?? []

  // Mutations
  const ensureMut = useMutation({
    mutationFn: () => ensureRencana({ kelasId, tahun, bulan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rencana', kelasId, tahun, bulan] })
    },
  })
  const addMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let id = rencana?.id
      if (!id) id = (await ensureMut.mutateAsync()).id
      return addRencanaItems(id, ids)
    },
    onSuccess: () => {
      toast(t('kelasSection.rencana.addedToRencana'), 'success')
      qc.invalidateQueries({ queryKey: ['rencana', kelasId, tahun, bulan] })
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
      setPicking(false)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.rencana.addFailed'), 'error'),
  })

  const addLibMut = useMutation({
    mutationFn: async (input: {
      libraryKind: 'quran' | 'hadits' | 'tilawati' | 'doa'
      libraryAspect?: string
      libraryRef: string
    }) => {
      let id = rencana?.id
      if (!id) id = (await ensureMut.mutateAsync()).id
      return addRencanaLibraryItem(id, input)
    },
    onSuccess: () => {
      toast(t('kelasSection.rencana.libraryAdded'), 'success')
      qc.invalidateQueries({ queryKey: ['rencana', kelasId, tahun, bulan] })
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
      setPickingLibrary(false)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.rencana.libraryAddFailed'), 'error'),
  })
  const toggleMut = useMutation({
    mutationFn: ({ itemId, selesai }: { itemId: string; selesai: boolean }) =>
      toggleRencanaItem(itemId, selesai),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
    },
  })
  const removeMut = useMutation({
    mutationFn: removeRencanaItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
    },
  })

  // Group items by tema. Library-sourced items (no ajar) all collect under
  // a synthetic "LIBRARY" group rendered last.
  const groupedItems = useMemo(() => {
    const m: Record<string, typeof items> = {}
    for (const it of items) {
      const tema = it.libraryKind
        ? 'LIBRARY'
        : (it.ajar?.tema || 'ALIM').toUpperCase()
      ;(m[tema] = m[tema] || []).push(it)
    }
    const orderedKeys = [
      ...TEMA_ORDER.filter((k) => m[k]),
      ...Object.keys(m).filter((k) => !TEMA_ORDER.includes(k) && k !== 'LIBRARY').sort(),
      ...(m['LIBRARY'] ? ['LIBRARY'] : []),
    ]
    return orderedKeys.map((k) => ({ tema: k, items: m[k] }))
  }, [items])

  const totalItems = items.length
  const doneItems = items.filter((i) => i.selesai).length

  const toggleTema = (t: string) =>
    setCollapsedTemas((p) => {
      const n = new Set(p)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })

  const plannedIds = useMemo(
    () => new Set(items.map((i) => i.materiAjarId).filter((x): x is string => Boolean(x))),
    [items],
  )

  return (
    <PageShell>
      {/* Filter card */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1" style={{ minWidth: 160 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kelasSection.rencana.lingkup')}
            </label>
            <select
              value={kelasMode}
              onChange={(e) => setKelasMode(e.target.value as 'all' | 'mine')}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="all">{t('kelasSection.rencana.allKelas')}</option>
              <option value="mine">{t('kelasSection.rencana.myKelas')}</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kelasSection.rencana.kelas')}
            </label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="">{t('kelasSection.rencana.kelasPrompt')}</option>
              {visibleKelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama} — {k.tingkat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1" style={{ width: 120 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kelasSection.rencana.tahun')}
            </label>
            <Input
              type="number"
              min={2000}
              max={2200}
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1" style={{ minWidth: 160 }}>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kelasSection.rencana.bulan')}
            </label>
            <select
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {BULAN.map((b, i) => (
                <option key={i + 1} value={i + 1}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && selKelas ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPicking(true)}>
                <Plus size={16} className="mr-1" /> {t('kelasSection.rencana.fromKurikulum')}
              </Button>
              <Button variant="secondary" onClick={() => setPickingLibrary(true)}>
                <Plus size={16} className="mr-1" /> {t('kelasSection.rencana.library')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Month strip */}
      {selKelas ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs text-slate-500">
            {t('kelasSection.rencana.semesterProgress', {
              sem1: BULAN_PENDEK[SEM1_START - 1],
              sem2: BULAN_PENDEK[SEM2_START - 1],
            })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {monthOrder.map((entry, idx) => {
              const active = entry.month === bulan
              const semMarker = idx === 0 ? '#1' : entry.isSem2Start ? '#2' : null
              return (
                <button
                  key={`${entry.month}-${idx}`}
                  type="button"
                  onClick={() => setBulan(entry.month)}
                  className={cn(
                    'min-w-[64px] rounded-md border px-2 py-1.5 text-left text-xs transition',
                    active
                      ? 'border-sky-500 bg-sky-50 text-sky-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                  )}
                  title={t('kelasSection.rencana.semesterTitle', { n: entry.semester })}
                >
                  <div className="font-semibold">
                    {BULAN_PENDEK[entry.month - 1]}
                    {semMarker ? (
                      <span className="ml-1 text-[10px] font-normal text-slate-400">· {semMarker}</span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Plan card */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {t('kelasSection.rencana.rencanaHeading', { bulan: BULAN[bulan - 1], tahun })}
            {rencana ? (
              <span className="ml-2 text-sm font-normal text-slate-500">
                · {t('kelasSection.rencana.tuntasOf', { done: doneItems, total: totalItems })}
              </span>
            ) : null}
          </h3>
        </div>

        {!selKelas ? (
          <p className="text-sm text-slate-500">{t('kelasSection.rencana.pickKelasFirst')}</p>
        ) : !rencana ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <p className="font-medium text-slate-700">{t('kelasSection.rencana.emptyTitle')}</p>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin
                ? t('kelasSection.rencana.emptyHintAdmin')
                : t('kelasSection.rencana.emptyHintUser')}
            </p>
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">{t('kelasSection.rencana.rencanaEmptyItems')}</p>
        ) : (
          <div className="space-y-3">
            {groupedItems.map((g) => {
              const collapsed = collapsedTemas.has(g.tema)
              const total = g.items.length
              const tuntas = g.items.filter((it) => it.selesai).length
              const color = TEMA_COLOR[g.tema] || '#475569'
              return (
                <div
                  key={g.tema}
                  className="overflow-hidden rounded-md border border-slate-200"
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleTema(g.tema)}
                    className="flex w-full items-center gap-2 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="font-semibold" style={{ color }}>
                      {TEMA_LABEL[g.tema] || g.tema}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: color + '22', color }}
                    >
                      {t('kelasSection.rencana.groupTuntasOf', { done: tuntas, total })}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </button>
                  {!collapsed ? (
                    <ul className="divide-y divide-slate-100 border-t border-slate-200">
                      {g.items.map((it, idx) => (
                        <li key={it.id} className="flex items-start gap-3 bg-white px-3 py-2">
                          <span className="mt-1 w-6 text-right text-sm text-slate-400">{idx + 1}.</span>
                          <button
                            type="button"
                            onClick={() =>
                              isAdmin && toggleMut.mutate({ itemId: it.id, selesai: !it.selesai })
                            }
                            disabled={!isAdmin}
                            className={cn(
                              'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition',
                              it.selesai
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-300 bg-white text-transparent hover:border-emerald-400',
                              !isAdmin && 'cursor-default opacity-70',
                            )}
                            aria-label={it.selesai ? t('kelasSection.rencana.markIncomplete') : t('kelasSection.rencana.markComplete')}
                            title={it.selesai ? t('kelasSection.rencana.markIncomplete') : t('kelasSection.rencana.markComplete')}
                          >
                            <Check size={14} />
                          </button>
                          <div className="min-w-0 flex-1">
                            {it.ajar ? (
                              <>
                                <div className="text-xs text-slate-500">
                                  {it.ajar.tema} · {it.ajar.subTema}
                                </div>
                                {it.ajar.kelompokMateri ? (
                                  <div
                                    className={cn(
                                      'text-sm',
                                      it.selesai ? 'font-bold' : 'font-medium',
                                    )}
                                  >
                                    {it.ajar.kelompokMateri}
                                  </div>
                                ) : null}
                                <div className={cn(it.selesai ? 'font-semibold' : '')}>
                                  {it.ajar.detailMateri}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                                    {t('kelasSection.rencana.semChip', { n: it.ajar.semester })}
                                  </span>
                                </div>
                              </>
                            ) : it.libraryKind ? (
                              <LibraryRefLabel
                                libraryKind={it.libraryKind}
                                libraryRef={it.libraryRef}
                                libraryAspect={it.libraryAspect}
                                className={cn(it.selesai ? 'font-semibold' : '')}
                              />
                            ) : (
                              <div className="text-sm italic text-slate-500">
                                {t('kelasSection.rencana.materiDeleted')}
                              </div>
                            )}
                          </div>
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirm({ message: t('kelasSection.rencana.confirmRemove'), danger: true })) removeMut.mutate(it.id)
                              }}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                              aria-label={t('kelasSection.rencana.removeItem')}
                              title={t('kelasSection.rencana.removeFromRencana')}
                            >
                              <X size={14} />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {picking && selKelas ? (
        <KurikulumPickerDialog
          tingkat={selKelas.tingkat}
          alreadyPicked={plannedIds}
          onPick={(ids) => addMut.mutate(ids)}
          onClose={() => setPicking(false)}
          pending={addMut.isPending}
        />
      ) : null}

      {pickingLibrary && selKelas ? (
        <RencanaLibraryDialog
          onSave={(v) =>
            addLibMut.mutate({
              libraryKind: v.libraryKind as 'quran' | 'hadits' | 'tilawati' | 'doa',
              libraryAspect: v.libraryAspect ?? undefined,
              libraryRef: v.libraryRef ?? '',
            })
          }
          onClose={() => setPickingLibrary(false)}
          pending={addLibMut.isPending}
        />
      ) : null}
    </PageShell>
  )
}

// Library item picker for Rencana Ajar — reuses MateriSourcePicker locked
// to the non-kurikulum sources. Saves one library item at a time.
function RencanaLibraryDialog({
  onSave,
  onClose,
  pending,
}: {
  onSave: (v: MateriSourceValue) => void
  onClose: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  // Force non-kurikulum starting state — pre-pick Quran since that's the
  // most common.
  const [value, setValue] = useState<MateriSourceValue>(() => {
    const v = emptyMateriSourceValue()
    v.libraryKind = 'quran'
    v.libraryAspect = 'reciting'
    return v
  })
  const ready = value.libraryKind !== 'kurikulum' && (value.libraryRef ?? '').trim() !== ''
  return (
    <Dialog title={t('kelasSection.rencana.libraryDialogTitle')} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Lock the kurikulum tile by hiding it via local handler. */}
        <MateriSourcePicker
          value={value}
          onChange={setValue}
          hideKinds={['kurikulum']}
        />
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onSave(value)} disabled={!ready || pending}>
            {pending ? t('kelasSection.rencana.adding') : t('kelasSection.rencana.add')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// -----------------------------------------------------------------------

function KurikulumPickerDialog({
  tingkat,
  alreadyPicked,
  onPick,
  onClose,
  pending,
}: {
  tingkat: string
  alreadyPicked: Set<string>
  onPick: (ids: string[]) => void
  onClose: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [semester, setSemester] = useState<'1' | '2'>('1')

  const { data: materi = [], isPending } = useQuery({
    queryKey: ['materi-ajar', { tingkat }],
    queryFn: () => listMateriAjar({ tingkat }),
    staleTime: 60_000,
  })

  // Tingkat list is fetched too in case the user wants to pick from another
  // tingkat — but for simplicity we lock to the selected kelas's tingkat.
  void useQuery({ queryKey: ['tingkat'], queryFn: listTingkat, staleTime: 5 * 60_000 })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return materi.filter((m) => {
      if (alreadyPicked.has(m.id)) return false
      if (String(m.semester) !== semester) return false
      if (!q) return true
      return (
        (m.tema || '').toLowerCase().includes(q) ||
        (m.subTema || '').toLowerCase().includes(q) ||
        (m.detailMateri || '').toLowerCase().includes(q) ||
        (m.kelompokMateri || '').toLowerCase().includes(q)
      )
    })
  }, [materi, alreadyPicked, search, semester])

  const grouped = useMemo(() => {
    const m: Record<string, MateriAjar[]> = {}
    for (const it of filtered) {
      const t = (it.tema || 'ALIM').toUpperCase()
      ;(m[t] = m[t] || []).push(it)
    }
    return [
      ...TEMA_ORDER.filter((k) => m[k]),
      ...Object.keys(m).filter((k) => !TEMA_ORDER.includes(k)).sort(),
    ].map((k) => ({ tema: k, items: m[k] }))
  }, [filtered])

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Dialog title={t('kelasSection.rencana.kurikulumDialogTitle', { tingkat })} onClose={onClose} size="lg">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={t('kelasSection.rencana.searchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
          {(['1', '2'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSemester(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold',
                semester === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {t('kelasSection.rencana.semBtn', { n: s })}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 max-h-[55vh] overflow-y-auto rounded-md border border-slate-200">
        {isPending ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{t('kelasSection.rencana.loadingMateri')}</p>
        ) : grouped.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {t('kelasSection.rencana.noMatchSemester')}
          </p>
        ) : (
          grouped.map((g) => {
            const color = TEMA_COLOR[g.tema] || '#475569'
            return (
              <div key={g.tema} className="border-b border-slate-100 last:border-b-0">
                <div
                  className="bg-slate-50 px-3 py-1.5 text-xs font-semibold"
                  style={{ color, borderLeft: `4px solid ${color}` }}
                >
                  {TEMA_LABEL[g.tema] || g.tema} · {g.items.length}
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.items.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 transition hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={picked.has(m.id)}
                          onChange={() => toggle(m.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-500">
                            {m.tema} · {m.subTema}
                            {m.kelompokMateri ? ` · ${m.kelompokMateri}` : ''}
                          </div>
                          <div className="text-sm">{m.detailMateri}</div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-xs text-slate-500">{t('kelasSection.rencana.pickedCount', { count: picked.size })}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onPick(Array.from(picked))} disabled={pending || picked.size === 0}>
            {pending
              ? t('kelasSection.rencana.adding')
              : picked.size > 0
                ? t('kelasSection.rencana.addCount', { count: picked.size })
                : t('kelasSection.rencana.add')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

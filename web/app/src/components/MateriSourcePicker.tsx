import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'

import { listMateriAjar, listTingkat, type MateriAjar } from '@/api/kurikulum'
import { listQuranSurahs } from '@/api/quran'
import { listKitab, type HaditsKitab } from '@/api/hadits'
import { listDoa } from '@/api/doa'
import type { LibraryAspect, LibraryKind, SesiLibraryItem } from '@/api/sesi'
import { TILAWATI_JILID, TILAWATI_LEARNING_START } from '@/lib/tilawati'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'

/**
 * MateriSourcePicker — choose what content the sesi will cover. The user
 * first picks a library (Kurikulum / Al-Qur'an / Hadits / Tilawati / Doa),
 * then narrows down inside that library.
 *
 * The picker is fully controlled — parent owns the value object and gets
 * notified via `onChange`. When the user changes library, the rest of the
 * fields reset.
 */

export type MateriSourceValue = {
  libraryKind: LibraryKind
  libraryAspect: LibraryAspect | null
  libraryRef: string | null
  /** Used by kurikulum kind only — list of picked MateriAjar row ids. */
  materiAjarIds: string[]
  /** Accumulated non-kurikulum picks across multiple add actions. The single
   *  libraryKind/libraryAspect/libraryRef fields remain as the user's draft;
   *  pressing "Tambah ke daftar" pushes the draft into this list. */
  libraryItems: SesiLibraryItem[]
  /** Per-kind selection scratch space — preserved so changing aspect doesn't
   *  blow away the user's drilldown. */
  kurikulum: {
    tingkat: string
  }
  quran: {
    surah: string // surah id as string
    ayatFrom: string
    ayatTo: string
  }
  hadits: {
    kitabSlug: string
    nomorFrom: string
    nomorTo: string
  }
  tilawati: {
    jilid: string
    pageFrom: string
    pageTo: string
  }
  doa: {
    doaId: string
  }
}

const ASPECTS_BY_KIND: Record<LibraryKind, LibraryAspect[]> = {
  kurikulum: [],
  quran: ['reciting', 'memorizing', 'review', 'manqul'],
  hadits: ['manqul'],
  tilawati: ['reciting'],
  doa: ['memorizing', 'review'],
}

export function emptyMateriSourceValue(defaultTingkat?: string): MateriSourceValue {
  return {
    libraryKind: 'kurikulum',
    libraryAspect: null,
    libraryRef: null,
    materiAjarIds: [],
    libraryItems: [],
    kurikulum: {
      tingkat: defaultTingkat ?? '',
    },
    quran: { surah: '', ayatFrom: '', ayatTo: '' },
    hadits: { kitabSlug: '', nomorFrom: '', nomorTo: '' },
    tilawati: { jilid: '', pageFrom: '', pageTo: '' },
    doa: { doaId: '' },
  }
}

export function MateriSourcePicker({
  value,
  onChange,
  fixedTingkat,
  hideKinds,
  multipleLibrary,
}: {
  value: MateriSourceValue
  onChange: (v: MateriSourceValue) => void
  /** When set, the Kurikulum panel locks to this tingkat (used when the
   *  sesi is bound to a kelas — the kelas's tingkat is canonical). */
  fixedTingkat?: string
  /** Tile kinds to hide from the source-tile grid. Used by callers that
   *  want library-only flows (e.g. "+ Library" in the SesiEndDialog
   *  hides the kurikulum tile, since kurikulum has its own "+ Kurikulum"
   *  button). */
  hideKinds?: LibraryKind[]
  /** When true, enables the multi-library workflow: a chip list of accumulated
   *  picks plus a "Tambah ke daftar" button for the non-kurikulum kinds.
   *  Callers that need single-shot pick semantics (legacy library-ref add
   *  dialogs) leave this off. */
  multipleLibrary?: boolean
}) {
  const { t } = useTranslation()

  const ASPECT_LABEL: Record<LibraryAspect, string> = {
    reciting: t('materiComp.source.aspectReciting'),
    memorizing: t('materiComp.source.aspectMemorizing'),
    review: t('materiComp.source.aspectReview'),
    manqul: t('materiComp.source.aspectManqul'),
  }

  const KIND_LABEL: Record<LibraryKind, string> = {
    kurikulum: t('materiComp.source.kindKurikulum'),
    quran: t('materiComp.source.kindQuran'),
    hadits: t('materiComp.source.kindHadits'),
    tilawati: t('materiComp.source.kindTilawati'),
    doa: t('materiComp.source.kindDoa'),
  }

  const set = (patch: Partial<MateriSourceValue>) => onChange({ ...value, ...patch })

  // Keep the kurikulum tingkat in sync with the fixed value coming from the
  // parent kelas. Done as an effect so we don't infinite-loop.
  useEffect(() => {
    if (!fixedTingkat) return
    if (value.kurikulum.tingkat === fixedTingkat) return
    onChange({
      ...value,
      kurikulum: { ...value.kurikulum, tingkat: fixedTingkat },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedTingkat])

  const isKurikulum = value.libraryKind === 'kurikulum'
  const canAddCurrent = !isKurikulum && Boolean(value.libraryRef)

  const addCurrent = () => {
    if (!canAddCurrent || isKurikulum) return
    const item: SesiLibraryItem = {
      libraryKind: value.libraryKind as Exclude<LibraryKind, 'kurikulum'>,
      libraryAspect: value.libraryAspect,
      libraryRef: value.libraryRef!,
    }
    const patch: Partial<MateriSourceValue> = {
      libraryItems: [...value.libraryItems, item],
      libraryRef: null,
    }
    if (value.libraryKind === 'quran') {
      patch.quran = { surah: '', ayatFrom: '', ayatTo: '' }
    } else if (value.libraryKind === 'hadits') {
      patch.hadits = { kitabSlug: '', nomorFrom: '', nomorTo: '' }
    } else if (value.libraryKind === 'tilawati') {
      patch.tilawati = { jilid: '', pageFrom: '', pageTo: '' }
    } else if (value.libraryKind === 'doa') {
      patch.doa = { doaId: '' }
    }
    set(patch)
  }

  const removeItem = (idx: number) =>
    set({ libraryItems: value.libraryItems.filter((_, i) => i !== idx) })

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/50 p-3">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">{t('materiComp.source.label')}</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(KIND_LABEL) as LibraryKind[])
            .filter((k) => !hideKinds?.includes(k))
            .map((k) => (
              <SourceTile
                key={k}
                kind={k}
                label={KIND_LABEL[k]}
                selected={value.libraryKind === k}
                onPick={() => {
                  const aspects = ASPECTS_BY_KIND[k]
                  set({
                    libraryKind: k,
                    libraryAspect: aspects[0] ?? null,
                    libraryRef: null,
                  })
                }}
              />
            ))}
        </div>
      </div>

      {multipleLibrary && value.libraryItems.length > 0 ? (
        <section>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('materiComp.source.libraryListLabel', { count: value.libraryItems.length })}
          </label>
          <ul className="space-y-1">
            {value.libraryItems.map((it, i) => (
              <li
                key={`${it.libraryKind}-${it.libraryRef}-${i}`}
                className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
              >
                <span className="mt-0.5 w-5 text-right text-slate-400">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase text-slate-500">
                    {KIND_LABEL[it.libraryKind]}
                    {it.libraryAspect ? ` · ${ASPECT_LABEL[it.libraryAspect]}` : ''}
                  </div>
                  <div className="text-sm font-medium text-slate-800">{it.libraryRef}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  aria-label={t('materiComp.source.removeMateriAria')}
                  title={t('materiComp.source.removeMateriTitle')}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isKurikulum ? (
        <KurikulumPicker value={value} set={set} fixedTingkat={fixedTingkat} />
      ) : null}

      {!isKurikulum ? (
        <Field label={t('materiComp.source.aspect')} htmlFor="src-aspect">
          <div className="flex flex-wrap gap-2">
            {ASPECTS_BY_KIND[value.libraryKind].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => set({ libraryAspect: a })}
                className={
                  'rounded-full border px-3 py-1 text-xs font-medium transition ' +
                  (value.libraryAspect === a
                    ? 'border-sky-500 bg-sky-500 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
                }
              >
                {ASPECT_LABEL[a]}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      {value.libraryKind === 'quran' ? <QuranPicker value={value} set={set} /> : null}
      {value.libraryKind === 'hadits' ? <HaditsPicker value={value} set={set} /> : null}
      {value.libraryKind === 'tilawati' ? <TilawatiPicker value={value} set={set} /> : null}
      {value.libraryKind === 'doa' ? <DoaPicker value={value} set={set} /> : null}

      {multipleLibrary && !isKurikulum ? (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
          <p className="text-[11px] text-slate-500">
            {t('materiComp.source.addToListHint')}
          </p>
          <button
            type="button"
            onClick={addCurrent}
            disabled={!canAddCurrent}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus size={14} /> {t('materiComp.source.addToListBtn')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

// Sitrac-style source tile: emoji icon + title + short subtitle, selectable
// like a radio. Grid lays them 2-col on mobile, 5-col on desktop.
const KIND_TILE: Record<LibraryKind, { icon: string; subKey: string; accent: string }> = {
  kurikulum: { icon: '🎓', subKey: 'materiComp.source.subKurikulum', accent: 'bg-violet-50' },
  quran: { icon: '📖', subKey: 'materiComp.source.subQuran', accent: 'bg-emerald-50' },
  hadits: { icon: '📜', subKey: 'materiComp.source.subHadits', accent: 'bg-amber-50' },
  tilawati: { icon: '📚', subKey: 'materiComp.source.subTilawati', accent: 'bg-sky-50' },
  doa: { icon: '🤲', subKey: 'materiComp.source.subDoa', accent: 'bg-rose-50' },
}

function SourceTile({
  kind,
  label,
  selected,
  onPick,
}: {
  kind: LibraryKind
  label: string
  selected: boolean
  onPick: () => void
}) {
  const { t } = useTranslation()
  const meta = KIND_TILE[kind]
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={
        'flex flex-col items-center gap-1 rounded-lg border-2 bg-white p-3 text-center transition ' +
        (selected
          ? 'border-sky-500 bg-sky-50 shadow-sm'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')
      }
    >
      <span
        className={
          'flex h-10 w-10 items-center justify-center rounded-full text-xl ' + meta.accent
        }
      >
        {meta.icon}
      </span>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <span className="text-[10px] leading-tight text-slate-500">{t(meta.subKey)}</span>
    </button>
  )
}

// ---------------------------------------------------------------- Kurikulum

// Hierarchical kurikulum browser styled like the Settings → Kurikulum tab.
// Tema (color-coded, collapsible) → Sub-tema (collapsible) → Kelompok
// (collapsible) → individual materi rows (radio-select). One materi is
// "picked" at a time; the chosen id is mirrored into value.materiAjarId.

const TEMA_ORDER = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']
const TEMA_LABEL: Record<string, string> = {
  ALIM: '🕌 Alim',
  FAQIH: '📚 Faqih',
  'AKHLAQUL KARIMAH': '✨ Akhlaqul Karimah',
  KEMANDIRIAN: '🎯 Kemandirian',
}
const TEMA_COLOR: Record<string, string> = {
  ALIM: '#5b6f4e',
  FAQIH: '#b88a3a',
  'AKHLAQUL KARIMAH': '#8a5cd6',
  KEMANDIRIAN: '#3a8a8a',
}

// Kurikulum picker — chips of picked materi + "+ Tambah materi" button.
// The button opens a modal showing the hierarchical tree (Settings>Kurikulum
// style) with checkboxes; user can pick multiple at once.
function KurikulumPicker({
  value,
  set,
  fixedTingkat,
}: {
  value: MateriSourceValue
  set: (patch: Partial<MateriSourceValue>) => void
  fixedTingkat?: string
}) {
  const { t } = useTranslation()
  const k = value.kurikulum
  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })
  const activeTingkat = fixedTingkat || k.tingkat
  const { data: materiList = [] } = useQuery({
    queryKey: ['materi-ajar', { tingkat: activeTingkat }],
    queryFn: () => listMateriAjar({ tingkat: activeTingkat || undefined }),
    enabled: Boolean(activeTingkat),
    staleTime: 60_000,
  })

  const [pickerOpen, setPickerOpen] = useState(false)

  // Resolve picked ids back to MateriAjar rows for chip rendering.
  const pickedItems = useMemo(() => {
    const byId = new Map(materiList.map((m) => [m.id, m]))
    return value.materiAjarIds
      .map((id) => byId.get(id))
      .filter((m): m is MateriAjar => Boolean(m))
  }, [materiList, value.materiAjarIds])

  const removeOne = (id: string) =>
    set({ materiAjarIds: value.materiAjarIds.filter((x) => x !== id) })

  return (
    <div className="space-y-3">
      {fixedTingkat ? (
        <div className="text-xs text-slate-500">
          {t('materiComp.source.tingkatLabel')}: <span className="font-semibold text-slate-700">{fixedTingkat}</span>
        </div>
      ) : (
        <Field label={t('materiComp.source.tingkatLabel')} htmlFor="kur-tingkat">
          <select
            id="kur-tingkat"
            value={k.tingkat}
            onChange={(e) =>
              set({
                kurikulum: { tingkat: e.target.value },
                materiAjarIds: [],
              })
            }
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
          >
            <option value="">{t('materiComp.source.tingkatPick')}</option>
            {tingkatList.map((tk) => (
              <option key={tk.id} value={tk.nama}>
                {tk.nama}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Picked materi chips. */}
      {pickedItems.length > 0 ? (
        <ul className="space-y-1">
          {pickedItems.map((m, i) => (
            <li
              key={m.id}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
            >
              <span className="mt-0.5 w-5 text-right text-slate-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-500">
                  {m.tema} · {m.subTema}
                </div>
                <div className="text-sm">{m.detailMateri}</div>
              </div>
              <button
                type="button"
                onClick={() => removeOne(m.id)}
                className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                aria-label={t('materiComp.source.removeMateriAria')}
                title={t('materiComp.source.removeMateriPilihan')}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={!activeTingkat}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus size={14} /> {t('materiComp.source.openKurikulum')}
      </button>

      {pickerOpen ? (
        <KurikulumMultiPickerDialog
          tingkat={activeTingkat}
          picked={new Set(value.materiAjarIds)}
          onCommit={(ids) => {
            const merged = [...value.materiAjarIds]
            const have = new Set(merged)
            for (const id of ids) if (!have.has(id)) merged.push(id)
            set({ materiAjarIds: merged })
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  )
}

// Multi-select hierarchical picker — opens in a modal. Mirrors the layout
// of Settings → Kurikulum: tema (color-coded) → sub-tema → kelompok → items
// with checkboxes. The dialog owns its own draft state and commits on save.
export function KurikulumMultiPickerDialog({
  tingkat,
  picked,
  onCommit,
  onClose,
}: {
  tingkat: string
  picked: Set<string>
  onCommit: (ids: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data: rawMateri = [], isPending } = useQuery({
    queryKey: ['materi-ajar', { tingkat }],
    queryFn: () => listMateriAjar({ tingkat: tingkat || undefined }),
    enabled: Boolean(tingkat),
    staleTime: 60_000,
  })

  // Hide materi that are already on the picker's chip list — dialog is a
  // "tambah ke daftar" flow, not an edit flow. Removal happens via the chip
  // X buttons in the parent picker.
  const materi = useMemo(() => rawMateri.filter((m) => !picked.has(m.id)), [rawMateri, picked])

  const noTema = t('materiComp.source.noTema')
  const [draft, setDraft] = useState<Set<string>>(() => new Set())
  const [openTemas, setOpenTemas] = useState<Set<string>>(new Set())
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const [openKels, setOpenKels] = useState<Set<string>>(new Set())

  // Auto-expand temas that contain already-picked items, plus the first tema
  // when nothing is picked yet — improves multi-select discoverability.
  useEffect(() => {
    if (materi.length === 0) return
    const tWithPicks = new Set<string>()
    for (const m of materi) {
      if (draft.has(m.id)) {
        const key = (m.tema || '').toUpperCase() || noTema
        tWithPicks.add(key)
      }
    }
    setOpenTemas((cur) => {
      if (cur.size > 0) return cur
      if (tWithPicks.size > 0) return tWithPicks
      const first = (materi[0].tema || '').toUpperCase() || noTema
      return new Set([first])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materi])

  const grouped = useMemo(() => {
    const byTema: Record<string, MateriAjar[]> = {}
    for (const m of materi) {
      const key = (m.tema || '').toUpperCase() || noTema
      ;(byTema[key] = byTema[key] || []).push(m)
    }
    const orderedKeys = [
      ...TEMA_ORDER.filter((t) => byTema[t]),
      ...Object.keys(byTema).filter((t) => !TEMA_ORDER.includes(t)).sort(),
    ]
    return orderedKeys.map((tema) => {
      const bySub: Record<string, MateriAjar[]> = {}
      const subOrder: string[] = []
      for (const m of byTema[tema]) {
        const sub = m.subTema || '—'
        if (!bySub[sub]) {
          bySub[sub] = []
          subOrder.push(sub)
        }
        bySub[sub].push(m)
      }
      const subs = subOrder.map((subTema) => {
        const items = bySub[subTema]
        const byKelompok: Record<string, MateriAjar[]> = {}
        const orderKel: string[] = []
        for (const m of items) {
          const kel = (m.kelompokMateri || '').trim()
          if (!byKelompok[kel]) {
            byKelompok[kel] = []
            orderKel.push(kel)
          }
          byKelompok[kel].push(m)
        }
        const kelompoks = orderKel
          .filter((kel) => kel && byKelompok[kel].length >= 2)
          .map((kelompokMateri) => ({ kelompokMateri, items: byKelompok[kelompokMateri] }))
        const groupedIds = new Set(kelompoks.flatMap((kg) => kg.items.map((x) => x.id)))
        const flat = items.filter((x) => !groupedIds.has(x.id))
        return { subTema, kelompoks, flat }
      })
      return { tema, subs }
    })
  }, [materi, noTema])

  const toggleDraft = (id: string) =>
    setDraft((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleSet = (s: Set<string>, key: string, setter: (s: Set<string>) => void) =>
    setter(new Set(s.has(key) ? [...s].filter((x) => x !== key) : [...s, key]))

  return (
    <Dialog title={t('materiComp.source.multiPickerTitle')} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {t('materiComp.source.multiHint')}
        </div>
        <div className="text-xs text-slate-500">
          {t('materiComp.source.multiTingkat')} <span className="font-semibold text-slate-700">{tingkat || '—'}</span>
          {' · '}
          <span className="font-semibold text-slate-700">{t('materiComp.source.multiCountAdd', { count: draft.size })}</span>
          {picked.size > 0 ? (
            <>
              {' · '}
              <span className="text-slate-500">{t('materiComp.source.multiCountExisting', { count: picked.size })}</span>
            </>
          ) : null}
        </div>

        {isPending ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{t('materiComp.source.multiLoading')}</p>
        ) : grouped.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {picked.size > 0
              ? t('materiComp.source.multiAllInList')
              : t('materiComp.source.multiEmpty')}
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
            {grouped.map((g) => {
              const tCollapsed = !openTemas.has(g.tema)
              const color = TEMA_COLOR[g.tema] || '#475569'
              let temaPicked = 0
              let temaTotal = 0
              for (const sub of g.subs) {
                for (const kg of sub.kelompoks) {
                  for (const m of kg.items) {
                    temaTotal++
                    if (draft.has(m.id)) temaPicked++
                  }
                }
                for (const m of sub.flat) {
                  temaTotal++
                  if (draft.has(m.id)) temaPicked++
                }
              }
              return (
                <div
                  key={g.tema}
                  className="border-b border-slate-100 last:border-b-0"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSet(openTemas, g.tema, setOpenTemas)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50"
                    style={{ color }}
                  >
                    {tCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span className="flex-1">{TEMA_LABEL[g.tema] || g.tema}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {temaPicked > 0 ? `${temaPicked} / ${temaTotal}` : temaTotal}
                    </span>
                  </button>
                  {!tCollapsed
                    ? g.subs.map((sub) => {
                        const subKey = `${g.tema}::${sub.subTema}`
                        const sCollapsed = !openSubs.has(subKey)
                        return (
                          <div key={subKey} className="border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => toggleSet(openSubs, subKey, setOpenSubs)}
                              className="flex w-full items-center gap-2 px-5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              {sCollapsed ? (
                                <ChevronRight size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                              {sub.subTema}
                            </button>
                            {!sCollapsed ? (
                              <div>
                                {sub.kelompoks.map((kg) => {
                                  const kKey = `${subKey}::${kg.kelompokMateri}`
                                  const kCollapsed = !openKels.has(kKey)
                                  return (
                                    <div key={kKey} className="border-t border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => toggleSet(openKels, kKey, setOpenKels)}
                                        className="flex w-full items-center gap-2 px-7 py-1.5 text-left text-[11px] uppercase tracking-wide text-slate-500 transition hover:bg-slate-50"
                                      >
                                        {kCollapsed ? (
                                          <ChevronRight size={12} />
                                        ) : (
                                          <ChevronDown size={12} />
                                        )}
                                        {kg.kelompokMateri}
                                      </button>
                                      {!kCollapsed ? (
                                        <ul className="bg-slate-50/50">
                                          {kg.items.map((m) => (
                                            <MateriRow
                                              key={m.id}
                                              m={m}
                                              selected={draft.has(m.id)}
                                              onToggle={() => toggleDraft(m.id)}
                                            />
                                          ))}
                                        </ul>
                                      ) : null}
                                    </div>
                                  )
                                })}
                                {sub.flat.length > 0 ? (
                                  <ul className="bg-slate-50/50">
                                    {sub.flat.map((m) => (
                                      <MateriRow
                                        key={m.id}
                                        m={m}
                                        selected={draft.has(m.id)}
                                        onToggle={() => toggleDraft(m.id)}
                                      />
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    : null}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onCommit([...draft])}
            disabled={draft.size === 0}
          >
            {t('materiComp.source.multiAddBtn', { count: draft.size })}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function MateriRow({
  m,
  selected,
  onToggle,
}: {
  m: MateriAjar
  selected: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <li>
      <label
        className={
          'flex cursor-pointer items-start gap-2 px-9 py-1.5 text-sm transition ' +
          (selected ? 'bg-sky-50' : 'hover:bg-slate-100')
        }
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">
            {t('materiComp.source.rowSem', { n: m.semester, kode: m.kodeMateri })}
          </div>
          <div className={selected ? 'font-medium text-slate-900' : 'text-slate-800'}>
            {m.detailMateri}
          </div>
        </div>
      </label>
    </li>
  )
}

// -------------------------------------------------------------------- Quran

function QuranPicker({
  value,
  set,
}: {
  value: MateriSourceValue
  set: (patch: Partial<MateriSourceValue>) => void
}) {
  const { t } = useTranslation()
  const q = value.quran
  const { data: surahs = [] } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
  })
  const surahInfo = q.surah ? surahs.find((s) => String(s.id) === q.surah) : null

  const update = (patch: Partial<MateriSourceValue['quran']>) => {
    const next = { ...q, ...patch }
    set({
      quran: next,
      libraryRef: buildQuranRef(next),
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t('materiComp.source.surah')} htmlFor="qrn-surah" className="sm:col-span-3">
        <select
          id="qrn-surah"
          value={q.surah}
          onChange={(e) => update({ surah: e.target.value, ayatFrom: '', ayatTo: '' })}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
        >
          <option value="">{t('materiComp.source.surahPick')}</option>
          {surahs.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {t('materiComp.source.surahDescOption', { id: s.id, nama: s.nama, n: s.jumlahAyat })}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('materiComp.source.ayatFrom')} htmlFor="qrn-from">
        <Input
          id="qrn-from"
          type="number"
          min={1}
          max={surahInfo?.jumlahAyat ?? 286}
          value={q.ayatFrom}
          disabled={!q.surah}
          onChange={(e) => update({ ayatFrom: e.target.value })}
          placeholder="1"
        />
      </Field>
      <Field label={t('materiComp.source.ayatTo')} htmlFor="qrn-to">
        <Input
          id="qrn-to"
          type="number"
          min={1}
          max={surahInfo?.jumlahAyat ?? 286}
          value={q.ayatTo}
          disabled={!q.surah}
          onChange={(e) => update({ ayatTo: e.target.value })}
          placeholder={surahInfo ? String(surahInfo.jumlahAyat) : ''}
        />
      </Field>
      <Field label={t('materiComp.source.ayatAll')} htmlFor="qrn-all" className="self-end">
        <button
          id="qrn-all"
          type="button"
          disabled={!q.surah}
          onClick={() =>
            update({ ayatFrom: '1', ayatTo: String(surahInfo?.jumlahAyat ?? '') })
          }
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {t('materiComp.source.fromAkhir')}
        </button>
      </Field>
    </div>
  )
}

function buildQuranRef(q: MateriSourceValue['quran']): string | null {
  if (!q.surah) return null
  const a = q.ayatFrom.trim()
  const b = q.ayatTo.trim()
  if (!a && !b) return q.surah
  if (a && !b) return `${q.surah}:${a}`
  if (!a && b) return `${q.surah}:${b}`
  return a === b ? `${q.surah}:${a}` : `${q.surah}:${a}-${b}`
}

// ------------------------------------------------------------------- Hadits

function HaditsPicker({
  value,
  set,
}: {
  value: MateriSourceValue
  set: (patch: Partial<MateriSourceValue>) => void
}) {
  const { t } = useTranslation()
  const h = value.hadits
  const { data: kitabs = [] } = useQuery({
    queryKey: ['hadits-kitab', 'hadits'],
    queryFn: () => listKitab('hadits'),
    staleTime: 60 * 60_000,
  })

  const update = (patch: Partial<MateriSourceValue['hadits']>) => {
    const next = { ...h, ...patch }
    set({
      hadits: next,
      libraryRef: buildHaditsRef(next),
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t('materiComp.source.kitab')} htmlFor="hdt-kitab" className="sm:col-span-3">
        <select
          id="hdt-kitab"
          value={h.kitabSlug}
          onChange={(e) => update({ kitabSlug: e.target.value, nomorFrom: '', nomorTo: '' })}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
        >
          <option value="">{t('materiComp.source.kitabPick')}</option>
          {kitabs.map((k: HaditsKitab) => (
            <option key={k.id} value={k.slug}>
              {k.nama}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('materiComp.source.nomorFrom')} htmlFor="hdt-from">
        <Input
          id="hdt-from"
          type="number"
          min={1}
          value={h.nomorFrom}
          disabled={!h.kitabSlug}
          onChange={(e) => update({ nomorFrom: e.target.value })}
          placeholder="1"
        />
      </Field>
      <Field label={t('materiComp.source.nomorTo')} htmlFor="hdt-to">
        <Input
          id="hdt-to"
          type="number"
          min={1}
          value={h.nomorTo}
          disabled={!h.kitabSlug}
          onChange={(e) => update({ nomorTo: e.target.value })}
          placeholder="10"
        />
      </Field>
      <Field label={t('materiComp.source.blank')} htmlFor="hdt-clear" className="self-end">
        <button
          id="hdt-clear"
          type="button"
          disabled={!h.kitabSlug}
          onClick={() => update({ nomorFrom: '', nomorTo: '' })}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {t('materiComp.source.reset')}
        </button>
      </Field>
    </div>
  )
}

function buildHaditsRef(h: MateriSourceValue['hadits']): string | null {
  if (!h.kitabSlug) return null
  const a = h.nomorFrom.trim()
  const b = h.nomorTo.trim()
  if (!a && !b) return h.kitabSlug
  if (a && !b) return `${h.kitabSlug}#${a}`
  if (!a && b) return `${h.kitabSlug}#${b}`
  return a === b ? `${h.kitabSlug}#${a}` : `${h.kitabSlug}#${a}-${b}`
}

// ----------------------------------------------------------------- Tilawati

function TilawatiPicker({
  value,
  set,
}: {
  value: MateriSourceValue
  set: (patch: Partial<MateriSourceValue>) => void
}) {
  const { t } = useTranslation()
  const tw = value.tilawati
  const jilid = tw.jilid ? TILAWATI_JILID.find((x) => String(x.id) === tw.jilid) : null

  const update = (patch: Partial<MateriSourceValue['tilawati']>) => {
    const next = { ...tw, ...patch }
    set({
      tilawati: next,
      libraryRef: buildTilawatiRef(next),
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label={t('materiComp.source.jilid')} htmlFor="tlw-jilid" className="sm:col-span-3">
        <select
          id="tlw-jilid"
          value={tw.jilid}
          onChange={(e) => update({ jilid: e.target.value, pageFrom: '', pageTo: '' })}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
        >
          <option value="">{t('materiComp.source.jilidPick')}</option>
          {TILAWATI_JILID.map((j) => (
            <option key={j.id} value={String(j.id)}>
              {t('materiComp.source.jilidOption', { n: j.id, pages: j.learningPages })}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('materiComp.source.pageFrom')} htmlFor="tlw-from">
        <Input
          id="tlw-from"
          type="number"
          min={TILAWATI_LEARNING_START}
          max={jilid?.pages ?? 46}
          value={tw.pageFrom}
          disabled={!tw.jilid}
          onChange={(e) => update({ pageFrom: e.target.value })}
          placeholder={String(TILAWATI_LEARNING_START)}
        />
      </Field>
      <Field label={t('materiComp.source.pageTo')} htmlFor="tlw-to">
        <Input
          id="tlw-to"
          type="number"
          min={TILAWATI_LEARNING_START}
          max={jilid?.pages ?? 46}
          value={tw.pageTo}
          disabled={!tw.jilid}
          onChange={(e) => update({ pageTo: e.target.value })}
          placeholder={jilid ? String(jilid.pages) : ''}
        />
      </Field>
      <Field label={t('materiComp.source.blank')} htmlFor="tlw-all" className="self-end">
        <button
          id="tlw-all"
          type="button"
          disabled={!tw.jilid}
          onClick={() =>
            update({
              pageFrom: String(TILAWATI_LEARNING_START),
              pageTo: String(jilid?.pages ?? ''),
            })
          }
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {t('materiComp.source.fromAkhir')}
        </button>
      </Field>
    </div>
  )
}

function buildTilawatiRef(tw: MateriSourceValue['tilawati']): string | null {
  if (!tw.jilid) return null
  // Clamp page numbers up to TILAWATI_LEARNING_START so the persisted ref
  // never points at the intro spread (pages 1 and 2 of every jilid). If
  // both endpoints fall below the learning range we treat the input as
  // "no page constraint" and reference the whole jilid.
  const clamp = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed) return ''
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n <= 0) return ''
    return String(Math.max(TILAWATI_LEARNING_START, Math.floor(n)))
  }
  const a = clamp(tw.pageFrom)
  const b = clamp(tw.pageTo)
  if (!a && !b) return tw.jilid
  if (a && !b) return `${tw.jilid}:${a}`
  if (!a && b) return `${tw.jilid}:${b}`
  return a === b ? `${tw.jilid}:${a}` : `${tw.jilid}:${a}-${b}`
}

// ---------------------------------------------------------------------- Doa

function DoaPicker({
  value,
  set,
}: {
  value: MateriSourceValue
  set: (patch: Partial<MateriSourceValue>) => void
}) {
  const { t } = useTranslation()
  const d = value.doa
  const { data: doas = [] } = useQuery({
    queryKey: ['doa-list'],
    queryFn: () => listDoa({}),
    staleTime: 60 * 60_000,
  })

  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return doas.slice(0, 30)
    return doas
      .filter((x) => x.nama.toLowerCase().includes(q))
      .slice(0, 50)
  }, [doas, search])

  const picked = d.doaId ? doas.find((x) => x.id === d.doaId) : null

  return (
    <div className="space-y-2">
      {picked ? (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase text-emerald-700">{t('materiComp.source.doaPickedBadge')}</div>
            <div className="text-sm text-slate-900">{picked.nama}</div>
          </div>
          <button
            type="button"
            onClick={() => set({ doa: { doaId: '' }, libraryRef: null })}
            className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label={t('materiComp.source.doaRemoveAria')}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}
      <Field label={t('materiComp.source.doaSearch')} htmlFor="doa-search">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            id="doa-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('materiComp.source.doaSearchPh')}
            className="pl-8"
          />
        </div>
      </Field>
      {search.trim() || !picked ? (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">
              {t('materiComp.source.doaNoMatch')}
            </li>
          ) : (
            filtered.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => {
                    set({ doa: { doaId: x.id }, libraryRef: x.id })
                    setSearch('')
                  }}
                  className={
                    'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm transition ' +
                    (x.id === d.doaId ? 'bg-sky-50' : 'hover:bg-slate-50')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{x.nama}</div>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

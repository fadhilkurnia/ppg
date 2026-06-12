import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

import {
  createMateriAjar,
  deleteMateriAjar,
  deleteMateriByTema,
  deleteMateriBySubTema,
  listMateriAjar,
  listTingkat,
  updateMateriAjar,
  type MateriAjar,
  type MateriAjarInput,
} from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { MateriAjarForm } from '@/components/MateriAjarForm'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

// Ported from sitrac-v3's KurikulumEditorSection — read-only viewer subset.
// Same 3-level grouping: tema → subTema → kelompokMateri.
const TEMA_ORDER = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']
const TEMA_LABEL: Record<string, string> = {
  ALIM: '🕌 Alim',
  FAQIH: '📚 Faqih',
  'AKHLAQUL KARIMAH': '✨ Akhlaqul Karimah',
  KEMANDIRIAN: '🎯 Kemandirian',
}
const TEMA_COLOR: Record<string, string> = {
  ALIM: '#5b6f4e', // sage
  FAQIH: '#b88a3a', // gold
  'AKHLAQUL KARIMAH': '#8a5cd6',
  KEMANDIRIAN: '#3a8a8a',
}
const REF_RE = /^\s*(sama dengan|idem|dtto)\b/i

type DialogMode =
  | { kind: 'create'; defaults?: Partial<MateriAjarInput> }
  | { kind: 'edit'; materi: MateriAjar }
  | null

export function KurikulumSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [tingkat, setTingkat] = useState('')
  const [semFilter, setSemFilter] = useState<'1' | '2'>('1')
  const [search, setSearch] = useState('')
  const [hideRefs, setHideRefs] = useState(true)
  const [collapsedTemas, setCollapsedTemas] = useState<Set<string>>(new Set())
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set())
  const [collapsedKelompoks, setCollapsedKelompoks] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<DialogMode>(null)

  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['materi-ajar'] })

  const createMut = useMutation({
    mutationFn: (input: MateriAjarInput) => createMateriAjar(input),
    onSuccess: () => {
      toast(t('kurikulum.addedMateri'), 'success')
      setDialog(null)
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('kurikulum.addMateriFailed')), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: MateriAjarInput }) =>
      updateMateriAjar(id, input),
    onSuccess: () => {
      toast(t('kurikulum.updatedMateri'), 'success')
      setDialog(null)
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('kurikulum.updateMateriFailed')), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMateriAjar,
    onSuccess: () => {
      toast(t('kurikulum.deletedMateri'), 'success')
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('kurikulum.deleteMateriFailed')), 'error'),
  })

  const deleteTemaMut = useMutation({
    mutationFn: deleteMateriByTema,
    onSuccess: (r) => {
      toast(t('kurikulum.temaToast', { count: r.deleted }), 'success')
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('kurikulum.deleteTemaFailed')), 'error'),
  })

  const deleteSubTemaMut = useMutation({
    mutationFn: ({ tema, subTema }: { tema: string; subTema: string }) =>
      deleteMateriBySubTema(tema, subTema),
    onSuccess: (r) => {
      toast(t('kurikulum.subTemaToast', { count: r.deleted }), 'success')
      invalidate()
    },
    onError: (err) => toast(apiMessage(err, t('kurikulum.deleteSubTemaFailed')), 'error'),
  })

  const handleDelete = async (m: MateriAjar) => {
    if (await confirm({ message: t('kurikulum.deleteMateriConfirm', { kode: m.kodeMateri, detail: m.detailMateri }), danger: true })) {
      deleteMut.mutate(m.id)
    }
  }

  // Pick first tingkat once loaded.
  useMemo(() => {
    if (tingkat || tingkatList.length === 0) return
    setTingkat(tingkatList[0].nama)
  }, [tingkatList, tingkat])

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['materi-ajar', tingkat],
    queryFn: () => listMateriAjar({ tingkat }),
    enabled: !!tingkat,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const lq = search.trim().toLowerCase()
    return list.filter((m) => {
      if (hideRefs && REF_RE.test(m.detailMateri)) return false
      if (String(m.semester) !== semFilter) return false
      if (
        lq &&
        !`${m.tema} ${m.subTema} ${m.kelompokMateri || ''} ${m.detailMateri}`
          .toLowerCase()
          .includes(lq)
      ) {
        return false
      }
      return true
    })
  }, [list, search, semFilter, hideRefs])

  const grouped = useMemo(() => {
    const byTema: Record<string, MateriAjar[]> = {}
    for (const it of filtered) {
      const key = (it.tema || '').toUpperCase()
      ;(byTema[key] = byTema[key] || []).push(it)
    }
    const orderedKeys = [
      ...TEMA_ORDER.filter((k) => byTema[k]),
      ...Object.keys(byTema).filter((k) => !TEMA_ORDER.includes(k)).sort(),
    ]
    return orderedKeys.map((tema) => {
      const bySub: Record<string, MateriAjar[]> = {}
      const subOrder: string[] = []
      for (const it of byTema[tema]) {
        const sub = it.subTema || '—'
        if (!bySub[sub]) {
          bySub[sub] = []
          subOrder.push(sub)
        }
        bySub[sub].push(it)
      }
      const subs = subOrder.map((subTema) => {
        const items = bySub[subTema]
        const byKelompok: Record<string, MateriAjar[]> = {}
        const kelompokOrder: string[] = []
        for (const it of items) {
          const k = (it.kelompokMateri || '').trim()
          if (!byKelompok[k]) {
            byKelompok[k] = []
            kelompokOrder.push(k)
          }
          byKelompok[k].push(it)
        }
        const kelompoks = kelompokOrder
          .filter((k) => k && byKelompok[k].length >= 2)
          .map((kelompokMateri) => ({ kelompokMateri, items: byKelompok[kelompokMateri] }))
        const groupedIds = new Set(kelompoks.flatMap((kg) => kg.items.map((x) => x.id)))
        const flat = items.filter((x) => !groupedIds.has(x.id))
        return { subTema, items, kelompoks, flat }
      })
      return { tema, items: byTema[tema], subs }
    })
  }, [filtered])

  const toggleTema = (k: string) =>
    setCollapsedTemas((p) => {
      const n = new Set(p)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const toggleSub = (k: string) =>
    setCollapsedSubs((p) => {
      const n = new Set(p)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const toggleKelompok = (k: string) =>
    setCollapsedKelompoks((p) => {
      const n = new Set(p)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })

  // Edit mode toggle — when OFF, the CRUD buttons (delete tema, delete
  // sub-tema, "+ sub-tema", "+ grup materi", item edit/delete) are hidden so
  // the page reads as a clean catalog. Admins flip this on to mutate.
  const [editMode, setEditMode] = useState(false)

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold">{t('kurikulum.title')}</h2>
        <p className="text-sm text-slate-500">
          {t('kurikulum.subtitle')}
          {editMode ? t('kurikulum.editModeSuffix') : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={editMode ? 'primary' : 'secondary'}
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? t('kurikulum.lockTitle') : t('kurikulum.editTitle')}
        >
          <Pencil size={14} className="mr-1" />
          {editMode ? t('kurikulum.lock') : t('kurikulum.edit')}
        </Button>
        {editMode ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} className="mr-1" /> {t('kurikulum.addMateri')}
          </Button>
        ) : null}
      </div>
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="space-y-4">

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kurikulum.filter.tingkat')}
            </label>
            <select
              className="h-10 min-w-[160px] rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              value={tingkat}
              onChange={(e) => setTingkat(e.target.value)}
            >
              {tingkatList.map((tk) => (
                <option key={tk.id} value={tk.nama}>
                  {tk.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kurikulum.filter.semester')}
            </label>
            <div className="flex gap-1">
              {(['1', '2'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSemFilter(v)}
                  className={
                    'h-10 w-12 rounded-md border text-sm font-medium ' +
                    (semFilter === v
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1 sm:min-w-[200px]">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('kurikulum.filter.search')}
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('kurikulum.filter.searchPh')}
            />
          </div>
          <label className="inline-flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideRefs}
              onChange={(e) => setHideRefs(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {t('kurikulum.filter.hideRefs')}
          </label>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {t('kurikulum.filter.summary', { count: filtered.length, temaCount: grouped.length, sem: semFilter })}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-500">{t('kurikulum.loading')}</p>
      ) : grouped.length === 0 ? (
        <p className="text-slate-500">{t('kurikulum.noMatch')}</p>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const collapsed = collapsedTemas.has(g.tema)
            const color = TEMA_COLOR[g.tema] || '#475569'
            return (
              <div
                key={g.tema}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div className="flex w-full items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleTema(g.tema)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span className="w-3 text-slate-400">{collapsed ? '▸' : '▾'}</span>
                    <span className="text-base font-bold" style={{ color }}>
                      {TEMA_LABEL[g.tema] || g.tema}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: color + '22', color }}
                    >
                      {t('kurikulum.materiCount', { count: g.items.length })}
                    </span>
                    <span className="text-xs text-slate-500">{t('kurikulum.subTemaCount', { count: g.subs.length })}</span>
                  </button>
                  {editMode ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({
                            kind: 'create',
                            defaults: {
                              tingkat,
                              tema: g.tema,
                              semester: Number(semFilter),
                              kategori: 'baru',
                            },
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        title={t('kurikulum.addSubTemaTitle')}
                      >
                        <Plus size={12} /> {t('kurikulum.addSubTema')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            await confirm({
                              message: t('kurikulum.deleteTemaConfirm', { tema: g.tema, count: g.items.length }),
                              danger: true,
                            })
                          ) {
                            deleteTemaMut.mutate(g.tema)
                          }
                        }}
                        disabled={deleteTemaMut.isPending}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        aria-label={t('kurikulum.deleteTemaAria')}
                        title={t('kurikulum.deleteTemaTitle')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {!collapsed && (
                  <div className="border-t border-slate-200">
                    {g.subs.map((sub) => {
                      const subKey = `${g.tema}|${sub.subTema}`
                      const subCollapsed = collapsedSubs.has(subKey)
                      return (
                        <div key={subKey} className="border-b border-dashed border-slate-200 last:border-b-0">
                          <div className="flex w-full items-center gap-2 py-2 pl-8 pr-4 hover:bg-slate-50">
                            <button
                              type="button"
                              onClick={() => toggleSub(subKey)}
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              <span className="w-3 text-slate-400">{subCollapsed ? '▸' : '▾'}</span>
                              <span className="font-semibold text-slate-700">{sub.subTema}</span>
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {sub.items.length}
                              </span>
                              {sub.kelompoks.length > 0 && (
                                <span className="text-xs text-slate-500">
                                  {t('kurikulum.kelompokCount', { count: sub.kelompoks.length })}
                                </span>
                              )}
                            </button>
                            {editMode ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDialog({
                                      kind: 'create',
                                      defaults: {
                                        tingkat,
                                        tema: g.tema,
                                        subTema: sub.subTema,
                                        semester: Number(semFilter),
                                        kategori: 'baru',
                                      },
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                                  title={t('kurikulum.addGrupMateriTitle')}
                                >
                                  <Plus size={11} /> {t('kurikulum.addGrupMateri')}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        message: t('kurikulum.deleteSubTemaConfirm', { subTema: sub.subTema, tema: g.tema, count: sub.items.length }),
                                        danger: true,
                                      })
                                    ) {
                                      deleteSubTemaMut.mutate({ tema: g.tema, subTema: sub.subTema })
                                    }
                                  }}
                                  disabled={deleteSubTemaMut.isPending}
                                  className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                  aria-label={t('kurikulum.deleteSubTemaAria')}
                                  title={t('kurikulum.deleteSubTemaTitle')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {!subCollapsed && (
                            <div>
                              {sub.kelompoks.map((kg) => {
                                const kKey = `${g.tema}|${sub.subTema}|${kg.kelompokMateri}`
                                const kCollapsed = collapsedKelompoks.has(kKey)
                                return (
                                  <div key={kKey} className="border-t border-dotted border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => toggleKelompok(kKey)}
                                      className="flex w-full items-center gap-2 bg-slate-50 px-4 py-2 pl-12 text-left hover:bg-slate-100"
                                    >
                                      <span className="w-3 text-slate-400">
                                        {kCollapsed ? '▸' : '▾'}
                                      </span>
                                      <span className="text-sm font-medium text-slate-700">
                                        📦 {kg.kelompokMateri}
                                      </span>
                                      <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                                        {kg.items.length}
                                      </span>
                                    </button>
                                    {!kCollapsed && (
                                      <MateriList
                                        items={kg.items}
                                        pad={64}
                                        editable={editMode}
                                        onEdit={(m) => setDialog({ kind: 'edit', materi: m })}
                                        onDelete={handleDelete}
                                        deleting={deleteMut.isPending}
                                      />
                                    )}
                                  </div>
                                )
                              })}
                              {sub.flat.length > 0 && (
                                <MateriList
                                  items={sub.flat}
                                  pad={32}
                                  editable={editMode}
                                  onEdit={(m) => setDialog({ kind: 'edit', materi: m })}
                                  onDelete={handleDelete}
                                  deleting={deleteMut.isPending}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dialog ? (
        <Dialog
          title={dialog.kind === 'create' ? t('kurikulum.dialogAdd') : t('kurikulum.dialogEdit')}
          onClose={() => setDialog(null)}
        >
          <MateriAjarForm
            initial={dialog.kind === 'edit' ? dialog.materi : undefined}
            defaults={dialog.kind === 'create' ? dialog.defaults : undefined}
            tingkatOptions={tingkatList}
            submitLabel={dialog.kind === 'create' ? t('kurikulum.submitAdd') : t('kurikulum.submitSave')}
            pending={createMut.isPending || updateMut.isPending}
            error={dialog.kind === 'create' ? createMut.error : updateMut.error}
            onSubmit={(input) => {
              if (dialog.kind === 'create') createMut.mutate(input)
              else updateMut.mutate({ id: dialog.materi.id, input })
            }}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      ) : null}
      </div>
    </PageShell>
  )
}

type MateriListProps = {
  items: MateriAjar[]
  pad: number
  editable?: boolean
  onEdit: (m: MateriAjar) => void
  onDelete: (m: MateriAjar) => void
  deleting?: boolean
}

function MateriList({ items, pad, editable, onEdit, onDelete, deleting }: MateriListProps) {
  const { t } = useTranslation()
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((m, i) => (
        <li key={m.id} className="px-4 py-2" style={{ paddingLeft: pad }}>
          <div className="flex items-start gap-2">
            <span className="w-6 text-right text-xs text-slate-400">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              {m.kelompokMateri && (
                <div className="text-xs font-medium text-slate-600">{m.kelompokMateri}</div>
              )}
              <div className="mt-0.5 text-sm text-slate-900">{m.detailMateri}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {t('kurikulum.semShort', { n: m.semester })}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {m.kategori}
                </span>
              </div>
            </div>
            {editable ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(m)}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label={t('kurikulum.editAria')}
                title={t('kurikulum.editAria')}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(m)}
                disabled={deleting}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={t('kurikulum.deleteAria')}
                title={t('kurikulum.deleteAria')}
              >
                <Trash2 size={14} />
              </button>
            </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('kurikulum.closeAria')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function apiMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback
  return fallback
}

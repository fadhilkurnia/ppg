import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react'

import {
  createDoa,
  deleteDoa,
  listDoa,
  updateDoa,
  type Doa,
  type DoaInput,
} from '@/api/doa'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { LibraryShell } from '@/components/LibraryShell'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * PustakaDoa — sitrac-style accordion list. The header (title + search +
 * kategori filter) is sticky and never scrolls; only the list area moves.
 * Each row collapses to its title; clicking expands the Arabic text + latin
 * transliteration + Indonesian translation + source.
 *
 * Admin users get an "Edit" toggle: when on, "+ Tambah doa" and per-row
 * edit/delete pencil/trash actions appear.
 */
export function PustakaDoaPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; doa: Doa }
    | null
  >(null)

  useMemo(() => {
    const h = setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => clearTimeout(h)
  }, [q])

  const { data: list = [], isPending } = useQuery({
    queryKey: ['doa-list', debouncedQ],
    queryFn: () => listDoa({ q: debouncedQ || undefined }),
  })

  const toggle = (id: string) =>
    setOpenIds((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const delMut = useMutation({
    mutationFn: deleteDoa,
    onSuccess: () => {
      toast(t('pustaka.doa.deleted'), 'success')
      qc.invalidateQueries({ queryKey: ['doa-list'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('pustaka.doa.deleteFailed'), 'error'),
  })

  const handleDelete = async (d: Doa) => {
    if (await confirm({ message: t('pustaka.doa.confirmDelete', { name: d.nama }), danger: true })) delMut.mutate(d.id)
  }

  return (
    <LibraryShell
      backTo="/pustaka"
      bgClassName="bg-slate-50"
      contentClassName="flex h-full min-h-0 flex-col"
    >
      {/* Static header — never scrolls. */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-14 backdrop-blur md:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold">{t('pustaka.doa.title')}</h1>
              <p className="mb-3 mt-1 text-sm text-slate-500">
                {editMode ? t('pustaka.doa.subtitleEdit') : t('pustaka.doa.subtitle')}
              </p>
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={editMode ? 'primary' : 'secondary'}
                  onClick={() => setEditMode((v) => !v)}
                >
                  <Pencil size={14} className="mr-1" />
                  {editMode ? t('pustaka.doa.btnLock') : t('pustaka.doa.btnEdit')}
                </Button>
                {editMode ? (
                  <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
                    <Plus size={14} className="mr-1" /> {t('pustaka.doa.btnAdd')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Search size={16} className="text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('pustaka.doa.searchPh')}
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Only this section scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-xs text-slate-500">
            {isPending ? t('common.loading') : t('pustaka.doa.countN', { count: list.length })}
          </p>
          {list.length === 0 && !isPending ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {t('pustaka.doa.noMatch')}
            </p>
          ) : (
            <ul className="space-y-2">
              {list.map((d) => (
                <DoaRow
                  key={d.id}
                  doa={d}
                  open={openIds.has(d.id)}
                  onToggle={() => toggle(d.id)}
                  editMode={editMode && isAdmin}
                  onEdit={() => setDialog({ kind: 'edit', doa: d })}
                  onDelete={() => handleDelete(d)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {dialog?.kind === 'create' ? (
        <DoaFormDialog
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <DoaFormDialog
          doa={dialog.doa}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
    </LibraryShell>
  )
}

function DoaRow({
  doa: d,
  open,
  onToggle,
  editMode,
  onEdit,
  onDelete,
}: {
  doa: Doa
  open: boolean
  onToggle: () => void
  editMode: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex w-full items-center gap-2 px-2 py-3 transition hover:bg-slate-50">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-3 px-2 text-left"
          aria-expanded={open}
        >
          <span className="text-slate-400">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">{d.nama}</span>
            </div>
            {d.deskripsi && !open ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">{d.deskripsi}</p>
            ) : null}
          </div>
        </button>
        {editMode ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label={t('pustaka.doa.rowEditAria')}
              title={t('pustaka.doa.rowEditAria')}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
              aria-label={t('pustaka.doa.rowDeleteAria')}
              title={t('pustaka.doa.rowDeleteAria')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          {d.deskripsi ? <p className="text-sm text-slate-600">{d.deskripsi}</p> : null}
          {d.teksArab ? (
            <div
              lang="ar"
              dir="rtl"
              className={cn('font-arab rounded-md bg-slate-50 px-4 py-3 text-right text-2xl leading-loose text-slate-900')}
            >
              {d.teksArab}
            </div>
          ) : null}
          {d.teksLatin ? <p className="text-sm italic text-slate-700">{d.teksLatin}</p> : null}
          {d.terjemahan ? (
            <p className="text-sm leading-relaxed text-slate-700">
              <span className="font-medium text-slate-500">{t('pustaka.doa.artiLabel')}</span>
              {d.terjemahan}
            </p>
          ) : null}
          {d.sumber ? <p className="text-xs text-slate-400">📚 {d.sumber}</p> : null}
          {d.quranSurah ? (
            <p className="text-xs text-slate-400">
              {d.quranAyat
                ? t('pustaka.doa.quranRefAyat', { surah: d.quranSurah, ayat: d.quranAyat })
                : t('pustaka.doa.quranRef', { surah: d.quranSurah })}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

// ---------------------------------------------------------------- Edit form

function DoaFormDialog({
  doa,
  onClose,
  onSaved,
}: {
  doa?: Doa
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState<DoaInput>(() => ({
    nama: doa?.nama ?? '',
    deskripsi: doa?.deskripsi ?? '',
    aktif: doa?.aktif ?? true,
    teksArab: doa?.teksArab ?? '',
    teksLatin: doa?.teksLatin ?? '',
    terjemahan: doa?.terjemahan ?? '',
    sumber: doa?.sumber ?? '',
    quranSurah: doa?.quranSurah ?? null,
    quranAyat: doa?.quranAyat ?? '',
  }))

  const mut = useMutation({
    mutationFn: (input: DoaInput) =>
      doa ? updateDoa(doa.id, input) : createDoa(input),
    onSuccess: () => {
      toast(doa ? t('pustaka.doa.updated') : t('pustaka.doa.added'), 'success')
      qc.invalidateQueries({ queryKey: ['doa-list'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('pustaka.doa.saveFailed'), 'error'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trim = (v?: string | null) => {
      const t = (v ?? '').trim()
      return t === '' ? null : t
    }
    mut.mutate({
      nama: form.nama.trim(),
      deskripsi: trim(form.deskripsi),
      aktif: form.aktif ?? true,
      teksArab: trim(form.teksArab),
      teksLatin: trim(form.teksLatin),
      terjemahan: trim(form.terjemahan),
      sumber: trim(form.sumber),
      quranSurah: form.quranSurah ?? null,
      quranAyat: trim(form.quranAyat),
    })
  }

  return (
    <Dialog title={doa ? t('pustaka.doa.dialogTitleEdit') : t('pustaka.doa.dialogTitleAdd')} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t('pustaka.doa.fldNama')} htmlFor="d-nama">
          <Input
            id="d-nama"
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
            required
            autoFocus
          />
        </Field>
        <Field label={t('pustaka.doa.fldDeskripsi')} htmlFor="d-desc">
          <Input
            id="d-desc"
            value={form.deskripsi ?? ''}
            onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
          />
        </Field>
        <Field label={t('pustaka.doa.fldArab')} htmlFor="d-arab">
          <textarea
            id="d-arab"
            dir="rtl"
            lang="ar"
            rows={3}
            value={form.teksArab ?? ''}
            onChange={(e) => setForm({ ...form, teksArab: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-right text-lg leading-loose shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </Field>
        <Field label={t('pustaka.doa.fldLatin')} htmlFor="d-latin">
          <textarea
            id="d-latin"
            rows={2}
            value={form.teksLatin ?? ''}
            onChange={(e) => setForm({ ...form, teksLatin: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm italic shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </Field>
        <Field label={t('pustaka.doa.fldTerjemahan')} htmlFor="d-terjemahan">
          <textarea
            id="d-terjemahan"
            rows={2}
            value={form.terjemahan ?? ''}
            onChange={(e) => setForm({ ...form, terjemahan: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </Field>
        <Field label={t('pustaka.doa.fldSumber')} htmlFor="d-sumber">
          <Input
            id="d-sumber"
            value={form.sumber ?? ''}
            onChange={(e) => setForm({ ...form, sumber: e.target.value })}
            placeholder={t('pustaka.doa.fldSumberPh')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pustaka.doa.fldSurah')} htmlFor="d-surah">
            <Input
              id="d-surah"
              type="number"
              min={1}
              max={114}
              value={form.quranSurah ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  quranSurah: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label={t('pustaka.doa.fldAyat')} htmlFor="d-ayat">
            <Input
              id="d-ayat"
              value={form.quranAyat ?? ''}
              onChange={(e) => setForm({ ...form, quranAyat: e.target.value })}
              placeholder={t('pustaka.doa.fldAyatPh')}
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.aktif ?? true}
            onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          {t('pustaka.doa.aktifLabel')}
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

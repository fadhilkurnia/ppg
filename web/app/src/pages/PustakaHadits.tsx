import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpenText, Pencil, Plus, Trash2 } from 'lucide-react'

import {
  createKitab,
  deleteKitab,
  listKitab,
  updateKitab,
  type HaditsKitab,
  type KitabInput,
} from '@/api/hadits'
import { LibraryShell } from '@/components/LibraryShell'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { useAuth } from '@/lib/auth'
import { useConfirm } from '@/lib/confirm'

const fieldCx =
  'flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * PustakaHadits — Hadits Himpunan landing. Admins see edit/delete controls;
 * other roles see a read-only catalogue.
 */
export function PustakaHaditsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<HaditsKitab | 'new' | null>(null)

  const { data: list = [], isPending, isError } = useQuery({
    queryKey: ['hadits-kitab-all'],
    queryFn: () => listKitab(),
    staleTime: 5 * 60 * 1000,
  })
  const himpunan = list.filter((k) => k.scope === 'hadits' || k.scope === 'both')

  const removeMut = useMutation({
    mutationFn: (slug: string) => deleteKitab(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hadits-kitab-all'] }),
  })

  const onDelete = async (k: HaditsKitab) => {
    if (!(await confirm({ message: t('pustaka.hadits.confirmDelete', { name: k.nama }), danger: true }))) return
    removeMut.mutate(k.slug)
  }

  return (
    <LibraryShell
      backTo="/pustaka"
      bgClassName="bg-slate-50"
      contentClassName="px-4 pt-14 pb-6 md:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{t('pustaka.hadits.title')}</h1>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              {t('pustaka.hadits.subtitle')}
            </p>
          </div>
          {isAdmin ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus size={14} className="mr-1.5" /> {t('pustaka.hadits.btnAdd')}
            </Button>
          ) : null}
        </div>

        {isError ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {t('pustaka.hadits.loadFailed')}
          </p>
        ) : null}
        {isPending ? <p className="text-sm text-slate-500">{t('pustaka.hadits.loading')}</p> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {himpunan.map((k) => (
            <KitabCard
              key={k.id}
              kitab={k}
              isAdmin={isAdmin}
              onEdit={() => setEditing(k)}
              onDelete={() => onDelete(k)}
            />
          ))}
        </div>
      </div>

      {editing ? (
        <KitabFormDialog
          kitab={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['hadits-kitab-all'] })
            setEditing(null)
          }}
        />
      ) : null}
    </LibraryShell>
  )
}

function KitabCard({
  kitab: k,
  isAdmin,
  onEdit,
  onDelete,
}: {
  kitab: HaditsKitab
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="group relative flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <Link
        to={`/pustaka/kitab/${encodeURIComponent(k.slug)}`}
        className="flex flex-1 items-start gap-3"
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <BookOpenText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{k.nama}</div>
          <div className="truncate text-xs text-slate-500">
            {t('pustaka.hadits.metaBabHadits', { bab: k.babCount, hadits: k.haditsCount })}
            {k.perawi ? t('pustaka.hadits.metaPerawi', { perawi: k.perawi }) : ''}
          </div>
        </div>
        {k.namaArab ? (
          <div lang="ar" dir="rtl" className="font-arab text-right text-base text-slate-600">
            {k.namaArab}
          </div>
        ) : null}
      </Link>
      {isAdmin ? (
        <div className="flex flex-shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onEdit()
            }}
            className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            title={t('pustaka.hadits.editKitab')}
            aria-label={t('pustaka.hadits.editKitab')}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              onDelete()
            }}
            className="rounded p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            title={t('pustaka.hadits.deleteKitab')}
            aria-label={t('pustaka.hadits.deleteKitab')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function KitabFormDialog({
  kitab,
  onClose,
  onSaved,
}: {
  kitab: HaditsKitab | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const isEdit = !!kitab
  const [form, setForm] = useState<KitabInput>({
    slug: kitab?.slug ?? '',
    nama: kitab?.nama ?? '',
    namaArab: kitab?.namaArab ?? '',
    deskripsi: kitab?.deskripsi ?? '',
    perawi: kitab?.perawi ?? '',
    urutan: kitab?.urutan ?? 0,
    scope: (kitab?.scope as KitabInput['scope']) ?? 'hadits',
    jumlahHalaman: kitab?.jumlahHalaman ?? 0,
  })
  const [error, setError] = useState<string | null>(null)
  const saveMut = useMutation({
    mutationFn: () => (isEdit ? updateKitab(kitab!.slug, form) : createKitab(form)),
    onSuccess: onSaved,
    onError: (err: unknown) => setError(err instanceof Error ? err.message : t('pustaka.hadits.saveFailed')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{isEdit ? t('pustaka.hadits.dialogEdit') : t('pustaka.hadits.dialogAdd')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label={t('pustaka.hadits.close')}
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError(null)
            saveMut.mutate()
          }}
          className="space-y-3 px-5 py-4"
        >
          <Field label={t('pustaka.hadits.fldNama')} required>
            <Input
              required
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
            />
          </Field>
          <Field label={t('pustaka.hadits.fldSlug')} hint={t('pustaka.hadits.fldSlugHint')}>
            <Input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              disabled={isEdit}
            />
          </Field>
          <Field label={t('pustaka.hadits.fldNamaArab')}>
            <Input
              dir="rtl"
              className="font-arab text-right"
              value={form.namaArab ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, namaArab: e.target.value }))}
            />
          </Field>
          <Field label={t('pustaka.hadits.fldPerawi')}>
            <Input
              value={form.perawi ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, perawi: e.target.value }))}
            />
          </Field>
          <Field label={t('pustaka.hadits.fldDeskripsi')}>
            <textarea
              rows={3}
              className={fieldCx}
              value={form.deskripsi ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, deskripsi: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t('pustaka.hadits.fldUrutan')}>
              <Input
                type="number"
                value={form.urutan}
                onChange={(e) =>
                  setForm((f) => ({ ...f, urutan: Number(e.target.value) || 0 }))
                }
              />
            </Field>
            <Field label={t('pustaka.hadits.fldJumlahHalaman')}>
              <Input
                type="number"
                min={0}
                max={10000}
                value={form.jumlahHalaman}
                onChange={(e) =>
                  setForm((f) => ({ ...f, jumlahHalaman: Number(e.target.value) || 0 }))
                }
              />
            </Field>
            <Field label={t('pustaka.hadits.fldScope')}>
              <select
                className={fieldCx + ' h-10'}
                value={form.scope}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scope: e.target.value as KitabInput['scope'] }))
                }
              >
                <option value="hadits">{t('pustaka.hadits.scopeHadits')}</option>
                <option value="maktabah">{t('pustaka.hadits.scopeMaktabah')}</option>
                <option value="both">{t('pustaka.hadits.scopeBoth')}</option>
              </select>
            </Field>
          </div>

          {error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saveMut.isPending}>
              {saveMut.isPending ? t('pustaka.hadits.btnSaving') : isEdit ? t('common.save') : t('pustaka.hadits.btnCreate')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-700">
        <span>
          {label}
          {required ? <span className="text-rose-500"> *</span> : null}
        </span>
        {hint ? <span className="font-normal text-slate-400">— {hint}</span> : null}
      </div>
      {children}
    </label>
  )
}

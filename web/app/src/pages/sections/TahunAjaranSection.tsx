import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Pencil, Plus, Star, Trash2 } from 'lucide-react'

import {
  activateTahunAjaran,
  createTahunAjaran,
  deleteTahunAjaran,
  listTahunAjaran,
  updateTahunAjaran,
  type TahunAjaran,
  type TahunAjaranInput,
} from '@/api/tahunAjaran'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * TahunAjaranSection — admin manages academic years (tahun_ajaran). Only one
 * row may be active at a time; activating one demotes any other automatically
 * (enforced at the store layer inside a transaction).
 */
export function TahunAjaranSection() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; item: TahunAjaran }
    | null
  >(null)

  const monthName = (m: number) => t(`tahunAjaran.bulan.${m}` as const)

  const { data: list = [], isPending } = useQuery({
    queryKey: ['tahun-ajaran'],
    queryFn: listTahunAjaran,
  })

  const activateMut = useMutation({
    mutationFn: activateTahunAjaran,
    onSuccess: () => {
      toast(t('tahunAjaran.activatedToast'), 'success')
      qc.invalidateQueries({ queryKey: ['tahun-ajaran'] })
      qc.invalidateQueries({ queryKey: ['tahun-ajaran-active'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('tahunAjaran.activateFailed'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteTahunAjaran,
    onSuccess: () => {
      toast(t('tahunAjaran.deletedToast'), 'success')
      qc.invalidateQueries({ queryKey: ['tahun-ajaran'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('tahunAjaran.deleteFailed'), 'error'),
  })

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold">{t('tahunAjaran.title')}</h2>
        <p className="text-sm text-slate-500">
          {t('tahunAjaran.subtitle')}
        </p>
      </div>
      <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
        <Plus size={14} className="mr-1" /> {t('tahunAjaran.add')}
      </Button>
    </div>
  )

  return (
    <PageShell header={header}>
      {isPending ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {t('tahunAjaran.empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((row) => (
            <li
              key={row.id}
              className={
                'flex flex-wrap items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm transition ' +
                (row.active ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200')
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{row.nama}</h3>
                  {row.active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                      <Star size={10} /> {t('tahunAjaran.activeBadge')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('tahunAjaran.rowDesc', {
                    sem1: monthName(row.semester1StartMonth),
                    sem2: monthName(row.semester2StartMonth),
                  })}
                  {row.tanggalMulai
                    ? t('tahunAjaran.rowStart', { date: row.tanggalMulai.slice(0, 10) })
                    : ''}
                  {row.tanggalSelesai
                    ? t('tahunAjaran.rowEnd', { date: row.tanggalSelesai.slice(0, 10) })
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!row.active ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => activateMut.mutate(row.id)}
                    disabled={activateMut.isPending}
                  >
                    <Check size={14} className="mr-1" /> {t('tahunAjaran.activate')}
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'edit', item: row })}
                  className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={t('tahunAjaran.editAria')}
                  title={t('tahunAjaran.editAria')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm({ message: t('tahunAjaran.deleteConfirm', { nama: row.nama }), danger: true })) {
                      deleteMut.mutate(row.id)
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  aria-label={t('tahunAjaran.deleteAria')}
                  title={t('tahunAjaran.deleteAria')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'create' ? (
        <TahunAjaranFormDialog
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <TahunAjaranFormDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
    </PageShell>
  )
}

function TahunAjaranFormDialog({
  item,
  onClose,
  onSaved,
}: {
  item?: TahunAjaran
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    nama: item?.nama ?? '',
    semester1StartMonth: item?.semester1StartMonth ?? 7,
    semester2StartMonth: item?.semester2StartMonth ?? 1,
    tanggalMulai: (item?.tanggalMulai ?? '').slice(0, 10),
    tanggalSelesai: (item?.tanggalSelesai ?? '').slice(0, 10),
  })

  const mut = useMutation({
    mutationFn: (input: TahunAjaranInput) =>
      item ? updateTahunAjaran(item.id, input) : createTahunAjaran(input),
    onSuccess: () => {
      toast(item ? t('tahunAjaran.savedEditToast') : t('tahunAjaran.savedAddToast'), 'success')
      qc.invalidateQueries({ queryKey: ['tahun-ajaran'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('tahunAjaran.saveFailed'), 'error'),
  })

  const monthName = (m: number) => t(`tahunAjaran.bulan.${m}` as const)

  return (
    <Dialog title={item ? t('tahunAjaran.dialogEdit') : t('tahunAjaran.dialogAdd')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          mut.mutate({
            nama: form.nama.trim(),
            semester1StartMonth: form.semester1StartMonth,
            semester2StartMonth: form.semester2StartMonth,
            tanggalMulai: form.tanggalMulai || null,
            tanggalSelesai: form.tanggalSelesai || null,
          })
        }}
        className="space-y-4"
      >
        <Field label={t('tahunAjaran.namaLabel')} htmlFor="ta-nama">
          <Input
            id="ta-nama"
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
            placeholder={t('tahunAjaran.namaPh')}
            autoFocus
            required
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('tahunAjaran.sem1')} htmlFor="ta-sem1">
            <select
              id="ta-sem1"
              value={form.semester1StartMonth}
              onChange={(e) =>
                setForm({ ...form, semester1StartMonth: Number(e.target.value) })
              }
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m}. {monthName(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('tahunAjaran.sem2')} htmlFor="ta-sem2">
            <select
              id="ta-sem2"
              value={form.semester2StartMonth}
              onChange={(e) =>
                setForm({ ...form, semester2StartMonth: Number(e.target.value) })
              }
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m}. {monthName(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('tahunAjaran.tanggalMulai')} htmlFor="ta-mulai">
            <Input
              id="ta-mulai"
              type="date"
              value={form.tanggalMulai}
              onChange={(e) => setForm({ ...form, tanggalMulai: e.target.value })}
            />
          </Field>
          <Field label={t('tahunAjaran.tanggalSelesai')} htmlFor="ta-selesai">
            <Input
              id="ta-selesai"
              type="date"
              value={form.tanggalSelesai}
              onChange={(e) => setForm({ ...form, tanggalSelesai: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
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

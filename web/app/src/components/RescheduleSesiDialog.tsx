import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, RotateCcw, X } from 'lucide-react'

import {
  ensureRencana,
  addRencanaItems,
} from '@/api/rencana'
import { updateSesi, type Sesi, type SesiInput } from '@/api/sesi'
import { listMateriAjar, type MateriAjar } from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { useToast } from '@/lib/toast'

const TEMA_LABEL: Record<string, string> = {
  ALIM: '🕌 Alim',
  FAQIH: '📚 Faqih',
  'AKHLAQUL KARIMAH': '✨ Akhlaqul Karimah',
  KEMANDIRIAN: '🎯 Kemandirian',
}
const TEMA_ORDER = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']

/**
 * RescheduleSesiDialog — port of sitrac's RescheduleSesiModal, simplified
 * for GNRS (no progresif items, no per-sesi materi link). User can:
 *   • change tanggal + jam + topik
 *   • optionally pick materi from kurikulum to auto-attach to the NEW
 *     month's rencana bulanan (using ensureRencana + addRencanaItems).
 * Available for both upcoming and missed sesi.
 */
export function RescheduleSesiDialog({
  sesi,
  tingkat,
  onClose,
  onSaved,
}: {
  sesi: Sesi
  tingkat?: string
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)

  const [tanggal, setTanggal] = useState(sesi.tanggal.slice(0, 10) || today)
  const [topik, setTopik] = useState(sesi.topik)
  const [mulai, setMulai] = useState(sesi.mulai ?? '')
  const [selesai, setSelesai] = useState(sesi.selesai ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedMateri, setPickedMateri] = useState<MateriAjar[]>([])

  const saveMut = useMutation({
    mutationFn: async () => {
      // 1. PATCH the sesi.
      const input: SesiInput = {
        tanggal,
        mulai: mulai || null,
        selesai: selesai || null,
        topik: topik.trim() || sesi.topik,
        catatan: sesi.catatan ?? null,
        tingkat: sesi.tingkat ?? null,
        materiAjarId: sesi.materiAjarId ?? null,
        guruId: sesi.guruId ?? null,
        kelasId: sesi.kelasId ?? null,
      }
      await updateSesi(sesi.id, input)
      // 2. If user picked materi and the sesi belongs to a kelas, ensure the
      //    new month's rencana exists and bulk-add the picks.
      if (pickedMateri.length > 0 && sesi.kelasId) {
        const year = Number(tanggal.slice(0, 4))
        const month = Number(tanggal.slice(5, 7))
        const r = await ensureRencana({ kelasId: sesi.kelasId, tahun: year, bulan: month })
        await addRencanaItems(r.id, pickedMateri.map((m) => m.id))
      }
    },
    onSuccess: () => {
      toast(t('reschedule.toastSaved', { date: tanggal }), 'success')
      qc.invalidateQueries({ queryKey: ['sesi'] })
      qc.invalidateQueries({ queryKey: ['kelas-sesi'] })
      qc.invalidateQueries({ queryKey: ['rencana'] })
      qc.invalidateQueries({ queryKey: ['rencana-full'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('reschedule.toastFailed'), 'error'),
  })

  const removePicked = (id: string) =>
    setPickedMateri((cur) => cur.filter((m) => m.id !== id))

  return (
    <Dialog title={t('reschedule.title')} onClose={onClose} size="md">
      <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs">
        <p className="font-medium text-slate-800">{sesi.topik}</p>
        <p className="text-slate-500">
          {t('reschedule.origin')}: {sesi.tanggal}
          {sesi.mulai ? ` · ${sesi.mulai}${sesi.selesai ? `–${sesi.selesai}` : ''}` : ''}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMut.mutate()
        }}
        className="space-y-4"
      >
        <Field label={t('reschedule.newDate')} htmlFor="resched-date">
          <Input
            id="resched-date"
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
          />
        </Field>

        <Field label={t('reschedule.topic')} htmlFor="resched-topik">
          <Input
            id="resched-topik"
            value={topik}
            onChange={(e) => setTopik(e.target.value)}
            placeholder={sesi.topik}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('reschedule.start')} htmlFor="resched-mulai">
            <Input
              id="resched-mulai"
              type="time"
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
            />
          </Field>
          <Field label={t('reschedule.end')} htmlFor="resched-selesai">
            <Input
              id="resched-selesai"
              type="time"
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
            />
          </Field>
        </div>

        {sesi.kelasId && tingkat ? (
          <Field label={t('reschedule.materiLabel')} htmlFor="">
            {pickedMateri.length > 0 ? (
              <ul className="mb-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                {pickedMateri.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="mt-0.5 w-6 text-right text-xs text-slate-400">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-500">
                        {m.tema} · {m.subTema}
                      </div>
                      <div className="text-sm">{m.kelompokMateri || m.detailMateri}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePicked(m.id)}
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={t('common.delete')}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
              <Plus size={14} className="mr-1" /> {t('reschedule.fromKurikulum')}
            </Button>
            <p className="mt-1 text-xs text-slate-500">
              {t('reschedule.materiHint', { ym: tanggal.slice(0, 7) })}
            </p>
          </Field>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saveMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saveMut.isPending}>
            <RotateCcw size={14} className="mr-1" />
            {saveMut.isPending ? t('reschedule.rescheduling') : t('reschedule.submit')}
          </Button>
        </div>
      </form>

      {pickerOpen && tingkat ? (
        <KurikulumMiniPicker
          tingkat={tingkat}
          excludeIds={new Set(pickedMateri.map((m) => m.id))}
          onPick={(items) => {
            setPickedMateri((cur) => [...cur, ...items])
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </Dialog>
  )
}

function KurikulumMiniPicker({
  tingkat,
  excludeIds,
  onPick,
  onClose,
}: {
  tingkat: string
  excludeIds: Set<string>
  onPick: (items: MateriAjar[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const { data: materi = [], isPending } = useQuery({
    queryKey: ['materi-ajar', { tingkat }],
    queryFn: () => listMateriAjar({ tingkat }),
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return materi.filter((m) => {
      if (excludeIds.has(m.id)) return false
      if (!q) return true
      return (
        (m.tema || '').toLowerCase().includes(q) ||
        (m.subTema || '').toLowerCase().includes(q) ||
        (m.detailMateri || '').toLowerCase().includes(q) ||
        (m.kelompokMateri || '').toLowerCase().includes(q)
      )
    })
  }, [materi, excludeIds, search])

  const grouped = useMemo(() => {
    const m: Record<string, MateriAjar[]> = {}
    for (const it of filtered) {
      const tema = (it.tema || 'ALIM').toUpperCase()
      ;(m[tema] = m[tema] || []).push(it)
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
    <Dialog title={t('materi.pickTitle', { tingkat })} onClose={onClose} size="lg">
      <Input
        placeholder={t('materi.searchPh')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3"
      />
      <div className="max-h-[55vh] overflow-y-auto rounded-md border border-slate-200">
        {isPending ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{t('materi.loading')}</p>
        ) : grouped.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{t('materi.noMatch')}</p>
        ) : (
          grouped.map((g) => (
            <div key={g.tema} className="border-b border-slate-100 last:border-b-0">
              <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
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
                        </div>
                        <div className="text-sm">{m.kelompokMateri || m.detailMateri}</div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-xs text-slate-500">{t('materi.picked', { count: picked.size })}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              const items = filtered.filter((m) => picked.has(m.id))
              onPick(items)
            }}
            disabled={picked.size === 0}
          >
            {picked.size > 0 ? t('materi.addN', { count: picked.size }) : t('common.add')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

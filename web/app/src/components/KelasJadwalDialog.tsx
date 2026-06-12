import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Trash2 } from 'lucide-react'

import { deleteJadwal, getJadwal, putJadwal, type KelasJadwalInput } from '@/api/kelas'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { DEFAULT_TIMEZONE } from '@/lib/timezones'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasJadwalDialog — configure a kelas's recurring weekly schedule. Pick
 * weekdays + one shared time; the backend lazily generates sesi rows on open.
 * Reachable by admin or the kelas wali (gated by the caller).
 */
export function KelasJadwalDialog({
  kelasId,
  kelasNama,
  onClose,
}: {
  kelasId: string
  kelasNama: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  // Sunday-first short weekday labels, locale-aware (matches calendar HARI).
  const HARI = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 2 + i)))
  }, [i18n.language])

  const [hari, setHari] = useState<number[]>([])
  const [mulai, setMulai] = useState('')
  const [selesai, setSelesai] = useState('')
  const [topik, setTopik] = useState('')
  const [mulaiTanggal, setMulaiTanggal] = useState('')
  const [sampaiTanggal, setSampaiTanggal] = useState('')
  const [horizon, setHorizon] = useState(8)
  const [aktif, setAktif] = useState(true)

  const { data: jadwal, isPending } = useQuery({
    queryKey: ['kelas-jadwal', kelasId],
    queryFn: () => getJadwal(kelasId),
  })

  useEffect(() => {
    if (!jadwal) return
    setHari(jadwal.hari ?? [])
    setMulai(jadwal.mulai ?? '')
    setSelesai(jadwal.selesai ?? '')
    setTopik(jadwal.topikDefault ?? '')
    setMulaiTanggal(jadwal.mulaiTanggal ?? '')
    setSampaiTanggal(jadwal.sampaiTanggal ?? '')
    setHorizon(jadwal.horizonMinggu ?? 8)
    setAktif(jadwal.aktif ?? true)
  }, [jadwal])

  const toggleHari = (d: number) =>
    setHari((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kelas-jadwal', kelasId] })
    qc.invalidateQueries({ queryKey: ['kelas-sesi', kelasId] })
    qc.invalidateQueries({ queryKey: ['sesi'] })
  }

  const saveMut = useMutation({
    mutationFn: (input: KelasJadwalInput) => putJadwal(kelasId, input),
    onSuccess: () => {
      toast(t('kelasSection.jadwal.saved'), 'success')
      invalidate()
      onClose()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.jadwal.saveFailed'), 'error'),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteJadwal(kelasId),
    onSuccess: () => {
      toast(t('kelasSection.jadwal.deleted'), 'success')
      invalidate()
      onClose()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.jadwal.deleteFailed'), 'error'),
  })

  const canSave = hari.length > 0 && /^\d{2}:\d{2}$/.test(mulai)

  const submit = () =>
    saveMut.mutate({
      hari,
      mulai,
      selesai: selesai || null,
      topikDefault: topik.trim() || null,
      mulaiTanggal: mulaiTanggal || null,
      sampaiTanggal: sampaiTanggal || null,
      horizonMinggu: horizon,
      aktif,
    })

  return (
    <Dialog title={t('kelasSection.jadwal.title', { name: kelasNama })} onClose={onClose} size="md">
      {isPending ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.hari')}</label>
            <div className="flex flex-wrap gap-1">
              {HARI.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleHari(d)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition',
                    hari.includes(d)
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.jam')}</label>
            <TimeRangePicker
              start={mulai}
              end={selesai}
              timezone={DEFAULT_TIMEZONE}
              onStartChange={setMulai}
              onEndChange={setSelesai}
              onTimezoneChange={() => {}}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.topik')}</label>
            <Input value={topik} onChange={(e) => setTopik(e.target.value)} placeholder={t('kelasSection.jadwal.topikPh')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.mulaiTanggal')}</label>
              <Input type="date" value={mulaiTanggal} onChange={(e) => setMulaiTanggal(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.sampaiTanggal')}</label>
              <Input type="date" value={sampaiTanggal} onChange={(e) => setSampaiTanggal(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('kelasSection.jadwal.horizon')}</label>
            <Input
              type="number"
              min={1}
              max={52}
              value={String(horizon)}
              onChange={(e) => setHorizon(Math.max(1, Math.min(52, Number(e.target.value) || 8)))}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={aktif} onChange={(e) => setAktif(e.target.checked)} className="h-4 w-4" />
            {t('kelasSection.jadwal.aktif')}
          </label>

          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            {jadwal ? (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ message: t('kelasSection.jadwal.confirmDelete', { name: kelasNama }), danger: true })) {
                    deleteMut.mutate()
                  }
                }}
                disabled={deleteMut.isPending}
              >
                <Trash2 size={16} className="mr-1" />
                {t('kelasSection.jadwal.delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('common.close')}
              </Button>
              <Button onClick={submit} disabled={!canSave || saveMut.isPending}>
                <CalendarClock size={16} className="mr-1" />
                {saveMut.isPending ? t('kelasSection.jadwal.saving') : t('kelasSection.jadwal.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

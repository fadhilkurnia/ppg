import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Pencil, Play, Plus, Radio, RotateCcw, Square, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { generateJadwal, type Kelas } from '@/api/kelas'
import { deleteSesi, listSesi, startSesi, type Sesi } from '@/api/sesi'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { RescheduleSesiDialog } from '@/components/RescheduleSesiDialog'
import { EndSesiSummaryDialog } from '@/components/EndSesiSummaryDialog'
import { SesiFormDialog } from '@/components/SesiFormDialog'
import { cn } from '@/lib/cn'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasSesiDialog — modal showing one kelas's sessions grouped by status
 * (In Progress / Upcoming / Missed / Done). Lifted out of KelasListSection's
 * former inline accordion. Admin can add a sesi and act on each row; the
 * session sub-dialogs open layered above this one.
 */

type Status = 'upcoming' | 'ongoing' | 'completed' | 'missed'

const STATUS_DOT: Record<Status, string> = {
  upcoming: 'bg-sky-500',
  ongoing: 'bg-amber-500',
  completed: 'bg-emerald-500',
  missed: 'bg-rose-500',
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function statusOf(s: Sesi, today: Date): Status {
  if (s.endedAt) return 'completed'
  if (s.startedAt) return 'ongoing'
  const iso = (s.tanggal || '').slice(0, 10)
  if (iso && iso < localDate(today)) return 'missed'
  return 'upcoming'
}

export function KelasSesiDialog({
  kelas: k,
  isAdmin,
  onClose,
}: {
  kelas: Kelas
  isAdmin: boolean
  onClose: () => void
}) {
  const today = useMemo(() => new Date(), [])
  const [rescheduling, setRescheduling] = useState<Sesi | null>(null)
  const [editingSesi, setEditingSesi] = useState<Sesi | null>(null)
  const [endingSesi, setEndingSesi] = useState<Sesi | null>(null)
  const [reviewingSesi, setReviewingSesi] = useState<Sesi | null>(null)
  const [addingSesi, setAddingSesi] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { t } = useTranslation()

  const STATUS_LABEL: Record<Status, string> = {
    upcoming: t('kelasSection.status.upcoming'),
    ongoing: t('kelasSection.status.ongoing'),
    completed: t('kelasSection.status.completed'),
    missed: t('kelasSection.status.missed'),
  }
  const invalidateSesi = () => {
    qc.invalidateQueries({ queryKey: ['kelas-sesi', k.id] })
    qc.invalidateQueries({ queryKey: ['sesi'] })
  }

  const { user } = useAuth()
  const canManage = isAdmin || (user?.id != null && k.guruUserId === user.id)

  // Auto-generate recurring sesi when an admin/wali opens the class (rolling,
  // idempotent). Best-effort: no schedule or no permission → silently ignored.
  useEffect(() => {
    if (!canManage) return
    let cancelled = false
    generateJadwal(k.id)
      .then((res) => {
        if (!cancelled && res.created > 0) invalidateSesi()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id, canManage])
  const startMut = useMutation({
    mutationFn: startSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiStarted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiStartFailed'), 'error'),
  })
  const delMut = useMutation({
    mutationFn: deleteSesi,
    onSuccess: () => {
      toast(t('kelasSection.list.sesiDeleted'), 'success')
      invalidateSesi()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.sesiDeleteFailed'), 'error'),
  })

  const { data: sesiList = [], isLoading } = useQuery({
    queryKey: ['kelas-sesi', k.id],
    queryFn: () => listSesi({ kelasId: k.id }),
  })

  const buckets = useMemo(() => {
    const out: Record<Status, Sesi[]> = { ongoing: [], upcoming: [], completed: [], missed: [] }
    for (const s of sesiList) out[statusOf(s, today)].push(s)
    out.upcoming.sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    out.completed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    out.missed.sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    return out
  }, [sesiList, today])

  const totalSesi = sesiList.length

  return (
    <Dialog title={k.nama} onClose={onClose} size="lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {k.guruName ? (
            <p className="truncate text-sm font-medium text-slate-700">
              {t('kelasSection.list.homeroomLine', { wali: k.guruName })}
            </p>
          ) : null}
          <p className="truncate text-xs text-slate-500">
            {t('kelasSection.list.cardSubtitle', { tingkat: k.tingkat, tahun: k.tahun })}
          </p>
        </div>
        {isAdmin ? (
          <Button size="sm" onClick={() => setAddingSesi(true)}>
            <Plus size={14} className="mr-1" /> {t('kelasSection.list.addSesi')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('kelasSection.list.loadingSesi')}</p>
      ) : totalSesi === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('kelasSection.list.noSesi')}</p>
      ) : (
        <div className="space-y-3">
          {(['ongoing', 'upcoming', 'missed', 'completed'] as Status[]).map((st) =>
            buckets[st].length > 0 ? (
              <div key={st}>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className={cn('inline-block h-2 w-2 rounded-full', STATUS_DOT[st])} />
                  {STATUS_LABEL[st]}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700">
                    {buckets[st].length}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {buckets[st].map((s) => {
                    const canResched = isAdmin && !s.endedAt && (st === 'upcoming' || st === 'missed' || st === 'ongoing')
                    return (
                      <li key={s.id} className="flex items-center gap-1.5 px-3 py-2">
                        {s.endedAt ? (
                          <button
                            type="button"
                            onClick={() => setReviewingSesi(s)}
                            className="min-w-0 flex-1 cursor-pointer text-left transition hover:opacity-75"
                            title={t('kelasSection.list.reviewSummary')}
                          >
                            <div className="text-sm font-medium text-slate-900 underline decoration-dotted underline-offset-2">
                              {s.topik}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.tanggal}
                              {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                            </div>
                          </button>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                              {s.topik}
                              {s.jadwalId ? (
                                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                  {t('kelasSection.jadwal.badge')}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.tanggal}
                              {s.mulai ? ` · ${s.mulai}${s.selesai ? `–${s.selesai}` : ''}` : ''}
                            </div>
                          </div>
                        )}
                        {isAdmin ? (
                          <>
                            {!s.startedAt ? (
                              <button
                                type="button"
                                onClick={() => startMut.mutate(s.id)}
                                disabled={startMut.isPending}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                                aria-label={t('kelasSection.list.startSesi')}
                                title={t('kelasSection.list.startSesi')}
                              >
                                <Play size={14} />
                              </button>
                            ) : !s.endedAt ? (
                              <>
                                <Link
                                  to={`/kelas/${s.kelasId ?? k.id}/sesi/${s.id}/live`}
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                  aria-label={t('kelasSection.list.liveStage')}
                                  title={t('kelasSection.list.openLive')}
                                >
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                  </span>
                                  <Radio size={13} />
                                  Live
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setEndingSesi(s)}
                                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                                  aria-label={t('kelasSection.list.endSesi')}
                                  title={t('kelasSection.list.endSesi')}
                                >
                                  <Square size={14} />
                                </button>
                              </>
                            ) : null}
                            {canResched ? (
                              <button
                                type="button"
                                onClick={() => setRescheduling(s)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-sky-50 hover:text-sky-700"
                                aria-label={t('kelasSection.list.reschedule')}
                                title={t('kelasSection.list.reschedule')}
                              >
                                <RotateCcw size={14} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setEditingSesi(s)}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                              aria-label={t('common.edit')}
                              title={t('common.edit')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (await confirm({ message: t('kelasSection.list.confirmDeleteSesi', { topik: s.topik }), danger: true })) delMut.mutate(s.id)
                              }}
                              disabled={delMut.isPending}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              aria-label={t('common.delete')}
                              title={t('common.delete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}

      {rescheduling ? (
        <RescheduleSesiDialog
          sesi={rescheduling}
          tingkat={k.tingkat}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            invalidateSesi()
            setRescheduling(null)
          }}
        />
      ) : null}

      {addingSesi ? (
        <SesiFormDialog
          mode="create"
          defaults={{ kelasId: k.id, defaultTingkat: k.tingkat }}
          onClose={() => setAddingSesi(false)}
          onSaved={() => {
            invalidateSesi()
            setAddingSesi(false)
          }}
        />
      ) : null}

      {editingSesi ? (
        <SesiFormDialog
          mode="edit"
          sesi={editingSesi}
          onClose={() => setEditingSesi(null)}
          onSaved={() => {
            invalidateSesi()
            setEditingSesi(null)
          }}
        />
      ) : null}

      {endingSesi ? (
        <EndSesiSummaryDialog
          sesi={endingSesi}
          onClose={() => setEndingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setEndingSesi(null)
          }}
        />
      ) : null}

      {reviewingSesi ? (
        <EndSesiSummaryDialog
          sesi={reviewingSesi}
          onClose={() => setReviewingSesi(null)}
          onEnded={() => {
            invalidateSesi()
            setReviewingSesi(null)
          }}
        />
      ) : null}
    </Dialog>
  )
}

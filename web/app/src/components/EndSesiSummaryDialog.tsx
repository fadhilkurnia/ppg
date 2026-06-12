import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MessageCircle, X } from 'lucide-react'

import { endSesi, type Sesi } from '@/api/sesi'
import {
  listDiajarkan,
  updateDiajarkan,
  type MateriDiajarkan,
} from '@/api/diajarkan'
import { listAnggota } from '@/api/kelas'
import { getUser, type ManagedUser } from '@/api/users'
import { apiFetch } from '@/api/client'
import { useToast } from '@/lib/toast'

/**
 * EndSesiSummaryDialog — shared end-of-sesi flow used by both the Live Stage
 * "Akhiri" button and the manual stop button on KelasListSection / DayPopup.
 *
 * Shows every materi diajarkan during the sesi (from sesi_materi_diajarkan),
 * lets the guru toggle "perlu review ortu" + write a parent-only note per
 * row, then offers a WhatsApp button per anggota kelas to deliver the
 * summary to the parent. The WA message template is loaded from settings
 * (wa_summary_template), editable from the admin Pengaturan page.
 */

export const DEFAULT_WA_TEMPLATE = `Assalamu'alaikum {salutation} {parent_name},

Kami informasikan ringkasan sesi pengajian {murid_name} hari ini:

📚 Topik: {topik}
🗓️ Tanggal: {tanggal}
⏱️ Durasi: {durasi}

Materi yang diajarkan:
{materi_list}

{review_section}

Terima kasih.`

const REGION_DIAL: Record<string, string> = {
  ID: '62',
  SG: '65',
  US: '1',
  CA: '1',
}

function toE164(region: string | undefined | null, raw: string | undefined | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  const dial = REGION_DIAL[(region ?? 'ID').toUpperCase()] ?? '62'
  // Strip leading 0 if present (common in ID local format).
  const local = digits.replace(/^0+/, '')
  return dial + local
}

function fmtDate(iso: string, months: string[]) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`
}

function buildMessage(
  template: string,
  ctx: {
    salutation: string
    parent_name: string
    murid_name: string
    topik: string
    tanggal: string
    durasi: string
    materi_list: string
    review_section: string
  },
): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (ctx as any)[k] ?? '')
}

export function EndSesiSummaryDialog({
  sesi,
  onClose,
  onEnded,
}: {
  sesi: Sesi
  onClose: () => void
  onEnded: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  // Localized month abbreviations for fmtDate. Falls back to ISO if returnObjects
  // resolves to something unexpected.
  const months = (() => {
    const m = t('sesiDialog.summary.monthsShort', { returnObjects: true }) as unknown
    return Array.isArray(m) ? (m as string[]) : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  })()

  // Localized helpers (depend on t).
  const fmtDuration = (startedAt: string | null | undefined, endedAt: string | null | undefined) => {
    if (!startedAt) return t('sesiDialog.summary.durationNone')
    const start = new Date(startedAt).getTime()
    const end = endedAt ? new Date(endedAt).getTime() : Date.now()
    if (Number.isNaN(start) || Number.isNaN(end)) return t('sesiDialog.summary.durationNone')
    const sec = Math.max(0, Math.floor((end - start) / 1000))
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (h > 0) return t('sesiDialog.summary.durationHM', { h, m })
    return t('sesiDialog.summary.durationM', { m })
  }

  const labelFor = (it: MateriDiajarkan): string => {
    if (it.label) return it.label
    if (it.ref) return `${it.kind}:${it.ref}`
    return it.kind
  }

  const kindLabel = (k: MateriDiajarkan['kind']) => {
    switch (k) {
      case 'kurikulum': return t('sesiDialog.summary.kindKurikulum')
      case 'quran': return t('sesiDialog.summary.kindQuran')
      case 'hadits': return t('sesiDialog.summary.kindHadits')
      case 'tilawati': return t('sesiDialog.summary.kindTilawati')
      case 'doa': return t('sesiDialog.summary.kindDoa')
    }
  }

  // Materi diajarkan + local edit buffer keyed by row id.
  const diajarkanQ = useQuery({
    queryKey: ['diajarkan', sesi.id],
    queryFn: () => listDiajarkan(sesi.id),
  })
  const diajarkan = diajarkanQ.data ?? []
  const [edits, setEdits] = useState<Record<string, { review: boolean; note: string }>>({})

  useEffect(() => {
    if (!diajarkan.length) return
    setEdits((prev) => {
      // Initialize only rows we haven't touched yet.
      const next = { ...prev }
      for (const it of diajarkan) {
        if (!(it.id in next)) {
          next[it.id] = {
            review: it.needsParentReview,
            note: it.parentNote ?? '',
          }
        }
      }
      return next
    })
  }, [diajarkan])

  // Anggota + per-anggota user (for parent contact).
  const anggotaQ = useQuery({
    queryKey: ['kelas-anggota', sesi.kelasId],
    queryFn: () => listAnggota(sesi.kelasId!),
    enabled: !!sesi.kelasId,
  })
  const anggota = anggotaQ.data ?? []
  const userQs = useQueries({
    queries: anggota.map((a) => ({
      queryKey: ['user', a.muridUserId],
      queryFn: () => getUser(a.muridUserId),
    })),
  })

  // Settings (for WA template).
  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<Record<string, string>>('/api/settings'),
  })
  const waTemplate =
    settingsQ.data?.wa_summary_template?.trim() || DEFAULT_WA_TEMPLATE

  // Save & end --------------------------------------------------------------
  const save = useMutation({
    mutationFn: async () => {
      // 1. Persist edits for every row that changed.
      for (const it of diajarkan) {
        const e = edits[it.id]
        if (!e) continue
        const changedReview = e.review !== it.needsParentReview
        const changedNote = (e.note ?? '') !== (it.parentNote ?? '')
        if (changedReview || changedNote) {
          await updateDiajarkan(sesi.id, it.id, {
            needsParentReview: e.review,
            parentNote: e.note,
          })
        }
      }
      // 2. End the sesi if still ongoing.
      if (!sesi.endedAt) await endSesi(sesi.id)
    },
    onSuccess: () => {
      toast(t('sesiDialog.summary.endedToast'), 'success')
      qc.invalidateQueries({ queryKey: ['sesi'] })
      qc.invalidateQueries({ queryKey: ['diajarkan', sesi.id] })
      qc.invalidateQueries({ queryKey: ['kelas-sesi'] })
      onEnded()
    },
    onError: (e: any) => toast(e?.message ?? t('sesiDialog.summary.saveFailed'), 'error'),
  })

  // Build WA message for one student ---------------------------------------
  const messageFor = (murid: ManagedUser | null | undefined): { url: string | null; preview: string } => {
    if (!murid) return { url: null, preview: '' }
    const phone = toE164(murid.parentPhoneRegion, murid.parentPhone)
    const materiList =
      diajarkan.length === 0
        ? t('sesiDialog.summary.noMateriRecorded')
        : diajarkan.map((it) => `• ${labelFor(it)}`).join('\n')
    const reviewItems = diajarkan
      .map((it) => ({ ...it, ...(edits[it.id] ?? { review: it.needsParentReview, note: it.parentNote ?? '' }) }))
      .filter((it) => it.review)
    const reviewSection =
      reviewItems.length === 0
        ? ''
        : t('sesiDialog.summary.reviewSectionHeader') + '\n' +
          reviewItems
            .map((it) => `• ${labelFor(it)}${it.note ? `\n   ${t('sesiDialog.summary.reviewItemNote', { note: it.note })}` : ''}`)
            .join('\n')
    const msg = buildMessage(waTemplate, {
      salutation: murid.parentTitle ?? t('sesiDialog.summary.defaultSalutation'),
      parent_name: murid.parentName ?? '',
      murid_name: murid.name,
      topik: sesi.topik,
      tanggal: fmtDate(sesi.tanggal, months),
      durasi: fmtDuration(sesi.startedAt, sesi.endedAt),
      materi_list: materiList,
      review_section: reviewSection,
    })
    if (!phone) return { url: null, preview: msg }
    return { url: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, preview: msg }
  }

  const [previewFor, setPreviewFor] = useState<string | null>(null)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(720px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">{t('sesiDialog.summary.title')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t('sesiDialog.summary.subtitle', {
                topik: sesi.topik,
                date: fmtDate(sesi.tanggal, months),
                durasi: fmtDuration(sesi.startedAt, sesi.endedAt),
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={t('sesiDialog.summary.closeAria')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {/* Materi diajarkan */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('sesiDialog.summary.materiHeading', { count: diajarkan.length })}
            </h3>
            {diajarkan.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                {t('sesiDialog.summary.materiEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {diajarkan.map((it) => {
                  const e = edits[it.id] ?? { review: it.needsParentReview, note: it.parentNote ?? '' }
                  return (
                    <li key={it.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-baseline gap-2">
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          {kindLabel(it.kind)}
                        </span>
                        <span className="text-sm font-medium text-slate-900">
                          {labelFor(it)}
                        </span>
                      </div>
                      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={e.review}
                          onChange={(ev) =>
                            setEdits((cur) => ({
                              ...cur,
                              [it.id]: { ...e, review: ev.target.checked },
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                        />
                        {t('sesiDialog.summary.needsReview')}
                      </label>
                      <textarea
                        value={e.note}
                        onChange={(ev) =>
                          setEdits((cur) => ({
                            ...cur,
                            [it.id]: { ...e, note: ev.target.value },
                          }))
                        }
                        placeholder={t('sesiDialog.summary.notePh')}
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Notifikasi orang tua */}
          {sesi.kelasId && (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('sesiDialog.summary.notifHeading', { count: anggota.length })}
              </h3>
              {anggotaQ.isLoading ? (
                <p className="text-sm text-slate-500">{t('sesiDialog.summary.loadingAnggota')}</p>
              ) : anggota.length === 0 ? (
                <p className="rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                  {t('sesiDialog.summary.noAnggota')}
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
                  {anggota.map((a, idx) => {
                    const user = userQs[idx]?.data ?? null
                    const m = messageFor(user)
                    const hasContact = user?.parentPhone && user?.parentName
                    return (
                      <li key={a.muridUserId} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900">{a.muridName}</div>
                          <div className="truncate text-xs text-slate-500">
                            {hasContact ? (
                              <>
                                {user!.parentTitle ?? ''} {user!.parentName} ·{' '}
                                +{REGION_DIAL[(user!.parentPhoneRegion ?? 'ID')]}
                                {(user!.parentPhone ?? '').replace(/^0+/, '')}
                              </>
                            ) : (
                              <span className="text-slate-400">{t('sesiDialog.summary.contactIncomplete')}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setPreviewFor(a.muridUserId)}
                          disabled={!m.url}
                          title={m.url ? t('sesiDialog.summary.waTitleSend') : t('sesiDialog.summary.waTitleIncomplete')}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <MessageCircle size={13} /> {t('sesiDialog.summary.waBtn')}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onClose}
            disabled={save.isPending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('common.close')}
          </button>
          {!sesi.endedAt ? (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              <CheckCircle2 size={14} />
              {save.isPending ? t('common.saving') : t('sesiDialog.summary.endBtn')}
            </button>
          ) : (
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {save.isPending ? t('common.saving') : t('sesiDialog.summary.saveBtn')}
            </button>
          )}
        </div>

        {/* WA preview overlay */}
        {previewFor && (() => {
          const idx = anggota.findIndex((a) => a.muridUserId === previewFor)
          const user = idx >= 0 ? userQs[idx]?.data ?? null : null
          const m = messageFor(user)
          return (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setPreviewFor(null)}
            >
              <div
                className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {t('sesiDialog.summary.previewTitle', {
                      salutation: user?.parentTitle ?? '',
                      name: user?.parentName ?? '',
                    })}
                  </h4>
                  <button
                    onClick={() => setPreviewFor(null)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-sans text-xs text-slate-700">
                  {m.preview}
                </pre>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setPreviewFor(null)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('common.close')}
                  </button>
                  {m.url ? (
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setPreviewFor(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                    >
                      <MessageCircle size={13} /> {t('sesiDialog.summary.openWa')}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

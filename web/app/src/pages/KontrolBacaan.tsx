import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'

import {
  createBacaan,
  deleteBacaan,
  getBacaanPerSurah,
  getBacaanSummary,
  listBacaan,
  type BacaanSource,
  type BacaanSummary,
  type SurahProgress,
} from '@/api/bacaan'
import { listQuranSurahs, type QuranSurah } from '@/api/quran'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PageShell, PageHeader } from '@/components/PageShell'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KontrolBacaan — track each user's progress reading the entire Qur'an. A
 * row in bacaan_log is a contiguous ayat range with a date and a source
 * (pengajian = mentored by guru, mandiri = self-study).
 *
 * Visibility is enforced server-side:
 *   - admin / pengurus  : everyone
 *   - guru              : all murid + self
 *   - ortu              : own anak (matched by parent_email)
 *   - murid             : self only
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function KontrolBacaanPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [picked, setPicked] = useState<BacaanSummary | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: summary } = useQuery({
    queryKey: ['bacaan-summary'],
    queryFn: getBacaanSummary,
    staleTime: 30_000,
  })

  const totalAyat = summary?.totalQuranAyat ?? 6236
  const items = summary?.items ?? []
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'

  const myEntry = items.find((x) => x.userId === user?.id) ?? null

  // Surah names lookup so we can label "sedang dibaca" in the side panel.
  const { data: surahs = [] } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
  })

  return (
    <PageShell
      header={
        <PageHeader
          title={t('bacaan.title')}
          subtitle={t('bacaan.subtitle', { count: totalAyat, countFmt: totalAyat.toLocaleString(numLocale) })}
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} className="mr-1" /> {t('bacaan.catatBacaan')}
            </Button>
          }
        />
      }
    >
      <div className="space-y-4">
        {myEntry ? (
          <BacaanProgressPanel
            entry={myEntry}
            totalAyat={totalAyat}
            surahs={surahs}
            highlight
          />
        ) : null}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('bacaan.daftarProgress', { count: items.length })}
          </div>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              {t('bacaan.emptyBacaan')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((it) => (
                <UserBacaanTile
                  key={it.userId}
                  item={it}
                  totalAyat={totalAyat}
                  highlight={it.userId === user?.id}
                  onClick={() => setPicked(it)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {picked ? (
        <UserBacaanDetail
          user={picked}
          totalAyat={totalAyat}
          surahs={surahs}
          onClose={() => setPicked(null)}
          canCreate
          onCreate={() => setCreating(true)}
        />
      ) : null}

      {creating ? (
        <BacaanCreateDialog
          summary={items}
          defaultUserId={picked?.userId ?? user?.id ?? ''}
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      ) : null}
    </PageShell>
  )
}

// ----------------------------------------------------------------------------

// BacaanProgressPanel — the unified pie-chart strip used for both the
// current user's "saya" card and any selected generus's detail dialog.
// Layout: title (nickname), then a horizontally scrollable row of donuts —
// the first donut is "all progress", followed by one per surah the user
// has started reading.
function BacaanProgressPanel({
  entry,
  totalAyat,
  surahs,
  highlight,
}: {
  entry: BacaanSummary
  totalAyat: number
  surahs: QuranSurah[]
  highlight?: boolean
}) {
  const { t, i18n } = useTranslation()
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const allPct =
    totalAyat > 0 ? Math.min(100, Math.round((entry.totalAyat / totalAyat) * 100)) : 0

  const { data: perSurah = [] } = useQuery({
    queryKey: ['bacaan-per-surah', entry.userId],
    queryFn: () => getBacaanPerSurah(entry.userId),
    staleTime: 30_000,
  })

  const title = (entry.userNickname && entry.userNickname.trim()) || entry.userName

  return (
    <div
      className={
        'rounded-lg border p-4 ' +
        (highlight ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white shadow-sm')
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">
          {t('bacaan.sessionsCount', { count: entry.sessions })}
          {entry.lastRead ? ` · ${entry.lastRead}` : ''}
        </div>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        <DonutTile
          pct={allPct}
          label={t('bacaan.donutTotal')}
          sub={`${entry.totalAyat.toLocaleString(numLocale)} / ${totalAyat.toLocaleString(numLocale)}`}
        />
        {perSurah.map((sp) => (
          <SurahDonutTile key={sp.surah} sp={sp} surah={surahs.find((s) => s.id === sp.surah)} />
        ))}
        {perSurah.length === 0 ? (
          <div className="flex items-center px-3 text-xs text-slate-500">
            {t('bacaan.noSurahStarted')}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// SurahDonutTile — pct per surah, capped at jumlahAyat. Shows surah name +
// "X/Y" below the donut, "x%" inside.
function SurahDonutTile({ sp, surah }: { sp: SurahProgress; surah: QuranSurah | undefined }) {
  const { t } = useTranslation()
  const total = surah?.jumlahAyat ?? sp.ayatRead
  const pct = total > 0 ? Math.min(100, Math.round((sp.ayatRead / total) * 100)) : 0
  return (
    <DonutTile
      pct={pct}
      label={surah ? `${surah.id}. ${surah.nama}` : t('bacaan.surahFallback', { n: sp.surah })}
      sub={`${sp.ayatRead}/${total}`}
    />
  )
}

// DonutTile — generic donut + label below. Click target if onClick passed.
function DonutTile({
  pct,
  label,
  sub,
}: {
  pct: number
  label: string
  sub?: string
}) {
  return (
    <div className="flex w-24 flex-shrink-0 flex-col items-center text-center">
      <DonutChart pct={pct} centerLabel={`${pct}%`} />
      <div className="mt-1 line-clamp-2 text-[11px] font-medium text-slate-800">{label}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  )
}

// Simple SVG donut — accepts pct (0–100) and renders a circular progress
// ring with the percentage label in the center.
function DonutChart({ pct, centerLabel }: { pct: number; centerLabel: string }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const filled = Math.max(0, Math.min(100, pct)) / 100
  return (
    <div className="relative h-20 w-20">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#d1fae5" strokeWidth="14" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#059669"
          strokeWidth="14"
          strokeDasharray={`${filled * circumference} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">
        <div className="text-sm font-bold text-emerald-900">{centerLabel}</div>
      </div>
    </div>
  )
}

function UserBacaanTile({
  item,
  totalAyat,
  highlight,
  onClick,
}: {
  item: BacaanSummary
  totalAyat: number
  highlight: boolean
  onClick: () => void
}) {
  const { t, i18n } = useTranslation()
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const pct = totalAyat > 0 ? Math.min(100, Math.round((item.totalAyat / totalAyat) * 100)) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-col gap-2 rounded-lg border-2 bg-white p-3 text-left transition hover:shadow ' +
        (highlight ? 'border-emerald-400' : 'border-slate-200 hover:border-slate-300')
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {item.photoPath ? (
            <img
              src={`/api/files/${item.photoPath}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-slate-500">
              {(item.userName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {item.userNickname?.trim() || item.userName}
          </div>
          {item.userNickname?.trim() ? (
            <div className="truncate text-[10px] text-slate-500">{item.userName}</div>
          ) : null}
        </div>
        <span className="text-sm font-bold text-emerald-700">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{item.totalAyat.toLocaleString(numLocale)} {t('bacaan.ayatUnit')}</span>
        <span>{item.lastRead ?? '—'}</span>
      </div>
    </button>
  )
}

// ----------------------------------------------------------------------------

function UserBacaanDetail({
  user: u,
  totalAyat,
  surahs,
  onClose,
  canCreate,
  onCreate,
}: {
  user: BacaanSummary
  totalAyat: number
  surahs: QuranSurah[]
  onClose: () => void
  canCreate: boolean
  onCreate: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: logs = [] } = useQuery({
    queryKey: ['bacaan', u.userId],
    queryFn: () => listBacaan({ userId: u.userId, limit: 200 }),
  })
  const delMut = useMutation({
    mutationFn: deleteBacaan,
    onSuccess: () => {
      toast(t('bacaan.logDeleted'), 'success')
      qc.invalidateQueries({ queryKey: ['bacaan', u.userId] })
      qc.invalidateQueries({ queryKey: ['bacaan-summary'] })
      qc.invalidateQueries({ queryKey: ['bacaan-per-surah', u.userId] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('bacaan.deleteFailed'), 'error'),
  })
  return (
    <Dialog title={u.userName} onClose={onClose} size="lg">
      <div className="space-y-4">
        <BacaanProgressPanel entry={u} totalAyat={totalAyat} surahs={surahs} />

        {canCreate ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={onCreate}>
              <Plus size={14} className="mr-1" /> {t('bacaan.addCatatan')}
            </Button>
          </div>
        ) : null}

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('bacaan.riwayatCatatan', { count: logs.length })}
          </div>
          {logs.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500">
              {t('bacaan.emptyCatatan')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {logs.map((l) => {
                const ayatRange = l.ayatTo !== l.ayatFrom ? `${l.ayatFrom}–${l.ayatTo}` : String(l.ayatFrom)
                const sourceLabel =
                  l.source === 'pengajian' ? t('bacaan.sourcePengajian') : t('bacaan.sourceMandiri')
                return (
                  <li key={l.id} className="flex items-start gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {t('bacaan.logSurahAyat', { surah: l.surah, ayat: ayatRange })}
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
                            (l.source === 'pengajian'
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-slate-100 text-slate-600')
                          }
                        >
                          {sourceLabel}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {l.tanggal}
                        {l.recorderName && l.recorderName !== l.userName
                          ? ` · ${t('bacaan.logByRecorder', { name: l.recorderName })}`
                          : ''}
                      </div>
                      {l.catatan ? (
                        <div className="mt-1 text-xs text-slate-600">{l.catatan}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirm({ message: t('bacaan.confirmDelete'), danger: true })) delMut.mutate(l.id)
                      }}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label={t('bacaan.removeAria')}
                      disabled={delMut.isPending}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  )
}

// ----------------------------------------------------------------------------

function BacaanCreateDialog({
  summary,
  defaultUserId,
  onClose,
  onSaved,
}: {
  summary: BacaanSummary[]
  defaultUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  // Form state — ayat fields stored as strings so they can start empty.
  // Validated/converted at submit time.
  const [form, setForm] = useState<{
    userId: string
    source: BacaanSource
    tanggal: string
    surah: number
    ayatFrom: string
    ayatTo: string
    catatan: string
  }>(() => ({
    userId: defaultUserId,
    source: 'mandiri',
    tanggal: localDate(new Date()),
    surah: 1,
    ayatFrom: '',
    ayatTo: '',
    catatan: '',
  }))
  const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')
  const { data: surahs = [] } = useQuery({
    queryKey: ['quran-surahs'],
    queryFn: listQuranSurahs,
    staleTime: 60 * 60_000,
  })
  const surahInfo = useMemo(() => surahs.find((s) => s.id === form.surah), [surahs, form.surah])

  const mut = useMutation({
    mutationFn: createBacaan,
    onSuccess: () => {
      toast(t('bacaan.catatanSaved'), 'success')
      qc.invalidateQueries({ queryKey: ['bacaan-summary'] })
      qc.invalidateQueries({ queryKey: ['bacaan'] })
      qc.invalidateQueries({ queryKey: ['bacaan-per-surah'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('bacaan.saveFailed'), 'error'),
  })

  return (
    <Dialog title={t('bacaan.dialogTitle')} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const aFrom = Number(form.ayatFrom)
          const aTo = Number(form.ayatTo || form.ayatFrom)
          if (!Number.isFinite(aFrom) || aFrom < 1) {
            toast(t('bacaan.errAyatFromInvalid'), 'error')
            return
          }
          mut.mutate({
            userId: form.userId,
            source: form.source,
            tanggal: form.tanggal,
            surah: form.surah,
            ayatFrom: aFrom,
            ayatTo: Math.max(aFrom, aTo),
            catatan: form.catatan.trim() || null,
          })
        }}
      >
        <Field label={t('bacaan.fieldUser')} htmlFor="b-user">
          <select
            id="b-user"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
            required
          >
            <option value="">{t('common.selectPrompt')}</option>
            {summary.map((s) => (
              <option key={s.userId} value={s.userId}>
                {t('bacaan.userOption', { name: s.userName, role: s.userRole })}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bacaan.fieldTanggal')} htmlFor="b-tanggal">
            <Input
              id="b-tanggal"
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
            />
          </Field>
          <Field label={t('bacaan.fieldSumber')} htmlFor="b-source">
            <div className="flex gap-2">
              {(['pengajian', 'mandiri'] as BacaanSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, source: s })}
                  className={
                    'flex-1 rounded-md border px-3 py-1.5 text-sm transition ' +
                    (form.source === s
                      ? 'border-sky-500 bg-sky-500 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
                  }
                >
                  {s === 'pengajian' ? t('bacaan.sourcePengajian') : t('bacaan.sourceMandiri')}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label={t('bacaan.fieldSurah')} htmlFor="b-surah">
          <select
            id="b-surah"
            value={form.surah}
            onChange={(e) =>
              setForm({ ...form, surah: Number(e.target.value), ayatFrom: '', ayatTo: '' })
            }
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm"
          >
            {surahs.map((s) => (
              <option key={s.id} value={s.id}>
                {t('bacaan.surahOption', { id: s.id, nama: s.nama, count: s.jumlahAyat })}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('bacaan.fieldAyatFrom')} htmlFor="b-from">
            <Input
              id="b-from"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={form.ayatFrom}
              onChange={(e) => setForm({ ...form, ayatFrom: digitsOnly(e.target.value) })}
              placeholder=""
            />
          </Field>
          <Field label={t('bacaan.fieldAyatTo')} htmlFor="b-to">
            <Input
              id="b-to"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={form.ayatTo}
              onChange={(e) => setForm({ ...form, ayatTo: digitsOnly(e.target.value) })}
              placeholder=""
            />
          </Field>
          <Field label={t('bacaan.fieldSeluruh')} htmlFor="b-all" className="self-end">
            <button
              id="b-all"
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  ayatFrom: '1',
                  ayatTo: surahInfo?.jumlahAyat ? String(surahInfo.jumlahAyat) : '',
                })
              }
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              {t('bacaan.btnFromEnd')}
            </button>
          </Field>
        </div>

        <Field label={t('bacaan.fieldCatatan')} htmlFor="b-note">
          <textarea
            id="b-note"
            rows={2}
            value={form.catatan ?? ''}
            onChange={(e) => setForm({ ...form, catatan: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mut.isPending || !form.userId}>
            {mut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

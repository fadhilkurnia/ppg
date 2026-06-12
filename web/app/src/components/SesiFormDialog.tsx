import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Clock } from 'lucide-react'

import {
  createSesi,
  updateSesi,
  type Sesi,
  type SesiInput,
  type SesiLibraryItem,
} from '@/api/sesi'
import { listKelas } from '@/api/kelas'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { TimeDialPopup } from '@/components/TimeDialPopup'
import {
  MateriSourcePicker,
  emptyMateriSourceValue,
  type MateriSourceValue,
} from '@/components/MateriSourcePicker'
import { useToast } from '@/lib/toast'

/**
 * SesiFormDialog — shared create/edit dialog for sesi. Used from both the
 * Kelas list (`+ Tambah sesi` inside an open kelas card) and the calendar
 * view. The materi picker is multi-source: kurikulum drilldown OR a fixed
 * library (Quran / Hadits / Tilawati / Doa) with an aspect (reciting /
 * memorizing / review / manqul).
 */

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export type SesiFormDefaults = {
  /** Pre-bound kelasId — when set, the sesi is created scoped to the kelas. */
  kelasId?: string
  /** Default tingkat for the materi picker (typically the kelas's tingkat). */
  defaultTingkat?: string
  /** Default date when creating. */
  defaultDate?: string
}

type FormValues = {
  tanggal: string
  topik: string
}

export function SesiFormDialog({
  mode,
  sesi,
  defaults,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit'
  sesi?: Sesi
  defaults?: SesiFormDefaults
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  // Build the validation schema fresh per locale so error messages
  // localize when the user flips the language switch.
  const schema = useMemo(
    () =>
      z.object({
        tanggal: z.string().length(10, t('sesiDialog.form.errDate')),
        topik: z.string().min(1, t('sesiDialog.form.errRequired')).max(500),
      }),
    [t],
  )

  // Kelas picker — bound to a kelasId. Defaults from props (typically the
  // calendar's "Pilih kelas" filter); user can change in the form.
  const [kelasId, setKelasId] = useState<string>(sesi?.kelasId ?? defaults?.kelasId ?? '')
  const { data: kelasList = [] } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
    staleTime: 60_000,
  })
  const pickedKelas = useMemo(
    () => kelasList.find((k) => k.id === kelasId) ?? null,
    [kelasList, kelasId],
  )
  // Tingkat auto-follows the picked kelas (or the legacy defaults prop).
  const autoTingkat = pickedKelas?.tingkat ?? sesi?.tingkat ?? defaults?.defaultTingkat ?? ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tanggal: sesi?.tanggal?.slice(0, 10) ?? defaults?.defaultDate ?? localDate(new Date()),
      topik: sesi?.topik ?? '',
    },
  })

  // Times — controlled outside RHF (TimeDialPopup writes back live).
  const [mulai, setMulai] = useState(sesi?.mulai ?? '')
  const [selesai, setSelesai] = useState(sesi?.selesai ?? '')
  const [dialOpenFor, setDialOpenFor] = useState<'start' | 'end' | null>(null)

  // Materi picker — preserves drilldown state across aspect/source switches.
  const [source, setSource] = useState<MateriSourceValue>(() => {
    if (sesi) {
      const base = emptyMateriSourceValue(sesi.tingkat ?? defaults?.defaultTingkat)
      if (sesi.materiAjarIds && sesi.materiAjarIds.length > 0) {
        base.materiAjarIds = sesi.materiAjarIds
      } else if (sesi.materiAjarId) {
        base.materiAjarIds = [sesi.materiAjarId]
      }
      // Saved library refs are read back from the new sesi_library join. We
      // fall back to the legacy single columns when the join is empty.
      if (sesi.libraryItems && sesi.libraryItems.length > 0) {
        base.libraryItems = sesi.libraryItems
      } else if (
        sesi.libraryKind &&
        sesi.libraryKind !== 'kurikulum' &&
        sesi.libraryRef
      ) {
        base.libraryItems = [
          {
            libraryKind: sesi.libraryKind,
            libraryAspect: sesi.libraryAspect ?? null,
            libraryRef: sesi.libraryRef,
          },
        ]
      }
      base.libraryKind = 'kurikulum'
      return base
    }
    return emptyMateriSourceValue(defaults?.defaultTingkat)
  })

  // Invalidate rencana caches too — the backend auto-syncs sesi materi
  // into the kelas's monthly rencana_bulanan, so the Rencana Ajar tab
  // should reflect newly-attached materi without a manual refresh.
  const invalidateSesi = () => {
    qc.invalidateQueries({ queryKey: ['sesi'] })
    qc.invalidateQueries({ queryKey: ['kelas-sesi'] })
    qc.invalidateQueries({ queryKey: ['rencana'] })
    qc.invalidateQueries({ queryKey: ['rencana-full'] })
  }

  const createMut = useMutation({
    mutationFn: (input: SesiInput) => createSesi(input),
    onSuccess: () => {
      toast(t('sesiDialog.form.added'), 'success')
      invalidateSesi()
      onSaved()
    },
    onError: (e) => toast(apiMsg(e, t('sesiDialog.form.addFailed')), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: (input: SesiInput) => updateSesi(sesi!.id, input),
    onSuccess: () => {
      toast(t('sesiDialog.form.updated'), 'success')
      invalidateSesi()
      onSaved()
    },
    onError: (e) => toast(apiMsg(e, t('sesiDialog.form.updateFailed')), 'error'),
  })

  const pending = createMut.isPending || updateMut.isPending

  // Suggest a friendly default topic from the source selection when topik
  // is empty — saves typing for the common case.
  const defaultTopik = useMemo(() => suggestTopik(source), [source])

  const onSubmit = (v: FormValues) => {
    const topik = v.topik.trim() || defaultTopik || 'Sesi'
    // Library items: the persisted list, plus the current draft if non-empty
    // and not yet pushed to the list (so users can hit Save without first
    // pressing "Tambah ke daftar"). De-dupes by (kind, aspect, ref).
    const items: SesiLibraryItem[] = [...source.libraryItems]
    if (source.libraryKind !== 'kurikulum' && source.libraryRef) {
      const draft: SesiLibraryItem = {
        libraryKind: source.libraryKind,
        libraryAspect: source.libraryAspect,
        libraryRef: source.libraryRef,
      }
      const key = (it: SesiLibraryItem) =>
        `${it.libraryKind}|${it.libraryAspect ?? ''}|${it.libraryRef}`
      const seen = new Set(items.map(key))
      if (!seen.has(key(draft))) items.push(draft)
    }
    const input: SesiInput = {
      tanggal: v.tanggal,
      mulai: mulai || null,
      selesai: selesai || null,
      topik,
      catatan: null,
      tingkat: autoTingkat || null,
      materiAjarId: source.materiAjarIds[0] ?? null,
      materiAjarIds: source.materiAjarIds,
      kelasId: kelasId || null,
      libraryKind: items.length > 0 ? items[0].libraryKind : 'kurikulum',
      libraryAspect: items.length > 0 ? items[0].libraryAspect ?? null : null,
      libraryRef: items.length > 0 ? items[0].libraryRef : null,
      libraryItems: items,
    }
    if (mode === 'create') createMut.mutate(input)
    else updateMut.mutate(input)
  }

  return (
    <Dialog
      title={mode === 'create' ? t('sesiDialog.form.titleCreate') : t('sesiDialog.form.titleEdit')}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field
          label={t('sesiDialog.form.kelasLabel')}
          htmlFor="sesi-kelas"
          hint={
            pickedKelas
              ? t('sesiDialog.form.kelasHintTingkat', { tingkat: pickedKelas.tingkat })
              : t('sesiDialog.form.kelasHintPrompt')
          }
        >
          <select
            id="sesi-kelas"
            value={kelasId}
            onChange={(e) => setKelasId(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <option value="">{t('sesiDialog.form.kelasSelectPrompt')}</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama} · {k.tingkat}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('sesiDialog.form.tanggalLabel')} htmlFor="sesi-tanggal" error={errors.tanggal?.message}>
            <Input id="sesi-tanggal" type="date" {...register('tanggal')} />
          </Field>
          <Field
            label={t('sesiDialog.form.topikLabel')}
            htmlFor="sesi-topik"
            error={errors.topik?.message}
            hint={
              autoTingkat
                ? t('sesiDialog.form.topikHintTingkat', { tingkat: autoTingkat })
                : defaultTopik && !errors.topik
                ? t('sesiDialog.form.topikHintAuto', { topik: defaultTopik })
                : undefined
            }
          >
            <Input
              id="sesi-topik"
              placeholder={defaultTopik || t('sesiDialog.form.topikPhDefault')}
              {...register('topik')}
            />
          </Field>
        </div>

        {/* Simple time inputs + dial popup. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('sesiDialog.form.mulaiLabel')} htmlFor="sesi-mulai">
            <div className="flex items-center gap-1">
              <Input
                id="sesi-mulai"
                type="time"
                value={mulai}
                onChange={(e) => setMulai(e.target.value)}
                disabled={pending}
              />
              <button
                type="button"
                onClick={() => setDialOpenFor('start')}
                disabled={pending}
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label={t('sesiDialog.form.dialMulaiAria')}
                title={t('sesiDialog.form.dialTitle')}
              >
                <Clock size={14} />
              </button>
            </div>
          </Field>
          <Field label={t('sesiDialog.form.selesaiLabel')} htmlFor="sesi-selesai">
            <div className="flex items-center gap-1">
              <Input
                id="sesi-selesai"
                type="time"
                value={selesai}
                onChange={(e) => setSelesai(e.target.value)}
                disabled={pending}
              />
              <button
                type="button"
                onClick={() => setDialOpenFor('end')}
                disabled={pending}
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label={t('sesiDialog.form.dialSelesaiAria')}
                title={t('sesiDialog.form.dialTitle')}
              >
                <Clock size={14} />
              </button>
            </div>
          </Field>
        </div>

        {dialOpenFor ? (
          <TimeDialPopup
            start={mulai}
            end={selesai}
            onStartChange={setMulai}
            onEndChange={setSelesai}
            initialSlot={dialOpenFor}
            onClose={() => setDialOpenFor(null)}
          />
        ) : null}

        <MateriSourcePicker
          value={source}
          onChange={setSource}
          fixedTingkat={autoTingkat}
          multipleLibrary
        />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function suggestTopik(s: MateriSourceValue): string {
  switch (s.libraryKind) {
    case 'kurikulum':
      return ''
    case 'quran':
      return s.libraryRef ? `Al-Qur'an ${s.libraryRef}` : "Al-Qur'an"
    case 'hadits':
      return s.libraryRef ? `Hadits ${s.libraryRef}` : 'Hadits'
    case 'tilawati':
      return s.libraryRef ? `Tilawati ${s.libraryRef}` : 'Tilawati'
    case 'doa':
      return s.libraryRef ? `Doa #${s.libraryRef}` : 'Doa'
    default:
      return ''
  }
}

function apiMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.message || fallback
  return fallback
}

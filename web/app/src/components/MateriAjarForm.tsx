import { useId, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'

import { listMateriAjar, type MateriAjar, type MateriAjarInput, type Tingkat } from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from './Button'
import { Field } from './Field'
import { Input } from './Input'
import { MateriRelationsPanel } from './MateriRelationsPanel'

// Canonical tema names ship as default suggestions. Admins may add new themes
// by typing them in the form (the field is a free-text input with autocomplete
// from the existing materi list).
const DEFAULT_TEMA = ['ALIM', 'FAQIH', 'AKHLAQUL KARIMAH', 'KEMANDIRIAN']

const KATEGORI = ['baru', 'lanjutan', 'mengulang'] as const

type FormValues = {
  kodeMateri: string
  tingkat: string
  tema: string
  subTema: string
  kelompokMateri?: string
  detailMateri: string
  semester: number
  kategori: (typeof KATEGORI)[number]
  refRaportId?: string
  perluReviewOrtu: boolean
  progresif: boolean
}

type Props = {
  initial?: MateriAjar
  /** Pre-fill values for the create form (e.g., when adding a new sub-tema
   *  under an existing tema, the parent tema is locked in). Ignored when
   *  `initial` is also supplied (edit mode owns its own values). */
  defaults?: Partial<MateriAjarInput>
  tingkatOptions: Tingkat[]
  submitLabel: string
  pending?: boolean
  error?: unknown
  onSubmit: (input: MateriAjarInput) => void
  onCancel: () => void
}

export function MateriAjarForm({
  initial,
  defaults,
  tingkatOptions,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const temaListId = useId()
  const subTemaListId = useId()
  const kelompokListId = useId()

  // Build the validation schema fresh per locale so error messages
  // localize when the user flips the language switch.
  const schema = useMemo(
    () =>
      z.object({
        kodeMateri: z.string().min(1, t('materiComp.form.errRequired')).max(100),
        tingkat: z.string().min(1, t('materiComp.form.errRequired')).max(100),
        tema: z.string().min(1, t('materiComp.form.errRequired')).max(200),
        subTema: z.string().min(1, t('materiComp.form.errRequired')).max(500),
        kelompokMateri: z.string().max(200).optional().or(z.literal('')),
        detailMateri: z.string().min(1, t('materiComp.form.errRequired')),
        semester: z.coerce.number().int().refine((v) => v === 1 || v === 2, t('materiComp.form.errSemester')),
        kategori: z.enum(KATEGORI),
        refRaportId: z.string().max(100).optional().or(z.literal('')),
        perluReviewOrtu: z.boolean(),
        progresif: z.boolean(),
      }),
    [t],
  )

  // Pull the full materi list once so we can derive existing tema / subTema /
  // kelompokMateri values for the datalist suggestions. Cached for 5 min so
  // opening the form doesn't refire the request.
  const { data: allMateri = [] } = useQuery({
    queryKey: ['materi-ajar', { all: true }],
    queryFn: () => listMateriAjar({}),
    staleTime: 5 * 60_000,
  })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kodeMateri: initial?.kodeMateri ?? '',
      tingkat: initial?.tingkat ?? defaults?.tingkat ?? tingkatOptions[0]?.nama ?? '',
      tema: initial?.tema ?? defaults?.tema ?? '',
      subTema: initial?.subTema ?? defaults?.subTema ?? '',
      kelompokMateri: initial?.kelompokMateri ?? defaults?.kelompokMateri ?? '',
      detailMateri: initial?.detailMateri ?? defaults?.detailMateri ?? '',
      semester: (initial?.semester as 1 | 2) ?? (defaults?.semester as 1 | 2) ?? 1,
      kategori: initial?.kategori ?? defaults?.kategori ?? 'baru',
      refRaportId: initial?.refRaportId ?? '',
      perluReviewOrtu: initial?.perluReviewOrtu ?? false,
      progresif: initial?.progresif ?? false,
    },
  })

  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          kodeMateri: v.kodeMateri.trim(),
          tingkat: v.tingkat.trim(),
          tema: v.tema.trim(),
          subTema: v.subTema.trim(),
          kelompokMateri: empty(v.kelompokMateri),
          detailMateri: v.detailMateri.trim(),
          semester: Number(v.semester),
          kategori: v.kategori,
          refRaportId: empty(v.refRaportId),
          perluReviewOrtu: Boolean(v.perluReviewOrtu),
          progresif: Boolean(v.progresif),
        }),
      )}
      className="space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('materiComp.form.kodeMateri')} htmlFor="kodeMateri" error={errors.kodeMateri?.message}>
          <Input id="kodeMateri" {...register('kodeMateri')} />
        </Field>
        <Field label={t('materiComp.form.tingkat')} htmlFor="tingkat" error={errors.tingkat?.message}>
          <Select id="tingkat" {...register('tingkat')}>
            {tingkatOptions.length === 0 ? <option value="">—</option> : null}
            {tingkatOptions.map((tk) => (
              <option key={tk.id} value={tk.nama}>
                {tk.umur != null ? t('materiComp.form.tingkatUmur', { nama: tk.nama, umur: tk.umur }) : tk.nama}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('materiComp.form.tema')} htmlFor="tema" error={errors.tema?.message} hint={t('materiComp.form.temaHint')}>
          <Input id="tema" list={temaListId} placeholder={t('materiComp.form.temaPh')} {...register('tema')} />
          <TemaSuggestions id={temaListId} allMateri={allMateri} />
        </Field>
        <Field label={t('materiComp.form.subTema')} htmlFor="subTema" error={errors.subTema?.message} hint={t('materiComp.form.subTemaHint')}>
          <Input id="subTema" list={subTemaListId} {...register('subTema')} />
          <SubTemaSuggestions
            id={subTemaListId}
            allMateri={allMateri}
            control={control}
          />
        </Field>
        <Field label={t('materiComp.form.kelompokMateri')} htmlFor="kelompokMateri" error={errors.kelompokMateri?.message}>
          <Input id="kelompokMateri" list={kelompokListId} {...register('kelompokMateri')} />
          <KelompokSuggestions
            id={kelompokListId}
            allMateri={allMateri}
            control={control}
          />
        </Field>
        <Field label={t('materiComp.form.semester')} htmlFor="semester" error={errors.semester?.message}>
          <Select id="semester" {...register('semester')}>
            <option value="1">1</option>
            <option value="2">2</option>
          </Select>
        </Field>
        <Field
          label={t('materiComp.form.detailMateri')}
          htmlFor="detailMateri"
          error={errors.detailMateri?.message}
          className="sm:col-span-2"
        >
          <textarea
            id="detailMateri"
            rows={3}
            {...register('detailMateri')}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </Field>
        <Field label={t('materiComp.form.kategori')} htmlFor="kategori" error={errors.kategori?.message}>
          <Select id="kategori" {...register('kategori')}>
            <option value="baru">{t('materiComp.form.kategoriBaru')}</option>
            <option value="lanjutan">{t('materiComp.form.kategoriLanjutan')}</option>
            <option value="mengulang">{t('materiComp.form.kategoriMengulang')}</option>
          </Select>
        </Field>
        <Field label={t('materiComp.form.refRaportId')} htmlFor="refRaportId" error={errors.refRaportId?.message}>
          <Input id="refRaportId" {...register('refRaportId')} />
        </Field>
      </div>

      {/* Library refs + kurikulum relations — only available when editing
          an existing materi (we need an id to attach to). */}
      {initial?.id ? (
        <MateriRelationsPanel materiId={initial.id} />
      ) : (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {t('materiComp.form.saveRelationsHint')}
        </p>
      )}

      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

function empty(v: string | undefined) {
  if (!v) return undefined
  const t = v.trim()
  return t === '' ? undefined : t
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
    />
  )
}

// ---------------- Datalist suggestion sources --------------------

function TemaSuggestions({ id, allMateri }: { id: string; allMateri: MateriAjar[] }) {
  const options = useMemo(() => {
    const set = new Set<string>(DEFAULT_TEMA)
    for (const m of allMateri) if (m.tema) set.add(m.tema)
    return Array.from(set).sort()
  }, [allMateri])
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

function SubTemaSuggestions({
  id,
  allMateri,
  control,
}: {
  id: string
  allMateri: MateriAjar[]
  control: ReturnType<typeof useForm<FormValues>>['control']
}) {
  // Suggestions narrow down to the currently-selected tema (sitrac-style
  // dependent picker). Falls back to all subTema if tema is empty.
  const tema = useWatch({ control, name: 'tema' })
  const options = useMemo(() => {
    const set = new Set<string>()
    for (const m of allMateri) {
      if (!m.subTema) continue
      if (tema && m.tema !== tema) continue
      set.add(m.subTema)
    }
    return Array.from(set).sort()
  }, [allMateri, tema])
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

function KelompokSuggestions({
  id,
  allMateri,
  control,
}: {
  id: string
  allMateri: MateriAjar[]
  control: ReturnType<typeof useForm<FormValues>>['control']
}) {
  const tema = useWatch({ control, name: 'tema' })
  const subTema = useWatch({ control, name: 'subTema' })
  const options = useMemo(() => {
    const set = new Set<string>()
    for (const m of allMateri) {
      if (!m.kelompokMateri) continue
      if (tema && m.tema !== tema) continue
      if (subTema && m.subTema !== subTema) continue
      set.add(m.kelompokMateri)
    }
    return Array.from(set).sort()
  }, [allMateri, tema, subTema])
  return (
    <datalist id={id}>
      {options.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

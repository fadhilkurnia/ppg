import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CalendarClock, Pencil, Plus, Trash2, Users } from 'lucide-react'

import {
  addAnggota,
  createKelas,
  deleteKelas,
  listKelas,
  updateKelas,
  type Kelas,
  type KelasInput,
} from '@/api/kelas'
import { listTingkat } from '@/api/kurikulum'
import { listStudents } from '@/api/students'
import { listUsers } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { KelasAnggotaDialog } from '@/components/KelasAnggotaDialog'
import { KelasJadwalDialog } from '@/components/KelasJadwalDialog'
import { KelasSesiDialog } from '@/components/KelasSesiDialog'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

/**
 * KelasListSection — two always-visible searchable fields (My Class / Other
 * Class). Each field has its own search box, a sticky search bar, and a
 * scrollable card grid. Clicking a card opens KelasSesiDialog (the session
 * popup). Admins CRUD kelas via dialogs reached from the card icons / top bar.
 */

function matchKelas(k: Kelas, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return (
    k.nama.toLowerCase().includes(needle) ||
    (k.guruName ?? '').toLowerCase().includes(needle) ||
    k.tingkat.toLowerCase().includes(needle)
  )
}

export function KelasListSection() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<
    | { kind: 'create' }
    | { kind: 'edit'; kelas: Kelas }
    | { kind: 'anggota'; kelas: Kelas }
    | { kind: 'jadwal'; kelas: Kelas }
    | null
  >(null)
  const [selected, setSelected] = useState<Kelas | null>(null)

  const { data: list = [], isPending } = useQuery({
    queryKey: ['kelas'],
    queryFn: () => listKelas({}),
  })

  // Split into "kelas saya" (current user is one of the guru) and the rest.
  const isMine = (k: Kelas) => Boolean(user?.id) && (k.guruUserIds ?? []).includes(user!.id)
  const myKelas = useMemo(() => list.filter(isMine), [list, user?.id])
  const otherKelas = useMemo(() => list.filter((k) => !isMine(k)), [list, user?.id])
  const bothFields = myKelas.length > 0 && otherKelas.length > 0

  const deleteMut = useMutation({
    mutationFn: deleteKelas,
    onSuccess: () => {
      toast(t('kelasSection.list.kelasDeleted'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas'] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.kelasDeleteFailed'), 'error'),
  })

  const handleDelete = async (k: Kelas) => {
    if (await confirm({ message: t('kelasSection.list.confirmDelete', { nama: k.nama }), danger: true })) {
      deleteMut.mutate(k.id)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-4 md:px-6">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {isPending ? t('common.loading') : t('kelasSection.list.countRegistered', { count: list.length })}
        </p>
        {isAdmin ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'create' })}>
            <Plus size={16} className="mr-1" /> {t('kelasSection.list.addKelas')}
          </Button>
        ) : null}
      </div>

      {!isPending && list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-700">{t('kelasSection.list.emptyTitle')}</p>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin ? t('kelasSection.list.emptyHintAdmin') : t('kelasSection.list.emptyHintUser')}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {myKelas.length > 0 ? (
            <KelasField
              label={t('kelasSection.list.myKelas')}
              searchPlaceholder={t('kelasSection.list.searchMyKelas')}
              kelasList={myKelas}
              isAdmin={isAdmin}
              onOpen={setSelected}
              onEdit={(k) => setDialog({ kind: 'edit', kelas: k })}
              onDelete={handleDelete}
              onAnggota={(k) => setDialog({ kind: 'anggota', kelas: k })}
              onJadwal={(k) => setDialog({ kind: 'jadwal', kelas: k })}
              currentUserId={user?.id}
              className={bothFields ? 'max-h-[45%] flex-none' : 'flex-1'}
            />
          ) : null}

          {otherKelas.length > 0 ? (
            <KelasField
              label={t('kelasSection.list.allKelas')}
              searchPlaceholder={t('kelasSection.list.searchOtherKelas')}
              kelasList={otherKelas}
              isAdmin={isAdmin}
              onOpen={setSelected}
              onEdit={(k) => setDialog({ kind: 'edit', kelas: k })}
              onDelete={handleDelete}
              onAnggota={(k) => setDialog({ kind: 'anggota', kelas: k })}
              onJadwal={(k) => setDialog({ kind: 'jadwal', kelas: k })}
              currentUserId={user?.id}
              className="flex-1"
            />
          ) : null}
        </div>
      )}

      {selected ? (
        <KelasSesiDialog kelas={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} />
      ) : null}

      {dialog?.kind === 'create' ? (
        <KelasFormDialog onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <KelasFormDialog
          kelas={dialog.kelas}
          onClose={() => setDialog(null)}
          onSaved={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'anggota' ? (
        <KelasAnggotaDialog
          kelasId={dialog.kelas.id}
          kelasNama={dialog.kelas.nama}
          tingkat={dialog.kelas.tingkat}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'jadwal' ? (
        <KelasJadwalDialog
          kelasId={dialog.kelas.id}
          kelasNama={dialog.kelas.nama}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------

function KelasField({
  label,
  searchPlaceholder,
  kelasList,
  isAdmin,
  onOpen,
  onEdit,
  onDelete,
  onAnggota,
  onJadwal,
  currentUserId,
  className,
}: {
  label: string
  searchPlaceholder: string
  kelasList: Kelas[]
  isAdmin: boolean
  onOpen: (k: Kelas) => void
  onEdit: (k: Kelas) => void
  onDelete: (k: Kelas) => void
  onAnggota: (k: Kelas) => void
  onJadwal: (k: Kelas) => void
  currentUserId?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => kelasList.filter((k) => matchKelas(k, q)), [kelasList, q])

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="mb-1 flex flex-shrink-0 items-center gap-2 px-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
          {kelasList.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-slate-50 pb-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-slate-500">{t('kelasSection.list.noMatch')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((k) => (
              <KelasCard
                key={k.id}
                kelas={k}
                isAdmin={isAdmin}
                canManageJadwal={isAdmin || (currentUserId != null && k.guruUserId === currentUserId)}
                onOpen={() => onOpen(k)}
                onEdit={() => onEdit(k)}
                onDelete={() => onDelete(k)}
                onAnggota={() => onAnggota(k)}
                onJadwal={() => onJadwal(k)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------

function KelasCard({
  kelas: k,
  isAdmin,
  canManageJadwal,
  onOpen,
  onEdit,
  onDelete,
  onAnggota,
  onJadwal,
}: {
  kelas: Kelas
  isAdmin: boolean
  canManageJadwal: boolean
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
  onAnggota: () => void
  onJadwal: () => void
}) {
  const { t } = useTranslation()
  const subtitle = k.guruName
    ? t('kelasSection.list.cardSubtitleWithWali', { tingkat: k.tingkat, tahun: k.tahun, wali: k.guruName })
    : t('kelasSection.list.cardSubtitle', { tingkat: k.tingkat, tahun: k.tahun })

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-sky-300 hover:shadow">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
          isAdmin ? 'pr-28' : canManageJadwal && 'pr-10',
        )}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-lg">
          🏫
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-900">{k.nama}</div>
          <div className="truncate text-xs text-slate-500">{subtitle}</div>
        </div>
      </button>
      {isAdmin || canManageJadwal ? (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onJadwal()
            }}
            className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={t('kelasSection.jadwal.manage')}
            title={t('kelasSection.jadwal.manage')}
          >
            <CalendarClock size={16} />
          </button>
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAnggota()
                }}
                className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label={t('kelasSection.list.manageAnggota')}
                title={t('kelasSection.list.manageAnggota')}
              >
                <Users size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label={t('kelasSection.list.editKelas')}
                title={t('kelasSection.list.editKelas')}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="rounded-md bg-white/80 p-1.5 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                aria-label={t('kelasSection.list.deleteKelas')}
                title={t('kelasSection.list.deleteKelas')}
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// -----------------------------------------------------------------------

type FormValues = {
  nama: string
  tingkat: string
  tahun: number
  deskripsi?: string
}

// Compute integer age (years) from an ISO YYYY-MM-DD date string.
function ageFromDob(dob?: string): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

// Pick the most appropriate tingkat for a murid: first try umur-based match
// (smallest tingkat.umur >= age), then fall back to a fuzzy level-name match.
function matchTingkatForMurid(
  m: { dateOfBirth?: string; level?: string } | undefined,
  tingkatList: { id: string; nama: string; urutan: number; umur?: number | null }[],
): { id: string; nama: string } | undefined {
  if (!m || tingkatList.length === 0) return undefined
  const age = ageFromDob(m.dateOfBirth)
  if (age != null) {
    const withUmur = tingkatList.filter((t) => t.umur != null) as {
      id: string
      nama: string
      umur: number
    }[]
    if (withUmur.length > 0) {
      const eligible = withUmur
        .filter((t) => t.umur >= age)
        .sort((a, b) => a.umur - b.umur)
      if (eligible[0]) return eligible[0]
      // age above all tingkat — pick the largest umur bucket.
      const sortedDesc = [...withUmur].sort((a, b) => b.umur - a.umur)
      return sortedDesc[0]
    }
  }
  if (m.level) {
    const lvl = m.level.toLowerCase()
    return tingkatList.find(
      (t) =>
        t.nama.toLowerCase() === lvl ||
        t.nama.toLowerCase().includes(lvl) ||
        lvl.includes(t.nama.toLowerCase()),
    )
  }
  return undefined
}

function KelasFormDialog({
  kelas,
  onClose,
  onSaved,
}: {
  kelas?: Kelas
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  const isCreate = !kelas
  // Build the validation schema fresh per locale so error messages
  // localize when the user flips the language switch.
  const schema = useMemo(
    () =>
      z.object({
        nama: z.string().min(1, t('kelasSection.list.form.errRequired')).max(200),
        tingkat: z.string().min(1, t('kelasSection.list.form.errRequired')).max(100),
        tahun: z.coerce.number().int().gte(2000).lte(2200),
        deskripsi: z.string().optional().or(z.literal('')),
      }),
    [t],
  )
  const { data: tingkatList = [] } = useQuery({
    queryKey: ['tingkat'],
    queryFn: listTingkat,
    staleTime: 5 * 60_000,
  })
  const { data: gurus } = useQuery({
    queryKey: ['users', 'role-guru'],
    queryFn: () => listUsers({ role: 'guru', active: true, limit: 200 }),
    staleTime: 60_000,
  })
  const guruOptions = gurus?.items ?? []

  const [muridSearch, setMuridSearch] = useState('')
  const { data: studentsRes } = useQuery({
    queryKey: ['students-pick', { q: muridSearch }],
    queryFn: () => listStudents({ q: muridSearch, status: 'active', limit: 200, offset: 0 }),
    enabled: isCreate,
    staleTime: 30_000,
  })
  const muridOptions = studentsRes?.items ?? []

  const [pickedGuru, setPickedGuru] = useState<string[]>(
    () => kelas?.guruUserIds ?? (kelas?.guruUserId ? [kelas.guruUserId] : []),
  )
  const toggleGuru = (id: string) =>
    setPickedGuru((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const [pickedMurid, setPickedMurid] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nama: kelas?.nama ?? '',
      tingkat: kelas?.tingkat ?? '',
      tahun: kelas?.tahun ?? new Date().getFullYear(),
      deskripsi: kelas?.deskripsi ?? '',
    },
  })

  const muridById = useMemo(() => {
    const m: Record<string, (typeof muridOptions)[number]> = {}
    for (const s of muridOptions) m[s.id] = s
    return m
  }, [muridOptions])

  const toggleMurid = (id: string) => {
    setPickedMurid((cur) => {
      const adding = !cur.includes(id)
      const next = adding ? [...cur, id] : cur.filter((x) => x !== id)
      if (adding) {
        const m = muridById[id]
        const t = matchTingkatForMurid(m, tingkatList)
        if (t) setValue('tingkat', t.nama, { shouldValidate: true, shouldDirty: true })
      }
      return next
    })
  }

  const mut = useMutation({
    mutationFn: async (input: KelasInput) => {
      const saved = kelas ? await updateKelas(kelas.id, input) : await createKelas(input)
      if (isCreate && pickedMurid.length > 0) {
        try {
          await addAnggota(saved.id, pickedMurid)
        } catch (e) {
          toast(
            e instanceof ApiError
              ? t('kelasSection.list.form.addMuridPartialFail', { message: e.message })
              : t('kelasSection.list.form.addMuridFailed'),
            'error',
          )
        }
      }
      return saved
    },
    onSuccess: () => {
      toast(kelas ? t('kelasSection.list.form.kelasUpdated') : t('kelasSection.list.form.kelasAdded'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas'] })
      onSaved()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('kelasSection.list.form.saveFailed'), 'error'),
  })

  return (
    <Dialog title={kelas ? t('kelasSection.list.form.titleEdit') : t('kelasSection.list.form.titleAdd')} onClose={onClose} size="lg">
      <form
        onSubmit={handleSubmit((v) =>
          mut.mutate({
            nama: v.nama.trim(),
            tingkat: v.tingkat,
            tahun: v.tahun,
            deskripsi: v.deskripsi?.trim() || null,
            guruUserId: pickedGuru[0] ?? null,
            guruUserIds: pickedGuru,
          }),
        )}
        className="space-y-4"
      >
        <Field label={t('kelasSection.list.form.nama')} htmlFor="kelas-nama" error={errors.nama?.message}>
          <Input id="kelas-nama" autoFocus {...register('nama')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('kelasSection.list.form.tingkat')} htmlFor="kelas-tingkat" error={errors.tingkat?.message}>
            <select
              id="kelas-tingkat"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              {...register('tingkat')}
            >
              <option value="">{t('common.selectPrompt')}</option>
              {tingkatList.map((tk) => (
                <option key={tk.id} value={tk.nama}>
                  {tk.nama}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('kelasSection.list.form.tahun')} htmlFor="kelas-tahun" error={errors.tahun?.message}>
            <Input
              id="kelas-tahun"
              type="number"
              min={2000}
              max={2200}
              {...register('tahun', { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field
          label={t('kelasSection.list.form.guru')}
          htmlFor="kelas-guru"
          hint={t('kelasSection.list.form.guruHint')}
        >
          <div className="max-h-44 overflow-y-auto rounded-md border border-slate-300 bg-white">
            {guruOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">
                {t('kelasSection.list.form.guruEmpty')}
              </p>
            ) : (
              guruOptions.map((g) => {
                const checked = pickedGuru.includes(g.id)
                const isPrimary = pickedGuru[0] === g.id
                return (
                  <label
                    key={g.id}
                    className={
                      'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition ' +
                      (checked ? 'bg-sky-50' : 'hover:bg-slate-50')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGuru(g.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="flex-1 truncate">{g.name}</span>
                    {isPrimary ? (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {t('kelasSection.list.form.guruWali')}
                      </span>
                    ) : null}
                  </label>
                )
              })
            )}
          </div>
        </Field>
        {isCreate ? (
          <Field
            label={t('kelasSection.list.form.muridLabel', { count: pickedMurid.length })}
            htmlFor="kelas-murid"
            hint={t('kelasSection.list.form.muridHint')}
          >
            <Input
              id="kelas-murid"
              placeholder={t('kelasSection.list.form.muridSearchPh')}
              value={muridSearch}
              onChange={(e) => setMuridSearch(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white">
              {muridOptions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-500">
                  {muridSearch ? t('kelasSection.list.form.muridNoMatch') : t('kelasSection.list.form.muridEmpty')}
                </p>
              ) : (
                muridOptions.map((s) => {
                  const checked = pickedMurid.includes(s.id)
                  return (
                    <label
                      key={s.id}
                      className={
                        'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition ' +
                        (checked ? 'bg-sky-50' : 'hover:bg-slate-50')
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMurid(s.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="flex-1 truncate">
                        {s.name}
                        {s.nickname ? (
                          <span className="ml-1 text-xs text-slate-500">({s.nickname})</span>
                        ) : null}
                      </span>
                      {s.level ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {s.level}
                        </span>
                      ) : null}
                    </label>
                  )
                })
              )}
            </div>
          </Field>
        ) : null}
        <Field label={t('kelasSection.list.form.deskripsi')} htmlFor="kelas-deskripsi">
          <Input id="kelas-deskripsi" {...register('deskripsi')} />
        </Field>
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

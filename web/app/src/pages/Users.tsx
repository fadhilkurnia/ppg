import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, User as UserIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  setUserPassword,
  updateUser,
  USER_ROLES,
  type ManagedUser,
  type UserCreateInput,
  type UserRole,
  type UserUpdateInput,
} from '@/api/users'
import { ApiError } from '@/api/client'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PhotoUploader } from '@/components/PhotoUploader'
import { RowActions } from '@/components/RowActions'
import { PageShell } from '@/components/PageShell'
import { WilayahPicker } from '@/components/WilayahPicker'

const PAGE_SIZE = 25

type DialogMode = { kind: 'create' } | { kind: 'edit'; id: string } | null

function useRoleLabel() {
  const { t } = useTranslation()
  return (r: string): string => {
    // Map a role string (incl. legacy "staff") to a localized label.
    const known = ['admin', 'pengurus', 'guru', 'ortu', 'murid', 'staff'] as const
    if ((known as readonly string[]).includes(r)) {
      return t(`users.role.${r as (typeof known)[number]}`)
    }
    return r
  }
}


export function UsersPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const roleParam = params.get('role')
  const role = (USER_ROLES as readonly string[]).includes(roleParam ?? '')
    ? (roleParam as UserRole)
    : undefined
  const activeParam = params.get('active')
  const active =
    activeParam === 'true' ? true : activeParam === 'false' ? false : undefined
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const newFlag = params.get('new') === '1'
  const editId = params.get('edit')

  const { user: me } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<DialogMode>(null)

  // /students/new and /teachers/new redirect here with ?new=1 — open the
  // create dialog and strip the param so refresh / back-nav doesn't reopen.
  useEffect(() => {
    if (newFlag) {
      setDialog({ kind: 'create' })
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [newFlag, params, setParams])

  // /pengaturan/pengguna/:id (and legacy /users/:id) redirect here with
  // ?edit=<id> — open the full edit dialog and strip the param.
  useEffect(() => {
    if (editId) {
      setDialog({ kind: 'edit', id: editId })
      const next = new URLSearchParams(params)
      next.delete('edit')
      setParams(next, { replace: true })
    }
  }, [editId, params, setParams])

  const { data, isPending } = useQuery({
    queryKey: ['users', { q, role, active, page }],
    queryFn: () =>
      listUsers({
        q,
        role,
        active,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  })

  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] })

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: invalidate,
  })

  const createMut = useMutation({
    mutationFn: (input: UserCreateInput) => createUser(input),
    onSuccess: (u) => {
      toast(t('users.addToast'), 'success')
      invalidate()
      setDialog({ kind: 'edit', id: u.id })
    },
    onError: (e) => toast(apiMsg(e, t('users.addFailed')), 'error'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UserUpdateInput }) => updateUser(id, input),
    onSuccess: () => {
      toast(t('users.updateToast'), 'success')
      invalidate()
      setDialog(null)
    },
    onError: (e) => toast(apiMsg(e, t('users.updateFailed')), 'error'),
  })

  const handleDelete = async (u: ManagedUser) => {
    if (await confirm({ message: t('users.deleteConfirm', { name: u.name }), danger: true })) {
      deleteMutation.mutate(u.id)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const updateSearch = (next: { q?: string; role?: string; active?: string; page?: number }) => {
    const sp = new URLSearchParams()
    if (next.q) sp.set('q', next.q)
    if (next.role) sp.set('role', next.role)
    if (next.active) sp.set('active', next.active)
    if (next.page && next.page > 1) sp.set('page', String(next.page))
    navigate({ pathname: '/pengaturan/pengguna', search: sp.toString() ? `?${sp.toString()}` : '' })
  }

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{t('users.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('users.subtitle')}
        </p>
      </div>
      <Button className="self-start sm:self-auto" onClick={() => setDialog({ kind: 'create' })}>
        <Plus size={16} className="mr-1" />
        {t('users.add')}
      </Button>
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          updateSearch({
            q: String(fd.get('q') ?? '') || undefined,
            role: String(fd.get('role') ?? '') || undefined,
            active: String(fd.get('active') ?? '') || undefined,
            page: 1,
          })
        }}
      >
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input name="q" defaultValue={q} placeholder={t('users.searchPh')} className="pl-9" />
        </div>
        <select
          name="role"
          defaultValue={role ?? ''}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('users.allRole')}</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        <select
          name="active"
          defaultValue={active === undefined ? '' : String(active)}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">{t('users.allStatus')}</option>
          <option value="true">{t('users.statusActive')}</option>
          <option value="false">{t('users.statusInactive')}</option>
        </select>
        <Button type="submit" variant="secondary" size="md">
          {t('common.apply')}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 w-12"></th>
              <th className="px-4 py-2">{t('users.cols.name')}</th>
              <th className="hidden px-4 py-2 sm:table-cell">{t('users.cols.email')}</th>
              <th className="hidden px-4 py-2 md:table-cell">{t('users.cols.username')}</th>
              <th className="px-4 py-2">{t('users.cols.role')}</th>
              <th className="px-4 py-2">{t('users.cols.status')}</th>
              <th className="px-4 py-2 text-right">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isPending ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Avatar url={u.photoUrl} />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'edit', id: u.id })}
                      className="text-left text-slate-900 hover:underline"
                    >
                      {u.name}
                      {me?.id === u.id ? <span className="ml-2 text-xs text-slate-500">{t('users.selfBadge')}</span> : null}
                    </button>
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{u.email}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{u.username ?? '—'}</td>
                  <td className="px-4 py-2">
                    <RolePill role={u.role} />
                  </td>
                  <td className="px-4 py-2">
                    <ActivePill active={u.active} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RowActions
                      onEdit={() => setDialog({ kind: 'edit', id: u.id })}
                      onDelete={() => handleDelete(u)}
                      deleteDisabled={deleteMutation.isPending || me?.id === u.id}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  {t('users.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>{t('common.pagination', { page, total: totalPages, count: total })}</span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() =>
              updateSearch({
                q,
                role,
                active: active === undefined ? undefined : String(active),
                page: Math.max(1, page - 1),
              })
            }
          >
            {t('common.previous')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              updateSearch({
                q,
                role,
                active: active === undefined ? undefined : String(active),
                page: Math.min(totalPages, page + 1),
              })
            }
          >
            {t('common.next')}
          </Button>
        </div>
      </div>

      {dialog?.kind === 'create' ? (
        <Dialog title={t('users.add')} onClose={() => setDialog(null)}>
          <UserCreateForm
            pending={createMut.isPending}
            error={createMut.error}
            onSubmit={(input) => createMut.mutate(input)}
            onCancel={() => setDialog(null)}
          />
        </Dialog>
      ) : null}

      {dialog?.kind === 'edit' ? (
        <UserEditDialog
          id={dialog.id}
          pending={updateMut.isPending}
          error={updateMut.error}
          onSubmit={(input) => updateMut.mutate({ id: dialog.id, input })}
          onClose={() => setDialog(null)}
          onPhotoChanged={invalidate}
        />
      ) : null}
      </div>
    </PageShell>
  )
}

// --- Create form ----------------------------------------------------------

type CreateValues = {
  name: string
  email: string
  username?: string
  password: string
  role: UserRole
  nickname?: string
  userCode?: string
  noHp?: string
  tempatLahir?: string
  dateOfBirth?: string
  gender?: '' | 'male' | 'female'
  daerah?: string
  desa?: string
  kelompok?: string
  pendidikan?: string
}

function UserCreateForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pending: boolean
  error: unknown
  onSubmit: (input: UserCreateInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()

  const createSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('users.form.errRequired')).max(200),
        email: z.string().email(t('users.form.errEmail')),
        username: z.string().max(64).optional().or(z.literal('')),
        password: z.string().min(6, t('users.form.errPasswordMin')).max(128, t('users.form.errPasswordMax')),
        role: z.enum(USER_ROLES as readonly [UserRole, ...UserRole[]]),
        nickname: z.string().max(200).optional().or(z.literal('')),
        userCode: z.string().max(40).optional().or(z.literal('')),
        noHp: z.string().max(64).optional().or(z.literal('')),
        tempatLahir: z.string().max(120).optional().or(z.literal('')),
        dateOfBirth: z.string().optional().or(z.literal('')),
        gender: z.enum(['', 'male', 'female']).optional(),
        daerah: z.string().max(200).optional().or(z.literal('')),
        desa: z.string().max(200).optional().or(z.literal('')),
        kelompok: z.string().max(200).optional().or(z.literal('')),
        pendidikan: z.string().max(80).optional().or(z.literal('')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: '',
      email: '',
      username: '',
      password: '',
      role: 'murid',
      nickname: '',
      userCode: '',
      noHp: '',
      tempatLahir: '',
      dateOfBirth: '',
      gender: '',
      daerah: '',
      desa: '',
      kelompok: '',
      pendidikan: '',
    },
  })
  const apiError = error instanceof ApiError ? error.message : null

  return (
    <form
      onSubmit={handleSubmit((v) =>
        onSubmit({
          name: v.name,
          email: v.email,
          username: v.username || undefined,
          password: v.password,
          role: v.role,
          nickname: v.nickname || undefined,
          userCode: v.userCode || undefined,
          noHp: v.noHp || undefined,
          tempatLahir: v.tempatLahir || undefined,
          dateOfBirth: v.dateOfBirth || undefined,
          gender: v.gender === '' ? undefined : v.gender,
          daerah: v.daerah || undefined,
          desa: v.desa || undefined,
          kelompok: v.kelompok || undefined,
          pendidikan: v.pendidikan || undefined,
        }),
      )}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('users.form.fullName')} htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>
        <Field label={t('users.form.nickname')} htmlFor="nickname" error={errors.nickname?.message}>
          <Input id="nickname" {...register('nickname')} />
        </Field>
        <Field label={t('users.form.email')} htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register('email')} />
        </Field>
        <Field label={t('users.form.usernameOptional')} htmlFor="username" error={errors.username?.message}>
          <Input id="username" {...register('username')} />
        </Field>
        <Field label={t('users.form.password')} htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="text" placeholder={t('users.form.passwordPh')} {...register('password')} />
        </Field>
        <Field label={t('users.form.role')} htmlFor="role" error={errors.role?.message}>
          <select
            id="role"
            {...register('role')}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('users.form.userCodeOptional')} htmlFor="userCode" error={errors.userCode?.message}>
          <Input id="userCode" placeholder={t('users.form.userCodePh')} {...register('userCode')} />
        </Field>
        <Field label={t('users.form.noHp')} htmlFor="noHp" error={errors.noHp?.message}>
          <Input id="noHp" {...register('noHp')} />
        </Field>
        <Field label={t('users.form.tempatLahir')} htmlFor="tempatLahir" error={errors.tempatLahir?.message}>
          <Input id="tempatLahir" {...register('tempatLahir')} />
        </Field>
        <Field label={t('users.form.tanggalLahir')} htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
          <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
        </Field>
        <Field label={t('users.form.gender')} htmlFor="gender" error={errors.gender?.message}>
          <select
            id="gender"
            {...register('gender')}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <option value="">—</option>
            <option value="male">{t('users.form.genderMale')}</option>
            <option value="female">{t('users.form.genderFemale')}</option>
          </select>
        </Field>
        <Field label={t('users.form.pendidikan')} htmlFor="pendidikan" error={errors.pendidikan?.message}>
          <Input id="pendidikan" {...register('pendidikan')} />
        </Field>
      </div>
      {/* Daerah → Desa → Kelompok, cascading from the master Wilayah. */}
      <WilayahPicker
        value={{ daerah: watch('daerah') ?? '', desa: watch('desa') ?? '', kelompok: watch('kelompok') ?? '' }}
        onChange={(v) => {
          setValue('daerah', v.daerah)
          setValue('desa', v.desa)
          setValue('kelompok', v.kelompok)
        }}
      />
      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}

// --- Edit dialog ----------------------------------------------------------

type EditValues = {
  email: string
  username: string
  password: string
  name: string
  role: UserRole
  active: boolean
  nickname: string
  tempatLahir: string
  dateOfBirth: string
  gender: '' | 'male' | 'female'
  noHp: string
  daerah: string
  desa: string
  kelompok: string
}

function userToEditValues(u: ManagedUser): EditValues {
  return {
    email: u.email,
    username: u.username ?? '',
    password: '',
    name: u.name,
    role: u.role,
    active: u.active,
    nickname: u.nickname ?? '',
    tempatLahir: u.tempatLahir ?? '',
    dateOfBirth: u.dateOfBirth?.slice(0, 10) ?? '',
    gender: u.gender ?? '',
    noHp: u.noHp ?? '',
    daerah: u.daerah ?? '',
    desa: u.desa ?? '',
    kelompok: u.kelompok ?? '',
  }
}

function UserEditDialog({
  id,
  pending,
  error,
  onSubmit,
  onClose,
  onPhotoChanged,
}: {
  id: string
  pending: boolean
  error: unknown
  onSubmit: (input: UserUpdateInput) => void
  onClose: () => void
  onPhotoChanged: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: () => getUser(id),
  })

  return (
    <Dialog title={data ? t('users.editWithName', { name: data.name }) : t('users.edit')} onClose={onClose} size="lg">
      {isPending ? (
        <div className="py-6 text-center text-slate-500">{t('common.loading')}</div>
      ) : data ? (
        <div className="space-y-4">
          <PhotoUploader
            userId={data.id}
            photoUrl={data.photoUrl ?? null}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ['users', 'detail', id] })
              onPhotoChanged()
            }}
          />
          <UserEditForm
            initial={data}
            pending={pending}
            error={error}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        </div>
      ) : (
        <div className="py-6 text-center text-red-600">{t('common.dataNotFound')}</div>
      )}
    </Dialog>
  )
}

function UserEditForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: ManagedUser
  pending: boolean
  error: unknown
  onSubmit: (input: UserUpdateInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const roleLabel = useRoleLabel()
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const toast = useToast()
  // Password lives in this form now: empty = unchanged; non-empty = set via the
  // dedicated endpoint on save (the profile PATCH never carries a password).
  const pwMut = useMutation({
    mutationFn: (p: string) => setUserPassword(initial.id, p),
    onError: (e) => toast(e instanceof ApiError ? e.message : t('common.saveFailed'), 'error'),
  })
  const [f, setF] = useState<EditValues>(() => userToEditValues(initial))
  useEffect(() => {
    setF(userToEditValues(initial))
  }, [initial])
  const update = <K extends keyof EditValues>(k: K, v: EditValues[K]) =>
    setF((p) => ({ ...p, [k]: v }))
  const apiError = error instanceof ApiError ? error.message : null

  const selectCls =
    'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        // Password is optional here: only push it when filled (empty = keep).
        const pw = f.password.trim()
        if (pw) pwMut.mutate(pw)
        // Role only included for admins — the backend rejects role changes
        // from non-admins anyway, so skip it to keep the PATCH minimal.
        onSubmit({
          email: f.email.trim(),
          username: f.username.trim(),
          name: f.name.trim(),
          ...(isAdmin ? { role: f.role } : {}),
          active: f.active,
          nickname: f.nickname.trim(),
          tempatLahir: f.tempatLahir.trim(),
          dateOfBirth: f.dateOfBirth, // '' clears
          gender: f.gender || undefined,
          noHp: f.noHp.trim(),
          daerah: f.daerah.trim(),
          desa: f.desa.trim(),
          kelompok: f.kelompok.trim(),
        })
      }}
    >
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">{t('users.userDetail.cardAkun')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('users.userDetail.akun.email')} htmlFor="e_email">
            <Input id="e_email" type="email" value={f.email} onChange={(e) => update('email', e.target.value)} required />
          </Field>
          <Field label={t('users.userDetail.akun.whatsapp')} htmlFor="e_wa">
            <Input id="e_wa" value={f.noHp} onChange={(e) => update('noHp', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.akun.username')} htmlFor="e_username" hint={t('users.userDetail.akun.usernameHint')}>
            <Input id="e_username" value={f.username} onChange={(e) => update('username', e.target.value)} />
          </Field>
          <Field label={t('users.form.password')} htmlFor="e_pw">
            <Input id="e_pw" type="text" value={f.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" placeholder={t('users.userDetail.akun.passwordPh')} />
          </Field>
          {isAdmin ? (
            <Field label={t('users.userDetail.akun.role')} htmlFor="e_role">
              <select id="e_role" className={selectCls} value={f.role} onChange={(e) => update('role', e.target.value as UserRole)}>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label={t('users.userDetail.akun.role')} htmlFor="e_role">
              <div className="flex h-10 items-center text-sm text-slate-700">{roleLabel(f.role)}</div>
            </Field>
          )}
          <Field label={t('users.userDetail.akun.statusAkun')} htmlFor="e_active">
            <label className="inline-flex h-10 items-center gap-2">
              <input id="e_active" type="checkbox" checked={f.active} onChange={(e) => update('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm">{t('users.userDetail.akun.activeToggle')}</span>
            </label>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">{t('users.userDetail.cardProfil')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('users.userDetail.profil.fullName')} htmlFor="e_name">
            <Input id="e_name" value={f.name} onChange={(e) => update('name', e.target.value)} required />
          </Field>
          <Field label={t('users.userDetail.profil.nickname')} htmlFor="e_nickname">
            <Input id="e_nickname" value={f.nickname} onChange={(e) => update('nickname', e.target.value)} />
          </Field>
          <Field label={t('profileDialog.birthPlace')} htmlFor="e_ttl">
            <Input id="e_ttl" value={f.tempatLahir} onChange={(e) => update('tempatLahir', e.target.value)} placeholder={t('profileDialog.birthPlacePh')} />
          </Field>
          <Field label={t('users.userDetail.profil.birthDate')} htmlFor="e_dob" hint={t('users.userDetail.profil.birthDateHint')}>
            <Input id="e_dob" type="date" value={f.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} />
          </Field>
          <Field label={t('users.userDetail.profil.gender')} htmlFor="e_gender">
            <select id="e_gender" className={selectCls} value={f.gender} onChange={(e) => update('gender', e.target.value as EditValues['gender'])}>
              <option value="">—</option>
              <option value="female">{t('users.userDetail.profil.genderFemale')}</option>
              <option value="male">{t('users.userDetail.profil.genderMale')}</option>
            </select>
          </Field>
        </div>
        {/* Daerah → Desa → Kelompok, cascading from the master Wilayah. */}
        <WilayahPicker
          value={{ daerah: f.daerah, desa: f.desa, kelompok: f.kelompok }}
          onChange={(v) => setF((p) => ({ ...p, ...v }))}
        />
      </section>

      {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  )
}

// --- Helpers --------------------------------------------------------------

function apiMsg(e: unknown, fallback: string) {
  if (e instanceof ApiError) return e.message || fallback
  return fallback
}

function Avatar({ url }: { url?: string | null }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon size={16} className="text-slate-300" />
      )}
    </div>
  )
}

function RolePill({ role }: { role: UserRole }) {
  const roleLabel = useRoleLabel()
  const colors: Record<string, string> = {
    admin: 'bg-rose-100 text-rose-800',
    pengurus: 'bg-amber-100 text-amber-800',
    guru: 'bg-sky-100 text-sky-800',
    ortu: 'bg-violet-100 text-violet-800',
    murid: 'bg-emerald-100 text-emerald-800',
    staff: 'bg-slate-200 text-slate-700', // legacy
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        colors[role] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {roleLabel(role)}
    </span>
  )
}

function ActivePill({ active }: { active: boolean }) {
  const { t } = useTranslation()
  if (active) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        {t('users.statusActive')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
      {t('users.statusInactive')}
    </span>
  )
}

// Re-export the hook for sibling user pages.
export { useRoleLabel }

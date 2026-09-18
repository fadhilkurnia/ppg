import { useState, useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  CheckCircle2,
  Edit2,
  Key,
  Lock,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'

import {
  listUsers,
  createUser,
  updateUser,
  setUserPassword,
  archiveUser,
} from '@/api/users'
import {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  type RoleRecord,
} from '@/api/roles'
import type { User } from '@/api/types'
import { useMe } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Field } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Modals state
  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)

  const [addRoleOpen, setAddRoleOpen] = useState(false)
  const [editRole, setEditRole] = useState<RoleRecord | null>(null)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleRecord | null>(null)

  const isAdmin = me?.role === 'admin'

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['users', search, roleFilter, statusFilter],
    queryFn: () =>
      listUsers({
        q: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      }),
    enabled: isAdmin,
  })

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
    enabled: isAdmin,
  })

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Shield className="h-12 w-12 text-red-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Akses Terbatas</h2>
        <p className="mt-1 text-sm text-slate-500">
          Menu pengaturan akun dan role hanya dapat diakses oleh Administrator.
        </p>
      </div>
    )
  }

  const users = usersData?.items ?? []
  const roles = rolesData?.items ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {t('settings.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('settings.subtitle')}
          </p>
        </div>
        {activeTab === 'users' && (
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus size={16} />
            {t('settings.addUser')}
          </Button>
        )}
        {activeTab === 'roles' && (
          <Button onClick={() => setAddRoleOpen(true)} className="gap-2">
            <Plus size={16} />
            {t('settings.addRole')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'users'
              ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <Users size={16} />
          {t('settings.tabUsers')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'roles'
              ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          <Shield size={16} />
          {t('settings.tabRoles')}
        </button>
      </div>

      {activeTab === 'users' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                placeholder={t('settings.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="">{t('settings.filterRole')}</option>
              <option value="admin">Admin</option>
              <option value="guru">Guru</option>
              <option value="murid">Murid</option>
              <option value="staff">Staff</option>
              <option value="teacher">Teacher (legacy)</option>
              <option value="student">Student (legacy)</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="">{t('settings.filterStatus')}</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {usersLoading ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {t('common.loading')}
              </div>
            ) : usersError ? (
              <div className="p-8 text-center text-sm text-red-500">
                {t('common.loadError')}
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {t('settings.noUsers')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-3.5">{t('settings.thName')}</th>
                      <th className="px-6 py-3.5">{t('settings.thEmail')}</th>
                      <th className="px-6 py-3.5">{t('settings.thPhone')}</th>
                      <th className="px-6 py-3.5">{t('settings.thRole')}</th>
                      <th className="px-6 py-3.5">{t('settings.thStatus')}</th>
                      <th className="px-6 py-3.5 text-right">{t('settings.thActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} className="h-9 w-9 text-xs" />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {u.name}
                              </div>
                              {u.username && (
                                <div className="text-xs text-slate-400">@{u.username}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                          {u.email}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {u.phone || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                              u.role === 'admin'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                                : u.role === 'guru' || u.role === 'teacher'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : u.role === 'murid' || u.role === 'student'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                            )}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              u.status === 'archived'
                                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                : 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400',
                            )}
                          >
                            {u.status || 'active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title={t('common.edit')}
                              onClick={() => setEditUser(u)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              title={t('settings.changePassword')}
                              onClick={() => setPasswordUser(u)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                              <Key size={16} />
                            </button>
                            {u.status !== 'archived' && (
                              <button
                                type="button"
                                title={t('settings.archiveUser')}
                                onClick={async () => {
                                  if (confirm(t('settings.archiveConfirm'))) {
                                    await archiveUser(u.id)
                                    queryClient.invalidateQueries({ queryKey: ['users'] })
                                  }
                                }}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              >
                                <Archive size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Roles Catalog Tab */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rolesLoading ? (
            <div className="col-span-full p-8 text-center text-sm text-slate-500">
              {t('common.loading')}
            </div>
          ) : roles.length === 0 ? (
            <div className="col-span-full p-8 text-center text-sm text-slate-500">
              {t('common.noDataLong')}
            </div>
          ) : (
            roles.map((r) => {
              const isSystemRole = ['admin', 'guru', 'murid', 'staff', 'coordinator', 'teacher', 'student', 'parent'].includes(r.id)
              return (
                <div
                  key={r.id}
                  className="relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {r.label}
                          </h3>
                          {isSystemRole && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                              {t('settings.systemRoleBadge')}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <code className="text-xs text-slate-400">id: {r.id}</code>
                          <span className="text-xs text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-xs text-slate-400">order: #{r.sortOrder}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditRole(r)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
                          title={t('settings.editRole')}
                        >
                          <Edit2 size={15} />
                        </button>
                        {isSystemRole ? (
                          <span
                            className="p-1.5 text-slate-300 dark:text-slate-700 cursor-not-allowed"
                            title={t('settings.cannotDeleteSystemRole')}
                          >
                            <Lock size={15} />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteRoleTarget(r)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                            title={t('settings.deleteRole')}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          r.canLogin
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {r.canLogin ? <CheckCircle2 size={12} /> : null}
                        {r.canLogin ? t('settings.roleCanLogin') : 'No Login'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {t('settings.roleManageable')}:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {r.manageableRoleIds && r.manageableRoleIds.length > 0 ? (
                        r.manageableRoleIds.map((mr) => (
                          <span
                            key={mr}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {mr}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">None</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Add User Modal */}
      <AddUserModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setAddOpen(false)
          queryClient.invalidateQueries({ queryKey: ['users'] })
        }}
        roles={roles}
      />

      {/* Edit User Modal */}
      <EditUserModal
        user={editUser}
        open={!!editUser}
        onClose={() => setEditUser(null)}
        onSuccess={() => {
          setEditUser(null)
          queryClient.invalidateQueries({ queryKey: ['users'] })
        }}
        roles={roles}
      />

      {/* Change Password Modal */}
      <AdminPasswordModal
        user={passwordUser}
        open={!!passwordUser}
        onClose={() => setPasswordUser(null)}
        onSuccess={() => {
          setPasswordUser(null)
        }}
      />

      {/* Add Role Modal */}
      <AddRoleModal
        open={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        onSuccess={() => {
          setAddRoleOpen(false)
          queryClient.invalidateQueries({ queryKey: ['roles'] })
        }}
        existingRoles={roles}
      />

      {/* Edit Role Modal */}
      <EditRoleModal
        role={editRole}
        open={!!editRole}
        onClose={() => setEditRole(null)}
        onSuccess={() => {
          setEditRole(null)
          queryClient.invalidateQueries({ queryKey: ['roles'] })
        }}
        existingRoles={roles}
      />

      {/* Delete Role Modal */}
      <DeleteRoleModal
        role={deleteRoleTarget}
        open={!!deleteRoleTarget}
        onClose={() => setDeleteRoleTarget(null)}
        onSuccess={() => {
          setDeleteRoleTarget(null)
          queryClient.invalidateQueries({ queryKey: ['roles'] })
        }}
      />
    </div>
  )
}

function AddUserModal({
  open,
  onClose,
  onSuccess,
  roles,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  roles: RoleRecord[]
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('guru')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await createUser({
        name: name.trim(),
        nickname: nickname.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        roleId,
      })
      setName('')
      setNickname('')
      setUsername('')
      setEmail('')
      setPhone('')
      setPassword('')
      setRoleId('guru')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('settings.addUser')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label={t('profile.name')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ahmad Fulan"
          />
        </Field>
        <Field label={t('profile.nickname')}>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Ahmad"
          />
        </Field>
        <Field label={t('profile.username')}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ahmadfulan"
          />
        </Field>
        <Field label={t('profile.email')}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="ahmad@example.com"
          />
        </Field>
        <Field label={t('profile.phone')}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08123456789"
          />
        </Field>
        <Field label="Kata Sandi">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Minimal 6 karakter"
          />
        </Field>
        <Field label={t('profile.role')}>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {roles && roles.length > 0 ? (
              roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} ({r.id})
                </option>
              ))
            ) : (
              <>
                <option value="admin">Administrator (admin)</option>
                <option value="guru">Guru / Pengajar (guru)</option>
                <option value="murid">Generus / Murid (murid)</option>
                <option value="staff">Staf (staff)</option>
              </>
            )}
          </select>
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({
  user,
  open,
  onClose,
  onSuccess,
  roles,
}: {
  user: User | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
  roles: RoleRecord[]
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('guru')
  const [status, setStatus] = useState('active')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset values when user or open changes
  useEffect(() => {
    if (user && open) {
      setName(user.name || '')
      setNickname(user.nickname || '')
      setUsername(user.username || '')
      setEmail(user.email || '')
      setPhone(user.phone || '')
      setRole(user.role || 'guru')
      setStatus(user.status || 'active')
      setError(null)
    }
  }, [user, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setError(null)
    setLoading(true)
    try {
      await updateUser(user.id, {
        name: name.trim(),
        nickname: nickname.trim() || undefined,
        username: username.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
        status,
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open && !!user} onClose={onClose} title={t('settings.editUser')} size="md">
      {user && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}
          <Field label={t('profile.name')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label={t('profile.nickname')}>
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ahmad"
            />
          </Field>
          <Field label={t('profile.username')}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t('profile.email')}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('profile.phone')}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08123456789"
            />
          </Field>
          <Field label={t('profile.role')}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {roles && roles.length > 0 ? (
                roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.id})
                  </option>
                ))
              ) : (
                <>
                  <option value="admin">Administrator (admin)</option>
                  <option value="guru">Guru / Pengajar (guru)</option>
                  <option value="murid">Generus / Murid (murid)</option>
                  <option value="staff">Staf (staff)</option>
                  <option value="teacher">Teacher (legacy)</option>
                  <option value="student">Student (legacy)</option>
                </>
              )}
            </select>
          </Field>
        <Field label={t('settings.thStatus')}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
      )}
    </Modal>
  )
}

function AdminPasswordModal({
  user,
  open,
  onClose,
  onSuccess,
}: {
  user: User | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    if (!newPassword || newPassword.length < 6) {
      setError('Kata sandi minimal 6 karakter')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok')
      return
    }

    setError(null)
    setLoading(true)
    try {
      await setUserPassword(user.id, { newPassword })
      setNewPassword('')
      setConfirmPassword('')
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t('settings.changePassword')} - ${user.name}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}
        <Field label={t('profile.newPassword')}>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            placeholder="Minimal 6 karakter"
          />
        </Field>
        <Field label={t('profile.confirmPassword')}>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Ulangi kata sandi baru"
          />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AddRoleModal({
  open,
  onClose,
  onSuccess,
  existingRoles,
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  existingRoles: RoleRecord[]
}) {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [label, setLabel] = useState('')
  const [canLogin, setCanLogin] = useState(true)
  const [sortOrder, setSortOrder] = useState<number>(50)
  const [manageableRoleIds, setManageableRoleIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toggleManageable = (roleId: string) => {
    setManageableRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await createRole({
        id: id.trim().toLowerCase(),
        label: label.trim(),
        canLogin,
        sortOrder: Number(sortOrder) || 50,
        manageableRoleIds,
      })
      setId('')
      setLabel('')
      setCanLogin(true)
      setSortOrder(50)
      setManageableRoleIds([])
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('settings.addRole')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label={t('settings.roleId')}>
          <Input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            required
            placeholder="contoh: bendahara, keamanan, humas"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {t('settings.roleIdHelp')}
          </p>
        </Field>

        <Field label={t('settings.roleLabel')}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            placeholder="contoh: Bendahara Keuangan"
          />
        </Field>

        <Field label={t('settings.roleSortOrder')}>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            placeholder="50"
          />
        </Field>

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={canLogin}
              onChange={(e) => setCanLogin(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="text-xs">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {t('settings.roleCanLogin')}
              </span>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                {t('settings.roleCanLoginDesc')}
              </p>
            </div>
          </label>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
            {t('settings.roleManageable')}
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
            {t('settings.roleManageableDesc')}
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            {existingRoles.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs select-none"
              >
                <input
                  type="checkbox"
                  checked={manageableRoleIds.includes(r.id)}
                  onChange={() => toggleManageable(r.id)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                  {r.label}
                </span>
                <code className="text-[10px] text-slate-400 shrink-0">({r.id})</code>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditRoleModal({
  role,
  open,
  onClose,
  onSuccess,
  existingRoles,
}: {
  role: RoleRecord | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
  existingRoles: RoleRecord[]
}) {
  const { t } = useTranslation()
  const isSystemRole = role ? ['admin', 'guru', 'murid', 'staff', 'coordinator', 'teacher', 'student', 'parent'].includes(role.id) : false
  const [roleId, setRoleId] = useState('')
  const [label, setLabel] = useState('')
  const [canLogin, setCanLogin] = useState(true)
  const [sortOrder, setSortOrder] = useState<number>(50)
  const [manageableRoleIds, setManageableRoleIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (role && open) {
      setRoleId(role.id)
      setLabel(role.label)
      setCanLogin(role.canLogin)
      setSortOrder(role.sortOrder)
      setManageableRoleIds(role.manageableRoleIds ?? [])
      setError(null)
    }
  }, [role, open])

  const isAdminRole = role?.id === 'admin'

  const toggleManageable = (targetId: string) => {
    setManageableRoleIds((prev) =>
      (prev || []).includes(targetId) ? prev.filter((r) => r !== targetId) : [...(prev || []), targetId],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    setError(null)
    setLoading(true)
    try {
      const cleanNewId = !isSystemRole && roleId.trim() !== role.id ? roleId.trim().toLowerCase() : undefined
      await updateRole(role.id, {
        newId: cleanNewId,
        label: label.trim(),
        canLogin: isAdminRole ? true : canLogin,
        sortOrder: Number(sortOrder) || 0,
        manageableRoleIds,
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open && !!role} onClose={onClose} title={t('settings.editRole')} size="md">
      {role && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <Field label={t('settings.roleId')}>
            <Input
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={isSystemRole}
              className={cn(
                'font-mono text-xs',
                isSystemRole && 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed',
              )}
            />
            {isSystemRole ? (
              <p className="text-[11px] text-slate-400 mt-1">ID role sistem bawaan tidak dapat diubah.</p>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">{t('settings.roleIdHelp')}</p>
            )}
          </Field>

          <Field label={t('settings.roleLabel')}>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              placeholder="contoh: Bendahara"
            />
          </Field>

          <Field label={t('settings.roleSortOrder')}>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="50"
            />
          </Field>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <label className={cn('flex items-start gap-2.5 select-none', isAdminRole ? 'cursor-not-allowed opacity-75' : 'cursor-pointer')}>
              <input
                type="checkbox"
                checked={isAdminRole ? true : canLogin}
                disabled={isAdminRole}
                onChange={(e) => setCanLogin(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900 disabled:opacity-50"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('settings.roleCanLogin')}
                </span>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                  {isAdminRole ? 'Role admin harus selalu diizinkan login.' : t('settings.roleCanLoginDesc')}
                </p>
              </div>
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              {t('settings.roleManageable')}
            </label>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
              {t('settings.roleManageableDesc')}
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              {existingRoles.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs select-none"
                >
                  <input
                    type="checkbox"
                    checked={(manageableRoleIds || []).includes(r.id)}
                    onChange={() => toggleManageable(r.id)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                    {r.label}
                  </span>
                  <code className="text-[10px] text-slate-400 shrink-0">({r.id})</code>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function DeleteRoleModal({
  role,
  open,
  onClose,
  onSuccess,
}: {
  role: RoleRecord | null
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!role) return null

  const handleDelete = async () => {
    setError(null)
    setLoading(true)
    try {
      await deleteRole(role.id)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('settings.deleteRole')} size="md">
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <p className="text-sm text-slate-700 dark:text-slate-300">
          {t('settings.deleteRoleConfirm', { label: role.label })}
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs text-slate-500">
          <p>
            <strong>ID:</strong> <code className="font-mono text-slate-700 dark:text-slate-300">{role.id}</code>
          </p>
          <p className="mt-1">
            <strong>Label:</strong> {role.label}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? t('common.loading') : t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

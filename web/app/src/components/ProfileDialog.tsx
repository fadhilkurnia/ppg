import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { setMyPassword, updateMe, type UpdateMeInput } from '@/api/auth'
import { ApiError } from '@/api/client'
import { ME_QUERY_KEY, useAuth, type User } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { DEFAULT_TIMEZONE, timezoneGroups, timezoneLabel } from '@/lib/timezones'
import { SUPPORTED_LANGS, type Lang } from '@/lib/i18n'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { PhotoUploader } from '@/components/PhotoUploader'
import { WilayahPicker } from '@/components/WilayahPicker'

/**
 * ProfileDialog — opened by clicking the username chip above the Logout
 * button. Lets the current user edit their own photo, name, nickname,
 * timezone, phone, and address. Photo uses /api/auth/me/photo (self-service).
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState({
    name: user?.name ?? '',
    nickname: user?.nickname ?? '',
    timezone: user?.timezone ?? DEFAULT_TIMEZONE,
    noHp: user?.noHp ?? '',
    daerah: user?.daerah ?? '',
    desa: user?.desa ?? '',
    kelompok: user?.kelompok ?? '',
    // Taaruf-style biodata fields editable by the user themselves.
    tempatLahir: user?.tempatLahir ?? '',
    dateOfBirth: (user?.dateOfBirth ?? '').slice(0, 10),
    hideDob: user?.hideDob ?? false,
    gender: (user?.gender as 'male' | 'female' | '') ?? '',
    pendidikan: user?.pendidikan ?? '',
    // Password — empty means "don't change".
    password: '',
  })

  const saveMut = useMutation({
    mutationFn: async (input: UpdateMeInput) => {
      const u = await updateMe(input)
      const pwd = form.password.trim()
      if (pwd) await setMyPassword(pwd)
      return u
    },
    onSuccess: async (u) => {
      qc.setQueryData(ME_QUERY_KEY, u)
      await refresh()
      toast(t('profileDialog.saved'), 'success')
      onClose()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('profileDialog.saveFailed'), 'error'),
  })

  const handlePhotoChanged = async () => {
    // After photo upload/delete the /me cache is stale — refetch.
    await refresh()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMut.mutate({
      name: form.name.trim() || undefined,
      nickname: form.nickname.trim() || '',
      timezone: form.timezone || '',
      noHp: form.noHp.trim() || '',
      daerah: form.daerah.trim() || '',
      desa: form.desa.trim() || '',
      kelompok: form.kelompok.trim() || '',
      tempatLahir: form.tempatLahir.trim() || '',
      dateOfBirth: form.dateOfBirth ? form.dateOfBirth : '',
      hideDob: form.hideDob,
      gender: form.gender === '' ? null : form.gender,
      pendidikan: form.pendidikan.trim() || '',
    })
  }

  // Language switcher — persists via i18next-browser-languagedetector
  // (localStorage). Falls back to the first supported lang if a
  // browser-detected variant (e.g. "en-US") slipped through.
  const currentLang: Lang = (SUPPORTED_LANGS as readonly string[]).includes(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as Lang)
    : 'id'

  return (
    <Dialog title={t('profileDialog.title')} onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        {user ? (
          <PhotoUploader
            self
            photoUrl={(user as User).photoUrl ?? null}
            onChanged={handlePhotoChanged}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profileDialog.fullName')} htmlFor="profile-name">
            <Input
              id="profile-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="name"
              required
            />
          </Field>
          <Field label={t('profileDialog.nickname')} htmlFor="profile-nickname">
            <Input
              id="profile-nickname"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            />
          </Field>
        </div>

        {/* Timezone + language on one line. Language applies immediately and
            persists in localStorage via the language detector. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('profileDialog.timezone')}
            htmlFor="profile-tz"
            hint={`${t('profileDialog.currentDisplay')} ${timezoneLabel(form.timezone)}`}
          >
            <select
              id="profile-tz"
              value={form.timezone || ''}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {timezoneGroups().map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                      {tz.hint ? ` · ${tz.hint}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={t('common.language')} htmlFor="profile-lang">
            <select
              id="profile-lang"
              value={currentLang}
              onChange={(e) => {
                const next = e.target.value as Lang
                void i18n.changeLanguage(next)
              }}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="id">{t('common.indonesian')}</option>
              <option value="en">{t('common.english')}</option>
            </select>
          </Field>
        </div>

        <Field label={t('profileDialog.phone')} htmlFor="profile-nohp">
          <Input
            id="profile-nohp"
            value={form.noHp}
            onChange={(e) => setForm({ ...form, noHp: e.target.value })}
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>

        {/* Daerah → Desa → Kelompok, cascading from the master Wilayah. */}
        <WilayahPicker
          value={{ daerah: form.daerah, desa: form.desa, kelompok: form.kelompok }}
          onChange={(v) => setForm({ ...form, ...v })}
        />

        {/* Taaruf-style biodata: tempat & tanggal lahir, jenis kelamin,
            pendidikan, pekerjaan. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profileDialog.birthPlace')} htmlFor="profile-ttl">
            <Input
              id="profile-ttl"
              value={form.tempatLahir}
              onChange={(e) => setForm({ ...form, tempatLahir: e.target.value })}
              placeholder={t('profileDialog.birthPlacePh')}
            />
          </Field>
          <Field label={t('profileDialog.birthDate')} htmlFor="profile-dob">
            <Input
              id="profile-dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
            <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={form.hideDob}
                onChange={(e) => setForm({ ...form, hideDob: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              {t('common.hideDob')}
            </label>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profileDialog.gender')} htmlFor="profile-jk">
            <select
              id="profile-jk"
              value={form.gender}
              onChange={(e) =>
                setForm({ ...form, gender: e.target.value as 'male' | 'female' | '' })
              }
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              <option value="">—</option>
              <option value="male">{t('profileDialog.male')}</option>
              <option value="female">{t('profileDialog.female')}</option>
            </select>
          </Field>
          <Field label={t('profileDialog.education')} htmlFor="profile-pendidikan">
            <Input
              id="profile-pendidikan"
              value={form.pendidikan}
              onChange={(e) => setForm({ ...form, pendidikan: e.target.value })}
              placeholder={t('profileDialog.educationPh')}
            />
          </Field>
        </div>
        {/* Akun: username (read-only) + password (kosongkan = skip). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('profileDialog.usernameLocked')} htmlFor="profile-username">
            <Input
              id="profile-username"
              value={user?.username ?? ''}
              readOnly
              disabled
              className="bg-slate-100 text-slate-500"
            />
          </Field>
          <Field
            label={t('profileDialog.newPassword')}
            htmlFor="profile-password"
            hint={t('profileDialog.newPasswordHint')}
          >
            <Input
              id="profile-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
        </div>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div>
            {t('profileDialog.emailLabel')} <span className="font-medium text-slate-800">{user?.email}</span>
          </div>
          <div>
            {t('profileDialog.roleLabel')} <span className="font-medium text-slate-800">{user?.role}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saveMut.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saveMut.isPending}>
            {saveMut.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

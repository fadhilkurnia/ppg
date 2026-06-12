import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2, UserPlus } from 'lucide-react'

import {
  addAnggota,
  addGuruAnggota,
  listAnggota,
  listGuruAnggota,
  removeAnggota,
  removeGuruAnggota,
} from '@/api/kelas'
import { listStudents } from '@/api/students'
import { listUsers } from '@/api/users'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { cn } from '@/lib/cn'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

type Tab = 'murid' | 'guru'

/**
 * KelasAnggotaDialog — manage the murid roster and the guru lineup of a
 * kelas. Two tabs: Murid (generus) and Guru. Each tab lists current members
 * with remove, plus a picker to add new ones.
 */
export function KelasAnggotaDialog({
  kelasId,
  kelasNama,
  tingkat,
  onClose,
}: {
  kelasId: string
  kelasNama: string
  tingkat: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('murid')

  return (
    <Dialog title={t('sesiDialog.kelasAnggota.title', { name: kelasNama })} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setTab('murid')}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-sm font-medium transition',
              tab === 'murid'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t('sesiDialog.kelasAnggota.tabMurid')}
          </button>
          <button
            type="button"
            onClick={() => setTab('guru')}
            className={cn(
              'flex-1 rounded px-3 py-1.5 text-sm font-medium transition',
              tab === 'guru'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t('sesiDialog.kelasAnggota.tabGuru')}
          </button>
        </div>

        {tab === 'murid' ? (
          <MuridSection kelasId={kelasId} tingkat={tingkat} />
        ) : (
          <GuruSection kelasId={kelasId} />
        )}

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// -----------------------------------------------------------------------

function MuridSection({ kelasId, tingkat }: { kelasId: string; tingkat: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const { data: anggota = [], isPending } = useQuery({
    queryKey: ['kelas-anggota', kelasId],
    queryFn: () => listAnggota(kelasId),
  })

  const { data: studentsRes } = useQuery({
    queryKey: ['students-pick', { q: search }],
    queryFn: () => listStudents({ q: search, status: 'active', limit: 200, offset: 0 }),
  })

  const anggotaIds = useMemo(() => new Set(anggota.map((a) => a.muridUserId)), [anggota])

  const availableStudents = useMemo(() => {
    const items = studentsRes?.items ?? []
    return items.filter((s) => !anggotaIds.has(s.id))
  }, [studentsRes, anggotaIds])

  const addMut = useMutation({
    mutationFn: (ids: string[]) => addAnggota(kelasId, ids),
    onSuccess: () => {
      toast(t('sesiDialog.kelasAnggota.muridAdded'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas-anggota', kelasId] })
      setPicked(new Set())
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sesiDialog.kelasAnggota.muridAddFailed'), 'error'),
  })

  const removeMut = useMutation({
    mutationFn: (muridId: string) => removeAnggota(kelasId, muridId),
    onSuccess: () => {
      toast(t('sesiDialog.kelasAnggota.muridRemoved'), 'success')
      qc.invalidateQueries({ queryKey: ['kelas-anggota', kelasId] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sesiDialog.kelasAnggota.muridRemoveFailed'), 'error'),
  })

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('sesiDialog.kelasAnggota.muridCurrent', { count: anggota.length })}
        </h4>
        {isPending ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : anggota.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('sesiDialog.kelasAnggota.muridEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {anggota.map((a) => (
              <li
                key={a.muridUserId}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="truncate text-sm">{a.muridName}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm({ message: t('sesiDialog.kelasAnggota.muridConfirmRemove', { name: a.muridName }), danger: true })) {
                      removeMut.mutate(a.muridUserId)
                    }
                  }}
                  disabled={removeMut.isPending}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('sesiDialog.kelasAnggota.muridRemoveAria')}
                  title={t('sesiDialog.kelasAnggota.muridRemoveTitle')}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('sesiDialog.kelasAnggota.muridAddSection')}
        </h4>
        <Input
          placeholder={t('sesiDialog.kelasAnggota.muridSearchPh', { tingkat })}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
          {availableStudents.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">
              {search
                ? t('sesiDialog.kelasAnggota.muridNoMatch')
                : t('sesiDialog.kelasAnggota.muridAllJoined')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {availableStudents.map((s) => (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={picked.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {s.nickname ? `${s.nickname} · ` : ''}
                        {s.level ?? '—'}
                        {s.kelompok ? ` · ${s.kelompok}` : ''}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{t('sesiDialog.kelasAnggota.pickedCount', { count: picked.size })}</span>
        <Button
          onClick={() => addMut.mutate(Array.from(picked))}
          disabled={addMut.isPending || picked.size === 0}
        >
          <UserPlus size={16} className="mr-1" />
          {addMut.isPending
            ? t('sesiDialog.kelasAnggota.adding')
            : picked.size > 0
              ? t('sesiDialog.kelasAnggota.addBtnN', { count: picked.size })
              : t('sesiDialog.kelasAnggota.addBtn')}
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------

function GuruSection({ kelasId }: { kelasId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const { data: gurus = [], isPending } = useQuery({
    queryKey: ['kelas-guru-anggota', kelasId],
    queryFn: () => listGuruAnggota(kelasId),
  })

  const { data: usersRes } = useQuery({
    queryKey: ['users', 'role-guru', 'pick'],
    queryFn: () => listUsers({ role: 'guru', active: true, limit: 200 }),
    staleTime: 60_000,
  })

  const guruIds = useMemo(() => new Set(gurus.map((g) => g.guruUserId)), [gurus])

  const availableGurus = useMemo(() => {
    const items = usersRes?.items ?? []
    const q = search.trim().toLowerCase()
    return items
      .filter((u) => !guruIds.has(u.id))
      .filter((u) => (q ? u.name.toLowerCase().includes(q) : true))
  }, [usersRes, guruIds, search])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kelas-guru-anggota', kelasId] })
    qc.invalidateQueries({ queryKey: ['kelas'] })
  }

  const addMut = useMutation({
    mutationFn: (ids: string[]) => addGuruAnggota(kelasId, ids),
    onSuccess: () => {
      toast(t('sesiDialog.kelasAnggota.guruAdded'), 'success')
      invalidate()
      setPicked(new Set())
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sesiDialog.kelasAnggota.guruAddFailed'), 'error'),
  })

  const removeMut = useMutation({
    mutationFn: (guruId: string) => removeGuruAnggota(kelasId, guruId),
    onSuccess: () => {
      toast(t('sesiDialog.kelasAnggota.guruRemoved'), 'success')
      invalidate()
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('sesiDialog.kelasAnggota.guruRemoveFailed'), 'error'),
  })

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('sesiDialog.kelasAnggota.guruCurrent', { count: gurus.length })}
        </h4>
        {isPending ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : gurus.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            {t('sesiDialog.kelasAnggota.guruEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {gurus.map((g) => (
              <li
                key={g.guruUserId}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm">{g.guruName}</span>
                  {g.isPrimary ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      {t('sesiDialog.kelasAnggota.guruWaliBadge')}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const msg = g.isPrimary
                      ? t('sesiDialog.kelasAnggota.guruConfirmRemovePrimary', { name: g.guruName })
                      : t('sesiDialog.kelasAnggota.guruConfirmRemove', { name: g.guruName })
                    if (await confirm({ message: msg, danger: true })) removeMut.mutate(g.guruUserId)
                  }}
                  disabled={removeMut.isPending}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={t('sesiDialog.kelasAnggota.guruRemoveAria')}
                  title={t('sesiDialog.kelasAnggota.guruRemoveTitle')}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('sesiDialog.kelasAnggota.guruAddSection')}
        </h4>
        <Input
          placeholder={t('sesiDialog.kelasAnggota.guruSearchPh')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
          {availableGurus.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-500">
              {search
                ? t('sesiDialog.kelasAnggota.guruNoMatch')
                : t('sesiDialog.kelasAnggota.guruAllJoined')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {availableGurus.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={picked.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name}</div>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{t('sesiDialog.kelasAnggota.pickedCount', { count: picked.size })}</span>
        <Button
          onClick={() => addMut.mutate(Array.from(picked))}
          disabled={addMut.isPending || picked.size === 0}
        >
          <UserPlus size={16} className="mr-1" />
          {addMut.isPending
            ? t('sesiDialog.kelasAnggota.adding')
            : picked.size > 0
              ? t('sesiDialog.kelasAnggota.addBtnN', { count: picked.size })
              : t('sesiDialog.kelasAnggota.addBtn')}
        </Button>
      </div>
    </div>
  )
}

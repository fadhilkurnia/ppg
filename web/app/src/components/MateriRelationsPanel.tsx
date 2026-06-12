import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X } from 'lucide-react'

import {
  addMateriLibraryRef,
  addMateriRelation,
  deleteMateriLibraryRef,
  deleteMateriRelation,
  listMateriAjar,
  listMateriLibraryRefs,
  listMateriRelations,
  type MateriAjar,
  type MateriLibraryRef,
} from '@/api/kurikulum'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import {
  MateriSourcePicker,
  emptyMateriSourceValue,
  type MateriSourceValue,
} from '@/components/MateriSourcePicker'
import { useToast } from '@/lib/toast'

/**
 * MateriRelationsPanel — used inside MateriAjarForm in edit mode.
 * Renders two sections:
 *   1. Library Relation — chips of library items + "+ Tambah" button
 *      opens a non-kurikulum MateriSourcePicker; when one of these is
 *      completed elsewhere in the app, the materi pencapaian auto-flips
 *      to "tuntas".
 *   2. Kurikulum Relation — chips of related materi_ajar rows + "+ Tambah"
 *      button opens a picker dialog to find another materi by tingkat /
 *      detail. Used to mark "same content, different umur" pairs.
 */
export function MateriRelationsPanel({ materiId }: { materiId: string }) {
  return (
    <div className="space-y-4">
      <LibraryRefsCard materiId={materiId} />
      <RelationsCard materiId={materiId} />
    </div>
  )
}

// ----------------------------------------------------------- Library refs

function LibraryRefsCard({ materiId }: { materiId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: refs = [] } = useQuery({
    queryKey: ['materi-library-refs', materiId],
    queryFn: () => listMateriLibraryRefs(materiId),
  })

  const addMut = useMutation({
    mutationFn: (v: MateriSourceValue) =>
      addMateriLibraryRef(materiId, {
        libraryKind: v.libraryKind as 'quran' | 'hadits' | 'tilawati' | 'doa',
        libraryAspect: v.libraryAspect ?? null,
        libraryRef: v.libraryRef ?? '',
      }),
    onSuccess: () => {
      toast(t('materiComp.relations.libraryConnected'), 'success')
      qc.invalidateQueries({ queryKey: ['materi-library-refs', materiId] })
      setOpen(false)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('materiComp.relations.errGeneric'), 'error'),
  })

  const delMut = useMutation({
    mutationFn: (refId: string) => deleteMateriLibraryRef(materiId, refId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materi-library-refs', materiId] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('materiComp.relations.errGeneric'), 'error'),
  })

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t('materiComp.relations.libraryTitle')}</div>
          <p className="text-xs text-slate-500">
            {t('materiComp.relations.libraryDesc')}
          </p>
        </div>
        <Button size="sm" type="button" onClick={() => setOpen(true)}>
          <Plus size={14} className="mr-1" /> {t('materiComp.relations.addBtn')}
        </Button>
      </div>

      {refs.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {t('materiComp.relations.libraryEmpty')}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {refs.map((r) => (
            <LibraryRefChip
              key={r.id}
              r={r}
              onRemove={() => delMut.mutate(r.id)}
              busy={delMut.isPending}
            />
          ))}
        </ul>
      )}

      {open ? (
        <LibraryRefDialog
          onSave={(v) => addMut.mutate(v)}
          onClose={() => setOpen(false)}
          pending={addMut.isPending}
        />
      ) : null}
    </div>
  )
}

function LibraryRefChip({
  r,
  onRemove,
  busy,
}: {
  r: MateriLibraryRef
  onRemove: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase text-slate-500">
          {r.libraryKind}
          {r.libraryAspect ? ` · ${r.libraryAspect}` : ''}
        </div>
        <div className="break-words text-sm text-slate-800">{r.libraryRef}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        aria-label={t('materiComp.relations.removeRelationAria')}
      >
        <X size={12} />
      </button>
    </li>
  )
}

function LibraryRefDialog({
  onSave,
  onClose,
  pending,
}: {
  onSave: (v: MateriSourceValue) => void
  onClose: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState<MateriSourceValue>(() => {
    const v = emptyMateriSourceValue()
    v.libraryKind = 'quran'
    v.libraryAspect = 'reciting'
    return v
  })
  const ready = value.libraryKind !== 'kurikulum' && (value.libraryRef ?? '').trim() !== ''
  return (
    <Dialog title={t('materiComp.relations.libDialogTitle')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <MateriSourcePicker
          value={value}
          onChange={setValue}
          hideKinds={['kurikulum']}
        />
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onSave(value)} disabled={!ready || pending}>
            {pending ? t('common.saving') : t('materiComp.relations.libConnectBtn')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// -------------------------------------------------------- Kurikulum relation

function RelationsCard({ materiId }: { materiId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: relIds = [] } = useQuery({
    queryKey: ['materi-relations', materiId],
    queryFn: () => listMateriRelations(materiId),
  })

  // Fetch the materi catalog once and resolve the related ids client-side.
  const { data: catalog = [] } = useQuery({
    queryKey: ['materi-ajar', { all: true }],
    queryFn: () => listMateriAjar({}),
    staleTime: 5 * 60_000,
  })
  const byId = useMemo(() => new Map(catalog.map((m) => [m.id, m])), [catalog])
  const related = relIds.map((id) => byId.get(id)).filter((m): m is MateriAjar => Boolean(m))

  const addMut = useMutation({
    mutationFn: (otherId: string) => addMateriRelation(materiId, otherId),
    onSuccess: () => {
      toast(t('materiComp.relations.kurikulumSaved'), 'success')
      qc.invalidateQueries({ queryKey: ['materi-relations', materiId] })
      setOpen(false)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('materiComp.relations.errGeneric'), 'error'),
  })

  const delMut = useMutation({
    mutationFn: (otherId: string) => deleteMateriRelation(materiId, otherId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materi-relations', materiId] })
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('materiComp.relations.errGeneric'), 'error'),
  })

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{t('materiComp.relations.kurikulumTitle')}</div>
          <p className="text-xs text-slate-500">
            {t('materiComp.relations.kurikulumDesc')}
          </p>
        </div>
        <Button size="sm" type="button" onClick={() => setOpen(true)}>
          <Plus size={14} className="mr-1" /> {t('materiComp.relations.addBtn')}
        </Button>
      </div>

      {related.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {t('materiComp.relations.kurikulumEmpty')}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {related.map((m) => (
            <li
              key={m.id}
              className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-500">
                  {m.tingkat} · {m.tema} · {m.subTema}
                </div>
                <div className="break-words text-sm text-slate-800">{m.detailMateri}</div>
              </div>
              <button
                type="button"
                onClick={() => delMut.mutate(m.id)}
                disabled={delMut.isPending}
                className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                aria-label={t('materiComp.relations.removeRelationAria')}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <RelationPickerDialog
          materiId={materiId}
          catalog={catalog}
          excludeIds={new Set([materiId, ...relIds])}
          onPick={(id) => addMut.mutate(id)}
          onClose={() => setOpen(false)}
          pending={addMut.isPending}
        />
      ) : null}
    </div>
  )
}

function RelationPickerDialog({
  materiId,
  catalog,
  excludeIds,
  onPick,
  onClose,
  pending,
}: {
  materiId: string
  catalog: MateriAjar[]
  excludeIds: Set<string>
  onPick: (id: string) => void
  onClose: () => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalog
      .filter((m) => !excludeIds.has(m.id))
      .filter((m) =>
        !q
          ? true
          : m.tingkat.toLowerCase().includes(q) ||
            m.tema.toLowerCase().includes(q) ||
            m.subTema.toLowerCase().includes(q) ||
            m.detailMateri.toLowerCase().includes(q) ||
            m.kodeMateri.toLowerCase().includes(q),
      )
      .slice(0, 200)
  }, [catalog, excludeIds, search])
  void materiId

  return (
    <Dialog title={t('materiComp.relations.relDialogTitle')} onClose={onClose} size="lg">
      <div className="space-y-3">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('materiComp.relations.relSearchPh')}
            className="pl-8"
          />
        </div>
        <ul className="max-h-[55vh] overflow-y-auto rounded-md border border-slate-200 bg-white">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-slate-500">
              {t('materiComp.relations.relNoMatch')}
            </li>
          ) : (
            filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onPick(m.id)}
                  disabled={pending}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-500">
                      {m.tingkat} · {m.tema} · {m.subTema} · {t('materiComp.relations.semShort', { n: m.semester })}
                    </div>
                    <div>{m.detailMateri}</div>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  )
}

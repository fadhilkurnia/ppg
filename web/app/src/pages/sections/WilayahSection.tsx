import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'

import {
  createDaerah,
  createDesa,
  createKelompok,
  deleteDaerah,
  deleteDesa,
  deleteKelompok,
  getWilayah,
  renameDaerah,
  renameDesa,
  renameKelompok,
  type WilayahDaerah,
  type WilayahDesa,
  type WilayahTree,
} from '@/api/wilayah'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { PageShell } from '@/components/PageShell'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

const TREE_KEY = ['wilayah']

/**
 * WilayahSection ("Scope") — admin manages the master Daerah → Desa → Kelompok
 * tree. Drill-down by buttons + popups (no dropdowns): each daerah row opens a
 * Desa dialog, each desa row opens a Kelompok dialog. The parent is implicit
 * from the row whose button was clicked. Deleting a node cascades to its
 * children.
 */
export function WilayahSection() {
  const { t } = useTranslation()
  const { data, isPending } = useQuery({ queryKey: TREE_KEY, queryFn: getWilayah })

  // Drill-down popups: store IDs and re-derive the live node from the tree each
  // render, so mutations (which refresh the whole tree) keep the open dialog in
  // sync — and a node that gets deleted simply auto-closes its dialog.
  const [desaForDaerahId, setDesaForDaerahId] = useState<string | null>(null)
  const [kelompokForDesaId, setKelompokForDesaId] = useState<string | null>(null)

  const activeDaerah = data?.daerah.find((d) => d.id === desaForDaerahId) ?? null
  const activeDesa =
    data?.daerah.flatMap((d) => d.desa).find((v) => v.id === kelompokForDesaId) ?? null

  const header = (
    <div>
      <h2 className="text-xl font-semibold">{t('wilayah.title')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('wilayah.subtitle')}</p>
    </div>
  )

  return (
    <PageShell header={header}>
      <div className="mx-auto max-w-3xl space-y-4">
        <AddForm level="daerah" parentId={null} placeholder={t('wilayah.daerahPh')} />
        {isPending ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : !data || data.daerah.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            {t('wilayah.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.daerah.map((d) => (
              <DaerahItem key={d.id} daerah={d} onOpenDesa={() => setDesaForDaerahId(d.id)} />
            ))}
          </ul>
        )}
      </div>

      {activeDaerah ? (
        <DesaDialog
          daerah={activeDaerah}
          onClose={() => {
            setDesaForDaerahId(null)
            setKelompokForDesaId(null)
          }}
          onOpenKelompok={(desaId) => setKelompokForDesaId(desaId)}
        />
      ) : null}
      {activeDesa ? (
        <KelompokDialog desa={activeDesa} onClose={() => setKelompokForDesaId(null)} />
      ) : null}
    </PageShell>
  )
}

// --- mutations hook -------------------------------------------------------

function useTreeMutation<TArgs extends unknown[]>(fn: (...a: TArgs) => Promise<WilayahTree>) {
  const qc = useQueryClient()
  const toast = useToast()
  const { t } = useTranslation()
  return useMutation({
    mutationFn: (args: TArgs) => fn(...args),
    onSuccess: (tree) => qc.setQueryData(TREE_KEY, tree),
    onError: (e) => toast(e instanceof ApiError ? e.message : t('wilayah.saveFailed'), 'error'),
  })
}

// --- add form -------------------------------------------------------------

function AddForm({
  level,
  parentId,
  placeholder,
}: {
  level: 'daerah' | 'desa' | 'kelompok'
  parentId: string | null
  placeholder: string
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const mut = useTreeMutation((n: string) =>
    level === 'daerah'
      ? createDaerah(n)
      : level === 'desa'
        ? createDesa(parentId as string, n)
        : createKelompok(parentId as string, n),
  )
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const v = name.trim()
        if (!v) return
        mut.mutate([v], { onSuccess: () => setName('') })
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      <Button type="submit" size="sm" variant="secondary" disabled={mut.isPending || !name.trim()}>
        <Plus size={15} className="mr-1" />
        {t('wilayah.add')}
      </Button>
    </form>
  )
}

// --- editable name row ----------------------------------------------------

function NameRow({
  name,
  action,
  onRename,
  onDelete,
  renaming,
  deleting,
}: {
  name: string
  action?: React.ReactNode
  onRename: (next: string) => void
  onDelete: () => void
  renaming: boolean
  deleting: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  if (editing) {
    return (
      <form
        className="flex flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = draft.trim()
          if (v && v !== name) onRename(v)
          setEditing(false)
        }}
      >
        <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9" />
        <Button type="submit" size="sm" disabled={renaming}>
          <Check size={15} />
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
          <X size={15} />
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="truncate font-medium text-slate-800">{name}</span>
      <span className="flex-1" />
      {action}
      <button
        type="button"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
        className="text-slate-400 hover:text-slate-700"
        title={t('wilayah.rename')}
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="text-rose-400 hover:text-rose-600 disabled:opacity-50"
        title={t('common.delete')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}

// --- drill-down button (shows child count, opens child popup) -------------

function DrillButton({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="secondary" onClick={onClick}>
      {label}
      <span className="ml-1 text-slate-400">({count})</span>
      <ChevronRight size={14} className="ml-0.5" />
    </Button>
  )
}

// --- daerah list item -----------------------------------------------------

function DaerahItem({ daerah: d, onOpenDesa }: { daerah: WilayahDaerah; onOpenDesa: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const rename = useTreeMutation((id: string, name: string) => renameDaerah(id, name))
  const del = useTreeMutation((id: string) => deleteDaerah(id))

  return (
    <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <NameRow
        name={d.name}
        action={<DrillButton label={t('wilayah.desa')} count={d.desa.length} onClick={onOpenDesa} />}
        renaming={rename.isPending}
        deleting={del.isPending}
        onRename={(next) => rename.mutate([d.id, next])}
        onDelete={async () => {
          if (await confirm({ message: t('wilayah.deleteConfirm', { name: d.name }), danger: true })) del.mutate([d.id])
        }}
      />
    </li>
  )
}

// --- desa dialog (children of one daerah) ---------------------------------

function DesaDialog({
  daerah,
  onClose,
  onOpenKelompok,
}: {
  daerah: WilayahDaerah
  onClose: () => void
  onOpenKelompok: (desaId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog title={`${t('wilayah.desa')} · ${daerah.name}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <AddForm level="desa" parentId={daerah.id} placeholder={t('wilayah.desaPh')} />
        {daerah.desa.length === 0 ? (
          <p className="text-sm text-slate-400">{t('wilayah.emptyDesa')}</p>
        ) : (
          <ul className="space-y-2">
            {daerah.desa.map((v) => (
              <DesaRow key={v.id} desa={v} onOpenKelompok={() => onOpenKelompok(v.id)} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

function DesaRow({ desa: v, onOpenKelompok }: { desa: WilayahDesa; onOpenKelompok: () => void }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const rename = useTreeMutation((id: string, name: string) => renameDesa(id, name))
  const del = useTreeMutation((id: string) => deleteDesa(id))
  return (
    <li className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
      <NameRow
        name={v.name}
        action={<DrillButton label={t('wilayah.kelompok')} count={v.kelompok.length} onClick={onOpenKelompok} />}
        renaming={rename.isPending}
        deleting={del.isPending}
        onRename={(next) => rename.mutate([v.id, next])}
        onDelete={async () => {
          if (await confirm({ message: t('wilayah.deleteConfirm', { name: v.name }), danger: true })) del.mutate([v.id])
        }}
      />
    </li>
  )
}

// --- kelompok dialog (children of one desa) -------------------------------

function KelompokDialog({ desa, onClose }: { desa: WilayahDesa; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Dialog title={`${t('wilayah.kelompok')} · ${desa.name}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <AddForm level="kelompok" parentId={desa.id} placeholder={t('wilayah.kelompokPh')} />
        {desa.kelompok.length === 0 ? (
          <p className="text-sm text-slate-400">{t('wilayah.emptyKelompok')}</p>
        ) : (
          <ul className="space-y-1">
            {desa.kelompok.map((k) => (
              <KelompokRow key={k.id} id={k.id} name={k.name} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

function KelompokRow({ id, name }: { id: string; name: string }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const rename = useTreeMutation((kid: string, n: string) => renameKelompok(kid, n))
  const del = useTreeMutation((kid: string) => deleteKelompok(kid))
  return (
    <li className="flex items-center gap-2 rounded border border-slate-100 px-3 py-1.5">
      <NameRow
        name={name}
        renaming={rename.isPending}
        deleting={del.isPending}
        onRename={(next) => rename.mutate([id, next])}
        onDelete={async () => {
          if (await confirm({ message: t('wilayah.deleteConfirm', { name }), danger: true })) del.mutate([id])
        }}
      />
    </li>
  )
}

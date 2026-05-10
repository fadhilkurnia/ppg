import { Link, type LinkComponentProps } from '@tanstack/react-router'
import { Pencil, Trash2 } from 'lucide-react'

type Props = {
  editTo: LinkComponentProps['to']
  editParams?: LinkComponentProps['params']
  onDelete: () => void
  deleteDisabled?: boolean
}

export function RowActions({ editTo, editParams, onDelete, deleteDisabled }: Props) {
  return (
    <div className="inline-flex items-center gap-1">
      <Link
        to={editTo as never}
        params={editParams as never}
        search={{ edit: 1 } as never}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Ubah"
        title="Ubah"
      >
        <Pencil size={16} />
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Hapus"
        title="Hapus"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

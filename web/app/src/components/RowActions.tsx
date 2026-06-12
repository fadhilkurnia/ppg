import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'

type Props = {
  editTo?: string
  onEdit?: () => void
  onDelete: () => void
  deleteDisabled?: boolean
  editDisabled?: boolean
}

export function RowActions({ editTo, onEdit, onDelete, deleteDisabled, editDisabled }: Props) {
  const { t } = useTranslation()
  const editLabel = t('rowActions.edit')
  const deleteLabel = t('rowActions.delete')
  const editClass =
    'rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <div className="inline-flex items-center gap-1">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled}
          className={editClass}
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil size={16} />
        </button>
      ) : editTo ? (
        <Link to={editTo} className={editClass} aria-label={editLabel} title={editLabel}>
          <Pencil size={16} />
        </Link>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

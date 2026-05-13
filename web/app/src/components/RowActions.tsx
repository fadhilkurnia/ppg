import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n'

type Props = {
  onEdit: () => void
  onDelete: () => void
  deleteDisabled?: boolean
}

export function RowActions({ onEdit, onDelete, deleteDisabled }: Props) {
  const { t } = useTranslation()
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label={t('common.edit')}
        title={t('common.edit')}
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleteDisabled}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('common.delete')}
        title={t('common.delete')}
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}

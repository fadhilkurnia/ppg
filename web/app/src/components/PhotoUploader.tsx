import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Loader2, Trash2, User } from 'lucide-react'

import { apiFetch, ApiError } from '@/api/client'
import { useToast } from '@/lib/toast'
import { useConfirm } from '@/lib/confirm'

type Props = {
  /** Target user id. Required unless self=true. */
  userId?: string
  photoUrl?: string | null
  onChanged: (next: { photoUrl?: string | null }) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  /** When true, use the /api/auth/me/photo self-service endpoint (no admin role needed). */
  self?: boolean
}

export function PhotoUploader({
  userId,
  photoUrl,
  onChanged,
  size = 'md',
  disabled,
  self,
}: Props) {
  const endpoint = self
    ? '/api/auth/me/photo'
    : `/api/users/${encodeURIComponent(userId ?? '')}/photo`
  const toast = useToast()
  const confirm = useConfirm()
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'delete' | null>(null)

  const handlePick = () => {
    if (disabled || busy) return
    fileRef.current?.click()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast(t('photoUploader.maxSize'), 'error')
      return
    }
    setBusy('upload')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const updated = await apiFetch<{ photoUrl?: string }>(endpoint, {
        method: 'POST',
        body: fd,
      })
      onChanged({ photoUrl: updated.photoUrl ?? null })
      toast(t('photoUploader.uploaded'), 'success')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('photoUploader.uploadFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async () => {
    if (!photoUrl || busy) return
    if (!(await confirm({ message: t('photoUploader.confirmDelete'), danger: true }))) return
    setBusy('delete')
    try {
      const updated = await apiFetch<{ photoUrl?: string }>(endpoint, {
        method: 'DELETE',
      })
      onChanged({ photoUrl: updated.photoUrl ?? null })
      toast(t('photoUploader.deleted'), 'success')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('photoUploader.deleteFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const dim = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24'

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${dim} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50`}
      >
        {photoUrl ? (
          <img src={photoUrl} alt={t('photoUploader.altPhoto')} className="h-full w-full object-cover" />
        ) : (
          <User className="h-1/2 w-1/2 text-slate-300" />
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
        <button
          type="button"
          onClick={handlePick}
          disabled={disabled || busy != null}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus size={14} /> {photoUrl ? t('photoUploader.change') : t('photoUploader.upload')}
        </button>
        {photoUrl ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={disabled || busy != null}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} /> {t('photoUploader.delete')}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  )
}

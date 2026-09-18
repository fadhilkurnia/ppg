import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useTranslation } from '@/lib/i18n'
import { lockScroll, unlockScroll } from '@/lib/scrollLock'

type Size = 'md' | 'lg' | 'xl'

const SIZE_CLASS: Record<Size, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
}

type Props = {
  open: boolean
  onClose?: () => void
  title?: string
  size?: Size
  closable?: boolean
  zIndex?: string
  children: React.ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  size = 'lg',
  closable = true,
  zIndex = 'z-[100]',
  children,
}: Props) {
  const { t } = useTranslation()
  const [isRendered, setIsRendered] = useState(open)
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (open) {
      setIsRendered(true)
      setIsClosing(false)
    } else if (isRendered) {
      setIsClosing(true)
      const timer = setTimeout(() => {
        setIsRendered(false)
        setIsClosing(false)
      }, 250)
      return () => clearTimeout(timer)
    }
  }, [open, isRendered])

  const handleDismiss = () => {
    if (!closable || !onClose || isClosing) return
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 250)
  }

  // Escape key closes the modal.
  useEffect(() => {
    if (!isRendered || !closable) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isRendered, isClosing, closable])

  // Lock body scroll while open.
  useEffect(() => {
    if (!isRendered) return
    lockScroll()
    return () => {
      unlockScroll()
    }
  }, [isRendered])

  if (!isRendered) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn('!m-0 fixed inset-0 flex items-end justify-center sm:items-center sm:p-4', zIndex)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <button
        type="button"
        aria-label={t('common.close')}
        className={cn(
          'fixed inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm',
          isClosing ? 'animate-fade-out' : 'animate-fade-in',
        )}
        onClick={closable ? handleDismiss : undefined}
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 dark:border dark:border-slate-800 dark:text-slate-100 sm:rounded-2xl',
          SIZE_CLASS[size],
          isClosing
            ? 'animate-slide-down-sheet sm:animate-modal-scale-out'
            : 'animate-slide-up-sheet sm:animate-modal-scale',
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden shrink-0" />
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 id="modal-title" className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          {closable && (
            <button
              type="button"
              onClick={handleDismiss}
              className="-mr-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-all duration-150 hover:rotate-90 active:scale-90"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-slate-900 dark:text-slate-100">{children}</div>
      </div>
    </div>,
    document.body,
  )
}


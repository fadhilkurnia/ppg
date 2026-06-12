import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

export interface ConfirmOptions {
  /** Body text. Required. */
  message: string
  /** Optional dialog title. Defaults to i18n `common.confirmTitle`. */
  title?: string
  /** Affirm button label. Defaults to `common.confirm` (or `common.delete` when `danger`). */
  confirmLabel?: string
  /** Cancel button label. Defaults to `common.cancel`. */
  cancelLabel?: string
  /** Destructive action — affirm button is rendered red. */
  danger?: boolean
}

type Resolver = (ok: boolean) => void

interface QueuedConfirm {
  opts: ConfirmOptions
  resolve: Resolver
}

const ConfirmCtx = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

/**
 * Imperative confirmation dialog replacement for `window.confirm()`.
 *
 *     const confirm = useConfirm()
 *     if (await confirm({ message: t('users.deleteConfirm', { name }), danger: true })) {
 *       delMut.mutate(id)
 *     }
 */
export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<QueuedConfirm | null>(null)

  const ask = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setCurrent({ opts, resolve })
      }),
    [],
  )

  const finish = useCallback(
    (ok: boolean) => {
      if (!current) return
      current.resolve(ok)
      setCurrent(null)
    },
    [current],
  )

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {current && <ConfirmDialog opts={current.opts} onResult={finish} />}
    </ConfirmCtx.Provider>
  )
}

function ConfirmDialog({
  opts,
  onResult,
}: {
  opts: ConfirmOptions
  onResult: (ok: boolean) => void
}) {
  const { t } = useTranslation()
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const title = opts.title ?? t('common.confirmTitle')
  const cancelLabel = opts.cancelLabel ?? t('common.cancel')
  const confirmLabel =
    opts.confirmLabel ?? (opts.danger ? t('common.delete') : t('common.confirm'))

  useEffect(() => {
    // Autofocus the affirm button — matches native confirm()'s default focus.
    confirmBtnRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResult(false)
      else if (e.key === 'Enter') onResult(true)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onResult])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => onResult(false)}
    >
      <div
        className="my-2 w-full max-w-md rounded-lg bg-white shadow-xl sm:my-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-base font-semibold">{title}</h3>
        </div>
        <div className="px-4 py-4 text-sm text-slate-700 sm:px-5 whitespace-pre-line">
          {opts.message}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => onResult(true)}
            className={
              opts.danger
                ? 'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700'
                : 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

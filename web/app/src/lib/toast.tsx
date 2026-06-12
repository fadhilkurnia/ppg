import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

type Tone = 'info' | 'success' | 'error'
interface Toast {
  id: number
  message: string
  tone: Tone
}

const ToastCtx = createContext<((msg: string, tone?: Tone) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random()
    setList((p) => [...p, { id, message, tone }])
    setTimeout(() => setList((p) => p.filter((t) => t.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const t = useContext(ToastCtx)
  if (!t) throw new Error('useToast must be inside ToastProvider')
  return t
}

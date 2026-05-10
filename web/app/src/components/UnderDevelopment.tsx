import { Construction } from 'lucide-react'

type Props = {
  title: string
  message?: string
}

export function UnderDevelopment({
  title,
  message = 'Fitur ini sedang dalam pengembangan.',
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-amber-50 p-4 text-amber-600">
        <Construction size={32} strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">{message}</p>
    </div>
  )
}

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BookOpenText, Pencil, Save } from 'lucide-react'

import { getKitab, updateKitabJumlahHalaman } from '@/api/hadits'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { LibraryShell } from '@/components/LibraryShell'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'

/**
 * PustakaKitabDetail — title-only view of a kitab himpunan.
 *
 * Hadits payload (teks_arab, terjemahan, etc.) is intentionally hidden per
 * project policy; the bab/hadits list is also hidden for now. What remains:
 *   • kitab metadata (nama, perawi, namaArab, counts)
 *   • admin-only "Setting Page" — edit `jumlah_halaman` (target page count
 *     used for raport / pencapaian coverage), mirroring sitrac's setting.
 */
export function PustakaKitabDetailPage() {
  const { t } = useTranslation()
  const { slug = '' } = useParams<{ slug: string }>()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const qc = useQueryClient()
  const toast = useToast()

  const { data: kitab, isPending } = useQuery({
    queryKey: ['hadits-kitab', slug],
    queryFn: () => getKitab(slug),
    enabled: !!slug,
  })

  const [editing, setEditing] = useState(false)
  const [jumlahInput, setJumlahInput] = useState<string>('')

  const updateMut = useMutation({
    mutationFn: (jumlah: number) => updateKitabJumlahHalaman(slug, jumlah),
    onSuccess: () => {
      toast(t('pustaka.kitab.targetUpdated'), 'success')
      qc.invalidateQueries({ queryKey: ['hadits-kitab', slug] })
      qc.invalidateQueries({ queryKey: ['hadits-kitab-all'] })
      setEditing(false)
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t('pustaka.kitab.saveFailed'), 'error'),
  })

  return (
    <LibraryShell
      backTo="/pustaka/hadits-himpunan"
      backLabel={t('pustaka.hadits.title')}
      bgClassName="bg-slate-50"
      contentClassName="px-4 pt-14 pb-6 md:px-8"
    >
      <div className="mx-auto max-w-3xl">
        {isPending ? (
          <p className="text-sm text-slate-500">{t('pustaka.kitab.loading')}</p>
        ) : !kitab ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {t('pustaka.kitab.notFound')}
          </p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {kitab.perawi ?? t('pustaka.kitab.fallbackPerawi')}
              </p>
              <h1 className="mt-1 text-lg font-semibold">{kitab.nama}</h1>
              {kitab.namaArab ? (
                <p
                  lang="ar"
                  dir="rtl"
                  className="font-arab mt-1 text-right text-xl text-slate-600"
                >
                  {kitab.namaArab}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-500">
                {t('pustaka.kitab.metaBabHadits', { bab: kitab.babCount, hadits: kitab.haditsCount })}
              </p>
              {kitab.deskripsi ? (
                <p className="mt-2 text-sm text-slate-600">{kitab.deskripsi}</p>
              ) : null}
            </div>

            {/* Setting Page — admin-only editor for the target page count. */}
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{t('pustaka.kitab.settingTitle')}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {t('pustaka.kitab.settingDesc')}
                  </p>
                </div>
                {isAdmin && !editing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setJumlahInput(String(kitab.jumlahHalaman ?? 0))
                      setEditing(true)
                    }}
                  >
                    <Pencil size={14} className="mr-1" /> {t('pustaka.kitab.btnEdit')}
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {editing ? (
                  <>
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      value={jumlahInput}
                      onChange={(e) => setJumlahInput(e.target.value)}
                      className="w-32"
                      autoFocus
                    />
                    <span className="text-sm text-slate-500">{t('pustaka.kitab.pagesUnit')}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        const n = Number(jumlahInput)
                        if (Number.isFinite(n) && n >= 0) updateMut.mutate(n)
                      }}
                      disabled={updateMut.isPending}
                    >
                      <Save size={14} className="mr-1" />
                      {updateMut.isPending ? t('pustaka.kitab.btnSaving') : t('common.save')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditing(false)}
                      disabled={updateMut.isPending}
                    >
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
                    <BookOpenText size={20} className="text-emerald-600" />
                    {kitab.jumlahHalaman ?? 0}
                    <span className="text-sm font-normal text-slate-500">{t('pustaka.kitab.pagesUnit')}</span>
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              {t('pustaka.kitab.hiddenNote')}
            </p>
          </>
        )}
      </div>
    </LibraryShell>
  )
}

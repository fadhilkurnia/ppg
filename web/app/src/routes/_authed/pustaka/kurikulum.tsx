import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Search } from 'lucide-react'

import { useMe } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import {
  createMateriAjar,
  createTingkat,
  deleteMateriAjar,
  deleteTingkat,
  listMateriAjar,
  listTingkats,
  updateMateriAjar,
  updateTingkat,
  type MateriAjar,
  type MateriAjarInput,
  type Tingkat,
} from '@/api/kurikulum'
import { groupByTemaSub, sortedTemas } from '@/lib/tingkat'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { MateriTree } from '@/components/MateriTree'
import { Modal } from '@/components/Modal'
import { RowActions } from '@/components/RowActions'

export const Route = createFileRoute('/_authed/pustaka/kurikulum')({
  component: KurikulumPage,
})

const SEMESTERS = [1, 2]

function selectCls() {
  return 'flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50'
}

function KurikulumPage() {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const qc = useQueryClient()
  const { data: tingkat = [] } = useQuery({ queryKey: ['tingkats'], queryFn: listTingkats })
  const [tingkatId, setTingkatId] = useState('')
  const [tema, setTema] = useState('')
  const [semester, setSemester] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [ageGroupsOpen, setAgeGroupsOpen] = useState(false)
  const [editTk, setEditTk] = useState<Tingkat | 'new' | null>(null)
  const [editMa, setEditMa] = useState<MateriAjar | 'new' | null>(null)
  const current = tingkat.find((tk) => tk.id === tingkatId) ?? tingkat[0]

  const { data: allMateri = [] } = useQuery({
    queryKey: ['materi-ajar', current?.id],
    queryFn: () => listMateriAjar({ tingkatId: current!.id }),
    enabled: !!current,
  })

  const temas = useMemo(() => sortedTemas(allMateri), [allMateri])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return allMateri.filter(
      (m) =>
        (semester == null || m.semester === semester) &&
        (tema === '' || m.tema === tema) &&
        (needle === '' ||
          m.materi.toLowerCase().includes(needle) ||
          (m.tema ?? '').toLowerCase().includes(needle) ||
          (m.subTema ?? '').toLowerCase().includes(needle)),
    )
  }, [allMateri, semester, tema, q])
  const groups = useMemo(() => groupByTemaSub(filtered), [filtered])

  const saveTk = useMutation({
    mutationFn: (input: { nama: string; urutan: number; umur?: number | null }) =>
      editTk === 'new'
        ? createTingkat(input)
        : updateTingkat((editTk as Tingkat).id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tingkats'] })
      setEditTk(null)
    },
  })
  const delTk = useMutation({
    mutationFn: (id: string) => deleteTingkat(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tingkats'] }),
  })
  const saveMa = useMutation({
    mutationFn: (input: MateriAjarInput) =>
      editMa === 'new'
        ? createMateriAjar({ ...input, tingkatId: current!.id })
        : updateMateriAjar((editMa as MateriAjar).id, { ...input, tingkatId: current!.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materi-ajar'] })
      setEditMa(null)
    },
  })
  const delMa = useMutation({
    mutationFn: (id: string) => deleteMateriAjar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materi-ajar'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('pustaka.hub.kurikulumTitle')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="secondary" onClick={() => setAgeGroupsOpen(true)}>
              <Layers size={16} className="mr-1" /> {t('achievement.tingkatBtn')}
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={() => setEditMode((v) => !v)}>
              {editMode ? t('common.close') : t('achievement.kurikulumEditMode')}
            </Button>
          )}
          {isAdmin && editMode && (
            <Button size="sm" onClick={() => setEditMa('new')}>
              <Plus size={16} className="mr-1" /> {t('achievement.addMateri')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <Field label={t('achievement.tingkat')}>
          <select
            className={selectCls()}
            value={current?.id ?? ''}
            onChange={(e) => {
              setTingkatId(e.target.value)
              setTema('')
            }}
          >
            {tingkat.map((tk) => (
              <option key={tk.id} value={tk.id}>
                {tk.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('achievement.tema')}>
          <select className={selectCls()} value={tema} onChange={(e) => setTema(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {temas.map((tm) => (
              <option key={tm} value={tm}>
                {tm}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('achievement.semester')}>
          <div className="flex h-10 overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSemester(semester === 1 ? null : 1)}
              className={cn(
                'px-3 text-sm font-medium transition-colors',
                semester === 1
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {t('achievement.semesterName', { n: 1 })}
            </button>
            <button
              type="button"
              onClick={() => setSemester(semester === 2 ? null : 2)}
              className={cn(
                'border-l border-slate-300 dark:border-slate-700 px-3 text-sm font-medium transition-colors',
                semester === 2
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {t('achievement.semesterName', { n: 2 })}
            </button>
          </div>
        </Field>
        <Field label={t('achievement.searchLabel')} className="min-w-48 flex-1">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('achievement.searchPlaceholder')} />
          </div>
        </Field>
      </div>

      <p className="text-xs text-slate-500">
        {t('achievement.summary', { count: filtered.length, temaCount: temas.length, semester: semester ?? '-' })}
      </p>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.noDataLong')}</p>
      ) : (
        <MateriTree
          groups={groups}
          renderRow={(m) => (
            <div className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">
                  <span className="mr-1.5 inline-flex items-center gap-1 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                      {t('achievement.semesterName', { n: m.semester ?? 0 })}
                    </span>
                    {m.jenis ? (
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">
                        {t(`achievement.jenis.${m.jenis}`)}
                      </span>
                    ) : null}
                  </span>
                  {m.nomor}. {m.materi}
                </p>
                {m.rincian ? <p className="mt-0.5 text-xs text-slate-400">{m.rincian}</p> : null}
                {m.keterangan ? (
                  <p className="mt-0.5 text-xs text-slate-400">{m.keterangan}</p>
                ) : null}
              </div>
              {isAdmin && editMode && (
                <RowActions
                  onEdit={() => setEditMa(m)}
                  onDelete={() => {
                    if (confirm(t('achievement.confirmDeleteMateri'))) delMa.mutate(m.id)
                  }}
                />
              )}
            </div>
          )}
        />
      )}

      {ageGroupsOpen && (
        <Modal open onClose={() => setAgeGroupsOpen(false)} title={t('achievement.tingkatList')} size="md">
          <ul className="divide-y divide-slate-100">
            {tingkat.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">
                  {tk.nama}
                  {tk.umur != null ? ` (${t('achievement.umur', { n: tk.umur })})` : ''}
                </span>
                <RowActions
                  onEdit={() => setEditTk(tk)}
                  onDelete={() => {
                    if (confirm(t('achievement.confirmDeleteTingkat'))) delTk.mutate(tk.id)
                  }}
                />
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => setEditTk('new')}>
              <Plus size={16} className="mr-1" /> {t('achievement.addTingkat')}
            </Button>
          </div>
        </Modal>
      )}

      {editTk && (
        <TingkatForm
          initial={editTk === 'new' ? null : editTk}
          saving={saveTk.isPending}
          onSave={(v) => saveTk.mutate(v)}
          onClose={() => setEditTk(null)}
        />
      )}
      {editMa && (
        <MateriForm
          initial={editMa === 'new' ? null : editMa}
          saving={saveMa.isPending}
          onSave={(v) => saveMa.mutate({ ...v, tingkatId: current!.id })}
          onClose={() => setEditMa(null)}
        />
      )}
    </div>
  )
}

function TingkatForm({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: Tingkat | null
  saving: boolean
  onSave: (v: { nama: string; urutan: number; umur?: number | null }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [nama, setNama] = useState(initial?.nama ?? '')
  const [urutan, setUrutan] = useState(initial?.urutan ?? 0)
  const [umur, setUmur] = useState<string>(initial?.umur != null ? String(initial.umur) : '')
  return (
    <Modal open onClose={onClose} title={t('achievement.tingkatForm')} size="md">
      <div className="space-y-3">
        <Field label={t('achievement.tingkatNama')}>
          <Input value={nama} onChange={(e) => setNama(e.target.value)} />
        </Field>
        <Field label={t('achievement.urutan')}>
          <Input
            type="number"
            min={0}
            value={urutan}
            onChange={(e) => setUrutan(Number(e.target.value))}
          />
        </Field>
        <Field label={t('achievement.umurField')}>
          <Input
            type="number"
            min={1}
            max={120}
            placeholder={t('common.notFilled')}
            value={umur}
            onChange={(e) => setUmur(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!nama.trim() || saving}
            onClick={() => onSave({ nama: nama.trim(), urutan, umur: umumValue(umur) })}
          >
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const umumValue = (v: string) => (v === '' ? null : Number(v))

function MateriForm({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: MateriAjar | null
  saving: boolean
  onSave: (v: Omit<MateriAjarInput, 'tingkatId'>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    nomor: initial?.nomor ?? 1,
    tema: initial?.tema ?? '',
    subTema: initial?.subTema ?? '',
    materi: initial?.materi ?? '',
    rincian: initial?.rincian ?? '',
    jenis: initial?.jenis ?? '',
    semester: initial?.semester ?? null,
    keterangan: initial?.keterangan ?? '',
    targetSemester: initial?.targetSemester ?? '',
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} title={t('achievement.materiForm')} size="md">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('achievement.nomor')}>
          <Input type="number" min={1} value={f.nomor} onChange={(e) => set('nomor', Number(e.target.value))} />
        </Field>
        <Field label={t('achievement.semester')}>
          <select className={selectCls()} value={f.semester ?? ''} onChange={(e) => set('semester', e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">{t('common.notFilled')}</option>
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {t(`achievement.semesterName`, { n: s })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('achievement.tema')}>
          <Input value={f.tema} onChange={(e) => set('tema', e.target.value)} />
        </Field>
        <Field label={t('achievement.subTema')}>
          <Input value={f.subTema} onChange={(e) => set('subTema', e.target.value)} />
        </Field>
        <Field label={t('achievement.materi')} className="col-span-2">
          <Input value={f.materi} onChange={(e) => set('materi', e.target.value)} />
        </Field>
        <Field label={t('achievement.cakupan')}>
          <Input value={f.rincian} onChange={(e) => set('rincian', e.target.value)} />
        </Field>
        <Field label={t('achievement.jenisLabel')}>
          <select className={selectCls()} value={f.jenis} onChange={(e) => set('jenis', e.target.value)}>
            <option value="">{t('common.notFilled')}</option>
            {['baru', 'lanjutan', 'mengulang'].map((j) => (
              <option key={j} value={j}>
                {t(`achievement.jenis.${j}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('achievement.targetSemester')} className="col-span-2">
          <Input value={f.targetSemester} onChange={(e) => set('targetSemester', e.target.value)} />
        </Field>
        <Field label={t('achievement.keterangan')} className="col-span-2">
          <Input value={f.keterangan} onChange={(e) => set('keterangan', e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!f.materi.trim() || f.nomor < 1 || saving}
          onClick={() =>
            onSave({
              nomor: f.nomor,
              tema: f.tema.trim(),
              subTema: f.subTema.trim(),
              materi: f.materi.trim(),
              rincian: f.rincian.trim(),
              cakupan: initial?.cakupan ?? null,
              deskripsi: initial?.deskripsi ?? null,
              statusPromes: initial?.statusPromes ?? null,
              jenis: f.jenis,
              semester: f.semester,
              keterangan: f.keterangan.trim(),
              targetSemester: f.targetSemester.trim(),
            })
          }
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}

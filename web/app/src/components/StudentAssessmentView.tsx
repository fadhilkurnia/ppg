import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  MessageSquare,
  PenLine,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react'

import { useMe } from '@/lib/auth'
import { useTranslation, formatKelompokTag } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { printRaport } from '@/lib/raportExport'
import { Modal } from '@/components/Modal'
import { ReportView } from '@/components/BulkPanel'
import type { BulkReport } from '@/api/bulk'
import { listMateriAjar, listTingkats, type MateriAjar } from '@/api/kurikulum'
import {
  createPencapaianNote,
  deletePencapaian,
  deletePencapaianNote,
  importPencapaianMatrix,
  listPencapaian,
  listPencapaianNotes,
  upsertPencapaian,
  type Pencapaian,
  type PencapaianStatus,
} from '@/api/pencapaian'
import type { Student } from '@/api/students'
import { ageInYears } from '@/lib/age'
import {
  groupByTemaSub,
  currentSemester,
  SEMESTER_MONTHS,
  sortedTemas,
  tingkatForAge,
  formatSubTemaTitle,
} from '@/lib/tingkat'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { MateriTree } from '@/components/MateriTree'

export type StudentAssessmentViewProps = {
  student: Student
  onBack?: () => void
  defaultTab?: 'penilaian' | 'laporan'
  hideTabs?: boolean
  onTabChange?: (tab: 'penilaian' | 'laporan') => void
}

export function StudentAssessmentView({
  student,
  onBack,
  defaultTab = 'penilaian',
  hideTabs = false,
  onTabChange,
}: StudentAssessmentViewProps) {
  const [tab, setTab] = useState<'penilaian' | 'laporan'>(defaultTab)

  const handleTabChange = (nextTab: 'penilaian' | 'laporan') => {
    setTab(nextTab)
    onTabChange?.(nextTab)
  }

  const { t, lang } = useTranslation()
  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'
  const { data: tingkats = [] } = useQuery({ queryKey: ['tingkats'], queryFn: listTingkats })

  const [tingkatId, setTingkatId] = useState('')
  const [tema, setTema] = useState('')
  const [semester, setSemester] = useState<number | null>(1)
  const [q, setQ] = useState('')

  const age = ageInYears(student.dateOfBirth)
  const autoTingkat = tingkatForAge(age, tingkats)
  const currentTingkat = tingkats.find((tk) => tk.id === tingkatId) ?? autoTingkat

  const { data: allMateri = [] } = useQuery({
    queryKey: ['materi-ajar', currentTingkat?.id],
    queryFn: () => listMateriAjar({ tingkatId: currentTingkat!.id }),
    enabled: !!currentTingkat,
  })
  const { data: existing = [] } = useQuery({
    queryKey: ['pencapaian', student.id],
    queryFn: () => listPencapaian(student.id),
    enabled: !!student,
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

  const byMateri = useMemo(
    () => new Map(existing.map((p) => [p.materiAjarId, p])),
    [existing],
  )

  const sem = semester ?? currentSemester()
  const exportRows = useMemo(() => filtered.filter((m) => m.semester === sem), [filtered, sem])
  const months = SEMESTER_MONTHS[sem]

  const monthValue = (m: MateriAjar, month: number): number | null => {
    const p = byMateri.get(m.id)
    if (!p?.tanggal || p.nilaiAngka == null) return null
    return new Date(p.tanggal).getMonth() + 1 === month ? p.nilaiAngka : null
  }

  const downloadMatrixCsv = (withStatus: boolean) => {
    const head = withStatus
      ? ['No', 'Semester', 'Tema', 'Sub Tema', 'Rincian', 'Materi', 'Status', ...months.map((mo) => t(`achievement.month.${mo}`))]
      : ['No', 'Semester', 'Tema', 'Sub Tema', 'Rincian', 'Materi', ...months.map((mo) => t(`achievement.month.${mo}`))]
    const lines = groupByTemaSub(exportRows)
      .flatMap((g) => g.subTemas.flatMap((s) => s.materi))
      .map((m) => {
        const p = byMateri.get(m.id)
        const cells = [m.nomor, sem, m.tema, m.subTema ?? '', m.rincian ?? '', m.materi]
        if (withStatus) cells.push(p?.status ?? '')
        cells.push(...months.map((mo) => monthValue(m, mo) ?? ''))
        return cells.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')
      })
    const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pencapaian-${(student?.name ?? 'generus').replaceAll(' ', '-')}-smt${sem}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importReport, setImportReport] = useState<BulkReport | null>(null)

  const handlePrint = () => {
    if (!currentTingkat) return
    const materiForRaport = (allMateri.length > 0 ? allMateri : filtered).filter(
      (m) => m.semester === sem,
    )
    printRaport({
      student,
      tingkat: currentTingkat,
      semester: sem,
      tab,
      materiList: materiForRaport,
      byMateri,
      lang,
    })
  }

  const importMut = useMutation({
    mutationFn: (file: File) =>
      importPencapaianMatrix(file, { studentId: student.id, tingkatId: currentTingkat!.id, semester: sem }),
    onSuccess: (r) => {
      setImportReport(r)
      qc.invalidateQueries({ queryKey: ['pencapaian', student.id] })
    },
  })

  return (
    <div className="space-y-5">
      {/* Student Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('achievement.changeStudent')}
                title={t('achievement.changeStudent')}
                className="inline-flex h-9 w-9 sm:h-auto sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 sm:px-3 sm:py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">{t('achievement.changeStudent')}</span>
              </button>
            )}
            <Avatar name={student.name} className="h-10 w-10 sm:h-12 sm:w-12 text-sm sm:text-base shrink-0 shadow-xs" />
            <div className="min-w-0">
              <h2 className="truncate text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">{student.name}</h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {age != null ? t('achievement.grid.age', { age }) : t('common.notFilled')}
                {autoTingkat ? ` · ${autoTingkat.nama}` : ''}
                <span className="ml-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {formatKelompokTag(student.kelompok)}
                </span>
              </p>
            </div>
          </div>

          {/* Tab Buttons (if not hidden) */}
          {!hideTabs && (
            <div className="shrink-0">
              {/* Mobile Single Toggle Button: inline with student identity */}
              <button
                type="button"
                onClick={() => handleTabChange(tab === 'penilaian' ? 'laporan' : 'penilaian')}
                className="inline-flex sm:hidden items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-xs active:scale-95 transition-all dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                {tab === 'penilaian' ? t('portalGuru.reportPageBtn') : t('portalGuru.assessmentPageBtn')}
              </button>

              {/* Desktop Segmented Control */}
              <div className="hidden sm:flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {(['penilaian', 'laporan'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTabChange(key)}
                    className={cn(
                      'rounded-lg px-4 py-1.5 text-xs font-bold transition-colors',
                      tab === key
                        ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                    )}
                  >
                    {t(`achievement.studentTabs.${key}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter Card */}
      <FilterCard
        tingkats={tingkats}
        current={currentTingkat}
        onTingkat={(id) => {
          setTingkatId(id)
          setTema('')
        }}
        temas={temas}
        tema={tema}
        setTema={setTema}
        semester={semester}
        setSemester={setSemester}
        q={q}
        setQ={setQ}
        tab={tab}
        canExport={exportRows.length > 0 && !!currentTingkat}
        canImport={isAdmin && tab === 'penilaian' && !!currentTingkat && !importMut.isPending}
        importing={importMut.isPending}
        onExport={() => downloadMatrixCsv(tab === 'penilaian')}
        onImport={() => fileRef.current?.click()}
        onPrint={handlePrint}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setImportReport(null)
            importMut.mutate(f)
          }
          e.target.value = ''
        }}
      />
      {importReport ? <ReportView report={importReport} /> : null}
      {importMut.error ? <p className="text-sm text-red-600">{importMut.error.message}</p> : null}

      {tab === 'penilaian' ? (
        <PenilaianTab student={student} filtered={filtered} byMateri={byMateri} />
      ) : (
        <LaporanTab
          student={student}
          filtered={filtered}
          byMateri={byMateri}
          semester={semester}
        />
      )}
    </div>
  )
}

export function FilterCard({
  tingkats,
  current,
  onTingkat,
  temas,
  tema,
  setTema,
  semester,
  setSemester,
  q,
  setQ,
  tab: _tab,
  canExport,
  canImport,
  importing,
  onExport,
  onImport,
  onPrint,
}: {
  tingkats: { id: string; nama: string; urutan: number; umur?: number | null }[]
  current?: { id: string; nama: string }
  onTingkat: (id: string) => void
  temas: string[]
  tema: string
  setTema: (v: string) => void
  semester: number | null
  setSemester: (v: number | null) => void
  q: string
  setQ: (v: string) => void
  tab: 'penilaian' | 'laporan'
  canExport: boolean
  canImport: boolean
  importing: boolean
  onExport: () => void
  onImport: () => void
  onPrint?: () => void
}) {
  const { t } = useTranslation()
  const [showExportModal, setShowExportModal] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Search Bar - on the left, flex-1 */}
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-9 pl-9 text-base sm:text-xs rounded-xl"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('achievement.searchPlaceholder')}
          />
        </div>

        {/* Age Group / Tingkat */}
        <div className="shrink-0 w-24 sm:w-36">
          <select
            className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-base sm:text-xs font-medium text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            value={current?.id ?? ''}
            onChange={(e) => onTingkat(e.target.value)}
          >
            {tingkats.map((tk) => (
              <option key={tk.id} value={tk.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                {tk.nama}
              </option>
            ))}
          </select>
        </div>

        {/* Tema - Hidden on mobile, visible on sm:block */}
        <div className="hidden sm:block w-36 shrink-0">
          <select
            className="flex h-9 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-base sm:text-xs font-medium text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            value={tema}
            onChange={(e) => setTema(e.target.value)}
          >
            <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">{t('common.all')}</option>
            {temas.map((tm) => (
              <option key={tm} value={tm} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                {tm}
              </option>
            ))}
          </select>
        </div>

        {/* Semester Buttons - SM-1, SM-2 & 1 Tahun */}
        <div className="flex h-9 shrink-0 overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setSemester(1)}
            className={cn(
              'px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              semester === 1
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            <span className="sm:hidden">SM-1</span>
            <span className="hidden sm:inline">{t('achievement.semesterName', { n: 1 })}</span>
          </button>
          <button
            type="button"
            onClick={() => setSemester(2)}
            className={cn(
              'border-l border-slate-300 dark:border-slate-700 px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              semester === 2
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            <span className="sm:hidden">SM-2</span>
            <span className="hidden sm:inline">{t('achievement.semesterName', { n: 2 })}</span>
          </button>
          <button
            type="button"
            onClick={() => setSemester(null)}
            className={cn(
              'border-l border-slate-300 dark:border-slate-700 px-2.5 text-xs font-semibold transition-colors cursor-pointer',
              semester == null
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
            title="Tampilkan seluruh sesi dan nilai dalam 1 tahun (2 semester)"
          >
            <span className="sm:hidden">1 Thn</span>
            <span className="hidden sm:inline">1 Tahun</span>
          </button>
        </div>

        {/* Export Popup Icon Button */}
        <button
          type="button"
          onClick={() => setShowExportModal(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-xs transition-colors cursor-pointer"
          aria-label="Export / Cetak / Download"
          title="Export / Cetak / Download"
        >
          <Download size={16} />
        </button>
      </div>

      {/* Export Action Modal */}
      {showExportModal && (
        <Modal
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={t('achievement.exportModal.title')}
          size="md"
        >
          <div className="space-y-3 p-1">
            {/* Print / Simpan PDF Button */}
            <button
              type="button"
              onClick={() => {
                setShowExportModal(false)
                onPrint?.()
              }}
              disabled={!canExport}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-blue-500 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 disabled:opacity-50 cursor-pointer"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                <Printer size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('achievement.exportModal.printTitle')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('achievement.exportModal.printDesc')}
                </p>
              </div>
            </button>

            {/* CSV Export Button */}
            <button
              type="button"
              onClick={() => {
                setShowExportModal(false)
                onExport()
              }}
              disabled={!canExport}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-emerald-500 hover:bg-emerald-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/20 disabled:opacity-50 cursor-pointer"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <FileSpreadsheet size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('achievement.exportModal.csvTitle')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('achievement.exportModal.csvDesc')}
                </p>
              </div>
            </button>

            {/* CSV Import Button */}
            {canImport && (
              <button
                type="button"
                onClick={() => {
                  setShowExportModal(false)
                  onImport()
                }}
                disabled={importing}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-amber-500 hover:bg-amber-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500 dark:hover:bg-amber-950/20 disabled:opacity-50 cursor-pointer"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  <Upload size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {t('achievement.exportModal.importTitle')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('achievement.exportModal.importDesc')}
                  </p>
                </div>
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

const STATUSES: PencapaianStatus[] = ['belum', 'proses', 'tuntas']

function AssessmentNoteModal({
  open,
  onClose,
  student,
  materi,
  pencapaian,
  canManage,
  initialTab = 'scoring',
}: {
  open: boolean
  onClose: () => void
  student: Student
  materi: MateriAjar | null
  pencapaian?: Pencapaian
  canManage: boolean
  initialTab?: 'scoring' | 'history' | 'preview'
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'scoring' | 'history'>(
    initialTab === 'history' ? 'history' : 'scoring',
  )

  const isPreview = initialTab === 'preview' || !canManage

  // Local assessment form state: notes/remarks initially empty (unless in preview mode), date follows today's date
  const [status, setStatus] = useState<PencapaianStatus>(pencapaian?.status ?? 'belum')
  const [nilai, setNilai] = useState<number | null>(pencapaian?.nilaiAngka ?? null)
  const [tanggal, setTanggal] = useState<string>(
    initialTab === 'preview' ? (pencapaian?.tanggal || '') : new Date().toISOString().slice(0, 10),
  )
  const [catatan, setCatatan] = useState<string>(
    initialTab === 'preview' ? (pencapaian?.catatan || '') : '',
  )

  useEffect(() => {
    if (open) {
      setStatus(pencapaian?.status ?? 'belum')
      setNilai(pencapaian?.nilaiAngka ?? null)
      if (initialTab === 'preview') {
        setTanggal(pencapaian?.tanggal || '')
        setCatatan(pencapaian?.catatan || '')
      } else {
        setTanggal(new Date().toISOString().slice(0, 10))
        setCatatan('')
      }
      setActiveTab(initialTab === 'history' ? 'history' : 'scoring')
    }
  }, [open, student.id, materi?.id, pencapaian?.id, initialTab])

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['pencapaian-notes', student.id, materi?.id],
    queryFn: () => (materi ? listPencapaianNotes(student.id, materi.id) : Promise.resolve([])),
    enabled: open && !!materi,
  })

  const saveAssessmentMut = useMutation({
    mutationFn: async (payload: {
      status: PencapaianStatus
      nilaiAngka: number | null
      tanggal: string | null
      catatan: string | null
    }) => {
      if (!materi) return

      const isBelum = payload.status === 'belum'
      const finalNilai = isBelum ? null : payload.nilaiAngka
      const finalTanggal = isBelum ? null : payload.tanggal

      // 1. Upsert current assessment
      const res = await upsertPencapaian({
        studentId: student.id,
        materiAjarId: materi.id,
        status: payload.status,
        nilaiAngka: finalNilai,
        tanggal: finalTanggal,
        catatan: payload.catatan,
      })

      // 2. If a note is provided, log it into history
      if (payload.catatan) {
        await createPencapaianNote({
          studentId: student.id,
          materiAjarId: materi.id,
          note: payload.catatan,
          status: payload.status,
          nilaiAngka: finalNilai,
        })
      }

      return res
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pencapaian', student.id] })
      if (materi) {
        qc.invalidateQueries({ queryKey: ['pencapaian-notes', student.id, materi.id] })
      }
      onClose()
    },
  })

  const { data: user } = useMe()
  const isAdmin = user?.role === 'admin'

  const resetAssessmentMut = useMutation({
    mutationFn: async () => {
      if (!pencapaian?.id) return
      return deletePencapaian(pencapaian.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pencapaian', student.id] })
      if (materi) {
        qc.invalidateQueries({ queryKey: ['pencapaian-notes', student.id, materi.id] })
      }
      onClose()
    },
  })

  const deleteNoteMut = useMutation({
    mutationFn: async (noteId: string) => {
      return deletePencapaianNote(noteId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pencapaian-notes', student.id, materi?.id] })
      qc.invalidateQueries({ queryKey: ['pencapaian', student.id] })
    },
  })

  if (!materi) return null

  const formatTimestamp = (ts?: string) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ts
    }
  }

  const getGradeTitle = (val: number) => {
    const key = `achievement.gradeRubric.${val}.title`
    const tVal = t(key as never)
    return tVal !== key ? tVal : String(val)
  }

  const getGradeDesc = (val: number) => {
    const key = `achievement.gradeRubric.${val}.desc`
    const tVal = t(key as never)
    return tVal !== key ? tVal : ''
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPreview ? t('achievement.notes.previewTitle') : t('achievement.notes.title')}
      size="lg"
    >
      <div className="space-y-4">
        {/* Header Info Banner */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {materi.nomor}
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                  {materi.materi}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {student.name} {student.kelompok ? `(${student.kelompok})` : ''} · {materi.tema}
                {materi.rincian ? ` · ${materi.rincian}` : ''}
              </p>
            </div>

            {/* Assessment Snapshot */}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-bold capitalize',
                  pencapaian?.status === 'tuntas'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : pencapaian?.status === 'proses'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                )}
              >
                {t(`achievement.status.${pencapaian?.status ?? 'belum'}`)}
              </span>
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {pencapaian?.nilaiAngka != null ? `Nilai: ${pencapaian.nilaiAngka}` : 'Belum Dinilai'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('scoring')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all',
              activeTab === 'scoring'
                ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <PenLine size={13} />
            <span>{t('achievement.notes.tabAssessment')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all',
              activeTab === 'history'
                ? 'bg-white text-emerald-700 shadow-xs dark:bg-slate-900 dark:text-emerald-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            <History size={13} />
            <span>{t('achievement.notes.tabHistory')}</span>
            {notes.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-extrabold text-slate-700 dark:text-slate-200">
                {notes.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Form Penilaian (Scoring & Notes) */}
        {activeTab === 'scoring' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {/* Status Progres */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                {t('achievement.notes.statusLabel')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={!canManage || isPreview}
                    onClick={() => {
                      setStatus(st)
                      if (st === 'belum') {
                        setNilai(null)
                        setTanggal('')
                      } else if (!tanggal) {
                        setTanggal(new Date().toISOString().slice(0, 10))
                      }
                      if (st === 'tuntas' && (nilai == null || nilai < 80)) {
                        setNilai(100)
                      } else if (st === 'proses' && nilai == null) {
                        setNilai(70)
                      }
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-xl border py-2.5 px-3 text-xs font-bold transition shadow-xs disabled:cursor-not-allowed',
                      status === st
                        ? st === 'tuntas'
                          ? 'border-emerald-500 bg-emerald-600 text-white dark:border-emerald-400'
                          : st === 'proses'
                            ? 'border-amber-500 bg-amber-500 text-white dark:border-amber-400'
                            : 'border-slate-600 bg-slate-700 text-white dark:border-slate-400 dark:bg-slate-300 dark:text-slate-900'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {status === st && st === 'tuntas' && <CircleCheck size={14} />}
                    {t(`achievement.status.${st}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Nilai & Tanggal Penilaian */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Nilai Penilaian */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t('achievement.notes.scoreLabel')}
                  </label>
                  {nilai != null && (
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {nilai}: {getGradeTitle(nilai)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[60, 70, 80, 90, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={!canManage || isPreview}
                      onClick={() => {
                        setNilai(num)
                        if (status === 'belum') {
                          setStatus(num >= 80 ? 'tuntas' : 'proses')
                        }
                        if (!tanggal) {
                          setTanggal(new Date().toISOString().slice(0, 10))
                        }
                      }}
                      className={cn(
                        'flex-1 min-w-[48px] rounded-xl py-2 text-xs font-bold border transition shadow-2xs text-center disabled:cursor-not-allowed',
                        nilai === num
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                      )}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                {nilai != null && getGradeDesc(nilai) && (
                  <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300 italic bg-emerald-50/50 dark:bg-emerald-950/30 px-2.5 py-1.5 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40">
                    &ldquo;{getGradeDesc(nilai)}&rdquo;
                  </p>
                )}
              </div>

              {/* Tanggal Penilaian */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {t('achievement.notes.dateLabel')}
                </label>
                <div className="relative flex items-center">
                  <Calendar size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    disabled={!canManage || isPreview}
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-900 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Catatan / Evaluasi */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-indigo-600 dark:text-indigo-400" />
                  <span>{t('achievement.notes.noteLabel')}</span>
                </label>
                {canManage && !isPreview && (
                  <button
                    type="button"
                    disabled={!catatan}
                    onClick={() => setCatatan('')}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline transition-colors disabled:opacity-40 disabled:hover:no-underline disabled:cursor-not-allowed cursor-pointer"
                  >
                    <RotateCcw size={11} />
                    <span>{t('achievement.notes.clearNoteBtn')}</span>
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                disabled={!canManage || isPreview}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder={isPreview ? 'Tidak ada catatan.' : t('achievement.notes.placeholder')}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs sm:text-sm text-slate-900 shadow-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 disabled:cursor-not-allowed"
              />
            </div>

            {/* Actions / Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                {isAdmin && pencapaian && canManage && !isPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={resetAssessmentMut.isPending}
                    onClick={() => {
                      if (window.confirm(t('achievement.notes.resetConfirm'))) {
                        resetAssessmentMut.mutate()
                      }
                    }}
                    className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50 text-xs font-semibold gap-1.5"
                  >
                    {resetAssessmentMut.isPending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                    <span>{t('achievement.notes.resetBtn')}</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="text-xs font-semibold rounded-xl"
                >
                  {isPreview ? t('common.close') : t('common.cancel')}
                </Button>

                {canManage && !isPreview && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={saveAssessmentMut.isPending}
                    onClick={() => {
                      saveAssessmentMut.mutate({
                        status,
                        nilaiAngka: status === 'belum' ? null : nilai,
                        tanggal: status === 'belum' ? null : (tanggal || null),
                        catatan: catatan.trim() || null,
                      })
                    }}
                    className="gap-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                  >
                    {saveAssessmentMut.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    <span>
                      {saveAssessmentMut.isPending
                        ? t('achievement.notes.saving')
                        : t('achievement.notes.saveAssessment')}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Riwayat Penilaian & Catatan */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock size={14} />
                <span>{t('achievement.notes.historyTitle')}</span>
              </h4>
              {canManage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('scoring')}
                  className="gap-1.5 text-xs font-bold rounded-xl text-emerald-700 border-emerald-300 dark:border-emerald-800 dark:text-emerald-300"
                >
                  <PenLine size={13} />
                  <span>{t('achievement.notes.tabAssessment')}</span>
                </Button>
              )}
            </div>

            {notesLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-400">
                <Loader2 size={18} className="animate-spin mr-2" />
                {t('common.loading')}
              </div>
            ) : notes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 space-y-2">
                <p>{t('achievement.notes.empty')}</p>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setActiveTab('scoring')}
                    className="mt-2 text-xs font-semibold rounded-xl"
                  >
                    {t('achievement.notes.saveAssessment')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {notes.map((item) => (
                  <div
                    key={item.id}
                    className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900/90"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <UserIcon size={12} className="text-slate-400" />
                          {item.authorName || t('achievement.notes.legacyAuthor')}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {formatTimestamp(item.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {(item.status || item.nilaiAngka != null) && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {item.status && (
                              <span
                                className={cn(
                                  'rounded-md px-1.5 py-0.5 font-semibold capitalize',
                                  item.status === 'tuntas'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : item.status === 'proses'
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                                )}
                              >
                                {t(`achievement.status.${item.status}`)}
                              </span>
                            )}
                            {item.nilaiAngka != null && (
                              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {item.nilaiAngka}
                              </span>
                            )}
                          </div>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            title={t('achievement.notes.deleteNoteConfirm')}
                            disabled={deleteNoteMut.isPending}
                            onClick={() => {
                              if (window.confirm(t('achievement.notes.deleteNoteConfirm'))) {
                                deleteNoteMut.mutate(item.id)
                              }
                            }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {item.note}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function formatDateBadge(dateStr?: string | null): { short: string; full: string } | null {
  if (!dateStr) return null
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const yr = parts[0]
      const moIdx = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const mo = monthsShort[moIdx] || parts[1]
      const yrShort = yr.length === 4 ? yr.slice(2) : yr
      return {
        short: `${day} ${mo} ${yrShort}`,
        full: `${day} ${mo} ${yr}`,
      }
    }
    return { short: dateStr, full: dateStr }
  } catch {
    return { short: dateStr, full: dateStr }
  }
}

export function PenilaianTab({
  student,
  filtered,
  byMateri,
}: {
  student: Student
  filtered: MateriAjar[]
  byMateri: Map<string, Pencapaian>
}) {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const manage =
    user?.role === 'admin' ||
    user?.role === 'guru' ||
    user?.role === 'teacher' ||
    user?.role === 'coordinator' ||
    user?.role === 'staff'

  const [modalState, setModalState] = useState<{
    materi: MateriAjar
    tab: 'scoring' | 'history'
  } | null>(null)
  const [previewMateri, setPreviewMateri] = useState<MateriAjar | null>(null)

  const openModal = (materi: MateriAjar, tab: 'scoring' | 'history') => {
    setModalState({ materi, tab })
  }

  const groups = useMemo(() => groupByTemaSub(filtered), [filtered])

  const stats = useMemo(() => {
    const totals = new Map<string, number>()
    const tuntas = new Map<string, number>()
    const proses = new Map<string, number>()
    for (const m of filtered) {
      totals.set(m.tema ?? '', (totals.get(m.tema ?? '') ?? 0) + 1)
      const p = byMateri.get(m.id)
      if (p?.status === 'tuntas') tuntas.set(m.tema ?? '', (tuntas.get(m.tema ?? '') ?? 0) + 1)
      if (p?.status === 'proses') proses.set(m.tema ?? '', (proses.get(m.tema ?? '') ?? 0) + 1)
    }
    return { totals, tuntas, proses }
  }, [filtered, byMateri])

  const totalDone = Array.from(stats.tuntas.values()).reduce((a, b) => a + b, 0)
  const totalAll = filtered.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Achievement</h3>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-slate-100">{totalDone}</strong> / {totalAll}{' '}
          {t('achievement.materiUnit')} ({totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0}%)
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const total = stats.totals.get(g.tema) ?? 0
          const done = stats.tuntas.get(g.tema) ?? 0
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          return (
            <div
              key={g.tema}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase text-slate-700 dark:text-slate-300">
                  {g.tema}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {done}/{total} ({pct}%)
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('common.noDataLong')}</p>
      ) : (
        <MateriTree
          groups={groups}
          renderRow={(m) => {
            const p = byMateri.get(m.id)
            return (
              <div className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                {/* Left: Materi Details & Clickable Summary */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-slate-400 shrink-0">{m.nomor}</span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {m.materi}
                    </span>
                  </div>
                  {m.rincian ? (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 pl-6">
                      {m.rincian}
                    </p>
                  ) : null}

                  {/* Inline row: Summary Penilaian (left) + Button Penilaian / Scoring (right) */}
                  <div className="flex items-center justify-between gap-2 pt-1 pl-6">
                    <button
                      type="button"
                      onClick={() => setPreviewMateri(m)}
                      className="group flex min-w-0 max-w-full items-center gap-1.5 text-left rounded-lg p-0.5 -ml-0.5 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer overflow-hidden"
                      title="Klik untuk melihat preview / detail penilaian"
                    >
                      {/* Status */}
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold capitalize shadow-2xs shrink-0',
                          p?.status === 'tuntas'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : p?.status === 'proses'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {t(`achievement.status.${p?.status ?? 'belum'}`)}
                      </span>

                      {/* Nilai */}
                      {p?.nilaiAngka != null && (
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 shrink-0">
                          {p.nilaiAngka}
                        </span>
                      )}

                      {/* Tanggal */}
                      {p?.tanggal && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                          <Calendar size={11} className="shrink-0 text-slate-400" />
                          <span>{formatDateBadge(p.tanggal)?.short}</span>
                        </span>
                      )}

                      {/* Note - dynamic width: hugs short text, expands up to available space and truncates when long */}
                      {p?.catatan ? (
                        <span className="inline-flex min-w-0 shrink max-w-full items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/80 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                          <FileText size={11} className="shrink-0 text-indigo-500" />
                          <span className="truncate whitespace-nowrap overflow-hidden text-ellipsis font-medium">
                            {p.catatan}
                          </span>
                        </span>
                      ) : null}
                    </button>

                    {/* Button Scoring / Penilaian (INLINE with summary) */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openModal(m, 'scoring')}
                      className="gap-1.5 h-8 rounded-xl border-emerald-500/50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600/50 dark:text-emerald-300 dark:hover:bg-emerald-950/50 font-bold text-xs shadow-2xs shrink-0 ml-auto"
                    >
                      <PenLine size={13} />
                      <span>{t('achievement.notes.scoreBtn')}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )
          }}
        />
      )}

      {/* Read-only Comment Preview Modal */}
      {previewMateri && (
        <CommentPreviewModal
          open={!!previewMateri}
          onClose={() => setPreviewMateri(null)}
          student={student}
          materi={previewMateri}
          pencapaian={byMateri.get(previewMateri.id)}
        />
      )}

      {/* Note & Assessment Modal */}
      {modalState && (
        <AssessmentNoteModal
          key={`${modalState.materi.id}_${modalState.tab}_${byMateri.get(modalState.materi.id)?.updatedAt ?? 'new'}`}
          open={!!modalState}
          onClose={() => setModalState(null)}
          student={student}
          materi={modalState.materi}
          pencapaian={byMateri.get(modalState.materi.id)}
          canManage={manage}
          initialTab={modalState.tab}
        />
      )}
    </div>
  )
}

function CommentPreviewModal({
  open,
  onClose,
  student,
  materi,
  pencapaian,
}: {
  open: boolean
  onClose: () => void
  student: Student
  materi: MateriAjar | null
  pencapaian?: Pencapaian
}) {
  const { t } = useTranslation()

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['pencapaian-notes', student.id, materi?.id],
    queryFn: () => (materi ? listPencapaianNotes(student.id, materi.id) : Promise.resolve([])),
    enabled: open && !!materi,
  })

  if (!materi) return null

  const latestNote = notes.length > 0 ? notes[0] : null
  const commentText = latestNote?.note || pencapaian?.catatan || ''
  const authorName =
    latestNote?.authorName || pencapaian?.recordedBy || t('achievement.notes.legacyAuthor')
  const scoreValue = latestNote?.nilaiAngka ?? pencapaian?.nilaiAngka ?? null
  const dateValue = latestNote?.createdAt || pencapaian?.tanggal || pencapaian?.updatedAt
  const statusValue = latestNote?.status || pencapaian?.status

  const formatCommentDate = (ts?: string | null) => {
    if (!ts) return '-'
    try {
      const d = new Date(ts)
      const dateStr = d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      const timeStr = ts.includes('T')
        ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        : ''
      return timeStr ? `${dateStr} · ${timeStr}` : dateStr
    } catch {
      return ts
    }
  }

  const getGradeTitle = (val: number) => {
    const key = `achievement.gradeRubric.${val}.title`
    const tVal = t(key as never)
    return tVal !== key ? tVal : String(val)
  }

  const scoreBadgeCls = (val: number | null) => {
    if (val == null) return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    if (val >= 90) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    if (val >= 80) return 'bg-lime-100 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300 border-lime-200 dark:border-lime-800'
    if (val >= 70) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    return 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-200 dark:border-red-800'
  }

  const olderNotes = notes.length > 1 ? notes.slice(1) : []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('achievement.notes.commentPreviewTitle')}
      size="md"
    >
      <div className="space-y-4">
        {/* Materi & Student Header Info */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex items-start gap-2.5">
            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 shrink-0 mt-0.5">
              {materi.nomor}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words">
                {materi.materi}
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                {student.name} {student.kelompok ? `(${formatKelompokTag(student.kelompok)})` : ''} · {materi.tema}
                {materi.rincian ? ` · ${materi.rincian}` : ''}
              </p>
            </div>
          </div>
        </div>

        {notesLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Loader2 size={24} className="animate-spin text-purple-600 mb-2" />
            <span className="text-xs">{t('common.loading')}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Primary Comment Card */}
            <div className="rounded-2xl border border-purple-200/80 bg-white p-4 shadow-xs dark:border-purple-900/40 dark:bg-slate-900">
              {/* Comment Metadata Header: Person who commented, Score, Date */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                {/* Person who did comment */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs shrink-0">
                    <UserIcon size={16} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                      {authorName}
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {t('achievement.notes.commentBy')}
                    </span>
                  </div>
                </div>

                {/* Score & Date */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Score */}
                  {scoreValue != null && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold border shadow-2xs',
                        scoreBadgeCls(scoreValue),
                      )}
                      title={getGradeTitle(scoreValue)}
                    >
                      <span>{t('achievement.notes.finalScore')}: {scoreValue}</span>
                    </div>
                  )}

                  {/* Status if available */}
                  {statusValue && (
                    <span
                      className={cn(
                        'rounded-lg px-2 py-0.5 text-xs font-bold capitalize',
                        statusValue === 'tuntas'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                          : statusValue === 'proses'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                            : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
                      )}
                    >
                      {t(`achievement.status.${statusValue}`)}
                    </span>
                  )}

                  {/* Date of comment */}
                  <div className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700">
                    <Calendar size={13} className="text-slate-400" />
                    <span>{formatCommentDate(dateValue)}</span>
                  </div>
                </div>
              </div>

              {/* Comment Content */}
              <div className="mt-3.5">
                {commentText ? (
                  <div className="relative rounded-xl bg-purple-50/40 p-3.5 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {commentText}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2">
                    {t('achievement.notes.noCommentYet')}
                  </p>
                )}
              </div>
            </div>

            {/* Previous Comments (if any) */}
            {olderNotes.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t('achievement.notes.olderComments')} ({olderNotes.length})
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {olderNotes.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900/70"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {item.authorName || t('achievement.notes.legacyAuthor')}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.nilaiAngka != null && (
                            <span className="font-bold text-slate-700 dark:text-slate-300">
                              {t('achievement.notes.finalScore')}: {item.nilaiAngka}
                            </span>
                          )}
                          <span>{formatCommentDate(item.createdAt)}</span>
                        </div>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {item.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer: Close Button only, NO editing choice */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-semibold rounded-xl px-5"
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function LaporanTab({
  student,
  filtered,
  byMateri,
  semester,
}: {
  student: Student
  filtered: MateriAjar[]
  byMateri: Map<string, Pencapaian>
  semester: number | null
}) {
  const { t } = useTranslation()
  const [previewMateri, setPreviewMateri] = useState<MateriAjar | null>(null)
  const isFullYear = semester == null
  const rows = isFullYear ? filtered : filtered.filter((m) => m.semester === semester)
  // In full year mode, order by Semester 1 (Jul - Des) then Semester 2 (Jan - Jun)
  const months = isFullYear
    ? [...SEMESTER_MONTHS[1], ...SEMESTER_MONTHS[2]]
    : SEMESTER_MONTHS[semester ?? 1]
  const groups = useMemo(() => groupByTemaSub(rows), [rows])

  // Column width constants:
  // Materi column widened significantly to 440px so details and rincian are clearly visible
  const MATERI_WIDTH = 440
  const MONTH_WIDTH = 52 // 3.25rem
  const NO_WIDTH = 40 // 2.5rem
  const FINAL_WIDTH = 72 // 4.5rem
  const NOTE_WIDTH = 200

  const VISIBLE_MONTHS_COUNT = 6
  const VISIBLE_MONTHS_WIDTH = VISIBLE_MONTHS_COUNT * MONTH_WIDTH // 312px

  // Visible table container width for exactly 6 months: 40 + 440 + 312 + 72 + 200 = 1064px
  const TABLE_VISIBLE_WIDTH = NO_WIDTH + MATERI_WIDTH + VISIBLE_MONTHS_WIDTH + FINAL_WIDTH + NOTE_WIDTH
  // Full grid content width: in 1-semester mode it is 1064px; in full year mode (12 months) it is 1376px
  const totalTableWidth = isFullYear
    ? NO_WIDTH + MATERI_WIDTH + months.length * MONTH_WIDTH + FINAL_WIDTH + NOTE_WIDTH
    : TABLE_VISIBLE_WIDTH

  const gridTemplate = useMemo(
    () => ({
      gridTemplateColumns: `2.5rem ${MATERI_WIDTH}px repeat(${months.length}, 3.25rem) 4.5rem 200px`,
    }),
    [months.length],
  )

  const tableScrollRef = useRef<HTMLDivElement>(null)
  const [activeSemView, setActiveSemView] = useState<1 | 2>(1)

  const scrollToSemester = (targetSem: 1 | 2) => {
    const el = tableScrollRef.current
    if (!el) return
    setActiveSemView(targetSem)
    const targetScroll = targetSem === 1 ? 0 : VISIBLE_MONTHS_WIDTH
    el.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }

  const handleScroll = () => {
    const el = tableScrollRef.current
    if (!el || !isFullYear) return
    if (el.scrollLeft > VISIBLE_MONTHS_WIDTH / 2) {
      setActiveSemView(2)
    } else {
      setActiveSemView(1)
    }
  }

  const prevSemesterRef = useRef<number | null>(semester)
  useEffect(() => {
    if (semester != null) {
      prevSemesterRef.current = semester
    } else if (prevSemesterRef.current === 2) {
      const timer = setTimeout(() => scrollToSemester(2), 60)
      return () => clearTimeout(timer)
    }
  }, [semester])

  // Mobile month navigation: single month
  const [mobileMonthIdx, setMobileMonthIdx] = useState<number>(() => {
    const realMo = new Date().getMonth() + 1
    const idx = months.indexOf(realMo)
    return idx >= 0 ? idx : 0
  })

  // Ensure idx stays valid if semester changes
  const safeIdx = Math.min(Math.max(0, mobileMonthIdx), Math.max(0, months.length - 1))
  const activeMonth = months[safeIdx]

  const completion = useMemo(() => {
    const byTema = new Map<string, { total: number; done: number }>()
    const bySub = new Map<string, { total: number; done: number }>()
    for (const m of rows) {
      const done = byMateri.get(m.id)?.status === 'tuntas' ? 1 : 0
      const tema = byTema.get(m.tema ?? '') ?? { total: 0, done: 0 }
      byTema.set(m.tema ?? '', { total: tema.total + 1, done: tema.done + done })
      const key = `${m.tema ?? ''}/${m.subTema}`
      const sub = bySub.get(key) ?? { total: 0, done: 0 }
      bySub.set(key, { total: sub.total + 1, done: sub.done + done })
    }
    return { byTema, bySub }
  }, [rows, byMateri])

  const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)

  const valueFor = (m: MateriAjar, month: number): number | null => {
    const p = byMateri.get(m.id)
    if (!p?.tanggal || p.nilaiAngka == null) return null
    const mm = new Date(p.tanggal).getMonth() + 1
    return mm === month ? p.nilaiAngka : null
  }

  const cellCls = (v: number | null) =>
    cn(
      'flex h-7 items-center justify-center rounded text-xs font-semibold',
      v != null
        ? v >= 90
          ? 'bg-green-100 text-green-800 dark:bg-green-950/70 dark:text-green-300'
          : v >= 80
            ? 'bg-lime-100 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300'
            : v >= 70
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
              : 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
        : 'text-slate-300 dark:text-slate-700',
    )

  return (
    <div className="space-y-4">
      {rows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('achievement.completionLabel')}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {groups.map((g) => {
              const temaStat = completion.byTema.get(g.tema) ?? { total: 0, done: 0 }
              return (
                <div key={g.tema} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold uppercase text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {g.tema}
                    </span>
                    <span className="text-xs text-slate-400">
                      {temaStat.done}/{temaStat.total} · {pct(temaStat.done, temaStat.total)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${pct(temaStat.done, temaStat.total)}%` }}
                    />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {g.subTemas.map((sub) => {
                      const key = `${g.tema}/${sub.subTema}`
                      const subStat = completion.bySub.get(key) ?? { total: 0, done: 0 }
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          <span className="w-36 truncate text-slate-500 dark:text-slate-400">{formatSubTemaTitle(sub.subTema)}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${pct(subStat.done, subStat.total)}%` }}
                            />
                          </div>
                          <span className="w-14 text-right text-slate-400">
                            {subStat.done}/{subStat.total}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 w-fit max-w-full">
        {/* Mobile View: Single month navigation + 4-column compact table */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={safeIdx <= 0}
              onClick={() => setMobileMonthIdx((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              <ChevronLeft size={15} />
              <span>{t('achievement.prevMonth')}</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <span>{t(`achievement.month.${activeMonth}`)}</span>
            </div>
            <button
              type="button"
              disabled={safeIdx >= months.length - 1}
              onClick={() => setMobileMonthIdx((p) => Math.min(months.length - 1, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              <span>{t('achievement.nextMonth')}</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div
            className="grid gap-2 border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 items-center"
            style={{ gridTemplateColumns: '2rem minmax(0, 1fr) 3.5rem 3.5rem' }}
          >
            <span>{t('achievement.no')}</span>
            <span>{t('achievement.materi')}</span>
            <span className="text-center truncate">
              {t(`achievement.month.${activeMonth}`)}
            </span>
            <span className="text-center truncate">
              {t('achievement.finalScore')}
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">{t('common.noDataLong')}</p>
          ) : (
            <MateriTree
              groups={groups}
              renderRow={(m) => {
                const p = byMateri.get(m.id)
                return (
                  <div
                    key={m.id}
                    className="grid gap-2 px-3 py-2.5 items-center border-b border-slate-100 dark:border-slate-800/60"
                    style={{ gridTemplateColumns: '2rem minmax(0, 1fr) 3.5rem 3.5rem' }}
                  >
                    <span className="text-xs font-bold text-slate-400">{m.nomor}</span>
                    <div className="min-w-0 pr-1">
                      <span className="block text-xs font-medium text-slate-900 dark:text-slate-100 leading-snug break-words" title={m.materi}>
                        {m.materi}
                      </span>
                      {m.rincian ? (
                        <span className="block text-[11px] text-slate-400 leading-tight break-words mt-0.5" title={m.rincian}>
                          {m.rincian}
                        </span>
                      ) : null}
                    </div>
                    <span className={cellCls(valueFor(m, activeMonth))}>
                      {valueFor(m, activeMonth) ?? '·'}
                    </span>
                    <div className="flex justify-center">
                      {p?.catatan ? (
                        <button
                          type="button"
                          onClick={() => setPreviewMateri(m)}
                          className={cn(
                            cellCls(p?.nilaiAngka ?? null),
                            'relative cursor-pointer hover:ring-2 hover:ring-purple-400 transition w-full',
                          )}
                          title={`Catatan: ${p.catatan}`}
                        >
                          <span>{p?.nilaiAngka ?? '·'}</span>
                          <span
                            className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center"
                            title="Ada catatan guru"
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-600 dark:bg-purple-400 shadow-xs" />
                          </span>
                        </button>
                      ) : (
                        <span className={cn(cellCls(p?.nilaiAngka ?? null), 'w-full')}>
                          {p?.nilaiAngka ?? '·'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              }}
            />
          )}
        </div>

        {/* Full Year Semester Switcher Toolbar (Visible when 1 Tahun / 2 Semester is active) */}
        {isFullYear && (
          <div className="hidden sm:flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                Mode 1 Tahun (2 Semester)
              </span>
              <span className="hidden md:inline text-slate-400">
                · Geser horizontal untuk melihat bulan semester lainnya
              </span>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => scrollToSemester(1)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                  activeSemView === 1
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                )}
              >
                <span>Semester 1</span>
                <span className="opacity-75 text-[11px]">(Jul - Des)</span>
              </button>
              <button
                type="button"
                onClick={() => scrollToSemester(2)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                  activeSemView === 2
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                )}
              >
                <span>Semester 2</span>
                <span className="opacity-75 text-[11px]">(Jan - Jun)</span>
              </button>
            </div>
          </div>
        )}

        {/* Desktop View: Horizontally scrollable month scores with sticky No, Materi (left) and Final, Teacher Note (right) */}
        <div
          ref={tableScrollRef}
          onScroll={handleScroll}
          className="hidden sm:block overflow-x-auto custom-scrollbar"
          style={{ width: '100%', maxWidth: `${TABLE_VISIBLE_WIDTH}px` }}
        >
          <div style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }}>
            {/* Desktop Table Header */}
            <div
              className="grid gap-0 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 items-center bg-slate-50 dark:bg-slate-800"
              style={gridTemplate}
            >
              <span className="sticky left-0 z-30 px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-500">
                {t('achievement.no')}
              </span>
              <span className="sticky left-[2.5rem] z-30 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-500 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                {t('achievement.materi')}
              </span>
              {months.map((m) => (
                <span key={m} className="text-center py-2.5">
                  {t(`achievement.month.${m}`)}
                </span>
              ))}
              <span className="sticky right-[200px] z-30 px-2 py-2.5 text-center bg-slate-50 dark:bg-slate-800 text-slate-500 border-l border-slate-200 dark:border-slate-700 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                {t('achievement.finalScore')}
              </span>
              <span className="sticky right-0 z-30 px-3 py-2.5 text-left bg-slate-50 dark:bg-slate-800 text-slate-500">
                {t('achievement.teacherNote')}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{t('common.noDataLong')}</p>
            ) : (
              <MateriTree
                groups={groups}
                renderRow={(m) => {
                  const p = byMateri.get(m.id)
                  return (
                    <div
                      key={m.id}
                      className="group grid gap-0 items-center border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                      style={gridTemplate}
                    >
                      <span className="sticky left-0 z-20 px-2.5 py-2 text-sm text-slate-500 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                        {m.nomor}
                      </span>
                      <div className="sticky left-[2.5rem] z-20 px-3 py-2 min-w-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 break-words" title={m.materi}>
                          {m.materi}
                        </span>
                        {m.rincian ? (
                          <span className="block text-xs text-slate-400 leading-tight line-clamp-2 break-words mt-0.5" title={m.rincian}>
                            {m.rincian}
                          </span>
                        ) : null}
                      </div>

                      {months.map((mo) => (
                        <div key={mo} className="px-1 py-1">
                          <span className={cellCls(valueFor(m, mo))}>
                            {valueFor(m, mo) ?? '·'}
                          </span>
                        </div>
                      ))}

                      {/* Final: sticky right-[200px] */}
                      <div className="sticky right-[200px] z-20 px-2 py-2 flex justify-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)] group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                        {p?.catatan ? (
                          <button
                            type="button"
                            onClick={() => setPreviewMateri(m)}
                            className={cn(
                              cellCls(p?.nilaiAngka ?? null),
                              'relative cursor-pointer hover:ring-2 hover:ring-purple-400 transition w-full max-w-[3.5rem]',
                            )}
                            title={`Catatan: ${p.catatan}`}
                          >
                            <span>{p?.nilaiAngka ?? '·'}</span>
                            <span
                              className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center"
                              title="Ada catatan guru"
                            >
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-600 dark:bg-purple-400 shadow-xs" />
                            </span>
                          </button>
                        ) : (
                          <span className={cn(cellCls(p?.nilaiAngka ?? null), 'w-full max-w-[3.5rem]')}>
                            {p?.nilaiAngka ?? '·'}
                          </span>
                        )}
                      </div>

                      {/* Teacher Note: sticky right-0 */}
                      <div className="sticky right-0 z-20 px-3 py-2 min-w-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors">
                        {p?.catatan ? (
                          <button
                            type="button"
                            onClick={() => setPreviewMateri(m)}
                            className="flex items-center gap-1.5 min-w-0 max-w-full text-left rounded-lg px-2 py-1 bg-slate-50 hover:bg-purple-50 text-slate-700 dark:bg-slate-800/60 dark:hover:bg-purple-950/40 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800 transition cursor-pointer group"
                            title={p.catatan}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0 group-hover:scale-125 transition-transform" />
                            <span className="truncate text-xs font-medium">{p.catatan}</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300 dark:text-slate-700 pl-2">·</span>
                        )}
                      </div>
                    </div>
                  )
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <span className="rounded bg-green-100 px-2 py-1 text-green-800 dark:bg-green-950/70 dark:text-green-300">90-100 · {t('achievement.grade.baikSekali')}</span>
        <span className="rounded bg-lime-100 px-2 py-1 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300">80-89 · {t('achievement.grade.baik')}</span>
        <span className="rounded bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">70-79 · {t('achievement.grade.cukup')}</span>
        <span className="rounded bg-red-100 px-2 py-1 text-red-800 dark:bg-red-950/70 dark:text-red-300">60-69 · {t('achievement.grade.kurang')}</span>
        <span className="rounded bg-slate-100 px-2 py-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400">· {t('achievement.grade.empty')}</span>
        <span className="inline-flex items-center gap-1.5 rounded bg-purple-50 px-2 py-1 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 font-medium">
          <span className="h-2 w-2 rounded-full bg-purple-600" />
          <span>Dot Ungu = Catatan Guru (klik untuk preview)</span>
        </span>
      </div>

      {/* Read-only Comment Preview Modal */}
      {previewMateri && (
        <CommentPreviewModal
          key={`${previewMateri.id}_preview_${byMateri.get(previewMateri.id)?.updatedAt ?? 'new'}`}
          open={!!previewMateri}
          onClose={() => setPreviewMateri(null)}
          student={student}
          materi={previewMateri}
          pencapaian={byMateri.get(previewMateri.id)}
        />
      )}
    </div>
  )
}

export const GRID_TEMPLATE = {
  gridTemplateColumns: '2.5rem minmax(180px, 1.2fr) repeat(6, 3.25rem) 4.5rem minmax(140px, 1.3fr)',
} as const

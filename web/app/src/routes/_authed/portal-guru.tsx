import { useState, useMemo, useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Award,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  Plus,
  Printer,
  Search,
  Users,
} from 'lucide-react'
import { z } from 'zod'

import { createAttendance, listAttendances } from '@/api/attendances'
import { getStudentsForTeacher } from '@/api/studentTeachers'
import { listStudents, type Student } from '@/api/students'
import { listTeachers } from '@/api/teachers'
import { getAttendanceStats, type WeeklyBucket, type MonthlyBucket } from '@/api/stats'
import { printSessionReport } from '@/lib/sessionReportExport'
import {
  type Attendance,
  type AttendanceStatus,
} from '@/api/types'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ageInYears } from '@/lib/age'
import { useMe } from '@/lib/auth'
import { useAttendanceStatusLabel, useTranslation, formatKelompokTag } from '@/lib/i18n'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { Field } from '@/components/Field'
import { StudentAssessmentView } from '@/components/StudentAssessmentView'
import { UserMenuDropdown } from '@/components/UserMenuDropdown'
import { WhatsAppIcon } from '@/components/ProfileModal'
import { forceUnlockScroll } from '@/lib/scrollLock'
import { cn } from '@/lib/cn'

const searchSchema = z.object({
  view: z
    .enum(['main', 'session-activity', 'material-assessment', 'dashboard-report'])
    .optional()
    .catch('main'),
  studentId: z.string().optional(),
})

export const Route = createFileRoute('/_authed/portal-guru')({
  validateSearch: searchSchema,
  component: PortalGuruPage,
})

type PortalView = 'main' | 'session-activity' | 'material-assessment' | 'dashboard-report'

function PortalGuruPage() {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const navigate = useNavigate({ from: '/portal-guru' })
  const search = Route.useSearch()
  const currentView: PortalView = search.view ?? 'main'

  const [assessmentSubState, setAssessmentSubState] = useState<{
    hasStudent: boolean
    tab: 'penilaian' | 'laporan'
  }>({ hasStudent: false, tab: 'penilaian' })

  const goView = (v: PortalView) => {
    setAssessmentSubState({ hasStudent: false, tab: 'penilaian' })
    navigate({ search: { view: v } })
  }

  useEffect(() => {
    forceUnlockScroll()
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [currentView])

  // Centered Header Title computed reactively
  const centerHeaderTitle = useMemo(() => {
    if (currentView === 'session-activity') return t('portalGuru.sessionActivityTitle')
    if (currentView === 'dashboard-report') return t('portalGuru.dashboardReportTitle')
    if (currentView === 'material-assessment') {
      if (assessmentSubState.hasStudent) {
        return assessmentSubState.tab === 'penilaian'
          ? t('achievement.studentTabs.penilaian')
          : t('achievement.studentTabs.laporan')
      }
      return t('portalGuru.materialAssessmentTitle')
    }
    return null
  }, [currentView, assessmentSubState, t])

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[80] flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 sm:px-6">
        <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            {currentView !== 'main' ? (
              <button
                type="button"
                onClick={() => goView('main')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">{t('portalGuru.backToPortal')}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="PPG US"
                  className="h-9 w-9 object-contain rounded-full bg-white dark:bg-slate-800 p-0.5 shadow-xs border border-slate-200 dark:border-slate-700"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                      PPG US
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                      {t('portalGuru.teacherBadge')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Centered Header Title */}
          {centerHeaderTitle && (
            <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none text-center max-w-[170px] sm:max-w-xs truncate">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-slate-800 dark:text-slate-200">
                {centerHeaderTitle}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {user?.name || 'Guru'}
              </p>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 capitalize">
                {user?.role || 'guru'}
              </p>
            </div>
            <UserMenuDropdown user={user} placement="top" />
          </div>
        </div>
      </header>

      {/* Main Viewport Content */}
      <main className="flex-1 px-4 py-6 sm:px-6 md:py-8">
        <div className="mx-auto w-full max-w-7xl">
          {currentView === 'main' && (
            <PortalMainView user={user} onSelectMenu={goView} />
          )}

          {currentView === 'session-activity' && (
            <PortalSessionActivityView user={user} onToast={showToast} />
          )}

          {currentView === 'material-assessment' && (
            <PortalMaterialAssessmentView onSubStateChange={setAssessmentSubState} />
          )}

          {currentView === 'dashboard-report' && (
            <PortalDashboardReportView user={user} onGoSessionActivity={() => goView('session-activity')} />
          )}
        </div>
      </main>
    </div>
  )
}

/* =========================================================================
   1. MAIN VIEW: 3 Big Buttons Only
   ========================================================================= */

function PortalMainView({
  user,
  onSelectMenu,
}: {
  user: ReturnType<typeof useMe>['data']
  onSelectMenu: (v: PortalView) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Emerald Hero Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-7 text-white shadow-xl md:p-10">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-md">
            <img src="/logo.png" alt="PPG US" className="h-4 w-4 object-contain rounded-full bg-white/90 p-0.5" />
            <span>PORTAL GURU PPG</span>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl md:text-4xl">
            {t('portalGuru.welcome', { name: user?.name || 'Guru' })}
          </h1>
          <p className="mt-2 text-sm text-emerald-100 sm:text-base leading-relaxed">
            {t('portalGuru.subtitle')}
          </p>
        </div>
        {/* Background decorative circles */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute right-24 -bottom-12 h-48 w-48 rounded-full bg-teal-300/20 blur-xl" />
      </div>

      {/* 3 Big Action Buttons - Full Page Focus */}
      <div>
        <div className="mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t('portalGuru.mainMenuHeading')}
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Form Kegiatan Pengajian */}
          <button
            type="button"
            onClick={() => onSelectMenu('session-activity')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-7 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500"
          >
            <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-emerald-500/5 transition-transform group-hover:scale-150 dark:bg-emerald-500/10" />
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs transition-transform duration-200 group-hover:scale-110 dark:bg-emerald-950/80 dark:text-emerald-300">
                <BookOpen size={28} />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-900 group-hover:text-emerald-600 dark:text-slate-100 dark:group-hover:text-emerald-400">
                {t('portalGuru.menu1Title')}
              </h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed sm:text-sm">
                {t('portalGuru.menu1Desc')}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <span>{t('portalGuru.openSessionActivity')}</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </div>
          </button>

          {/* Card 2: Form Penilaian Materi */}
          <button
            type="button"
            onClick={() => onSelectMenu('material-assessment')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-7 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amber-500 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
          >
            <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-amber-500/5 transition-transform group-hover:scale-150 dark:bg-amber-500/10" />
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-xs transition-transform duration-200 group-hover:scale-110 dark:bg-amber-950/80 dark:text-amber-300">
                <Award size={28} />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-900 group-hover:text-amber-600 dark:text-slate-100 dark:group-hover:text-amber-400">
                {t('portalGuru.menu2Title')}
              </h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed sm:text-sm">
                {t('portalGuru.menu2Desc')}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              <span>{t('portalGuru.openAssessmentBtn')}</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </div>
          </button>

          {/* Card 3: Dashboard Report */}
          <button
            type="button"
            onClick={() => onSelectMenu('dashboard-report')}
            className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-7 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-500 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
          >
            <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-indigo-500/5 transition-transform group-hover:scale-150 dark:bg-indigo-500/10" />
            <div>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-xs transition-transform duration-200 group-hover:scale-110 dark:bg-indigo-950/80 dark:text-indigo-300">
                <BarChart3 size={28} />
              </div>
              <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                {t('portalGuru.menu3Title')}
              </h3>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed sm:text-sm">
                {t('portalGuru.menu3Desc')}
              </p>
            </div>
            <div className="mt-8 flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span>{t('portalGuru.openSessionHistory')}</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

/* =========================================================================
   2. VIEW 1: Form Kegiatan Pengajian (Session Activity Form)
   ========================================================================= */

function PortalSessionActivityView({
  user,
  onToast,
}: {
  user: ReturnType<typeof useMe>['data']
  onToast: (msg: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('my-students')
  const [activeStudent, setActiveStudent] = useState<Student | null>(null)
  const [reportModalData, setReportModalData] = useState<SessionReportData | null>(null)

  // Fetch students
  const { data: studentsData, isPending: studentsLoading } = useQuery({
    queryKey: ['students', 'portal-guru'],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
  })


  // Fetch teachers for resolving teacher ID
  const { data: teachersData } = useQuery({
    queryKey: ['teachers', 'portal-guru'],
    queryFn: () => listTeachers({ status: 'active', limit: 200 }),
    staleTime: 5 * 60_000,
  })

  // Derive teacher from current logged in user
  const currentTeacher = useMemo(() => {
    const items = teachersData?.items ?? []
    if (!user || items.length === 0) return null
    return (
      items.find(
        (tc) =>
          tc.name.toLowerCase() === (user.name || '').toLowerCase() ||
          (tc.nickname && tc.nickname.toLowerCase() === (user.username || '').toLowerCase()),
      ) ||
      (user?.role === 'admin' ? null : (items[0] || null))
    )
  }, [user, teachersData])

  const teacherId = currentTeacher?.id || ''

  // Fetch attendances for this teacher to determine taught students
  const { data: teacherAttendancesData } = useQuery({
    queryKey: ['attendances', 'teacher-taught', teacherId],
    queryFn: () => listAttendances({ teacherId, limit: 500 }),
    enabled: !!teacherId,
  })

  // Fetch explicitly assigned students for this teacher
  const { data: assignedStudentsData } = useQuery({
    queryKey: ['teacher-students', teacherId],
    queryFn: () => getStudentsForTeacher(teacherId),
    enabled: !!teacherId,
  })

  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of assignedStudentsData ?? []) {
      if (s.id) set.add(s.id)
    }
    return set
  }, [assignedStudentsData])

  const taughtStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const a of teacherAttendancesData?.items ?? []) {
      if (a.studentId) set.add(a.studentId)
    }
    return set
  }, [teacherAttendancesData])

  const teacherKelompok = currentTeacher?.kelompok?.trim() || ''

  const isMyStudent = useMemo(() => {
    return (s: Student) => {
      if (user?.role === 'admin' && !currentTeacher) return true
      if (assignedStudentIds.has(s.id)) return true
      if (taughtStudentIds.has(s.id)) return true
      if (
        teacherKelompok &&
        s.kelompok &&
        s.kelompok.toLowerCase() === teacherKelompok.toLowerCase()
      ) {
        return true
      }
      return false
    }
  }, [user, currentTeacher, assignedStudentIds, taughtStudentIds, teacherKelompok])

  const students = studentsData?.items ?? []

  // Dynamic filter options: "Generus Saya" first, then "Semua", then kelompok list
  const filterOptions = useMemo(() => {
    const kelompokSet = new Set<string>()
    for (const s of students) {
      if (s.kelompok) kelompokSet.add(s.kelompok)
    }
    return [
      { id: 'my-students', label: t('portalGuru.filterMyStudents') },
      { id: 'all', label: t('common.all') },
      ...Array.from(kelompokSet)
        .sort()
        .map((k) => ({ id: k, label: formatKelompokTag(k) })),
    ]
  }, [students, t])

  // Filter students
  const filteredStudents = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // When searching, search across all students regardless of active tab filter
    if (needle) {
      return students.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.nickname && s.nickname.toLowerCase().includes(needle)) ||
          (s.kelompok && s.kelompok.toLowerCase().includes(needle)),
      )
    }

    let list = students
    if (selectedFilter === 'my-students') {
      list = list.filter(isMyStudent)
    } else if (selectedFilter !== 'all') {
      list = list.filter((s) => s.kelompok === selectedFilter)
    }
    return list
  }, [students, q, selectedFilter, isMyStudent])

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('portalGuru.searchStudentPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 h-10 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
            {filteredStudents.length} {t('portalGuru.activeStudentsCount')}
          </span>
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedFilter(opt.id)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                selectedFilter === opt.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student Grid */}
      {studentsLoading ? (
        <div className="p-16 text-center text-sm text-slate-500">
          {t('common.loading')}
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-16 text-center text-sm text-slate-500 dark:border-slate-800">
          <p>{t('achievement.grid.empty')}</p>
          {selectedFilter === 'my-students' && (
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className="mt-3 inline-flex items-center text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {t('portalGuru.viewAllStudents')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredStudents.map((s) => {
            const age = ageInYears(s.dateOfBirth)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStudent(s)}
                className="group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500"
              >
                <Avatar name={s.name} className="h-12 w-12 text-base shadow-xs transition-transform group-hover:scale-105" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[s.level, age != null ? t('achievement.grid.age', { age }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {formatKelompokTag(s.kelompok)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <Plus size={12} /> {t('portalGuru.inputSessionBtn')}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Input Session Modal for Selected Student */}
      {activeStudent && (
        <TeacherSessionModal
          student={activeStudent}
          teacherId={teacherId}
          open={!!activeStudent}
          onClose={() => setActiveStudent(null)}
          onSuccess={(savedData) => {
            const studentName = activeStudent.name
            queryClient.invalidateQueries({ queryKey: ['attendances'] })
            onToast(t('portalGuru.sessionSuccessToast', { name: studentName }))

            const sName = activeStudent.nickname || activeStudent.name
            const studentLabel = activeStudent.kelompok ? `${sName}-${activeStudent.kelompok}` : sName

            const tName = currentTeacher?.nickname || currentTeacher?.name || user?.username || user?.name || 'Guru'
            const tDaerah = currentTeacher?.daerah || user?.daerah
            const teacherLabel = tDaerah
              ? `${tName} - ${tDaerah}`
              : currentTeacher?.kelompok || user?.kelompok
                ? `${tName} - ${currentTeacher?.kelompok || user?.kelompok}`
                : tName

            setReportModalData({
              student: activeStudent,
              studentLabel,
              teacherLabel,
              date: savedData.date,
              durationMin: savedData.durationMin,
              status: savedData.status,
              materi: savedData.materi,
            })
            setActiveStudent(null)
          }}
        />
      )}

      {/* Session Report Preview Modal (WhatsApp Share) */}
      {reportModalData && (
        <SessionReportModal
          open={!!reportModalData}
          data={reportModalData}
          onClose={() => setReportModalData(null)}
        />
      )}
    </div>
  )
}

/* =========================================================================
   3. VIEW 2: Form Penilaian Materi (Material Assessment Form)
   ========================================================================= */

function PortalMaterialAssessmentView({
  onSubStateChange,
}: {
  onSubStateChange?: (state: { hasStudent: boolean; tab: 'penilaian' | 'laporan' }) => void
}) {
  const { t } = useTranslation()
  const { data: user } = useMe()
  const [q, setQ] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('my-students')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [currentTab, setCurrentTab] = useState<'penilaian' | 'laporan'>('penilaian')

  // Sync substate to parent
  useEffect(() => {
    onSubStateChange?.({
      hasStudent: !!selectedStudent,
      tab: currentTab,
    })
  }, [selectedStudent, currentTab, onSubStateChange])

  // Fetch students
  const { data: studentsData, isPending: studentsLoading } = useQuery({
    queryKey: ['students', 'portal-guru-penilaian'],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
  })


  // Fetch teachers for resolving teacher ID
  const { data: teachersData } = useQuery({
    queryKey: ['teachers', 'portal-guru-penilaian'],
    queryFn: () => listTeachers({ status: 'active', limit: 200 }),
    staleTime: 5 * 60_000,
  })

  // Derive teacher from current logged in user
  const currentTeacher = useMemo(() => {
    const items = teachersData?.items ?? []
    if (!user || items.length === 0) return null
    return (
      items.find(
        (tc) =>
          tc.name.toLowerCase() === (user.name || '').toLowerCase() ||
          (tc.nickname && tc.nickname.toLowerCase() === (user.username || '').toLowerCase()),
      ) ||
      (user?.role === 'admin' ? null : (items[0] || null))
    )
  }, [user, teachersData])

  const teacherId = currentTeacher?.id || ''

  // Fetch attendances for this teacher to determine taught students
  const { data: teacherAttendancesData } = useQuery({
    queryKey: ['attendances', 'teacher-taught-penilaian', teacherId],
    queryFn: () => listAttendances({ teacherId, limit: 500 }),
    enabled: !!teacherId,
  })

  // Fetch explicitly assigned students for this teacher
  const { data: assignedStudentsData } = useQuery({
    queryKey: ['teacher-students-penilaian', teacherId],
    queryFn: () => getStudentsForTeacher(teacherId),
    enabled: !!teacherId,
  })

  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of assignedStudentsData ?? []) {
      if (s.id) set.add(s.id)
    }
    return set
  }, [assignedStudentsData])

  const taughtStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const a of teacherAttendancesData?.items ?? []) {
      if (a.studentId) set.add(a.studentId)
    }
    return set
  }, [teacherAttendancesData])

  const teacherKelompok = currentTeacher?.kelompok?.trim() || ''

  const isMyStudent = useMemo(() => {
    return (s: Student) => {
      if (user?.role === 'admin' && !currentTeacher) return true
      if (assignedStudentIds.has(s.id)) return true
      if (taughtStudentIds.has(s.id)) return true
      if (
        teacherKelompok &&
        s.kelompok &&
        s.kelompok.toLowerCase() === teacherKelompok.toLowerCase()
      ) {
        return true
      }
      return false
    }
  }, [user, currentTeacher, assignedStudentIds, taughtStudentIds, teacherKelompok])

  const students = studentsData?.items ?? []

  // Dynamic filter options: "Generus Saya" first, then "Semua", then kelompok list
  const filterOptions = useMemo(() => {
    const kelompokSet = new Set<string>()
    for (const s of students) {
      if (s.kelompok) kelompokSet.add(s.kelompok)
    }
    return [
      { id: 'my-students', label: t('portalGuru.filterMyStudents') },
      { id: 'all', label: t('common.all') },
      ...Array.from(kelompokSet)
        .sort()
        .map((k) => ({ id: k, label: formatKelompokTag(k) })),
    ]
  }, [students, t])

  // Filter students
  const filteredStudents = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // When searching, search across all students regardless of active tab filter
    if (needle) {
      return students.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          (s.nickname && s.nickname.toLowerCase().includes(needle)) ||
          (s.kelompok && s.kelompok.toLowerCase().includes(needle)),
      )
    }

    let list = students
    if (selectedFilter === 'my-students') {
      list = list.filter(isMyStudent)
    } else if (selectedFilter !== 'all') {
      list = list.filter((s) => s.kelompok === selectedFilter)
    }
    return list
  }, [students, q, selectedFilter, isMyStudent])

  // If student is chosen: render StudentAssessmentView full page!
  if (selectedStudent) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <StudentAssessmentView
          student={selectedStudent}
          onBack={() => setSelectedStudent(null)}
          defaultTab={currentTab}
          onTabChange={(nextTab) => setCurrentTab(nextTab)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('portalGuru.searchStudentPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 h-10 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
            {filteredStudents.length} {t('portalGuru.studentsCount')}
          </span>
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelectedFilter(opt.id)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                selectedFilter === opt.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student Grid */}
      {studentsLoading ? (
        <div className="p-16 text-center text-sm text-slate-500">
          {t('common.loading')}
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-16 text-center text-sm text-slate-500 dark:border-slate-800">
          <p>{t('achievement.grid.empty')}</p>
          {selectedFilter === 'my-students' && (
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className="mt-3 inline-flex items-center text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
            >
              {t('portalGuru.viewAllStudents')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredStudents.map((s) => {
            const age = ageInYears(s.dateOfBirth)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStudent(s)}
                className="group flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-500"
              >
                <Avatar name={s.name} className="h-12 w-12 text-base shadow-xs transition-transform group-hover:scale-105" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[s.level, age != null ? t('achievement.grid.age', { age }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {formatKelompokTag(s.kelompok)}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                      {t('portalGuru.openAssessmentBtn')} &rarr;
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  hadir: '#10b981',        // emerald-500
  izin_murid: '#f59e0b',   // amber-500
  izin_guru: '#f97316',    // orange-500
  by_vn: '#0ea5e9',        // sky-500
}

function resolveRange(token: string | undefined, today = new Date()) {
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayIso = `${yyyy}-${mm}-${dd}`

  if (token === 'ytd') {
    return { dateFrom: `${yyyy}-01-01`, dateTo: todayIso, key: 'ytd' as const }
  }
  if (token === 'mtd') {
    return { dateFrom: `${yyyy}-${mm}-01`, dateTo: todayIso, key: 'mtd' as const }
  }
  if (token && /^\d{4}$/.test(token)) {
    return {
      dateFrom: `${token}-01-01`,
      dateTo: `${token}-12-31`,
      key: 'year' as const,
      year: token,
    }
  }
  return { dateFrom: undefined, dateTo: undefined, key: 'all' as const }
}

function CustomMonthlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any[]
  label?: string | number
}) {
  const { t, lang } = useTranslation()
  const isEn = lang === 'en'
  if (!active || !payload || !payload.length) return null
  const item = payload[0]?.payload
  if (!item) return null

  const dateRange = item?.dateRange
  const title = dateRange
    ? `${label} (${dateRange})`
    : t('attendanceStats.monthLabel', { label: String(label) })

  const hadir = item.hadir ?? 0
  const byVn = item.byVn ?? 0
  const izin = item.izin ?? 0
  const total = item.sessions ?? (hadir + byVn + izin)
  const hours = item.hours ?? 0

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-sm z-50 min-w-[145px]">
      <p className="font-bold text-slate-200 mb-1.5 border-b border-slate-700/60 pb-1">
        {title}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-[#22c55e] inline-block shrink-0" />
            {isEn ? 'Present' : 'Hadir'}:
          </span>
          <span className="font-bold text-slate-100 font-mono">
            {hadir.toLocaleString(isEn ? 'en-US' : 'id-ID')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-[#0284c7] inline-block shrink-0" />
            {isEn ? 'By VN' : 'By VN'}:
          </span>
          <span className="font-bold text-slate-100 font-mono">
            {byVn.toLocaleString(isEn ? 'en-US' : 'id-ID')}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-[#f59e0b] inline-block shrink-0" />
            {isEn ? 'Excused' : 'Izin'}:
          </span>
          <span className="font-bold text-slate-100 font-mono">
            {izin.toLocaleString(isEn ? 'en-US' : 'id-ID')}
          </span>
        </div>
        <div className="border-t border-slate-700/60 pt-1 mt-1 flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-300">
            {t('attendanceStats.sessionsTooltip')}:
          </span>
          <span className="font-bold text-indigo-400 font-mono">
            {total.toLocaleString(isEn ? 'en-US' : 'id-ID')}
          </span>
        </div>
        {hours > 0 && (
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <span className="text-slate-400">
              {t('attendanceStats.hoursTooltip')}:
            </span>
            <span className="font-bold text-slate-100 font-mono">
              {t('attendanceStats.hoursUnit', { n: Number(hours).toFixed(1) })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatMonthTick(mStr: string, isEn?: boolean) {
  try {
    if (!mStr || typeof mStr !== 'string') return ''
    if (mStr.startsWith('Minggu') || mStr.startsWith('Week') || mStr.startsWith('M')) {
      return mStr
    }
    const parts = mStr.split('-')
    if (parts.length === 2) {
      const yrShort = parts[0].slice(-2)
      const moIdx = parseInt(parts[1], 10) - 1
      const months = isEn
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const mo = months[moIdx] || parts[1]
      return `${mo} '${yrShort}`
    }
    return mStr
  } catch {
    return mStr
  }
}

function getStackedBarPath(x: number, y: number, width: number, height: number, isTop: boolean, r = 3) {
  if (height <= 0 || width <= 0) return ''
  if (!isTop) {
    return `M ${x},${y + height} L ${x},${y} L ${x + width},${y} L ${x + width},${y + height} Z`
  }
  const radius = Math.min(r, width / 2, height)
  return `M ${x},${y + height} L ${x},${y + radius} Q ${x},${y} ${x + radius},${y} L ${x + width - radius},${y} Q ${x + width},${y} ${x + width},${y + radius} L ${x + width},${y + height} Z`
}

const renderHadirBar = (props: any) => {
  const { x, y, width, height, payload } = props
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || height <= 0) return <g />
  const isTop = (!payload?.byVn || payload.byVn === 0) && (!payload?.izin || payload.izin === 0)
  const d = getStackedBarPath(x, y, width, height, isTop, 3)
  return <path d={d} fill="#22c55e" className="transition-all duration-200" />
}

const renderByVnBar = (props: any) => {
  const { x, y, width, height, payload } = props
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || height <= 0) return <g />
  const isTop = !payload?.izin || payload.izin === 0
  const d = getStackedBarPath(x, y, width, height, isTop, 3)
  return <path d={d} fill="#0284c7" className="transition-all duration-200" />
}

const renderIzinBar = (props: any) => {
  const { x, y, width, height } = props
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || height <= 0) return <g />
  const d = getStackedBarPath(x, y, width, height, true, 3)
  return <path d={d} fill="#f59e0b" className="transition-all duration-200" />
}

function PortalMonthlyChart({
  data,
  rangeToken = 'all',
  weeklyData,
  sessions,
}: {
  data: MonthlyBucket[]
  rangeToken?: string
  weeklyData?: WeeklyBucket[]
  sessions?: Attendance[]
}) {
  const { t, lang } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  const isEn = lang === 'en'
  const isMtd = rangeToken === 'mtd'

  const chartData = useMemo(() => {
    // Map raw sessions by month (YYYY-MM) and week for fallback
    const sessionsByMonth = new Map<string, { sessions: number; hours: number; hadir: number; byVn: number; izin: number }>()
    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        if (!s.date) continue
        const ym = s.date.slice(0, 7)
        const curr = sessionsByMonth.get(ym) || { sessions: 0, hours: 0, hadir: 0, byVn: 0, izin: 0 }
        curr.sessions += 1
        curr.hours += (s.durationMin || 0) / 60
        if (s.status === 'hadir') curr.hadir += 1
        else if (s.status === 'by_vn') curr.byVn += 1
        else if (s.status === 'izin_murid' || s.status === 'izin_guru' || s.status === 'izin' || s.status === 'excused') curr.izin += 1
        else curr.hadir += 1
        sessionsByMonth.set(ym, curr)
      }
    }

    if (rangeToken === 'mtd') {
      const now = new Date()
      const year = now.getFullYear()
      const monthIdx = now.getMonth()
      const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
      const monthShortNames = isEn
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      const monthName = monthShortNames[monthIdx] || ''
      const weekPrefix = isEn ? 'Week' : 'Minggu'

      const weekDefs = [
        { code: 'w1', label: `${weekPrefix} 1`, dateRange: `1 - 7 ${monthName}` },
        { code: 'w2', label: `${weekPrefix} 2`, dateRange: `8 - 14 ${monthName}` },
        { code: 'w3', label: `${weekPrefix} 3`, dateRange: `15 - 21 ${monthName}` },
        { code: 'w4', label: `${weekPrefix} 4`, dateRange: `22 - 28 ${monthName}` },
      ]
      if (daysInMonth > 28) {
        weekDefs.push({
          code: 'w5',
          label: `${weekPrefix} 5`,
          dateRange: `29 - ${daysInMonth} ${monthName}`,
        })
      }

      const backendMap = new Map((weeklyData ?? []).map((w) => [w.week.toLowerCase(), w]))
      const sessionsMap = new Map<string, { sessions: number; hours: number; hadir: number; byVn: number; izin: number }>()
      if (sessions && sessions.length > 0) {
        for (const s of sessions) {
          const day = parseInt((s.date || '').slice(8, 10), 10)
          if (!day) continue
          let code = 'w5'
          if (day <= 7) code = 'w1'
          else if (day <= 14) code = 'w2'
          else if (day <= 21) code = 'w3'
          else if (day <= 28) code = 'w4'
          const curr = sessionsMap.get(code) || { sessions: 0, hours: 0, hadir: 0, byVn: 0, izin: 0 }
          curr.sessions += 1
          curr.hours += (s.durationMin || 0) / 60
          if (s.status === 'hadir') curr.hadir += 1
          else if (s.status === 'by_vn') curr.byVn += 1
          else if (s.status === 'izin_murid' || s.status === 'izin_guru' || s.status === 'izin' || s.status === 'excused') curr.izin += 1
          else curr.hadir += 1
          sessionsMap.set(code, curr)
        }
      }

      return weekDefs.map((def) => {
        const fromBackend = backendMap.get(def.code)
        const fromSessions = sessionsMap.get(def.code)
        const sessionsCount = fromBackend ? fromBackend.sessions : (fromSessions?.sessions ?? 0)
        const hoursCount = fromBackend ? fromBackend.hours : (fromSessions?.hours ?? 0)
        const hadirCount = fromBackend?.hadir !== undefined ? fromBackend.hadir : (fromSessions?.hadir ?? 0)
        const byVnCount = fromBackend?.byVn !== undefined ? fromBackend.byVn : (fromSessions?.byVn ?? 0)
        const izinCount = fromBackend?.izin !== undefined ? fromBackend.izin : (fromSessions?.izin ?? 0)
        return {
          month: def.label,
          label: def.label,
          dateRange: def.dateRange,
          sessions: sessionsCount,
          hours: hoursCount,
          hadir: hadirCount,
          byVn: byVnCount,
          izin: izinCount,
        }
      })
    }

    const backendMonthMap = new Map(data.map((d) => [d.month, d]))
    const resolveMonthBucket = (mStr: string) => {
      const fromBackend = backendMonthMap.get(mStr)
      const fromSessions = sessionsByMonth.get(mStr)
      const sessionsCount = fromBackend ? fromBackend.sessions : (fromSessions?.sessions ?? 0)
      const hoursCount = fromBackend ? fromBackend.hours : (fromSessions?.hours ?? 0)
      const hadirCount = fromBackend?.hadir !== undefined ? fromBackend.hadir : (fromSessions?.hadir ?? (sessionsCount > 0 ? sessionsCount : 0))
      const byVnCount = fromBackend?.byVn !== undefined ? fromBackend.byVn : (fromSessions?.byVn ?? 0)
      const izinCount = fromBackend?.izin !== undefined ? fromBackend.izin : (fromSessions?.izin ?? 0)
      return {
        month: mStr,
        sessions: sessionsCount,
        hours: hoursCount,
        hadir: hadirCount,
        byVn: byVnCount,
        izin: izinCount,
      }
    }

    if (/^\d{4}$/.test(rangeToken)) {
      const year = rangeToken
      const result = []
      for (let m = 1; m <= 12; m++) {
        const mStr = `${year}-${String(m).padStart(2, '0')}`
        result.push(resolveMonthBucket(mStr))
      }
      return result
    }
    if (rangeToken === 'ytd') {
      const now = new Date()
      const year = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      const result = []
      for (let m = 1; m <= currentMonth; m++) {
        const mStr = `${year}-${String(m).padStart(2, '0')}`
        result.push(resolveMonthBucket(mStr))
      }
      return result
    }
    if (rangeToken === 'all') {
      if (data.length === 0) return []
      const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month))
      let startMonth = sorted[0]?.month
      let endMonth = sorted[sorted.length - 1]?.month

      // If data only covers 1 month, expand to the full 12 months of that year
      // so the chart renders a continuous timeline instead of a single isolated bar
      if (startMonth === endMonth) {
        const [yr] = startMonth.split('-')
        startMonth = `${yr}-01`
        endMonth = `${yr}-12`
      }

      const [startYear, startM] = startMonth.split('-').map(Number)
      const [endYear, endM] = endMonth.split('-').map(Number)

      const result = []
      let curY = startYear
      let curM = startM
      while (curY < endYear || (curY === endYear && curM <= endM)) {
        const mStr = `${curY}-${String(curM).padStart(2, '0')}`
        result.push(resolveMonthBucket(mStr))
        curM++
        if (curM > 12) {
          curM = 1
          curY++
        }
      }
      return result
    }
    return data.map((d) => resolveMonthBucket(d.month))
  }, [data, rangeToken, weeklyData, sessions, isEn])

  // Auto-scroll to latest month on initial mount & data change
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const scrollToLatest = () => {
      el.scrollLeft = el.scrollWidth - el.clientWidth
    }
    scrollToLatest()
    const timer = setTimeout(scrollToLatest, 60)
    return () => clearTimeout(timer)
  }, [chartData])

  const totalSessions = chartData.reduce((acc, d) => acc + d.sessions, 0)

  const { yMax, yTicks } = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.sessions), 0)
    let upper = maxVal === 0 ? 4 : Math.ceil(maxVal * 1.15)
    if (upper < 4) upper = 4
    const step = Math.ceil(upper / 4)
    const finalMax = step * 4
    const ticks = [0, step, step * 2, step * 3, finalMax]
    return { yMax: finalMax, yTicks: ticks }
  }, [chartData])

  if (chartData.length === 0 || (rangeToken === 'all' && totalSessions === 0)) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-slate-500">
        {t('attendanceStats.monthlyEmpty')}
      </div>
    )
  }

  const Y_AXIS_WIDTH = 32
  // Calculate dynamic width for smooth horizontal scrolling:
  // For MTD with 4-5 items, fill 100% cleanly; for other ranges each data point gets 52px.
  const calculatedWidth = isMtd ? '100%' : Math.max(chartData.length * 52, 0)

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="relative w-full min-w-0 max-w-full h-[230px]">
        {/* 1. Stationary Base: Fixed Y-Axis & Horizontal Grid Lines spanning 100% of the card */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 12, bottom: 24, left: 0 }}
            >
              <CartesianGrid
                stroke="#e2e8f0"
                strokeDasharray="3 3"
                className="stroke-slate-200 dark:stroke-slate-800"
                vertical={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                allowDecimals={false}
                width={Y_AXIS_WIDTH}
                domain={[0, yMax]}
                ticks={yTicks}
                tickMargin={3}
                axisLine={false}
                className="dark:[&_text]:fill-slate-400"
              />
              <XAxis dataKey="month" hide height={0} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Scrollable Foreground: Stacked Bars, X-Axis dates, and Tooltip */}
        <div
          ref={scrollRef}
          className="absolute top-0 bottom-0 right-0 overflow-x-auto overflow-y-hidden custom-scrollbar touch-pan-x z-10 border-l border-slate-200 dark:border-slate-800"
          style={{
            left: Y_AXIS_WIDTH,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div style={{ width: calculatedWidth, minWidth: '100%', height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 12, right: isMtd ? 20 : 12, bottom: 0, left: isMtd ? 10 : 0 }}
              >
                <YAxis
                  hide
                  width={0}
                  domain={[0, yMax]}
                  ticks={yTicks}
                />
                <XAxis
                  dataKey="month"
                  height={24}
                  stroke="#64748b"
                  fontSize={10}
                  tickMargin={4}
                  interval={0}
                  tickFormatter={(val) => formatMonthTick(val, isEn)}
                  axisLine={{ stroke: '#cbd5e1' }}
                  className="dark:[&_line]:stroke-slate-700 dark:[&_text]:fill-slate-400"
                />
                <Tooltip content={<CustomMonthlyTooltip />} />
                <Bar
                  dataKey="hadir"
                  name={isEn ? 'Present' : 'Hadir'}
                  stackId="sessionStack"
                  fill="#22c55e"
                  shape={renderHadirBar}
                  maxBarSize={isMtd ? 36 : 28}
                />
                <Bar
                  dataKey="byVn"
                  name={isEn ? 'By VN' : 'By VN'}
                  stackId="sessionStack"
                  fill="#0284c7"
                  shape={renderByVnBar}
                  maxBarSize={isMtd ? 36 : 28}
                />
                <Bar
                  dataKey="izin"
                  name={isEn ? 'Excused' : 'Izin'}
                  stackId="sessionStack"
                  fill="#f59e0b"
                  shape={renderIzinBar}
                  maxBarSize={isMtd ? 36 : 28}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Legend below the stacked bar chart */}
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#22c55e]" />
          {isEn ? 'Present' : 'Hadir'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#0284c7]" />
          {isEn ? 'By VN' : 'By VN'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#f59e0b]" />
          {isEn ? 'Excused' : 'Izin'}
        </span>
      </div>
    </div>
  )
}

function CustomDonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: any[]
  total: number
}) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0]
  const val = Number(item.value || 0)
  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0'
  const key = (item.payload?.key || 'hadir') as AttendanceStatus
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-sm z-50">
      <div className="flex items-center gap-2 font-semibold">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: STATUS_COLORS[key] || '#6366f1' }}
        />
        <span className="text-slate-100">{item.name}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 font-mono text-slate-300">
        <span>{val.toLocaleString('id-ID')} sesi</span>
        <span className="font-bold text-emerald-400">({pct}%)</span>
      </div>
    </div>
  )
}

function PortalStatusDonut({
  buckets,
  total,
}: {
  buckets: { label: string; count: number }[]
  total: number
}) {
  const { t } = useTranslation()
  const statusLabel = useAttendanceStatusLabel()
  const data = buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      name: statusLabel(b.label, b.label),
      key: b.label as AttendanceStatus,
      value: b.count,
    }))
  if (data.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-slate-500">
        {t('attendanceStats.monthlyEmpty')}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={72}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLORS[d.key] || '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip content={<CustomDonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {buckets.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[b.label as AttendanceStatus] || '#94a3b8' }}
            />
            <span className="truncate font-medium text-slate-600 dark:text-slate-300">
              {statusLabel(b.label, b.label)}:
            </span>
            <span className="ml-auto font-bold text-slate-900 dark:text-slate-100">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* =========================================================================
   4. VIEW 3: Dashboard Report (Material Assessment Report & Activity History)
   ========================================================================= */

function PortalDashboardReportView({
  user,
  onGoSessionActivity,
}: {
  user: ReturnType<typeof useMe>['data']
  onGoSessionActivity: () => void
}) {
  const { t, lang } = useTranslation()
  const statusLabel = useAttendanceStatusLabel()
  const [rangeToken, setRangeToken] = useState<string>('all')
  const [scope, setScope] = useState<'my' | 'all'>('my')
  const [selectedStudentId, setSelectedStudentId] = useState<string>('')
  const [adminTeacherId, setAdminTeacherId] = useState<string>('')
  const [exportPdfOpen, setExportPdfOpen] = useState(false)

  // Fetch teachers for resolving teacher ID
  const { data: teachersData } = useQuery({
    queryKey: ['teachers', 'portal-guru-report'],
    queryFn: () => listTeachers({ status: 'active', limit: 200 }),
    staleTime: 5 * 60_000,
  })

  // Derive teacher ID from current logged in user
  const matchedTeacher = useMemo(() => {
    const items = teachersData?.items ?? []
    if (!user || items.length === 0) return null
    return (
      items.find(
        (tc) =>
          tc.name.toLowerCase() === (user.name || '').toLowerCase() ||
          (tc.nickname && tc.nickname.toLowerCase() === (user.username || '').toLowerCase()),
      ) || null
    )
  }, [user, teachersData])

  const teacherId = useMemo(() => {
    if (user?.role === 'admin') {
      return adminTeacherId
    }
    return matchedTeacher ? matchedTeacher.id : ''
  }, [user, adminTeacherId, matchedTeacher])

  const effectiveTeacherId = selectedStudentId
    ? undefined
    : (scope === 'my' && teacherId ? teacherId : undefined)

  const resolvedRange = useMemo(() => resolveRange(rangeToken), [rangeToken])

  // Fetch attendance analytics stats
  const { data: attendanceStats, isLoading: statsLoading } = useQuery({
    queryKey: [
      'stats',
      'attendance',
      effectiveTeacherId || 'all',
      selectedStudentId || 'all',
      resolvedRange.dateFrom ?? null,
      resolvedRange.dateTo ?? null,
    ],
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      getAttendanceStats({
        dateFrom: resolvedRange.dateFrom,
        dateTo: resolvedRange.dateTo,
        teacherId: effectiveTeacherId,
        studentId: selectedStudentId || undefined,
      }),
    staleTime: 60_000,
  })

  // Fetch recent attendances / report for this teacher
  const { data: recentSessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: [
      'attendances',
      'portal-guru-recent',
      effectiveTeacherId || 'all',
      selectedStudentId || 'all',
      resolvedRange.dateFrom ?? null,
      resolvedRange.dateTo ?? null,
    ],
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      listAttendances({
        teacherId: effectiveTeacherId,
        studentId: selectedStudentId || undefined,
        dateFrom: resolvedRange.dateFrom,
        dateTo: resolvedRange.dateTo,
        limit: 500,
      }),
  })

  // Fetch active students for filter dropdown
  const { data: studentsData } = useQuery({
    queryKey: ['students', 'portal-guru-report-students'],
    queryFn: () => listStudents({ status: 'active', limit: 500 }),
    staleTime: 5 * 60_000,
  })

  // Fetch attendances for effective teacher to determine taught students
  const { data: teacherAttendancesData } = useQuery({
    queryKey: ['attendances', 'teacher-taught-report', teacherId],
    queryFn: () => listAttendances({ teacherId, limit: 500 }),
    enabled: !!teacherId,
  })

  // Fetch explicitly assigned students for this teacher
  const { data: assignedStudentsData } = useQuery({
    queryKey: ['teacher-students-report', teacherId],
    queryFn: () => getStudentsForTeacher(teacherId),
    enabled: !!teacherId,
  })

  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const s of assignedStudentsData ?? []) {
      if (s.id) set.add(s.id)
    }
    return set
  }, [assignedStudentsData])

  const taughtStudentIds = useMemo(() => {
    const set = new Set<string>()
    for (const a of teacherAttendancesData?.items ?? []) {
      if (a.studentId) set.add(a.studentId)
    }
    return set
  }, [teacherAttendancesData])

  const selectedTeacherObj = useMemo(() => {
    if (!teacherId) return null
    return teachersData?.items.find((tc) => tc.id === teacherId) || null
  }, [teachersData, teacherId])

  const teacherKelompok = selectedTeacherObj?.kelompok?.trim() || ''

  const allStudents = studentsData?.items ?? []
  const recentSessions = recentSessionsData?.items ?? []

  const displayedStudents = useMemo(() => {
    if (scope === 'my' && teacherId) {
      const filtered = allStudents.filter((s) => {
        if (assignedStudentIds.has(s.id)) return true
        if (taughtStudentIds.has(s.id)) return true
        if (
          teacherKelompok &&
          s.kelompok &&
          s.kelompok.toLowerCase() === teacherKelompok.toLowerCase()
        ) {
          return true
        }
        return false
      })
      return filtered.length > 0 ? filtered : allStudents
    }
    return allStudents
  }, [scope, teacherId, taughtStudentIds, teacherKelompok, allStudents])

  // Stats calculation
  const stats = useMemo(() => {
    const totalSessions = attendanceStats?.total.sessions ?? recentSessions.length
    const totalHours = attendanceStats?.total.hours
      ? attendanceStats.total.hours.toFixed(1)
      : (recentSessions.reduce((acc, s) => acc + (s.durationMin || 0), 0) / 60).toFixed(1)
    const uniqueStudents = scope === 'my'
      ? new Set(recentSessions.map((s) => s.studentId)).size
      : (attendanceStats?.byStudent.length ?? new Set(recentSessions.map((s) => s.studentId)).size)
    const hadirCount =
      attendanceStats?.byStatus.find((b) => b.label === 'hadir')?.count ??
      recentSessions.filter((s) => s.status === 'hadir').length
    const attendanceRate = totalSessions > 0 ? Math.round((hadirCount / totalSessions) * 100) : 0
    return {
      totalSessions,
      totalHours,
      uniqueStudents,
      attendanceRate,
    }
  }, [attendanceStats, recentSessions, scope])

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Summary Metric Cards: 2 Columns & 2 Rows on Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-400">
            <BookOpen size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate">
              {t('portalGuru.statTotalSessions')}
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {stats.totalSessions}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-400">
            <Clock size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate">
              {t('portalGuru.statTotalHours')}
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {stats.totalHours} <span className="text-[11px] sm:text-xs font-normal text-slate-500">{t('portalGuru.hoursUnit')}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-400">
            <Users size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate">
              {t('portalGuru.statTaughtStudents')}
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {stats.uniqueStudents} <span className="text-[11px] sm:text-xs font-normal text-slate-500">{t('portalGuru.peopleUnit')}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-400">
            <CheckCircle2 size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate">
              {t('portalGuru.statAttendanceRate')}
            </span>
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {stats.attendanceRate}%
          </p>
        </div>
      </div>

      {/* Attendance Analytics Charts */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 w-full lg:w-auto min-w-0 flex-wrap sm:flex-nowrap">
            {/* Scope Switcher */}
            <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setScope('my')
                  setSelectedStudentId('')
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  scope === 'my'
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {t('portalGuru.filterMyStudents')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('all')
                  setSelectedStudentId('')
                }}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                  scope === 'all'
                    ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                )}
              >
                {t('common.all')}
              </button>
            </div>

            {/* Admin: Teacher Filter Dropdown */}
            {user?.role === 'admin' && (
              <select
                value={adminTeacherId}
                onChange={(e) => {
                  setAdminTeacherId(e.target.value)
                  setSelectedStudentId('')
                }}
                className="h-8 min-w-0 w-36 sm:w-44 truncate rounded-xl border border-slate-200 bg-white px-2.5 text-base sm:text-xs font-medium text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
                aria-label="Filter Pengajar"
              >
                <option value="">Semua Pengajar</option>
                {teachersData?.items.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {tc.name} {tc.kelompok ? `(${tc.kelompok})` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Student Dropdown (Inline with Switch) */}
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="h-8 min-w-0 flex-1 lg:w-48 lg:flex-initial truncate rounded-xl border border-slate-200 bg-white px-2.5 text-base sm:text-xs font-medium text-slate-800 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <option value="">{t('portalGuru.allStudents')}</option>
              {displayedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.kelompok ? `(${s.kelompok})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Range pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full pb-1 -mx-1 px-1 flex-nowrap shrink-0">
            {[
              { token: 'all', label: t('attendanceStats.rangeAll') },
              { token: 'mtd', label: t('attendanceStats.rangeMtd') },
              { token: 'ytd', label: t('attendanceStats.rangeYtd') },
              ...(attendanceStats?.availableYears ?? []).map((y) => ({
                token: String(y),
                label: String(y),
              })),
            ].map((opt) => (
              <button
                key={opt.token}
                type="button"
                onClick={() => setRangeToken(opt.token)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition border shrink-0 whitespace-nowrap',
                  opt.token === rangeToken
                    ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 min-w-0 max-w-full">
          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 pb-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-2 flex flex-col justify-between">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {rangeToken === 'mtd' ? t('portalGuru.chartWeeklyTitle') : t('attendanceStats.monthly')}
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {rangeToken === 'mtd'
                    ? t('portalGuru.chartWeeklySubtitle')
                    : rangeToken === 'all'
                    ? (lang === 'en' ? 'All monthly history (scroll horizontally)' : 'Semua riwayat bulanan (geser ke samping)')
                    : (lang === 'en' ? `Year ${rangeToken}` : `Tahun ${rangeToken}`)}
                </p>
              </div>
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                {stats.totalSessions} {lang === 'en' ? 'sessions' : 'sesi'}
              </span>
            </div>
            {statsLoading ? (
              <div className="flex h-60 items-center justify-center text-sm text-slate-400">
                {t('common.loading')}
              </div>
            ) : (
              <PortalMonthlyChart
                data={attendanceStats?.monthly ?? []}
                weeklyData={attendanceStats?.weekly}
                sessions={recentSessions}
                rangeToken={rangeToken}
              />
            )}
          </div>

          <div className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h4 className="mb-3 text-sm font-bold text-slate-800 dark:text-slate-200">
              {t('attendanceStats.distribution')}
            </h4>
            {statsLoading ? (
              <div className="flex h-60 items-center justify-center text-sm text-slate-400">
                {t('common.loading')}
              </div>
            ) : (
              <PortalStatusDonut
                buckets={attendanceStats?.byStatus ?? []}
                total={attendanceStats?.total.sessions ?? 0}
              />
            )}
          </div>
        </div>
      </div>

      {/* Session History Table Container */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {t('portalGuru.sessionHistoryTitle')}
            </h3>
            {recentSessions.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {recentSessions.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportPdfOpen(true)}
              className="gap-1.5 rounded-xl border-indigo-500/40 text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
            >
              <Download size={14} /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onGoSessionActivity}
              className="gap-1.5 rounded-xl border-emerald-500/40 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
            >
              <Plus size={14} /> {t('portalGuru.recordNewSessionBtn')}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {sessionsLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">{t('common.loading')}</div>
          ) : recentSessions.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">{t('portalGuru.noRecentSessions')}</div>
          ) : (
            <div className="max-h-[440px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs text-xs font-semibold uppercase tracking-wider text-slate-500 shadow-xs dark:border-slate-800 dark:bg-slate-800/95 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5 whitespace-nowrap">{t('portalGuru.colDateTime')}</th>
                    <th className="px-6 py-3.5 whitespace-nowrap">{t('portalGuru.colStudent')}</th>
                    <th className="px-6 py-3.5 whitespace-nowrap">{t('portalGuru.colDuration')}</th>
                    <th className="px-6 py-3.5 whitespace-nowrap">{t('portalGuru.colStatus')}</th>
                    <th className="px-6 py-3.5 whitespace-nowrap">{t('portalGuru.colMaterial')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentSessions.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap font-mono text-xs">
                        {att.date ? att.date.replace(/T00:00:00.*$/, '').replace(/ 00:00:00.*$/, '').slice(0, 10) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {att.studentName}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {att.durationMin ? `${att.durationMin} ${t('portalGuru.minUnit')}` : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                            att.status === 'hadir'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : att.status === 'by_vn'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
                          )}
                        >
                          {statusLabel(att.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md">
                        {att.materi ? (
                          <p className="line-clamp-2 text-xs">{att.materi}</p>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {exportPdfOpen && (
        <ExportSessionPdfModal
          open={exportPdfOpen}
          onClose={() => setExportPdfOpen(false)}
          students={displayedStudents}
          defaultStudentId={selectedStudentId}
          teacherId={effectiveTeacherId}
          teacherName={selectedTeacherObj?.name || user?.name}
        />
      )}
    </div>
  )
}

function ExportSessionPdfModal({
  open,
  onClose,
  students,
  defaultStudentId,
  teacherId,
  teacherName,
}: {
  open: boolean
  onClose: () => void
  students: Student[]
  defaultStudentId?: string
  teacherId?: string
  teacherName?: string
}) {
  const { t } = useTranslation()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const oneMonthAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }, [])

  const [studentId, setStudentId] = useState(defaultStudentId || '')
  const [dateFrom, setDateFrom] = useState(oneMonthAgo)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStudentId(defaultStudentId || '')
      setDateFrom(oneMonthAgo)
      setDateTo(today)
      setError(null)
      setLoading(false)
    }
  }, [open, defaultStudentId, oneMonthAgo, today])

  const setPresetRange = (preset: '30d' | 'mtd' | 'ytd' | 'all') => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    setDateTo(todayStr)
    if (preset === '30d') {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      setDateFrom(d.toISOString().slice(0, 10))
    } else if (preset === 'mtd') {
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      setDateFrom(`${y}-${m}-01`)
    } else if (preset === 'ytd') {
      const y = now.getFullYear()
      setDateFrom(`${y}-01-01`)
    } else if (preset === 'all') {
      setDateFrom('2020-01-01')
    }
  }

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      setError('Rentang tanggal awal dan akhir wajib diisi')
      return
    }
    if (dateFrom > dateTo) {
      setError('Tanggal awal tidak boleh melebihi tanggal akhir')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [sessionsRes, statsRes] = await Promise.all([
        listAttendances({
          teacherId,
          studentId: studentId || undefined,
          dateFrom,
          dateTo,
          limit: 500,
        }),
        getAttendanceStats({
          teacherId,
          studentId: studentId || undefined,
          dateFrom,
          dateTo,
        }),
      ])

      const selStudent = studentId ? students.find((s) => s.id === studentId) || null : null

      const reportParams = {
        student: selStudent,
        teacherName,
        dateFrom,
        dateTo,
        sessions: sessionsRes.items || [],
        stats: statsRes,
      }

      printSessionReport(reportParams)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyiapkan dokumen PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Laporan Sesi" size="md">
      <form onSubmit={(e) => { e.preventDefault(); handleExport() }} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Dropdown Murid */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Pilihan Murid / Generus
          </label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <option value="">Semua Murid (Semua Generus)</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.kelompok ? `(${s.kelompok})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Pilih murid tertentu atau tampilkan rekapitulasi seluruh murid
          </p>
        </div>

        {/* Rentang Waktu */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Rentang Waktu Laporan
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            <button
              type="button"
              onClick={() => setPresetRange('30d')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              30 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('mtd')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('ytd')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              Tahun Ini (YTD)
            </button>
            <button
              type="button"
              onClick={() => setPresetRange('all')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              Semua Periode
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[11px] text-slate-500 mb-1">Dari Tanggal</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                required
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div>
              <span className="block text-[11px] text-slate-500 mb-1">Sampai Tanggal</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                required
                className="h-9 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Menyiapkan Dokumen...</span>
              </>
            ) : (
              <>
                <Printer size={14} />
                <span>Cetak / Simpan PDF</span>
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* =========================================================================
   5. Teacher Session Modal (Used by Session Activity Form)
   ========================================================================= */

function TeacherSessionModal({
  student,
  teacherId,
  open,
  onClose,
  onSuccess,
}: {
  student: Student
  teacherId: string
  open: boolean
  onClose: () => void
  onSuccess: (data: {
    date: string
    status: AttendanceStatus
    durationMin: string
    materi: string
  }) => void
}) {
  const { t } = useTranslation()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [date, setDate] = useState(today)
  const [durationMin, setDurationMin] = useState('')
  const [status, setStatus] = useState<AttendanceStatus>('hadir')
  const [materi, setMateri] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isExcused = status === 'izin_murid' || status === 'izin_guru'

  const handleStatusChange = (newStatus: AttendanceStatus) => {
    setStatus(newStatus)
    if (newStatus === 'izin_murid' || newStatus === 'izin_guru') {
      setDurationMin('1')
    } else if (durationMin === '1') {
      setDurationMin('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!date) {
      setError(t('validation.requiredDate'))
      return
    }
    if (!status) {
      setError(t('validation.requiredStatus'))
      return
    }
    let finalDuration = 1
    if (isExcused) {
      finalDuration = 1
    } else {
      const parsed = parseInt(durationMin, 10)
      if (!durationMin || isNaN(parsed) || parsed < 1) {
        setError(t('validation.requiredDuration'))
        return
      }
      finalDuration = parsed
    }
    setError(null)
    setLoading(true)

    try {
      await createAttendance({
        date,
        durationMin: finalDuration,
        teacherId: teacherId || '',
        studentId: student.id,
        status,
        materi: materi.trim() || undefined,
      })
      onSuccess({
        date,
        status,
        durationMin: isExcused ? '1' : durationMin,
        materi,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('settings.saveError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('portalGuru.inputSessionFor', { name: student.name })}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4 items-start">
          {/* Left Column: Student Foto, Nama, Identitas (Widened & Styled) */}
          <div className="flex flex-row sm:flex-col items-center sm:items-center text-left sm:text-center p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 gap-3.5 sm:gap-3">
            <Avatar name={student.name} className="h-16 w-16 sm:h-20 sm:w-20 text-xl sm:text-2xl shadow-sm shrink-0" />
            <div className="min-w-0 flex-1 sm:w-full">
              <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 line-clamp-2">
                {student.name}
              </h4>
              <div className="mt-1 flex flex-wrap items-center sm:justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-md bg-slate-200/70 px-2 py-0.5 dark:bg-slate-800 dark:text-slate-300 font-medium">
                  {student.level}
                </span>
                {student.kelompok && (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {formatKelompokTag(student.kelompok)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Date, Status, Duration inline, then Material directly below */}
          <div className="space-y-3 min-w-0">
            {/* Inline 3 Columns: Date, Status, Duration (compact) */}
            <div className="grid grid-cols-[1fr_0.9fr_92px] sm:grid-cols-[1.1fr_1.1fr_100px] gap-2 items-start [&_label]:text-xs sm:[&_label]:text-sm [&_label]:whitespace-nowrap [&_label]:truncate">
              <Field label={t('portalGuru.sessionDate')}>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="rounded-xl h-10 text-base sm:text-sm px-2"
                />
              </Field>

              <Field label={t('portalGuru.sessionStatus')}>
                <select
                  value={status}
                  required
                  onChange={(e) => handleStatusChange(e.target.value as AttendanceStatus)}
                  className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 truncate"
                >
                  <option value="hadir">{t('attendanceStatus.hadir')}</option>
                  <option value="izin_murid">{t('attendanceStatus.izin_murid')}</option>
                  <option value="izin_guru">{t('attendanceStatus.izin_guru')}</option>
                  <option value="by_vn">{t('attendanceStatus.by_vn')}</option>
                </select>
              </Field>

              <Field label={t('portalGuru.sessionDuration')}>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  required
                  value={isExcused ? '1' : durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  disabled={isExcused}
                  placeholder="60"
                  className={cn(
                    'rounded-xl h-10 text-base sm:text-sm px-2 text-center w-full',
                    isExcused && 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-75 font-semibold',
                  )}
                />
              </Field>
            </div>

            {/* Material directly underneath Date, Status, Duration */}
            <Field label={t('portalGuru.sessionMaterial')}>
              <textarea
                rows={4}
                value={materi}
                onChange={(e) => setMateri(e.target.value)}
                placeholder={t('portalGuru.sessionMaterialPlaceholder')}
                className="flex w-full rounded-xl border border-slate-300 bg-white p-3 text-base sm:text-sm text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="rounded-xl">
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            {loading ? t('portalGuru.submittingSession') : t('portalGuru.submitSession')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* =========================================================================
   6. Session Report Preview Modal (WhatsApp Share)
   ========================================================================= */

type SessionReportData = {
  student: Student
  studentLabel: string
  teacherLabel: string
  date: string
  durationMin: string
  status: AttendanceStatus
  materi: string
}

function formatDurationHM(minStr?: string | number): string {
  const m = typeof minStr === 'string' ? parseInt(minStr, 10) : Number(minStr || 0)
  if (isNaN(m) || m <= 0) return '00:00'
  const h = Math.floor(m / 60)
  const rem = m % 60
  return `${String(h).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
}

function getStatusUpper(status: AttendanceStatus): string {
  switch (status) {
    case 'hadir':
      return 'HADIR'
    case 'izin_murid':
      return 'IZIN MURID'
    case 'izin_guru':
      return 'IZIN GURU'
    case 'by_vn':
      return 'BY VN'
    default:
      return String(status).toUpperCase()
  }
}

function generateReportText(data: SessionReportData): string {
  const dur = formatDurationHM(data.durationMin)
  const st = getStatusUpper(data.status)
  const materiTrimmed = data.materi.trim() || '-'

  return `=====================
LAPORAN PENGAJIAN PPG
=====================

● Murid     : ${data.studentLabel}
● Tanggal   : ${data.date}
● Guru      : ${data.teacherLabel}
● Durasi    : ${dur}
● Kehadiran : ${st}

● Materi:
${materiTrimmed}


الحمدلله جزاكم الله خيرا`
}

function SessionReportModal({
  open,
  data,
  onClose,
}: {
  open: boolean
  data: SessionReportData | null
  onClose: () => void
}) {
  const [reportText, setReportText] = useState('')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    if (data) {
      setReportText(generateReportText(data))
      setCopied(false)
      setIsEditing(false)
    }
  }, [data])

  if (!data) return null

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(reportText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSendWA = () => {
    const encoded = encodeURIComponent(reportText)
    const rawParentPhone = data.student.parentPhone?.replace(/\D/g, '') || ''
    let waUrl = `https://api.whatsapp.com/send?text=${encoded}`
    if (rawParentPhone.length >= 9) {
      let intlPhone = rawParentPhone
      if (typeof intlPhone === 'string' && intlPhone.startsWith('0')) {
        intlPhone = '62' + intlPhone.slice(1)
      }
      waUrl = `https://wa.me/${intlPhone}?text=${encoded}`
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preview Laporan Pengajian"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              <CheckCircle2 size={13} />
              Sesi Berhasil Disimpan
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {data.studentLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            {isEditing ? 'Pratinjau' : 'Edit Teks'}
          </button>
        </div>

        {/* Report Text Display / Editor */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 sm:p-4 text-xs sm:text-sm dark:border-slate-800 dark:bg-slate-900/60 shadow-inner">
          {isEditing ? (
            <textarea
              rows={14}
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              className="w-full bg-transparent font-mono text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none resize-y"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-mono leading-relaxed select-all text-slate-900 dark:text-slate-100">
              {reportText}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} className="rounded-xl">
            Tutup
          </Button>

          <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-xs transition-colors"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-500" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Salin Pesan</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSendWA}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#20ba5a] active:scale-[0.98] transition-all"
            >
              <WhatsAppIcon className="h-4 w-4 shrink-0" />
              <span>Kirim ke WA</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

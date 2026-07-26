import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { ATTENDANCE_STATUSES } from '@/api/types'

export type Language = 'id' | 'en'

export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'en', label: 'English', short: 'EN' },
]

const id = {
  app: { title: 'Dasbor PPG' },
  language: { label: 'Bahasa', switchTo: 'Ganti ke {{lang}}' },
  common: {
    loading: 'Memuat…',
    loadError: 'Gagal memuat data.',
    save: 'Simpan',
    saving: 'Menyimpan…',
    cancel: 'Batal',
    apply: 'Terapkan',
    close: 'Tutup',
    edit: 'Ubah',
    delete: 'Hapus',
    prev: 'Sebelumnya',
    next: 'Berikutnya',
    all: 'Semua',
    yes: 'Ya',
    no: 'Tidak',
    dash: '—',
    irreversible: 'Tindakan ini tidak dapat dibatalkan.',
    notFilled: '(belum diisi)',
    pageStatus: 'Halaman {{page}} dari {{total}} · {{count}} total',
    selectPrompt: '— Pilih {{thing}} —',
    noDataLong: 'Belum ada data.',
  },
  nav: {
    dashboard: 'Dasbor',
    teachers: 'Pengajar',
    students: 'Generus',
    sessions: 'Pengajian',
    attendance: 'Kehadiran',
    achievement: 'Pencapaian',
    logout: 'Keluar',
    openMenu: 'Buka menu',
    closeMenu: 'Tutup menu',
  },
  status: { active: 'Aktif', left: 'Keluar', retired: 'Purna' },
  attendanceStatus: {
    hadir: 'Hadir',
    izin_murid: 'Izin (Murid)',
    izin_guru: 'Izin (Guru)',
    by_vn: 'Via Voice Note',
  },
  publicStatus: {
    hadir: 'HADIR',
    by_vn: 'By VN',
    izin_guru: 'IZIN (GURU)',
    izin_murid: 'IZIN (MURID)',
  },
  login: {
    heading: 'Masuk',
    identifier: 'Email atau nama pengguna',
    password: 'Kata sandi',
    submit: 'Masuk',
    submitting: 'Memproses…',
    errIdentifierRequired: 'Email atau nama pengguna wajib diisi',
    errPasswordRequired: 'Kata sandi wajib diisi',
  },
  dashboard: {
    heading: 'Dasbor',
    intro: 'Angka utama menampilkan Generus dan Pengajar yang masih aktif.',
    loadError: 'Gagal memuat data dasbor.',
    activeStudents: 'Generus aktif',
    activeTeachers: 'Pengajar aktif',
    fromOfTotal: 'dari {{n}} total',
    byGender: 'Generus aktif per Jenis Kelamin',
    byLevel: 'Generus aktif per Jenjang',
    byKelompok: 'Generus aktif per Kelompok',
    studentLocationTitle: 'Sebaran Generus aktif per Kelompok',
    mapHint: 'Klik tanda lingkaran untuk membuka daftar Generus pada kelompok tersebut.',
    teacherByDaerah: 'Pengajar aktif per Daerah (top 10)',
    matrixTitle: 'Matriks Jenjang × Kelompok (Generus aktif)',
    matrixRowHeader: 'Jenjang \\ Kelompok',
    total: 'Total',
    male: 'Laki-laki',
    female: 'Perempuan',
    other: 'Lainnya ({{n}})',
    emptyLevel: 'Belum ada data jenjang.',
    emptyKelompok: 'Belum ada data kelompok.',
    emptyDaerah: 'Belum ada data daerah.',
  },
  attendanceStats: {
    heading: 'Kehadiran',
    intro: 'Ringkasan dan analitik dari seluruh data Pengajian.',
    loadError: 'Gagal memuat statistik kehadiran.',
    rangeLabel: 'Rentang waktu',
    rangeAll: 'Semua',
    rangeYtd: 'Tahun Ini',
    rangeMtd: 'Bulan Ini',
    totalSessions: 'Total Sesi',
    totalHours: 'Total Jam Ngaji',
    hoursUnit: '{{n}} jam',
    last30: 'Sesi 30 Hari Terakhir',
    last30Note: 'Tidak terpengaruh filter',
    activePairs: 'Pasangan Aktif (30hr)',
    activePairsNote: 'Generus × Pengajar',
    monthly: 'Sesi per Bulan',
    monthlyEmpty: 'Belum ada data.',
    distribution: 'Distribusi Status',
    perStudent: 'Per Generus',
    perTeacher: 'Per Pengajar',
    colName: 'Nama',
    colSessions: 'Sesi',
    colAttRate: '% Hadir',
    colHours: 'Jam',
    colStudents: '# Generus',
    colLast: 'Sesi Terakhir',
    monthLabel: 'Bulan {{label}}',
    hoursTooltip: 'Jam',
    sessionsTooltip: 'Sesi',
  },
  students: {
    heading: 'Generus',
    addBtn: 'Tambah Generus',
    detailTitle: 'Detail Generus',
    newTitle: 'Tambah Generus',
    editTitle: 'Ubah Generus',
    bulkTitle: 'Impor / Ekspor Generus',
    searchPlaceholder: 'Cari nama atau panggilan',
    allStatus: 'Semua status',
    allKelompok: 'Semua kelompok',
    empty: 'Belum ada data Generus.',
    confirmDelete: 'Hapus {{name}}? Tindakan ini tidak dapat dibatalkan.',
    colName: 'Nama',
    colNickname: 'Panggilan',
    colGender: 'L/P',
    colAge: 'Usia',
    colLevel: 'Jenjang',
    colKelompok: 'Kelompok',
    colStatus: 'Status',
    colActions: 'Aksi',
    genderShortMale: 'L',
    genderShortFemale: 'P',
    sectionStudent: 'Data Generus',
    sectionMembership: 'Keanggotaan',
    sectionParent: 'Orang Tua (opsional)',
    fName: 'Nama',
    fNickname: 'Nama Panggilan',
    fDob: 'Tanggal Lahir',
    fGender: 'Jenis Kelamin',
    fLevel: 'Jenjang',
    fKelompok: 'Kelompok',
    fCity: 'Kota',
    fCityPh: 'cth. Chicago, Raleigh',
    fJoinedAt: 'Tanggal Masuk',
    fLeftAt: 'Tanggal Keluar',
    fLeaveReason: 'Keterangan Keluar',
    fStatus: 'Status',
    fParentName: 'Nama Orang Tua',
    fParentPhone: 'Telepon Orang Tua',
    fParentEmail: 'Email Orang Tua',
    detailAgeSuffix: '{{n}} tahun',
  },
  teachers: {
    heading: 'Pengajar',
    addBtn: 'Tambah Pengajar',
    detailTitle: 'Detail Pengajar',
    newTitle: 'Tambah Pengajar',
    editTitle: 'Ubah Pengajar',
    bulkTitle: 'Impor / Ekspor Pengajar',
    searchPlaceholder: 'Cari nama atau panggilan',
    allStatus: 'Semua status',
    empty: 'Belum ada data Pengajar.',
    confirmDelete: 'Hapus {{name}}? Tindakan ini tidak dapat dibatalkan.',
    colName: 'Nama',
    colNickname: 'Panggilan',
    colKelompok: 'Kelompok',
    colDaerah: 'Daerah',
    colStatus: 'Status',
    colActions: 'Aksi',
    fName: 'Nama Pengajar',
    fNickname: 'Nama Panggilan',
    fKelompok: 'Kelompok',
    fDesa: 'Desa',
    fDaerah: 'Daerah',
    fJoinedAt: 'Tanggal Masuk',
    fRetiredAt: 'Tanggal Purna',
    fStatus: 'Status',
    fNotes: 'Keterangan',
  },
  sessions: {
    heading: 'Pengajian',
    addBtn: 'Tambah Pengajian',
    newTitle: 'Tambah Pengajian',
    editTitle: 'Ubah Pengajian',
    bulkTitle: 'Impor / Ekspor Pengajian',
    detailTitle: 'Detail Pengajian',
    detailWith: 'Pengajian — {{name}} ({{date}})',
    confirmDelete: 'Hapus pengajian {{label}}?\nTindakan ini tidak dapat dibatalkan.',
    fFrom: 'Dari',
    fTo: 'Sampai',
    fTeacher: 'Pengajar',
    fStudent: 'Generus',
    fStatus: 'Status',
    fDate: 'Tanggal',
    fDuration: 'Durasi (menit)',
    fDurationPh: 'cth. 45',
    fMateri: 'Materi',
    colDate: 'Tanggal',
    colStudent: 'Generus',
    colTeacher: 'Pengajar',
    colDuration: 'Durasi',
    colStatus: 'Status',
    colActions: 'Aksi',
    durationMin: '{{n}} min',
    empty: 'Belum ada data pengajian untuk filter ini.',
    pickTeacher: '— Pilih pengajar —',
    pickStudent: '— Pilih generus —',
    loadingLists: 'Memuat daftar pengajar dan generus…',
    detailDate: 'Tanggal',
    detailStatus: 'Status',
    detailTeacher: 'Pengajar',
    detailStudent: 'Generus',
    detailDuration: 'Durasi',
    detailMateri: 'Materi',
    durationMinutes: '{{n}} menit',
  },
  bulk: {
    exportTitle: 'Ekspor CSV',
    exportHint:
      'Unduh seluruh data {{entity}} sebagai CSV (mengikuti filter aktif di halaman ini).',
    download: 'Unduh CSV',
    downloading: 'Mengunduh…',
    importTitle: 'Impor CSV',
    importHint:
      'File CSV harus memuat header berikut (alias bahasa Indonesia juga didukung untuk beberapa kolom):',
    loadingSchema: 'Memuat skema…',
    schemaError: 'Gagal memuat skema.',
    fileLabel: 'Berkas CSV',
    modeLabel: 'Mode',
    importBtn: 'Impor',
    importing: 'Mengimpor…',
    reset: 'Reset',
    pickFileFirst: 'Pilih file CSV terlebih dahulu.',
    rowsFailed: '{{n}} baris gagal',
    rowsOk: 'Semua baris diproses tanpa kesalahan.',
    rowPrefix: 'baris {{n}}:',
    unknownError: 'unknown error',
    modeCreate: 'Create (gagal jika duplikat)',
    modeUpsert: 'Upsert (timpa jika duplikat)',
    modeDryRun: 'Dry-run (validasi saja)',
    importExportBtn: 'Impor / Ekspor',
  },
  absen: {
    heading: 'Form Kegiatan Pengajian',
    note: '*Semua data wajib diisi!',
    submitBtn: 'KIRIM LAPORAN',
    sending: 'Mengirim…',
    successHeading: 'Laporan tersimpan, terima kasih!',
    successWaHint: 'Klik tombol di bawah untuk membuka laporan ke nomor WhatsApp tujuan.',
    sendWa: 'Kirim ke WhatsApp',
    savedToDb: 'Laporan sudah disimpan di database.',
    sendAnother: 'Kirim laporan lain',
    back: '← Kembali',
    hasQuestion: 'Ada Pertanyaan!?',
    fDate: 'Tanggal',
    fDuration: 'Durasi (menit)',
    fDurationPh: 'cth. 45',
    fTeacher: 'Nama Guru',
    fStudent: 'Nama Murid',
    pickTeacher: '— Pilih guru —',
    pickStudent: '— Pilih murid —',
    fAttendance: 'Kehadiran',
    fMateri: 'Materi',
    fPhone: 'No. WhatsApp tujuan laporan',
    phoneHint:
      'Laporan akan dibuka di WhatsApp ke nomor ini. Contoh: 081234567890 atau +6281234567890',
    loadingLists: 'Memuat daftar guru dan murid…',
  },
  validation: {
    required: 'Wajib diisi',
    requiredSelect: 'Wajib dipilih',
    isoDate: 'Gunakan format YYYY-MM-DD',
    invalidEmail: 'Format email tidak valid',
    invalidPhone: 'Gunakan format 08… atau +62…',
  },
  underDev: { defaultMsg: 'Fitur ini sedang dalam pengembangan.' },
  actions: { edit: 'Ubah', delete: 'Hapus', close: 'Tutup' },
}

type Messages = typeof id

const en: Messages = {
  app: { title: 'PPG Dashboard' },
  language: { label: 'Language', switchTo: 'Switch to {{lang}}' },
  common: {
    loading: 'Loading…',
    loadError: 'Failed to load data.',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    apply: 'Apply',
    close: 'Close',
    edit: 'Edit',
    delete: 'Delete',
    prev: 'Previous',
    next: 'Next',
    all: 'All',
    yes: 'Yes',
    no: 'No',
    dash: '—',
    irreversible: 'This action cannot be undone.',
    notFilled: '(unset)',
    pageStatus: 'Page {{page}} of {{total}} · {{count}} total',
    selectPrompt: '— Select {{thing}} —',
    noDataLong: 'No data yet.',
  },
  nav: {
    dashboard: 'Dashboard',
    teachers: 'Teachers',
    students: 'Students',
    sessions: 'Sessions',
    attendance: 'Attendance',
    achievement: 'Achievements',
    logout: 'Sign out',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  status: { active: 'Active', left: 'Left', retired: 'Retired' },
  attendanceStatus: {
    hadir: 'Present',
    izin_murid: 'Excused (Student)',
    izin_guru: 'Excused (Teacher)',
    by_vn: 'Via Voice Note',
  },
  publicStatus: {
    hadir: 'PRESENT',
    by_vn: 'By VN',
    izin_guru: 'EXCUSED (TEACHER)',
    izin_murid: 'EXCUSED (STUDENT)',
  },
  login: {
    heading: 'Sign in',
    identifier: 'Email or username',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    errIdentifierRequired: 'Email or username is required',
    errPasswordRequired: 'Password is required',
  },
  dashboard: {
    heading: 'Dashboard',
    intro: 'Headline counts show currently active Students and Teachers.',
    loadError: 'Failed to load dashboard data.',
    activeStudents: 'Active students',
    activeTeachers: 'Active teachers',
    fromOfTotal: 'of {{n}} total',
    byGender: 'Active students by gender',
    byLevel: 'Active students by level',
    byKelompok: 'Active students by group',
    studentLocationTitle: 'Active students by group (map)',
    mapHint: 'Click a circle to view the students in that group.',
    teacherByDaerah: 'Active teachers by region (top 10)',
    matrixTitle: 'Level × Group matrix (active students)',
    matrixRowHeader: 'Level \\ Group',
    total: 'Total',
    male: 'Male',
    female: 'Female',
    other: 'Others ({{n}})',
    emptyLevel: 'No level data yet.',
    emptyKelompok: 'No group data yet.',
    emptyDaerah: 'No region data yet.',
  },
  attendanceStats: {
    heading: 'Attendance',
    intro: 'Summary and analytics across all sessions.',
    loadError: 'Failed to load attendance stats.',
    rangeLabel: 'Date range',
    rangeAll: 'All',
    rangeYtd: 'Year to date',
    rangeMtd: 'Month to date',
    totalSessions: 'Total sessions',
    totalHours: 'Total hours',
    hoursUnit: '{{n}} h',
    last30: 'Sessions (last 30 days)',
    last30Note: 'Not affected by filters',
    activePairs: 'Active pairs (30d)',
    activePairsNote: 'Students × teachers',
    monthly: 'Sessions per month',
    monthlyEmpty: 'No data yet.',
    distribution: 'Status distribution',
    perStudent: 'Per student',
    perTeacher: 'Per teacher',
    colName: 'Name',
    colSessions: 'Sessions',
    colAttRate: '% Present',
    colHours: 'Hours',
    colStudents: '# Students',
    colLast: 'Last session',
    monthLabel: 'Month {{label}}',
    hoursTooltip: 'Hours',
    sessionsTooltip: 'Sessions',
  },
  students: {
    heading: 'Students',
    addBtn: 'Add student',
    detailTitle: 'Student details',
    newTitle: 'Add student',
    editTitle: 'Edit student',
    bulkTitle: 'Import / Export students',
    searchPlaceholder: 'Search name or nickname',
    allStatus: 'All statuses',
    allKelompok: 'All groups',
    empty: 'No students yet.',
    confirmDelete: 'Delete {{name}}? This action cannot be undone.',
    colName: 'Name',
    colNickname: 'Nickname',
    colGender: 'M/F',
    colAge: 'Age',
    colLevel: 'Level',
    colKelompok: 'Group',
    colStatus: 'Status',
    colActions: 'Actions',
    genderShortMale: 'M',
    genderShortFemale: 'F',
    sectionStudent: 'Student details',
    sectionMembership: 'Membership',
    sectionParent: 'Parent (optional)',
    fName: 'Name',
    fNickname: 'Nickname',
    fDob: 'Date of birth',
    fGender: 'Gender',
    fLevel: 'Level',
    fKelompok: 'Group',
    fCity: 'City',
    fCityPh: 'e.g. Chicago, Raleigh',
    fJoinedAt: 'Joined on',
    fLeftAt: 'Left on',
    fLeaveReason: 'Reason for leaving',
    fStatus: 'Status',
    fParentName: 'Parent name',
    fParentPhone: 'Parent phone',
    fParentEmail: 'Parent email',
    detailAgeSuffix: '{{n}} y.o.',
  },
  teachers: {
    heading: 'Teachers',
    addBtn: 'Add teacher',
    detailTitle: 'Teacher details',
    newTitle: 'Add teacher',
    editTitle: 'Edit teacher',
    bulkTitle: 'Import / Export teachers',
    searchPlaceholder: 'Search name or nickname',
    allStatus: 'All statuses',
    empty: 'No teachers yet.',
    confirmDelete: 'Delete {{name}}? This action cannot be undone.',
    colName: 'Name',
    colNickname: 'Nickname',
    colKelompok: 'Group',
    colDaerah: 'Region',
    colStatus: 'Status',
    colActions: 'Actions',
    fName: 'Teacher name',
    fNickname: 'Nickname',
    fKelompok: 'Group',
    fDesa: 'Village',
    fDaerah: 'Region',
    fJoinedAt: 'Joined on',
    fRetiredAt: 'Retired on',
    fStatus: 'Status',
    fNotes: 'Notes',
  },
  sessions: {
    heading: 'Sessions',
    addBtn: 'Add session',
    newTitle: 'Add session',
    editTitle: 'Edit session',
    bulkTitle: 'Import / Export sessions',
    detailTitle: 'Session details',
    detailWith: 'Session — {{name}} ({{date}})',
    confirmDelete: 'Delete session {{label}}?\nThis action cannot be undone.',
    fFrom: 'From',
    fTo: 'To',
    fTeacher: 'Teacher',
    fStudent: 'Student',
    fStatus: 'Status',
    fDate: 'Date',
    fDuration: 'Duration (min)',
    fDurationPh: 'e.g. 45',
    fMateri: 'Material',
    colDate: 'Date',
    colStudent: 'Student',
    colTeacher: 'Teacher',
    colDuration: 'Duration',
    colStatus: 'Status',
    colActions: 'Actions',
    durationMin: '{{n}} min',
    empty: 'No sessions match this filter.',
    pickTeacher: '— Select teacher —',
    pickStudent: '— Select student —',
    loadingLists: 'Loading teachers and students…',
    detailDate: 'Date',
    detailStatus: 'Status',
    detailTeacher: 'Teacher',
    detailStudent: 'Student',
    detailDuration: 'Duration',
    detailMateri: 'Material',
    durationMinutes: '{{n}} minutes',
  },
  bulk: {
    exportTitle: 'Export CSV',
    exportHint: 'Download all {{entity}} as CSV (current page filters apply).',
    download: 'Download CSV',
    downloading: 'Downloading…',
    importTitle: 'Import CSV',
    importHint:
      'The CSV must include the headers below (some columns also accept Indonesian aliases):',
    loadingSchema: 'Loading schema…',
    schemaError: 'Failed to load schema.',
    fileLabel: 'CSV file',
    modeLabel: 'Mode',
    importBtn: 'Import',
    importing: 'Importing…',
    reset: 'Reset',
    pickFileFirst: 'Choose a CSV file first.',
    rowsFailed: '{{n}} rows failed',
    rowsOk: 'All rows processed without errors.',
    rowPrefix: 'row {{n}}:',
    unknownError: 'unknown error',
    modeCreate: 'Create (fail on duplicates)',
    modeUpsert: 'Upsert (overwrite on duplicates)',
    modeDryRun: 'Dry-run (validate only)',
    importExportBtn: 'Import / Export',
  },
  absen: {
    heading: 'Session report form',
    note: '*All fields are required!',
    submitBtn: 'SUBMIT REPORT',
    sending: 'Sending…',
    successHeading: 'Report saved, thank you!',
    successWaHint: 'Click the button below to open the report for the destination WhatsApp number.',
    sendWa: 'Send via WhatsApp',
    savedToDb: 'The report is already saved to the database.',
    sendAnother: 'Send another report',
    back: '← Back',
    hasQuestion: 'Have a question?',
    fDate: 'Date',
    fDuration: 'Duration (min)',
    fDurationPh: 'e.g. 45',
    fTeacher: 'Teacher name',
    fStudent: 'Student name',
    pickTeacher: '— Select teacher —',
    pickStudent: '— Select student —',
    fAttendance: 'Attendance',
    fMateri: 'Material',
    fPhone: 'Destination WhatsApp number',
    phoneHint:
      'The report will open in WhatsApp targeted at this number. Example: 081234567890 or +6281234567890',
    loadingLists: 'Loading teachers and students…',
  },
  validation: {
    required: 'Required',
    requiredSelect: 'Please choose one',
    isoDate: 'Use the format YYYY-MM-DD',
    invalidEmail: 'Invalid email format',
    invalidPhone: 'Use format 08… or +62…',
  },
  underDev: { defaultMsg: 'This feature is under development.' },
  actions: { edit: 'Edit', delete: 'Delete', close: 'Close' },
}

const DICTIONARIES: Record<Language, Messages> = { id, en }

const STORAGE_KEY = 'ppg.lang'

export type TranslateParams = Record<string, string | number>
export type TranslateFn = (key: string, params?: TranslateParams) => string

type LanguageContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: TranslateFn
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'id'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch {
    // localStorage unavailable (e.g. privacy mode); fall through to detection
  }
  const navLang = window.navigator?.language?.toLowerCase() ?? ''
  return navLang.startsWith('en') ? 'en' : 'id'
}

function lookup(dict: Messages, key: string): string {
  const parts = key.split('.')
  let node: unknown = dict
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return key
    }
  }
  return typeof node === 'string' ? node : key
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  )
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => initialLanguage())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // best effort only
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const setLang = useCallback((next: Language) => setLangState(next), [])
  const t = useCallback<TranslateFn>(
    (key, params) => interpolate(lookup(DICTIONARIES[lang], key), params),
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider')
  return ctx
}

/** Translates an attendance status token (hadir, izin_murid, …). */
export function useAttendanceStatusLabel() {
  const { t } = useTranslation()
  return (status: string, fallback?: string) =>
    (ATTENDANCE_STATUSES as readonly string[]).includes(status)
      ? t(`attendanceStatus.${status}`)
      : (fallback ?? String(status))
}

/** Translates a student status token (active | left). */
export function useStudentStatusLabel() {
  const { t } = useTranslation()
  return (status: string) => t(status === 'active' ? 'status.active' : 'status.left')
}

/** Translates a teacher status token (active | retired). */
export function useTeacherStatusLabel() {
  const { t } = useTranslation()
  return (status: string) => t(status === 'active' ? 'status.active' : 'status.retired')
}

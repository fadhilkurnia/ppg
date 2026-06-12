import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { KelasLayout } from '@/pages/Kelas'
import { LiveSesiPage } from '@/pages/LiveSesi'
import { KelasListSection } from '@/pages/sections/KelasListSection'
import { KelasCalendarSection } from '@/pages/sections/KelasCalendarSection'
import { KelasRencanaSection } from '@/pages/sections/KelasRencanaSection'
import { PustakaPage } from '@/pages/Pustaka'
import { KontrolBacaanPage } from '@/pages/KontrolBacaan'
import { KehadiranPage } from '@/pages/Kehadiran'
import { PustakaAsmaulPage } from '@/pages/PustakaAsmaul'
import { PustakaKarakterPage } from '@/pages/PustakaKarakter'
import { PustakaQuranMushafPage } from '@/pages/PustakaQuranMushaf'
import { PustakaHaditsPage } from '@/pages/PustakaHadits'
import { PustakaKitabDetailPage } from '@/pages/PustakaKitabDetail'
import { PustakaDoaPage } from '@/pages/PustakaDoa'
import { PustakaTilawatiPage } from '@/pages/PustakaTilawati'
import { AchievementPage } from '@/pages/Achievement'
import { UsersPage } from '@/pages/Users'
import { UserNewPage } from '@/pages/UserNew'
import { SettingsLayout } from '@/pages/Pengaturan'
import { KurikulumSection } from '@/pages/sections/KurikulumSection'
import { TahunAjaranSection } from '@/pages/sections/TahunAjaranSection'
import { InstansiSection } from '@/pages/sections/InstansiSection'
import { WhatsappSection } from '@/pages/sections/WhatsappSection'
import { WilayahSection } from '@/pages/sections/WilayahSection'

export function App() {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/kelas/:kelasId/sesi/:sesiId/live"
        element={user ? <LiveSesiPage /> : <Navigate to="/login" replace />}
      />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        {/* Unified-user mechanism: Students/Teachers UIs were folded into
            /pengaturan/pengguna. Old routes redirect to the filtered Users
            page so bookmarks + in-app links keep working. */}
        <Route path="/students" element={<Navigate to="/pengaturan/pengguna?role=murid" replace />} />
        <Route path="/students/new" element={<Navigate to="/pengaturan/pengguna?new=1&role=murid" replace />} />
        <Route path="/students/:id" element={<RedirectUserById />} />
        <Route path="/teachers" element={<Navigate to="/pengaturan/pengguna?role=guru" replace />} />
        <Route path="/teachers/new" element={<Navigate to="/pengaturan/pengguna?new=1&role=guru" replace />} />
        <Route path="/teachers/:id" element={<RedirectUserById />} />
        <Route path="/kelas" element={<KelasLayout />}>
          <Route index element={<Navigate to="list" replace />} />
          <Route path="list" element={<KelasListSection />} />
          <Route path="calendar" element={<KelasCalendarSection />} />
          <Route path="rencana" element={<KelasRencanaSection />} />
        </Route>
        {/* Back-compat: old /attendance URL redirects to /kelas/calendar. */}
        <Route path="/attendance" element={<Navigate to="/kelas/calendar" replace />} />
        <Route path="/pustaka" element={<PustakaPage />} />
        <Route path="/bacaan" element={<KontrolBacaanPage />} />
        <Route path="/kehadiran" element={<KehadiranPage />} />
        <Route path="/pustaka/asmaul-husna" element={<PustakaAsmaulPage />} />
        <Route path="/pustaka/karakter-luhur" element={<PustakaKarakterPage />} />
        <Route path="/pustaka/quran" element={<PustakaQuranMushafPage />} />
        <Route path="/pustaka/quran/:surahId" element={<PustakaQuranMushafPage />} />
        <Route path="/pustaka/doa" element={<PustakaDoaPage />} />
        <Route path="/pustaka/tilawati" element={<PustakaTilawatiPage />} />
        <Route path="/pustaka/tilawati/:jilidId" element={<PustakaTilawatiPage />} />
        <Route path="/pustaka/hadits" element={<Navigate to="/pustaka/hadits-himpunan" replace />} />
        <Route path="/pustaka/hadits-himpunan" element={<PustakaHaditsPage />} />
        {/* Maktabah hidden: redirect to Hadits Himpunan. */}
        <Route path="/pustaka/maktabah" element={<Navigate to="/pustaka/hadits-himpunan" replace />} />
        <Route path="/pustaka/kitab/:slug" element={<PustakaKitabDetailPage />} />
        <Route path="/achievement" element={<AchievementPage />} />

        {/* Pengaturan: tabbed layout for Pengguna + Kurikulum (single page). */}
        <Route path="/pengaturan" element={<AdminOnly><SettingsLayout /></AdminOnly>}>
          <Route index element={<Navigate to="instansi" replace />} />
          <Route path="instansi" element={<InstansiSection />} />
          <Route path="pengguna" element={<UsersPage />} />
          <Route path="kurikulum" element={<KurikulumSection />} />
          <Route path="tahun-ajaran" element={<TahunAjaranSection />} />
          <Route path="whatsapp" element={<WhatsappSection />} />
          <Route path="wilayah" element={<WilayahSection />} />
          {/* Back-compat redirects from the old sub-tab URLs. */}
          <Route path="kurikulum/materi" element={<Navigate to="/pengaturan/kurikulum" replace />} />
          <Route path="kurikulum/tingkat" element={<Navigate to="/pengaturan/kurikulum" replace />} />
        </Route>
        {/* Pengguna "new" page lives outside the tab strip. Editing is done
            in a pop-up on the list, so a per-user detail URL just opens that
            dialog via ?edit=<id> (no more standalone full edit page). */}
        <Route path="/pengaturan/pengguna/new" element={<AdminOnly><UserNewPage /></AdminOnly>} />
        <Route path="/pengaturan/pengguna/:id" element={<AdminOnly><RedirectPenggunaEdit /></AdminOnly>} />

        {/* Backwards-compat redirects from the old /users URLs. */}
        <Route path="/users" element={<Navigate to="/pengaturan/pengguna" replace />} />
        <Route path="/users/new" element={<Navigate to="/pengaturan/pengguna/new" replace />} />
        <Route path="/users/:id" element={<RedirectUserDetail />} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

function FullScreenLoader() {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="text-slate-500 text-sm">{t('common.loading')}</div>
    </div>
  )
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RedirectUserDetail() {
  // /users/:id → /pengaturan/pengguna/:id. Use useParams (not a pathname
  // regex) so deeper paths like /users/foo/bar are not silently rewritten
  // into nonexistent routes.
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/pengaturan/pengguna/${id ?? ''}${window.location.search}`} replace />
}

// The standalone user-detail page was removed — editing happens in a pop-up
// on the Pengguna list. A per-user URL now just opens that dialog via
// ?edit=<id>, so old links (and the post-create redirect) keep working.
function RedirectPenggunaEdit() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/pengaturan/pengguna?edit=${id ?? ''}`} replace />
}

// Redirect /students/:id and /teachers/:id to the unified user-detail URL.
// Per the unified-user mechanism, the same user record serves both murid
// and guru, so the :id parameter passes straight through.
function RedirectUserById() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/pengaturan/pengguna/${id ?? ''}${window.location.search}`} replace />
}

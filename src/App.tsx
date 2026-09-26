import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, lazy, Suspense } from 'react'
import { LayoutDashboard, Building2, CalendarCheck, Users, MapPin, MessageCircle, ClipboardList, Bed, Calendar, ArrowUpRight } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import OfflineIndicator from './components/OfflineIndicator'
import { initNativeFeatures } from './lib/native'
import { RTL_LANGUAGES } from './i18n'

const HomePage = lazy(() => import('./pages/public/HomePage'))
const SearchResults = lazy(() => import('./pages/public/SearchResults'))
const HotelDetail = lazy(() => import('./pages/public/HotelDetail'))
const BookingPage = lazy(() => import('./pages/public/BookingPage'))
const BookingConfirmation = lazy(() => import('./pages/public/BookingConfirmation'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const AddAccommodation = lazy(() => import('./pages/AddAccommodation'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminHotels = lazy(() => import('./pages/admin/AdminHotels'))
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings'))
const AdminOwners = lazy(() => import('./pages/admin/AdminOwners'))
const AdminDestinations = lazy(() => import('./pages/admin/AdminDestinations'))
const AdminImportHotel = lazy(() => import('./pages/admin/AdminImportHotel'))
const AdminChats = lazy(() => import('./pages/admin/AdminChats'))
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'))
const OwnerDashboard = lazy(() => import('./pages/hotel-owner/OwnerDashboard'))
const OwnerRoomTypes = lazy(() => import('./pages/hotel-owner/OwnerRoomTypes'))
const OwnerAvailability = lazy(() => import('./pages/hotel-owner/OwnerAvailability'))
const OwnerBookings = lazy(() => import('./pages/hotel-owner/OwnerBookings'))

const InstallPrompt = lazy(() => import('./components/InstallPrompt'))
const ChatBot = lazy(() => import('./components/ChatBot'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function Dashboard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { profile, loading } = useAuth()
  const { pathname } = useLocation()
  const isAdmin = pathname.startsWith('/admin')
  const hotelId = pathname.split('/')[3]
  const links = isAdmin ? [
    { to: '/admin', label: t('ux.overview'), icon: LayoutDashboard },
    { to: '/admin/hotels', label: t('admin.manageHotels'), icon: Building2 },
    { to: '/admin/bookings', label: t('owner.bookings'), icon: CalendarCheck },
    { to: '/admin/owners', label: t('admin.manageOwners'), icon: Users },
    { to: '/admin/destinations', label: t('home.destinations'), icon: MapPin },
    { to: '/admin/chats', label: t('admin.liveChats', 'Live chats'), icon: MessageCircle },
    { to: '/admin/applications', label: t('admin.applications', 'Applications'), icon: ClipboardList },
  ] : [
    { to: '/owner', label: t('ux.overview'), icon: LayoutDashboard },
    ...(hotelId ? [
      { to: `/owner/rooms/${hotelId}`, label: t('owner.roomTypes'), icon: Bed },
      { to: `/owner/availability/${hotelId}`, label: t('owner.availability'), icon: Calendar },
      { to: `/owner/bookings/${hotelId}`, label: t('owner.bookings'), icon: CalendarCheck },
    ] : []),
  ]
  const allowed = profile?.role === 'admin' || (!isAdmin && profile?.role === 'hotel_owner')
  if (loading) return <PageLoader />
  if (!profile) return <Navigate to="/login" replace />
  if (!allowed) return <Navigate to="/" replace />
  return <div className="dashboard-shell">
    {allowed && <aside className="workspace-sidebar"><div className="workspace-label">{t('ux.workspace')}</div><nav aria-label={t('common.dashboard')}>{links.map(item => <NavLink key={item.to} to={item.to} end className={({isActive}) => isActive ? 'workspace-link active' : 'workspace-link'}><item.icon size={18}/><span>{item.label}</span></NavLink>)}</nav><NavLink to="/search" className="workspace-public">{t('common.browseProperties')}<ArrowUpRight size={16}/></NavLink></aside>}
    <div className="dashboard-content">{children}</div>
  </div>
}

function AppContent() {
  const { i18n } = useTranslation()
  const { pathname } = useLocation()

  useEffect(() => {
    const dir = RTL_LANGUAGES.includes(i18n.language) ? 'rtl' : 'ltr'
    document.documentElement.dir = dir
    document.documentElement.lang = i18n.language
    document.title = i18n.t('common.appTitle', 'KurdStay - Hotels & Farms')
  }, [i18n.language])

  useEffect(() => {
    initNativeFeatures()
  }, [])

  return (
    <div className="app-shell min-h-screen">
      <ScrollToTop />
      <OfflineIndicator />
      <a href="#main-content" className="skip-link">{i18n.t('ux.skipContent')}</a>
      <Header />
      <main id="main-content" tabIndex={-1}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="*" element={<div className="mx-auto max-w-lg px-6 py-20 text-center"><h1 className="text-2xl font-bold">{i18n.t('common.notFound')}</h1><NavLink to="/" className="inline-block mt-6 rounded-xl bg-primary-600 px-6 py-3 text-white">{i18n.t('common.home')}</NavLink></div>} />
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/hotel/:id" element={<HotelDetail />} />
          <Route path="/booking/:hotelId/:roomTypeId" element={<BookingPage />} />
          <Route path="/booking/confirmation/:bookingId" element={<BookingConfirmation />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/add-accommodation" element={<AddAccommodation />} />
          <Route path="/admin" element={<Dashboard><AdminDashboard /></Dashboard>} />
          <Route path="/admin/hotels" element={<Dashboard><AdminHotels /></Dashboard>} />
          <Route path="/admin/bookings" element={<Dashboard><AdminBookings /></Dashboard>} />
          <Route path="/admin/owners" element={<Dashboard><AdminOwners /></Dashboard>} />
          <Route path="/admin/destinations" element={<Dashboard><AdminDestinations /></Dashboard>} />
          <Route path="/admin/import-hotel" element={<Dashboard><AdminImportHotel /></Dashboard>} />
          <Route path="/admin/chats" element={<Dashboard><AdminChats /></Dashboard>} />
          <Route path="/admin/applications" element={<Dashboard><AdminApplications /></Dashboard>} />
          <Route path="/owner" element={<Dashboard><OwnerDashboard /></Dashboard>} />
          <Route path="/owner/rooms/:hotelId" element={<Dashboard><OwnerRoomTypes /></Dashboard>} />
          <Route path="/owner/availability/:hotelId" element={<Dashboard><OwnerAvailability /></Dashboard>} />
          <Route path="/owner/bookings/:hotelId" element={<Dashboard><OwnerBookings /></Dashboard>} />
        </Routes>
      </Suspense>
      </main>
      <Suspense fallback={null}>
        <InstallPrompt />
        {!pathname.startsWith('/admin') && !pathname.startsWith('/owner') && !pathname.startsWith('/booking') && <div className="support-widget"><ChatBot /></div>}
      </Suspense>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

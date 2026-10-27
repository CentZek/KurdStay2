import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Component, useEffect, lazy, Suspense, useRef, type ErrorInfo, type ReactNode } from 'react'
import { LayoutDashboard, Building2, CalendarCheck, Users, MapPin, MessageCircle, ClipboardList, Bed, Calendar, ArrowUpRight } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import Header from './components/Header'
import { useApiCapabilities, type ApiCapabilities } from './lib/apiCapabilities'
import OfflineIndicator from './components/OfflineIndicator'
import { initNativeFeatures } from './lib/native'
import i18n, { RTL_LANGUAGES } from './i18n'

const HomePage = lazy(() => import('./pages/public/HomePage'))
const SearchResults = lazy(() => import('./pages/public/SearchResults'))
const SearchResultsLegacy = lazy(() => import('./pages/public/SearchResultsLegacy'))
const HotelDetail = lazy(() => import('./pages/public/HotelDetail'))
const BookingPage = lazy(() => import('./pages/public/BookingPage'))
const BookingConfirmation = lazy(() => import('./pages/public/BookingConfirmation'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const AddAccommodation = lazy(() => import('./pages/AddAccommodation'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminDashboardLegacy = lazy(() => import('./pages/admin/AdminDashboardLegacy'))
const AdminHotels = lazy(() => import('./pages/admin/AdminHotels'))
const AdminBookings = lazy(() => import('./pages/admin/AdminBookings'))
const AdminBookingsLegacy = lazy(() => import('./pages/admin/AdminBookingsLegacy'))
const AdminOwners = lazy(() => import('./pages/admin/AdminOwners'))
const AdminDestinations = lazy(() => import('./pages/admin/AdminDestinations'))
const AdminImportHotel = lazy(() => import('./pages/admin/AdminImportHotel'))
const AdminImportHotelLegacy = lazy(() => import('./pages/admin/AdminImportHotelLegacy'))
const AdminChats = lazy(() => import('./pages/admin/AdminChats'))
const AdminChatsLegacy = lazy(() => import('./pages/admin/AdminChatsLegacy'))
const AdminApplications = lazy(() => import('./pages/admin/AdminApplications'))
const OwnerDashboard = lazy(() => import('./pages/hotel-owner/OwnerDashboard'))
const OwnerRoomTypes = lazy(() => import('./pages/hotel-owner/OwnerRoomTypes'))
const OwnerAvailability = lazy(() => import('./pages/hotel-owner/OwnerAvailability'))
const OwnerBookings = lazy(() => import('./pages/hotel-owner/OwnerBookings'))

const InstallPrompt = lazy(() => import('./components/InstallPrompt'))
const ChatBot = lazy(() => import('./components/ChatBot'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">{i18n.t('common.loading')}</span>
    </div>
  )
}

function CompatiblePage({ feature, modern, legacy }: { feature: keyof ApiCapabilities; modern: ReactNode; legacy: ReactNode }) {
  const capabilities = useApiCapabilities()
  if (!capabilities) return <PageLoader />
  return capabilities[feature] === true ? modern : legacy
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  private chunkLoadError = false

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.chunkLoadError = /dynamic|chunk|module/i.test(error.message)
  }

  handleRetry = () => {
    if (this.chunkLoadError) window.location.reload()
    else this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center" role="alert">
        <h1 className="text-2xl font-bold">{i18n.t('ux.loadErrorTitle')}</h1>
        <p className="mt-3 leading-7">{i18n.t('ux.loadErrorDescription')}</p>
        <div className="ui-error-actions">
          <button type="button" className="ui-button" onClick={this.handleRetry}>{i18n.t('ux.retry')}</button>
          <button type="button" className="ui-button ui-button-secondary" onClick={() => window.location.reload()}>{i18n.t('ux.reload')}</button>
        </div>
      </div>
    )
  }
}

const ROUTE_TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'home'], [/^\/search$/, 'search'], [/^\/hotel\//, 'hotel'],
  [/^\/booking\/confirmation\//, 'confirmation'], [/^\/booking\//, 'booking'],
  [/^\/login$/, 'login'], [/^\/register$/, 'register'], [/^\/profile$/, 'profile'],
  [/^\/add-accommodation$/, 'addProperty'], [/^\/admin\/hotels$/, 'adminHotels'],
  [/^\/admin\/bookings$/, 'adminBookings'], [/^\/admin\/owners$/, 'adminOwners'],
  [/^\/admin\/destinations$/, 'adminDestinations'], [/^\/admin\/import-hotel$/, 'adminImport'],
  [/^\/admin\/chats$/, 'adminChats'], [/^\/admin\/applications$/, 'adminApplications'],
  [/^\/admin/, 'admin'], [/^\/owner\/rooms\//, 'ownerRooms'],
  [/^\/owner\/availability\//, 'ownerAvailability'], [/^\/owner\/bookings\//, 'ownerBookings'],
  [/^\/owner/, 'owner'],
]

function RouteEffects() {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  const { i18n: instance } = useTranslation()

  useEffect(() => {
    window.scrollTo(0, 0)
    if (previousPath.current !== pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true })
      previousPath.current = pathname
    }
  }, [pathname])

  useEffect(() => {
    const route = ROUTE_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] || 'notFound'
    document.title = `${instance.t(`routes.${route}`)} | ${instance.t('common.appTitle')}`
  })

  return null
}

function Dashboard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { profile, loading, restorationError, retryRestore } = useAuth()
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
  if (restorationError) return <div className="mx-auto max-w-lg px-6 py-16"><div role="alert" className="ui-feedback ui-feedback-error"><p>{t('common.errorOccurred')}</p><button className="ui-button ui-button-secondary mt-4" onClick={() => void retryRestore()}>{t('ux.retry')}</button></div></div>
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
    document.documentElement.lang = i18n.language === 'kmr' ? 'kmr-Arab-IQ' : i18n.language
  }, [i18n.language])

  useEffect(() => {
    initNativeFeatures()
  }, [])

  return (
    <div className="app-shell min-h-screen">
      <RouteEffects />
      <OfflineIndicator />
      <a href="#main-content" className="skip-link">{i18n.t('ux.skipContent')}</a>
      <Header />
      <main id="main-content" tabIndex={-1}>
      <RouteErrorBoundary key={pathname}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="*" element={<div className="mx-auto max-w-lg px-6 py-20 text-center"><h1 className="text-2xl font-bold">{i18n.t('common.notFound')}</h1><NavLink to="/" className="inline-block mt-6 rounded-xl bg-primary-600 px-6 py-3 text-white">{i18n.t('common.home')}</NavLink></div>} />
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<CompatiblePage feature="bookingSearch" modern={<SearchResults />} legacy={<SearchResultsLegacy />} />} />
          <Route path="/hotel/:id" element={<HotelDetail />} />
          <Route path="/booking/:hotelId/:roomTypeId" element={<BookingPage />} />
          <Route path="/booking/confirmation/:bookingId" element={<BookingConfirmation />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/add-accommodation" element={<AddAccommodation />} />
          <Route path="/admin" element={<Dashboard><CompatiblePage feature="adminReliability" modern={<AdminDashboard />} legacy={<AdminDashboardLegacy />} /></Dashboard>} />
          <Route path="/admin/hotels" element={<Dashboard><AdminHotels /></Dashboard>} />
          <Route path="/admin/bookings" element={<Dashboard><CompatiblePage feature="adminReliability" modern={<AdminBookings />} legacy={<AdminBookingsLegacy />} /></Dashboard>} />
          <Route path="/admin/owners" element={<Dashboard><AdminOwners /></Dashboard>} />
          <Route path="/admin/destinations" element={<Dashboard><AdminDestinations /></Dashboard>} />
          <Route path="/admin/import-hotel" element={<Dashboard><CompatiblePage feature="adminReliability" modern={<AdminImportHotel />} legacy={<AdminImportHotelLegacy />} /></Dashboard>} />
          <Route path="/admin/chats" element={<Dashboard><CompatiblePage feature="adminReliability" modern={<AdminChats />} legacy={<AdminChatsLegacy />} /></Dashboard>} />
          <Route path="/admin/applications" element={<Dashboard><AdminApplications /></Dashboard>} />
          <Route path="/owner" element={<Dashboard><OwnerDashboard /></Dashboard>} />
          <Route path="/owner/rooms/:hotelId" element={<Dashboard><OwnerRoomTypes /></Dashboard>} />
          <Route path="/owner/availability/:hotelId" element={<Dashboard><OwnerAvailability /></Dashboard>} />
          <Route path="/owner/bookings/:hotelId" element={<Dashboard><OwnerBookings /></Dashboard>} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>
      </main>
      <RouteErrorBoundary key={`support-${pathname}`}>
        <Suspense fallback={null}>
          <InstallPrompt />
          {!pathname.startsWith('/admin') && !pathname.startsWith('/owner') && !pathname.startsWith('/booking') && <div className="support-widget"><ChatBot /></div>}
        </Suspense>
      </RouteErrorBoundary>
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

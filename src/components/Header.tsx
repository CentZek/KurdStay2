import { useState, useEffect, useRef } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, changeLanguage } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { Globe, Menu, X, User } from 'lucide-react'

export function BrandLogo() {
  return <span className="brand" dir="ltr">
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className="brand-mark">
      <rect x="1" y="1" width="46" height="46" rx="14" stroke="currentColor" strokeOpacity=".4" />
      <circle cx="33" cy="14" r="3" fill="currentColor" />
      <path d="M9 32 21 15 31 30M23 32l8-12 9 12M17 32h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <span className="brand-name">Kurd<span>Stay</span><small>STAY SOMEWHERE SPECIAL</small></span>
  </span>
}

export default function Header() {
  const { t, i18n } = useTranslation()
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const headerRef = useRef<HTMLElement>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)

  useEffect(() => { setMobileMenuOpen(false); setLangMenuOpen(false) }, [pathname])
  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false); setLangMenuOpen(false)
        headerRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus()
      }
    }
    function outside(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) { setLangMenuOpen(false); setMobileMenuOpen(false) }
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside) }
  }, [])

  const languages = LANGUAGES

  function selectLanguage(code: string) {
    changeLanguage(code)
    setLangMenuOpen(false)
  }

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  function getDashboardLink() {
    if (!profile) return '/login'
    if (profile.role === 'admin') return '/admin'
    if (profile.role === 'hotel_owner') return '/owner'
    return '/'
  }

  return (
    <header ref={headerRef} className="site-header sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[76px]">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo />
          </Link>

          <nav aria-label={t('ux.navigation')} className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium">
              {t('common.home')}
            </Link>
            <NavLink to="/search" className="header-explore">{t('common.browseProperties')}</NavLink>
            <NavLink to="/add-accommodation" className="header-list">{t('ux.listProperty')}</NavLink>

            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                aria-expanded={langMenuOpen}
                aria-label={t('common.language')}
                className="flex items-center gap-1.5 text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium"
              >
                <Globe className="w-4 h-4" />
                {languages.find(l => l.code === i18n.language)?.name}
              </button>
              {langMenuOpen && (
                <div className="absolute top-full mt-2 end-0 bg-gray-900 rounded-lg shadow-xl border border-white/10 py-1 min-w-[140px] animate-scale-in">
                  {languages.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => selectLanguage(lang.code)}
                      className={`w-full text-start px-4 py-2 text-sm hover:bg-white/5 transition-colors ${
                        i18n.language === lang.code ? 'text-primary-400 font-medium' : 'text-gray-300'
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {user && profile ? (
              <div className="flex items-center gap-3">
                {profile.role === 'customer' ? (
                  <Link
                    to="/profile"
                    className="text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium"
                  >
                    {t('common.myProfile')}
                  </Link>
                ) : (
                  <Link
                    to={getDashboardLink()}
                    className="text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium"
                  >
                    {t('common.dashboard')}
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium"
                >
                  {t('common.logout')}
                </button>
                <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center ring-1 ring-primary-500/40">
                  <User className="w-4 h-4 text-primary-400" />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-gray-300 hover:text-primary-400 transition-colors text-sm font-medium"
                >
                  {t('common.login')}
                </Link>
                <Link
                  to="/register"
                  className="bg-primary-500 text-gray-950 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-400 transition-colors"
                >
                  {t('common.register')}
                </Link>
              </div>
            )}
          </nav>

          <button
            className="md:hidden p-2 text-gray-200"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            aria-label={t('ux.menu')}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <nav id="mobile-navigation" aria-label={t('ux.navigation')} className="mobile-navigation md:hidden border-t border-white/10 py-4">
            <div className="flex flex-col gap-3">
              <Link to="/" className="text-gray-300 py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                {t('common.home')}
              </Link>
              <Link to="/search" className="text-gray-300 py-2 text-sm font-medium">{t('common.browseProperties')}</Link>
              <Link to="/add-accommodation" className="text-primary-300 py-2 text-sm font-medium">{t('ux.listProperty')}</Link>
              <div className="flex gap-2 py-2">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { selectLanguage(lang.code); setMobileMenuOpen(false) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      i18n.language === lang.code
                        ? 'bg-primary-500 text-gray-950'
                        : 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
              {user && profile ? (
                <>
                  {profile.role === 'customer' ? (
                    <Link to="/profile" className="text-gray-300 py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      {t('common.myProfile')}
                    </Link>
                  ) : (
                    <Link to={getDashboardLink()} className="text-gray-300 py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                      {t('common.dashboard')}
                    </Link>
                  )}
                  <button onClick={() => { handleSignOut(); setMobileMenuOpen(false) }} className="text-start text-gray-300 py-2 text-sm font-medium">
                    {t('common.logout')}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-gray-300 py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                    {t('common.login')}
                  </Link>
                  <Link to="/register" className="bg-primary-500 text-gray-950 px-4 py-2 rounded-lg text-sm font-semibold text-center" onClick={() => setMobileMenuOpen(false)}>
                    {t('common.register')}
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}

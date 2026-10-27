import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const howToButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dismissed = localStorage.getItem('kurdstay_install_dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return
    }
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    if (isStandalone) return
    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    setIsIOS(isiOS)
    let timer: number | undefined
    if (isiOS) {
      const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
      if (isSafari) timer = window.setTimeout(() => setShowBanner(true), 3000)
      return () => { if (timer) window.clearTimeout(timer) }
    }
    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      timer = window.setTimeout(() => setShowBanner(true), 2000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!showIOSInstructions) return
    closeButton.current?.focus()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowIOSInstructions(false)
        window.setTimeout(() => howToButton.current?.focus(), 0)
        return
      }
      if (event.key !== 'Tab') return
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey) }
  }, [showIOSInstructions])

  async function handleInstall() {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch { /* A dismissed or expired browser prompt can only be used once. */ }
    finally { setShowBanner(false); setDeferredPrompt(null) }
  }

  function handleDismiss() {
    setShowBanner(false)
    setShowIOSInstructions(false)
    localStorage.setItem('kurdstay_install_dismissed', Date.now().toString())
  }

  if (!showBanner) return null

  return (
    <>
      <section className="install-prompt fixed bottom-0 inset-x-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up" aria-labelledby="install-title">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center">
              <img src="/Hotel_logo.png" alt="" className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="install-title" className="font-semibold text-gray-900 text-sm">{t('install.title', 'Install KurdStay')}</h2>
              <p className="text-xs text-gray-600 mt-0.5">{t('install.description', 'Add to your home screen for the best experience')}</p>
            </div>
            <button onClick={handleDismiss} aria-label={t('install.dismiss', 'Dismiss install prompt')} className="ui-icon-button inline-flex flex-shrink-0 items-center justify-center text-gray-600 hover:text-gray-900 transition-colors">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {isIOS ? (
              <button ref={howToButton} onClick={() => setShowIOSInstructions(true)} className="flex-1 bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-800 transition-colors flex items-center justify-center gap-2">
                <Share className="w-4 h-4" aria-hidden="true" />{t('install.howTo', 'How to Install')}
              </button>
            ) : (
              <button onClick={() => void handleInstall()} className="flex-1 bg-primary-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-800 transition-colors flex items-center justify-center gap-2">
                <Download className="w-4 h-4" aria-hidden="true" />{t('install.button', 'Install App')}
              </button>
            )}
            <button onClick={handleDismiss} className="px-4 py-2.5 text-gray-700 text-sm font-medium hover:bg-gray-50 rounded-xl transition-colors">{t('install.later', 'Later')}</button>
          </div>
        </div>
      </section>

      {showIOSInstructions && (
        <div className="install-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setShowIOSInstructions(false); howToButton.current?.focus() } }}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="install-dialog animate-slide-up">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 id="ios-install-title" className="text-lg font-bold text-gray-900">{t('install.iosTitle', 'Install on iPhone/iPad')}</h2>
              <button ref={closeButton} onClick={() => { setShowIOSInstructions(false); howToButton.current?.focus() }} aria-label={t('install.closeInstructions', 'Close install instructions')} className="ui-icon-button inline-flex items-center justify-center text-gray-700">
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3"><span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center text-xs font-bold">1</span><span>{t('install.iosStep1', 'Tap the Share button at the bottom of Safari')}</span></li>
              <li className="flex items-start gap-3"><span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center text-xs font-bold">2</span><span>{t('install.iosStep2', 'Scroll down and tap "Add to Home Screen"')}</span></li>
              <li className="flex items-start gap-3"><span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-800 rounded-full flex items-center justify-center text-xs font-bold">3</span><span>{t('install.iosStep3', 'Tap "Add" to confirm')}</span></li>
            </ol>
            <button onClick={handleDismiss} className="mt-5 w-full bg-primary-700 text-white py-3 rounded-xl text-sm font-medium hover:bg-primary-800 transition-colors">{t('install.gotIt', 'Got it!')}</button>
          </div>
        </div>
      )}
    </>
  )
}

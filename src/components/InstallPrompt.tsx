import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, X, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('kurdstay_install_dismissed')
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10)
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
    if (isStandalone) return

    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    setIsIOS(isiOS)

    if (isiOS) {
      const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua)
      if (isSafari) {
        setTimeout(() => setShowBanner(true), 3000)
      }
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setShowBanner(true), 2000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    setShowBanner(false)
    localStorage.setItem('kurdstay_install_dismissed', Date.now().toString())
  }

  if (!showBanner) return null

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-slide-up">
        <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center">
              <img src="/Hotel_logo.png" alt="KurdStay" className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm">
                {t('install.title', 'Install KurdStay')}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('install.description', 'Add to your home screen for the best experience')}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            {isIOS ? (
              <button
                onClick={() => setShowIOSInstructions(true)}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <Share className="w-4 h-4" />
                {t('install.howTo', 'How to Install')}
              </button>
            ) : (
              <button
                onClick={handleInstall}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t('install.button', 'Install App')}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 text-gray-600 text-sm font-medium hover:bg-gray-50 rounded-xl transition-colors"
            >
              {t('install.later', 'Later')}
            </button>
          </div>
        </div>
      </div>

      {showIOSInstructions && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {t('install.iosTitle', 'Install on iPhone/iPad')}
            </h3>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>{t('install.iosStep1', 'Tap the Share button at the bottom of Safari')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>{t('install.iosStep2', 'Scroll down and tap "Add to Home Screen"')}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>{t('install.iosStep3', 'Tap "Add" to confirm')}</span>
              </li>
            </ol>
            <button
              onClick={() => {
                setShowIOSInstructions(false)
                handleDismiss()
              }}
              className="mt-5 w-full bg-primary-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              {t('install.gotIt', 'Got it!')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

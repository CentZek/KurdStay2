import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'

export default function OfflineIndicator() {
  const { t } = useTranslation()
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    function handleOnline() { setIsOffline(false) }
    function handleOffline() { setIsOffline(true) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-[env(safe-area-inset-top)] inset-x-0 z-[100] bg-gray-900 text-white py-2 px-4 flex items-center justify-center gap-2 text-sm animate-slide-up">
      <WifiOff className="w-4 h-4" />
      <span>{t('offline.message')}</span>
    </div>
  )
}

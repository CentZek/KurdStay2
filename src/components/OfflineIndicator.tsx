import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'

export default function OfflineIndicator() {
  const { t } = useTranslation()
  const banner = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    document.documentElement.classList.toggle('is-offline', isOffline)
    const update = () => document.documentElement.style.setProperty('--offline-height', `${banner.current?.getBoundingClientRect().height || 0}px`)
    const observer = new ResizeObserver(update)
    if (banner.current) observer.observe(banner.current)
    update()
    return () => { observer.disconnect(); document.documentElement.classList.remove('is-offline'); document.documentElement.style.removeProperty('--offline-height') }
  }, [isOffline])

  if (!isOffline) return null

  return (
    <div ref={banner} className="offline-indicator" role="status" aria-live="polite" aria-atomic="true">
      <WifiOff className="w-4 h-4" aria-hidden="true" />
      <span>{t('offline.message')}</span>
    </div>
  )
}

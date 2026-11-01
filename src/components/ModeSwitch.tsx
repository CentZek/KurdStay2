import { useTranslation } from 'react-i18next'
import { Building2, Hotel } from 'lucide-react'

export const REAL_ESTATE_URL = '/real-estate/index.html'

export default function ModeSwitch({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="navigation" aria-label={t('ux.modeSwitch')} className={`mode-switch ${className}`}>
      <a href="/" aria-current="true"><Hotel size={16} aria-hidden="true" />{t('ux.modeHotels')}</a>
      <a href={REAL_ESTATE_URL}><Building2 size={16} aria-hidden="true" />{t('ux.modeRealEstate')}</a>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCcw } from 'lucide-react'
import type { PropertyVideoValue } from '../lib/propertyVideo'

export default function PropertyVideo({ value, title, startOnOpen = false }: { value: PropertyVideoValue; title?: string; startOnOpen?: boolean }) {
  const { t } = useTranslation()
  const [started, setStarted] = useState(startOnOpen)
  const [failed, setFailed] = useState(false)
  return <div className="property-video">
    {started && !failed ? <video key={value.url} src={value.url} poster={value.poster} controls playsInline autoPlay preload="metadata"
      aria-label={title || t('video.tour')} onError={() => setFailed(true)} /> :
      <button type="button" className="property-video-cover" onClick={() => { setFailed(false); setStarted(true) }}
        aria-label={failed ? t('video.retryPlayback') : t('video.watch')}>
        <img src={value.poster} alt="" loading="lazy" />
        <span className="property-video-shade" />
        <span className="property-video-play">{failed ? <RotateCcw size={26} /> : <Play size={28} fill="currentColor" />}</span>
        <span className="property-video-caption"><strong>{failed ? t('video.playbackError') : t('video.tour')}</strong>
          <span>{failed ? t('video.retryPlayback') : t('video.watch')}</span></span>
      </button>}
  </div>
}

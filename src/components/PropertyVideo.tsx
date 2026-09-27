import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Play, RotateCcw } from 'lucide-react'
import { parseSocialVideo } from '../lib/socialVideo'
import type { PropertyVideoValue } from '../lib/propertyVideo'

export default function PropertyVideo({ value, title, startOnOpen = false }: { value: PropertyVideoValue; title?: string; startOnOpen?: boolean }) {
  const { t } = useTranslation()
  const [started, setStarted] = useState(startOnOpen)
  const [failed, setFailed] = useState(false)
  const social = parseSocialVideo(value.url)
  if (social) return <div className="social-video-player">
    <div className={`property-video ${started && social.provider === 'Instagram' ? 'instagram-frame' : ''}`}>
      {started && social.embed ? <iframe src={social.embed} title={`${social.provider}: ${title || t('video.tour')}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> :
        <button type="button" className="property-video-cover" onClick={() => { if (social.embed) setStarted(true); else window.open(social.url, '_blank', 'noopener,noreferrer') }} aria-label={t('video.watch')}>
          {(value.poster || social.poster) && <img src={value.poster || social.poster} alt="" loading="lazy" />}
          <span className="property-video-shade" /><span className="property-video-play"><Play size={28} fill="currentColor" /></span>
          <span className="property-video-caption"><strong>{t('video.tour')}</strong><span>{social.provider}</span></span>
        </button>}
    </div>
    <a className="social-video-fallback" href={social.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />{t('socialVideo.open', { provider: social.provider })}</a>
    {started && <p className="social-video-note">{t('socialVideo.playbackHelp')}</p>}
  </div>
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

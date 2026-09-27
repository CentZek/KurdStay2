import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Images, Play } from 'lucide-react'
import { optimizeImageUrl, getImageSrcSet } from '../lib/imageUtils'
import type { PropertyVideoValue } from '../lib/propertyVideo'
import PropertyVideo from './PropertyVideo'

export default function PropertyGallery({ images, video, name }: { images: string[]; video: PropertyVideoValue | null; name: string }) {
  const { t } = useTranslation()
  const [activeImage, setActiveImage] = useState(0)
  const [showVideo, setShowVideo] = useState(false)
  const photos = images.length ? images : video?.poster ? [video.poster] : []
  const index = Math.min(activeImage, Math.max(0, photos.length - 1))
  return <section className="property-gallery-section" aria-label={t('video.media')}>
    {video && <div className="property-media-switch" role="group" aria-label={t('video.media')}>
      <button type="button" disabled={!photos.length} aria-pressed={!showVideo && !!photos.length} onClick={() => setShowVideo(false)}><Images size={17} />{t('video.photos')}<span>{photos.length}</span></button>
      <button type="button" aria-pressed={showVideo} onClick={() => setShowVideo(true)}><Play size={17} />{t('video.watch')}</button>
    </div>}
    {(showVideo || !photos.length) && video ? <PropertyVideo key={`${video.url}-${showVideo}`} value={video} title={name} startOnOpen={showVideo} /> :
      <div className="property-photo-stage">
        {photos[index] && <img src={optimizeImageUrl(photos[index], 1200)} srcSet={getImageSrcSet(photos[index], [600, 900, 1200, 1800])}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 90vw, 1200px" alt={name} decoding="async" />}
        {photos.length > 1 && <>
          <button type="button" className="property-photo-prev" aria-label={t('video.previous')} disabled={index === 0} onClick={() => setActiveImage(index - 1)}><ChevronLeft size={22} /></button>
          <button type="button" className="property-photo-next" aria-label={t('video.next')} disabled={index === photos.length - 1} onClick={() => setActiveImage(index + 1)}><ChevronRight size={22} /></button>
        </>}
        {video && <button type="button" className="property-watch-button" onClick={() => setShowVideo(true)}><Play size={16} fill="currentColor" />{t('video.watch')}</button>}
        {photos.length > 0 && <span className="property-photo-count">{index + 1} / {photos.length}</span>}
      </div>}
    {(photos.length > 1 || video) && <div className="property-media-thumbnails">
      {video && <button type="button" className="property-video-thumbnail" aria-label={t('video.watch')} aria-pressed={showVideo} onClick={() => setShowVideo(true)}>
        {video.poster && <img src={video.poster} alt="" loading="lazy" />}<Play size={23} fill="currentColor" /></button>}
      {photos.map((url, i) => <button key={`${url}-${i}`} type="button" aria-label={t('video.photo', { n: i + 1 })}
        aria-pressed={!showVideo && index === i} onClick={() => { setShowVideo(false); setActiveImage(i) }}>
        <img src={optimizeImageUrl(url, 160)} alt="" loading="lazy" decoding="async" /></button>)}
    </div>}
  </section>
}

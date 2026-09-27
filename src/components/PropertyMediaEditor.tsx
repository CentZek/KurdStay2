import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Upload, Check, X } from 'lucide-react'
import VideoUploader from './VideoUploader'
import PropertyVideo from './PropertyVideo'
import { parseSocialVideo } from '../lib/socialVideo'
import type { PropertyVideoValue } from '../lib/propertyVideo'

interface Props { value: PropertyVideoValue | null; onChange: (value: PropertyVideoValue | null) => void | Promise<void>; onBusyChange?: (busy: boolean) => void; disabled?: boolean }
export default function PropertyMediaEditor(props: Props) {
  const { t } = useTranslation()
  const existing = props.value && parseSocialVideo(props.value.url)
  const [mode, setMode] = useState(existing ? 'link' : 'upload')
  const [link, setLink] = useState(existing?.url || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function setWorking(value: boolean) { setBusy(value); props.onBusyChange?.(value) }
  async function save(remove = false) {
    if (busy || props.disabled) return
    const parsed = parseSocialVideo(link)
    if (!remove && !parsed) { setError(t('socialVideo.invalid')); return }
    setWorking(true); setError('')
    try { await props.onChange(remove ? null : { url: parsed!.url, poster: parsed!.poster }); if (remove) setLink('') }
    catch { setError(t('video.saveFailed')) } finally { setWorking(false) }
  }
  return <div className="property-media-editor">
    <div className="media-source-switch" role="group" aria-label={t('socialVideo.source')}>
      <button type="button" disabled={busy || props.disabled} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><Upload size={16} />{t('socialVideo.upload')}</button>
      <button type="button" disabled={busy || props.disabled} aria-pressed={mode === 'link'} onClick={() => setMode('link')}><Link2 size={16} />{t('socialVideo.link')}</button>
    </div>
    {mode === 'upload' ? <VideoUploader {...props} onBusyChange={setWorking} /> : <div className="social-video-editor">
      <h3>{t('socialVideo.title')}</h3><p>{t('socialVideo.help')}</p>
      {props.value && <div className="video-upload-preview"><PropertyVideo key={props.value.url} value={props.value} />
        <button type="button" disabled={busy || props.disabled} onClick={() => save(true)}><X size={16} />{t('video.remove')}</button></div>}
      <label>{t('socialVideo.url')}<input type="url" dir="ltr" value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" disabled={busy || props.disabled} /></label>
      <button type="button" className="social-video-save" disabled={busy || props.disabled || !link.trim()} onClick={() => save()}><Check size={17} />{t(busy ? 'video.finishing' : 'socialVideo.save')}</button>
      {error && <p className="video-upload-error" role="alert">{error}</p>}
      <p className="video-upload-tip">{t('socialVideo.publicOnly')}</p>
    </div>}
  </div>
}

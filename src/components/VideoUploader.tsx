import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Video, X, RefreshCw, Check, Loader2 } from 'lucide-react'
import { Upload as TusUpload } from '../vendor/tus/tus.js'
import { functionHeaders } from '../lib/session'
import { createVideoPoster, videoFileError, type PropertyVideoValue } from '../lib/propertyVideo'
import PropertyVideo from './PropertyVideo'

interface Ticket { id: string; path: string; posterSignedUrl: string; token: string }
interface Job { file: File; poster?: Blob; ticket?: Ticket; upload?: TusUpload; uploaded?: boolean; posterUploaded?: boolean }
interface Props {
  value: PropertyVideoValue | null
  onChange: (value: PropertyVideoValue | null) => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
}

async function videoRequest(body: object, signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/property-videos`, {
    method: 'POST', headers: { ...functionHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error === 'VIDEO_UPLOAD_LIMIT' ? 'video.limitReached' : 'video.uploadFailed')
  return data
}

export default function VideoUploader({ value, onChange, onBusyChange, disabled = false }: Props) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const job = useRef<Job | null>(null)
  const controller = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const busyCallback = useRef(onBusyChange)
  busyCallback.current = onBusyChange
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('video.preparing')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  function updateBusy(next: boolean) { busyRef.current = next; setBusy(next); busyCallback.current?.(next) }
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (busyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    return () => { controller.current?.abort(); busyCallback.current?.(false); window.removeEventListener('beforeunload', unload) }
  }, [])

  async function run(current: Job) {
    if (busyRef.current || disabled) return
    const abort = new AbortController()
    controller.current = abort
    const { signal } = abort
    const checkCancelled = () => { if (signal.aborted) throw new DOMException('Aborted', 'AbortError') }
    updateBusy(true); setError(''); setPhase('video.preparing')
    try {
      current.poster ||= await createVideoPoster(current.file, signal)
      checkCancelled()
      current.ticket ||= await videoRequest({ action: 'create', type: current.file.type, size: current.file.size }, signal)
      const ticket = current.ticket!
      if (!current.uploaded) {
        setPhase('video.uploading')
        await new Promise<void>((resolve, reject) => {
          const base = new URL(import.meta.env.VITE_SUPABASE_URL)
          if (base.hostname.endsWith('.supabase.co')) base.hostname = base.hostname.replace('.supabase.co', '.storage.supabase.co')
          const cancelled = () => { void current.upload?.abort(); reject(new DOMException('Aborted', 'AbortError')) }
          signal.addEventListener('abort', cancelled, { once: true })
          const cleanup = () => signal.removeEventListener('abort', cancelled)
          const callbacks = {
            onProgress: (sent: number, total: number) => { if (!signal.aborted) setProgress(Math.round(sent / total * 100)) },
            onError: () => { cleanup(); reject(new Error('video.uploadFailed')) },
            onSuccess: () => { cleanup(); current.uploaded = true; resolve() },
          }
          if (current.upload) Object.assign(current.upload.options, callbacks)
          else current.upload = new TusUpload(current.file, {
            endpoint: `${base.origin}/storage/v1/upload/resumable`,
            headers: { 'x-signature': ticket.token, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
            chunkSize: 6 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000, 10000],
            uploadDataDuringCreation: true, storeFingerprintForResuming: false,
            metadata: { bucketName: 'property-videos', objectName: ticket.path, contentType: current.file.type, cacheControl: '3600' },
            ...callbacks,
          })
          if (signal.aborted) cancelled()
          else current.upload.start()
        })
      }
      checkCancelled()
      setPhase('video.finishing')
      if (!current.posterUploaded) {
        const body = new FormData()
        body.append('cacheControl', '3600')
        body.append('', current.poster)
        const response = await fetch(ticket.posterSignedUrl, { method: 'PUT', body, signal })
        if (!response.ok) throw new Error('video.uploadFailed')
        current.posterUploaded = true
      }
      checkCancelled()
      const media = await videoRequest({ action: 'complete', id: ticket.id }, signal)
      checkCancelled()
      await onChange({ url: media.url, poster: media.poster })
      job.current = null
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error && failure.message.startsWith('video.') ? failure.message : 'video.uploadFailed')
    } finally { if (!signal.aborted) updateBusy(false) }
  }

  function choose(files: FileList | null) {
    if (busyRef.current || disabled || !files?.length) return
    if (files.length > 1) { setError('video.oneOnly'); return }
    const file = files[0]
    const invalid = videoFileError(file)
    if (invalid) { setError(invalid); return }
    job.current = { file }
    setProgress(0)
    void run(job.current)
  }

  function cancel() { controller.current?.abort(); job.current = null; updateBusy(false); setError(''); setProgress(0) }

  async function remove() {
    if (busyRef.current || disabled) return
    updateBusy(true); setError(''); setPhase('video.finishing')
    try { await onChange(null); job.current = null } catch { setError('video.saveFailed') }
    finally { updateBusy(false) }
  }

  return <section className="video-uploader" aria-label={t('video.title')}>
    <div className="video-uploader-heading"><span className="video-uploader-icon"><Video size={21} /></span>
      <div><h3>{t('video.title')}</h3><p>{t('video.description')}</p></div></div>
    {value && <div className="video-upload-preview"><PropertyVideo key={value.url} value={value} />
      <div className="video-upload-ready"><span><Check size={16} />{t('video.ready')}</span>
        <button type="button" disabled={busy || disabled} onClick={remove}><X size={16} />{t('video.remove')}</button></div></div>}
    <input ref={input} type="file" accept="video/mp4,video/webm,.mp4,.webm" className="hidden" aria-label={t('video.choose')}
      onChange={event => { choose(event.target.files); event.target.value = '' }} disabled={busy || disabled} />
    {busy ? <div className="video-upload-progress" role="status" aria-live="polite">
      <div><Loader2 size={18} className="animate-spin" /><span>{t(phase)}</span><button type="button" disabled={phase === 'video.finishing'} onClick={cancel}>{t('common.cancel')}</button></div>
      <progress max={100} value={phase === 'video.uploading' ? progress : undefined} aria-label={t('video.uploading')} />
      <p>{phase === 'video.uploading' ? `${progress}% · ${job.current?.file.name || ''}` : t('video.keepOpen')}</p>
    </div> : <button type="button" disabled={disabled} className={`video-dropzone ${dragging ? 'is-dragging' : ''}`} onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files) }}>
      <Upload size={20} /><strong>{t(value ? 'video.replace' : 'video.choose')}</strong><span>{t('video.hint')}</span>
    </button>}
    {error && <div className="video-upload-error" role="alert"><p>{t(error)}</p>
      {job.current && !busy && <button type="button" disabled={disabled} onClick={() => job.current && void run(job.current)}><RefreshCw size={16} />{t('video.retry')}</button>}</div>}
    <p className="video-upload-tip">{t('video.coverHelp')}</p>
  </section>
}

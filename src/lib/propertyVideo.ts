export interface PropertyVideoValue { url: string; poster: string }
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024
export const VIDEO_TYPES = ['video/mp4', 'video/webm']

export function videoFileError(file: Pick<File, 'size' | 'type'>): string | null {
  if (!VIDEO_TYPES.includes(file.type) || file.size === 0) return 'video.invalidType'
  return file.size > MAX_VIDEO_BYTES ? 'video.tooLarge' : null
}

// Decode a real frame before uploading: catches unsupported codecs and creates
// a useful cover for video-only listings without asking hosts for a photo.
export async function createVideoPoster(file: File, signal: AbortSignal): Promise<Blob> {
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const fail = () => reject(new Error('video.unplayable'))
      abort = () => reject(new DOMException('Aborted', 'AbortError'))
      timer = setTimeout(fail, 20000)
      const finish = (blob: Blob | null) => { blob ? resolve(blob) : fail() }
      signal.addEventListener('abort', abort, { once: true })
      video.onerror = fail
      video.onloadedmetadata = () => {
        if (!video.videoWidth || !video.videoHeight || Number.isNaN(video.duration) || video.duration <= 0) return fail()
        video.currentTime = Math.min(1, video.duration / 2)
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight))
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          const context = canvas.getContext('2d')
          if (!context) return fail()
          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob(finish, 'image/jpeg', .85)
        } catch { fail() }
      }
      if (signal.aborted) abort()
      else video.src = url
    })
  } finally {
    clearTimeout(timer)
    if (abort) signal.removeEventListener('abort', abort)
    video.onerror = video.onloadedmetadata = video.onseeked = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

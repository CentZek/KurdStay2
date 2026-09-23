const SUPABASE_STORAGE_PATTERN = /\.supabase\.co\/storage\/v1\/object\/public\//

export function optimizeImageUrl(url: string, width: number, quality = 75): string {
  if (!url) return url
  if (!SUPABASE_STORAGE_PATTERN.test(url)) return url

  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}width=${width}&quality=${quality}`
}

export function getImageSrcSet(url: string, sizes: number[] = [400, 800, 1200]): string {
  if (!url || !SUPABASE_STORAGE_PATTERN.test(url)) return ''
  return sizes.map(w => `${optimizeImageUrl(url, w)} ${w}w`).join(', ')
}

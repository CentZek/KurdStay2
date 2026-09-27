import type { PropertyVideoValue } from './propertyVideo'

export interface SocialVideo { provider: 'YouTube' | 'Instagram' | 'Facebook'; url: string; embed: string | null; poster: string }
export function parseSocialVideo(input: string): SocialVideo | null {
  try {
    const u = new URL(input.trim())
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? u.pathname.slice(1) : u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)\/?$/)?.[1]
      if (!id || !/^[\w-]{11}$/.test(id)) return null
      return { provider: 'YouTube', url: `https://www.youtube.com/watch?v=${id}`, embed: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
    }
    if (host === 'instagram.com') {
      const match = u.pathname.match(/^\/(p|reel|reels)\/([\w-]+)\/?$/)
      if (!match) return null
      const url = `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/`
      return { provider: 'Instagram', url, embed: `${url}embed/`, poster: '' }
    }
    if (['facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(host)) {
      const id = /^\/(watch\/?|video\.php)$/.test(u.pathname) ? u.searchParams.get('v') : u.pathname.match(/^\/(?:reel|[\w.-]+\/videos)\/(\d+)\/?$/)?.[1]
      if (id && /^\d+$/.test(id)) {
        const url = `https://www.facebook.com/watch/?v=${id}`
        return { provider: 'Facebook', url, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`, poster: '' }
      }
      const share = u.pathname.match(/^\/share\/(?:v|r)\/([\w-]+)\/?$/)
      if (share) return { provider: 'Facebook', url: `https://www.facebook.com${u.pathname.replace(/\/?$/, '/')}`, embed: null, poster: '' }
    }
    if (host === 'fb.watch' && /^\/[\w-]+\/?$/.test(u.pathname)) return { provider: 'Facebook', url: `https://fb.watch${u.pathname.replace(/\/?$/, '/')}`, embed: null, poster: '' }
    return null
  } catch { return null }
}

export function videoColumns(value: PropertyVideoValue | null) {
  const social = value && parseSocialVideo(value.url)
  return { video_url: social ? null : value?.url || null, video_poster_url: social ? null : value?.poster || null, social_video_url: social?.url || null }
}
export function videoFromRow(row: { video_url?: string | null; video_poster_url?: string | null; social_video_url?: string | null; images?: string[] }): PropertyVideoValue | null {
  const social = row.social_video_url && parseSocialVideo(row.social_video_url)
  if (social) return { url: social.url, poster: row.images?.[0] || social.poster }
  return row.video_url && row.video_poster_url ? { url: row.video_url, poster: row.video_poster_url } : null
}

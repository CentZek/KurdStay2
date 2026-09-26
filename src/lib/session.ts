const SESSION_KEY = 'kurdstay_session'
const VISITOR_KEY = 'kurdstay_visitor'
let session = localStorage.getItem(SESSION_KEY) || ''
let visitor = localStorage.getItem(VISITOR_KEY) || ''
if (!visitor) {
  visitor = crypto.randomUUID() + crypto.randomUUID()
  localStorage.setItem(VISITOR_KEY, visitor)
}

export function setSession(token: string) {
  session = token
  if (token) localStorage.setItem(SESSION_KEY, token)
  else {
    localStorage.removeItem(SESSION_KEY)
    visitor = crypto.randomUUID() + crypto.randomUUID()
    localStorage.setItem(VISITOR_KEY, visitor)
  }
  localStorage.removeItem('stayhub_user')
}

export function sessionHeaders(): Record<string, string> {
  return {
    'x-stay-session': session,
    'x-stay-visitor': visitor,
  }
}

export function functionHeaders(): Record<string, string> {
  return { ...sessionHeaders(), Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` }
}

export function hasSession() { return Boolean(session) }

window.addEventListener('storage', event => {
  if (event.key === SESSION_KEY) window.location.reload()
})

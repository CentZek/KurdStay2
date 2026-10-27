import { createClient } from '@supabase/supabase-js'
import { hasSession, sessionHeaders } from './session'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      Object.entries(sessionHeaders()).forEach(([key, value]) => headers.set(key, value))
      const response = await fetch(input, { ...init, headers, cache: 'no-store' })
      if (response.status === 401 && hasSession()) window.dispatchEvent(new Event('stay-session-expired'))
      return response
    },
  },
})

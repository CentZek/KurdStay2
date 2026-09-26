import { createClient } from '@supabase/supabase-js'
import { sessionHeaders } from './session'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers)
      Object.entries(sessionHeaders()).forEach(([key, value]) => headers.set(key, value))
      return fetch(input, { ...init, headers, cache: 'no-store' })
    },
  },
})

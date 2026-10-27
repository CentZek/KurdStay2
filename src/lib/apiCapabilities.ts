import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface ApiCapabilities {
  bookingSearch?: boolean
  adminReliability?: boolean
  applicationResubmit?: boolean
}

let pending: Promise<ApiCapabilities> | undefined

// Older databases keep using the established screens until the complete migration
// is installed. This read-only check never falls back after a write was attempted.
function loadCapabilities(): Promise<ApiCapabilities> {
  return pending ??= (async () => {
    try {
      const { data, error } = await supabase.rpc('app_capabilities').abortSignal(AbortSignal.timeout(5000))
      return !error && data && !Array.isArray(data) && typeof data === 'object' ? data : {}
    } catch { return {} }
  })()
}

export function useApiCapabilities() {
  const [capabilities, setCapabilities] = useState<ApiCapabilities | null>(null)
  useEffect(() => {
    let active = true
    void loadCapabilities().then(value => { if (active) setCapabilities(value) })
    return () => { active = false }
  }, [])
  return capabilities
}

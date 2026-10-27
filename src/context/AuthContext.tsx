import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { changeLanguage } from '../i18n'
import { hasSession, setSession } from '../lib/session'

interface UserProfile {
  id: string
  name: string
  username: string
  role: 'admin' | 'hotel_owner' | 'customer'
  language_preference: string
  phone?: string | null
  email?: string | null
  phone_verified?: boolean
}

interface SignUpInput {
  username: string
  password: string
  name: string
  phone?: string
  email?: string
  language?: string
}

interface AuthContextType {
  user: UserProfile | null
  profile: UserProfile | null
  loading: boolean
  restorationError: string | null
  retryRestore: () => Promise<void>
  signIn: (username: string, password: string) => Promise<{ error: any }>
  signUp: (input: SignUpInput) => Promise<{ error: any; user?: UserProfile }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setPhoneVerified: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [restorationError, setRestorationError] = useState<string | null>(null)
  const restoreRequest = useRef(0)
  const mounted = useRef(false)

  function persist(userProfile: UserProfile) {
    setUser(userProfile)
    if (userProfile.language_preference) changeLanguage(userProfile.language_preference)
  }

  const retryRestore = useCallback(async () => {
    const request = ++restoreRequest.current
    setLoading(true)
    setRestorationError(null)
    try {
      if (!hasSession()) {
        if (mounted.current && request === restoreRequest.current) setUser(null)
        return
      }
      const { data, error } = await supabase.rpc('current_profile')
      if (!mounted.current || request !== restoreRequest.current) return
      if (error) {
        setRestorationError(error.message || 'Your session could not be restored. Check your connection and try again.')
        return
      }
      if (data) {
        persist(data as UserProfile)
      } else {
        setUser(null)
        setSession('')
      }
    } catch (error) {
      if (!mounted.current || request !== restoreRequest.current) return
      const message = error instanceof Error ? error.message : ''
      setRestorationError(message || 'Your session could not be restored. Check your connection and try again.')
    } finally {
      if (mounted.current && request === restoreRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    localStorage.removeItem('stayhub_user')
    const handleExpiredSession = () => {
      restoreRequest.current += 1
      setUser(null)
      setRestorationError(null)
      setLoading(false)
      setSession('')
    }
    window.addEventListener('stay-session-expired', handleExpiredSession)
    retryRestore()
    return () => {
      mounted.current = false
      restoreRequest.current += 1
      window.removeEventListener('stay-session-expired', handleExpiredSession)
    }
  }, [retryRestore])

  async function signIn(username: string, password: string) {
    const request = ++restoreRequest.current
    setLoading(false)
    const { data, error } = await supabase.rpc('login', {
      p_username: username,
      p_password: password,
    })

    if (request !== restoreRequest.current) return { error: { message: 'Sign-in changed. Please try again.' } }
    if (error) return { error: { message: error.message } }
    if (!data?.success) return { error: { message: data?.message } }

    if (!data.session_token) return { error: { message: 'Secure sign-in is unavailable. Please try again later.' } }
    setSession(data.session_token)
    setRestorationError(null)
    persist(data.user as UserProfile)
    return { error: null }
  }

  async function signUp(input: SignUpInput) {
    const request = ++restoreRequest.current
    setLoading(false)
    const { data, error } = await supabase.rpc('register_user', {
      p_username: input.username,
      p_password: input.password,
      p_name: input.name,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_role: 'customer',
      p_language: input.language ?? 'en',
    })

    if (request !== restoreRequest.current) return { error: { message: 'Sign-in changed. Please try again.' } }
    if (error) return { error: { message: error.message } }
    if (!data?.success) return { error: { message: data?.message } }

    if (!data.session_token) return { error: { message: 'Account created. Please sign in after the service update.' } }
    setSession(data.session_token)
    const userProfile = data.user as UserProfile
    setRestorationError(null)
    persist(userProfile)
    return { error: null, user: userProfile }
  }

  async function refreshProfile() {
    if (!user) return
    const request = restoreRequest.current
    const { data } = await supabase
      .from('profiles')
      .select('id, name, username, role, language_preference, phone, email, phone_verified')
      .eq('id', user.id)
      .maybeSingle()
    if (data && mounted.current && request === restoreRequest.current) persist(data as UserProfile)
  }

  function setPhoneVerified() {
    if (!user) return
    persist({ ...user, phone_verified: true })
  }

  async function signOut() {
    const request = ++restoreRequest.current
    setLoading(false)
    try { await supabase.rpc('logout') } catch { /* Clear the local session even when offline. */ } finally {
      if (request !== restoreRequest.current) return
      setUser(null)
      setRestorationError(null)
      setSession('')
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, profile: user, loading, restorationError, retryRestore, signIn, signUp, signOut, refreshProfile, setPhoneVerified }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

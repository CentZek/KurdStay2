import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { changeLanguage } from '../i18n'

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
  signIn: (username: string, password: string) => Promise<{ error: any }>
  signUp: (input: SignUpInput) => Promise<{ error: any; user?: UserProfile }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  setPhoneVerified: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'stayhub_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  function persist(userProfile: UserProfile) {
    setUser(userProfile)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userProfile))
    if (userProfile.language_preference) changeLanguage(userProfile.language_preference)
  }

  async function signIn(username: string, password: string) {
    const { data, error } = await supabase.rpc('login', {
      p_username: username,
      p_password: password,
    })

    if (error) return { error: { message: error.message } }
    if (!data.success) return { error: { message: data.message } }

    persist(data.user as UserProfile)
    return { error: null }
  }

  async function signUp(input: SignUpInput) {
    const { data, error } = await supabase.rpc('register_user', {
      p_username: input.username,
      p_password: input.password,
      p_name: input.name,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_role: 'customer',
      p_language: input.language ?? 'en',
    })

    if (error) return { error: { message: error.message } }
    if (!data.success) return { error: { message: data.message } }

    const userProfile = data.user as UserProfile
    persist(userProfile)
    return { error: null, user: userProfile }
  }

  async function refreshProfile() {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('id, name, username, role, language_preference, phone, email, phone_verified')
      .eq('id', user.id)
      .maybeSingle()
    if (data) persist(data as UserProfile)
  }

  function setPhoneVerified() {
    if (!user) return
    persist({ ...user, phone_verified: true })
  }

  async function signOut() {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <AuthContext.Provider
      value={{ user, profile: user, loading, signIn, signUp, signOut, refreshProfile, setPhoneVerified }}
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

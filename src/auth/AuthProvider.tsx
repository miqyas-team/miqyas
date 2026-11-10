import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { AppRole, Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  role: AppRole | null
  /** true أثناء قراءة الجلسة أو الملف الشخصي */
  loading: boolean
  /** دخول تجريبي — متاح فقط في التطوير قبل ربط Supabase */
  isDemo: boolean
  canUseDemo: boolean
  enterDemo: () => void
  /** تبديل دور الحساب التجريبي لتجربة لوحات الأدوار */
  setDemoRole: (role: AppRole) => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const DEMO_KEY = 'miqyas-demo-user'
const canUseDemo = !isSupabaseConfigured && import.meta.env.DEV

const demoProfile: Profile = {
  id: 'demo-user',
  full_name: 'متدرب تجريبي',
  email: 'demo@miqyas.local',
  phone: '0500000000',
  specialization: 'طالب نظم معلومات جغرافية',
  organization: null,
  avatar_url: null,
  role: 'user',
  preferred_lang: 'ar',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
const demoSession = { user: { id: demoProfile.id, email: demoProfile.email } } as unknown as Session

const DEMO_ROLE_KEY = 'miqyas-demo-role'
function readDemoRole(): AppRole {
  try {
    const r = localStorage.getItem(DEMO_ROLE_KEY)
    if (r === 'instructor' || r === 'team' || r === 'admin') return r
  } catch {
    /* تجاهل */
  }
  return 'user'
}

function readDemoFlag() {
  try {
    return canUseDemo && localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(readDemoFlag)
  const [demoRole, setDemoRoleState] = useState<AppRole>(readDemoRole)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(isSupabaseConfigured)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const loadProfile = useCallback(async (id: string | undefined) => {
    if (!id) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
    setProfileLoading(false)
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured) void loadProfile(userId)
  }, [userId, loadProfile])

  const value = useMemo<AuthState>(() => {
    const activeSession = isDemo ? demoSession : session
    const activeProfile = isDemo ? { ...demoProfile, role: demoRole } : profile
    return {
      session: activeSession,
      user: activeSession?.user ?? null,
      profile: activeProfile,
      role: activeProfile?.role ?? null,
      loading: !isDemo && (sessionLoading || profileLoading),
      isDemo,
      canUseDemo,
      enterDemo: () => {
        try {
          localStorage.setItem(DEMO_KEY, '1')
        } catch {
          /* تجاهل */
        }
        setIsDemo(true)
      },
      setDemoRole: (role) => {
        try {
          localStorage.setItem(DEMO_ROLE_KEY, role)
        } catch {
          /* تجاهل */
        }
        setDemoRoleState(role)
      },
      refreshProfile: () => (isDemo ? Promise.resolve() : loadProfile(userId)),
      signOut: async () => {
        if (isDemo) {
          try {
            localStorage.removeItem(DEMO_KEY)
          } catch {
            /* تجاهل */
          }
          setIsDemo(false)
          return
        }
        await supabase.auth.signOut()
        setProfile(null)
      },
    }
  }, [isDemo, demoRole, session, profile, sessionLoading, profileLoading, loadProfile, userId])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

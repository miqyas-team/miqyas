export type AppRole = 'user' | 'instructor' | 'team' | 'admin'

export interface Profile {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  specialization: string | null
  organization: string | null
  avatar_url: string | null
  role: AppRole
  preferred_lang: 'ar' | 'en'
  created_at: string
  updated_at: string
}

/** لوحة كل دور */
export const dashboardPath: Record<AppRole, string> = {
  user: '/app',
  instructor: '/instructor',
  team: '/team',
  admin: '/admin',
}

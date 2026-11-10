import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { AppRole } from '../lib/types'
import { Spinner } from '../components/ui'
import { Forbidden } from '../pages/Forbidden'

/** يحمي المسار: يطلب تسجيل الدخول، ويقيّده بأدوار معيّنة (المدير يدخل كل اللوحات) */
export function RequireAuth({ roles, children }: { roles?: AppRole[]; children: ReactNode }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (roles && role !== 'admin' && (!role || !roles.includes(role))) return <Forbidden />
  return <>{children}</>
}

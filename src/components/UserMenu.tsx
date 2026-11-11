import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { dashboardPath } from '../lib/types'

/** قائمة المستخدم المسجّل في رأس الصفحة */
export function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile, role, signOut, isDemo, setDemoRole } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const name = profile?.full_name || profile?.email || ''
  const initial = name.trim().charAt(0).toUpperCase() || '؟'

  const go = () => {
    setOpen(false)
    onNavigate?.()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-primary/15 bg-white py-1 pe-3 ps-1 text-sm font-medium"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white">{initial}</span>
        <span className="max-w-[10rem] truncate">{name.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="absolute end-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-primary/10 bg-white py-2 shadow-xl">
          {role && (
            <Link to={dashboardPath[role]} onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">
              {t(`areas.${role === 'user' ? 'app' : role}`)}
            </Link>
          )}
          {role !== 'user' && (
            <Link to="/app" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('areas.app')}</Link>
          )}
          <Link to="/app/courses" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('myCourses.title')}</Link>
          <Link to="/app/certificates" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('certificates.title')}</Link>
          <Link to="/app/requests" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('requests.mine')}</Link>
          <Link to="/app/payments" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('payments.mine')}</Link>
          <Link to="/app/profile" onClick={go} className="block px-4 py-2 text-sm hover:bg-primary-50">{t('profile.title')}</Link>
          {isDemo && (
            <div className="mx-3 my-2 rounded-xl bg-accent-100/70 p-2">
              <p className="px-1 pb-1.5 text-[11px] font-semibold text-accent-700">{t('demo.switchRole')}</p>
              <div className="grid grid-cols-2 gap-1">
                {(['user', 'instructor', 'team', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setDemoRole(r)
                      go()
                      navigate(dashboardPath[r])
                    }}
                    className={`rounded-lg px-2 py-1 text-xs font-medium ${role === r ? 'bg-primary text-white' : 'bg-white text-ink hover:bg-primary-50'}`}
                  >
                    {t(`roles.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <hr className="my-2 border-primary/10" />
          <button
            type="button"
            onClick={async () => {
              go()
              await signOut()
              navigate('/')
            }}
            className="block w-full px-4 py-2 text-start text-sm text-red-600 hover:bg-red-50"
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}

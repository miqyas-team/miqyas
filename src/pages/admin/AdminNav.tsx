import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, ClipboardList, Inbox, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

/** شريط تنقّل لوحات الإدارة والمدرّب */
export function AdminNav() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const base = isAdmin ? '/admin' : '/instructor'

  const items = [
    { to: base, end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
    { to: `${base}/courses`, end: false, icon: BookOpen, label: t('admin.nav.courses') },
    ...(isAdmin
      ? [
          { to: '/admin/requests', end: false, icon: ClipboardList, label: t('admin.nav.requests') },
          { to: '/admin/inbox', end: false, icon: Inbox, label: t('areas.inbox') },
        ]
      : []),
  ]

  return (
    <nav className="border-b border-primary/10 bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
        {items.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'
              }`
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

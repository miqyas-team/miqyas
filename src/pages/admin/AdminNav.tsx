import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpen, Briefcase, ClipboardList, FileCheck2, Headset, Inbox, LayoutDashboard, Tags, Users, Wallet, Wrench } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

/** شريط تنقّل لوحات الإدارة والمدرّب */
export function AdminNav() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const items = isAdmin
    ? [
        { to: '/admin', end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
        { to: '/admin/inbox', end: false, icon: Inbox, label: t('areas.inbox') },
        { to: '/admin/support', end: false, icon: Headset, label: t('support.nav') },
        { to: '/admin/requests', end: false, icon: ClipboardList, label: t('admin.nav.requests') },
        { to: '/admin/services', end: false, icon: Tags, label: t('servicesAdmin.nav') },
        { to: '/admin/courses', end: false, icon: BookOpen, label: t('admin.nav.courses') },
        { to: '/admin/payments', end: false, icon: Wallet, label: t('admin.nav.payments') },
        { to: '/admin/jobs', end: false, icon: Briefcase, label: t('admin.nav.jobs') },
        { to: '/admin/software', end: false, icon: Wrench, label: t('nav.software') },
        { to: '/admin/users', end: false, icon: Users, label: t('admin.nav.users') },
      ]
    : [
        { to: '/instructor', end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
        { to: '/instructor/courses', end: false, icon: BookOpen, label: t('admin.nav.courses') },
        { to: '/instructor/grading', end: false, icon: FileCheck2, label: t('admin.nav.grading') },
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

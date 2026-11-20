import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight, BookOpen, Briefcase, ClipboardList, FileCheck2, Headset, Inbox, LayoutDashboard,
  BookOpenText, Flame, Menu, ShieldCheck, Tags, Users, Wallet, Wrench, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

type Area = 'admin' | 'instructor' | 'team'
type Item = { to: string; end?: boolean; icon: LucideIcon; label: string }
type Group = { title: string; items: Item[] }

/** روابط كل لوحة مقسّمة إلى مجموعات واضحة */
function useGroups(area: Area): Group[] {
  const { t } = useTranslation()
  if (area === 'admin')
    return [
      {
        title: t('staff.groups.main'),
        items: [
          { to: '/admin', end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
          { to: '/admin/inbox', icon: Inbox, label: t('areas.inbox') },
        ],
      },
      {
        title: t('staff.groups.operations'),
        items: [
          { to: '/admin/requests', icon: ClipboardList, label: t('admin.nav.requests') },
          { to: '/admin/payments', icon: Wallet, label: t('admin.nav.payments') },
          { to: '/admin/support', icon: Headset, label: t('support.nav') },
        ],
      },
      {
        title: t('staff.groups.content'),
        items: [
          { to: '/admin/courses', icon: BookOpen, label: t('admin.nav.courses') },
          { to: '/admin/services', icon: Tags, label: t('servicesAdmin.nav') },
          { to: '/admin/software', icon: Wrench, label: t('nav.software') },
          { to: '/admin/jobs', icon: Briefcase, label: t('admin.nav.jobs') },
          { to: '/admin/library', icon: BookOpenText, label: t('content.libraryNav') },
          { to: '/admin/questions', icon: Flame, label: t('content.questionsNav') },
        ],
      },
      {
        title: t('staff.groups.people'),
        items: [
          { to: '/admin/users', icon: Users, label: t('admin.nav.users') },
          { to: '/admin/roles', icon: ShieldCheck, label: t('staff.roles.nav') },
        ],
      },
    ]
  if (area === 'instructor')
    return [
      {
        title: t('staff.groups.main'),
        items: [
          { to: '/instructor', end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
          { to: '/instructor/courses', icon: BookOpen, label: t('admin.nav.courses') },
          { to: '/instructor/grading', icon: FileCheck2, label: t('admin.nav.grading') },
        ],
      },
    ]
  return [
    {
      title: t('staff.groups.main'),
      items: [
        { to: '/team', end: true, icon: LayoutDashboard, label: t('admin.nav.overview') },
        { to: '/team/requests', icon: ClipboardList, label: t('requests.assignedTitle') },
        { to: '/software', icon: Wrench, label: t('nav.software') },
      ],
    },
  ]
}

function NavList({ groups, onNavigate }: { groups: Group[]; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {g.items.map(({ to, end, icon: Icon, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                      isActive ? 'bg-primary text-white shadow-sm' : 'text-ink/80 hover:bg-primary-50 hover:text-primary'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** هيكل لوحات الإدارة والمدرّب والفريق: قائمة جانبية مرتّبة + محتوى الصفحة */
export function StaffLayout({ area }: { area: Area }) {
  const { t } = useTranslation()
  const { profile, role } = useAuth()
  const { pathname } = useLocation()
  const groups = useGroups(area)
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  const all = groups.flatMap((g) => g.items)
  const tabs: Item[] =
    area === 'admin'
      ? [
          { to: '/admin', end: true, icon: LayoutDashboard, label: t('staff.tab.home') },
          { to: '/admin/inbox', icon: Inbox, label: t('staff.tab.inbox') },
          { to: '/admin/courses', icon: BookOpen, label: t('admin.nav.courses') },
          { to: '/admin/users', icon: Users, label: t('admin.nav.users') },
        ]
      : all.slice(0, 4).map((i, n) => (n === 0 ? { ...i, label: t('staff.tab.home') } : i))
  const onTab = tabs.some((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
  const moreActive = !onTab && all.some((i) => pathname.startsWith(i.to))

  const header = (
    <div className="flex items-center gap-3 px-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-white">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-primary">{t(`areas.${area}`)}</p>
        <p className="truncate text-xs text-muted">
          {profile?.full_name} · {role ? t(`roles.${role}`) : ''}
        </p>
      </div>
    </div>
  )

  const back = (
    <Link to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:bg-primary-50 hover:text-primary">
      <ArrowRight className="h-4 w-4 ltr:rotate-180" /> {t('staff.backToSite')}
    </Link>
  )

  return (
    <div className="mx-auto flex max-w-7xl gap-6 lg:px-4 lg:py-6">
      {/* القائمة الجانبية — شاشات كبيرة */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-20 space-y-5 rounded-card border border-primary/10 bg-white p-4">
          {header}
          <div className="border-t border-primary/10" />
          <NavList groups={groups} />
          <div className="border-t border-primary/10 pt-3">{back}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        <Outlet />
      </div>

      {/* شريط سفلي للجوال: أهم 4 أقسام + المزيد */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t(`areas.${area}`)}>
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map(({ to, end, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted'}`}
              >
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full transition ${isActive ? 'bg-primary-50' : ''}`}><Icon className="h-5 w-5" /></span>
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="staff-menu" className={`flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${moreActive ? 'text-primary' : 'text-muted'}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full ${moreActive ? 'bg-primary-50' : ''}`}><Menu className="h-5 w-5" /></span>
              {t('staff.tab.more')}
            </button>
          </li>
        </ul>
      </nav>

      {open && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label={t('nav.close')} className="absolute inset-0 h-full w-full cursor-default bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside id="staff-menu" role="dialog" aria-modal="true" aria-label={t('staff.menu')} className="absolute inset-y-0 start-0 flex w-[min(18rem,85vw)] flex-col gap-4 overflow-y-auto bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              {header}
              <button type="button" className="rounded-lg p-2 text-primary hover:bg-primary-50" aria-label={t('nav.close')} onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-t border-primary/10" />
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-primary/10 pt-3">{back}</div>
          </aside>
        </div>,
        document.body,
      )}
    </div>
  )
}

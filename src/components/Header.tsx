import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { UserMenu } from './UserMenu'
import { useAuth } from '../auth/AuthProvider'

/** الروابط الظاهرة أعلى الصفحة على الشاشات الكبيرة — الباقي في القائمة الجانبية */
const topLinks = [
  { to: '/courses', key: 'nav.courses' },
  { to: '/services', key: 'nav.services' },
  { to: '/software', key: 'nav.software' },
]

/** القائمة الجانبية (☰): كل أقسام المنصة مجمّعة */
const groups = [
  {
    key: 'nav.groups.home',
    links: [
      { to: '/#about', key: 'nav.sections.about' },
      { to: '/#offer', key: 'nav.sections.offer' },
      { to: '/#why', key: 'nav.sections.why' },
      { to: '/#faq', key: 'nav.sections.faq' },
    ],
  },
  {
    key: 'nav.groups.learn',
    links: [
      { to: '/courses', key: 'nav.courses' },
      { to: '/community', key: 'nav.community' },
      { to: '/jobs', key: 'nav.jobs' },
    ],
  },
  {
    key: 'nav.groups.work',
    links: [
      { to: '/services', key: 'nav.services' },
      { to: '/services/request', key: 'hero.requestService' },
      { to: '/software', key: 'nav.software' },
      { to: '/map-viewer', key: 'nav.mapViewer' },
    ],
  },
  {
    key: 'nav.groups.platform',
    links: [
      { to: '/about', key: 'nav.about' },
      { to: '/contact', key: 'nav.contact' },
    ],
  },
]

export function Header() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { session } = useAuth()
  const { pathname, hash } = useLocation()

  // أغلق القائمة عند الانتقال لصفحة أو قسم
  useEffect(() => setOpen(false), [pathname, hash])
  // امنع تمرير الصفحة خلف القائمة، وأغلقها بزر Esc
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-primary-50 text-primary' : 'text-ink/80 hover:text-primary'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-sand/85 shadow-[0_1px_12px_rgb(15_94_78/0.06)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-2 text-primary hover:bg-primary-50"
            aria-label={t('nav.menu')}
            aria-expanded={open}
            aria-controls="side-menu"
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <Link to="/" aria-label={t('nav.home')}>
            <Logo />
          </Link>
        </div>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {topLinks.map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              {t(l.key)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block">
            <LanguageSwitcher />
          </div>
          <Link
            to="/services/request"
            className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-accent/30 transition hover:brightness-95 xl:inline-flex"
          >
            {t('hero.requestService')}
          </Link>
          {session ? (
            <div className="hidden lg:block">
              <UserMenu />
            </div>
          ) : (
            <>
              <Link to="/login" className="hidden px-3 py-2 text-sm font-medium text-primary hover:underline sm:inline">
                {t('nav.login')}
              </Link>
              <Link to="/register" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ───────── القائمة الجانبية (خارج الشريط: تأثير التمويه يحبس العناصر الثابتة داخله) ───────── */}
      {open && createPortal(
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={t('nav.close')}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside
            id="side-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.menu')}
            className="absolute inset-y-0 start-0 flex w-[min(20rem,85vw)] flex-col overflow-y-auto bg-sand shadow-2xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-primary/10 px-4">
              <Link to="/" aria-label={t('nav.home')}>
                <Logo />
              </Link>
              <button type="button" className="rounded-lg p-2 text-primary hover:bg-primary-50" aria-label={t('nav.close')} onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 space-y-5 px-3 py-4">
              {groups.map((g) => (
                <div key={g.key}>
                  <p className="px-3 text-xs font-semibold text-muted">{t(g.key)}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {g.links.map((l) => (
                      <li key={l.to}>
                        <Link
                          to={l.to}
                          onClick={() => setOpen(false)}
                          className={`block rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white hover:text-primary ${
                            !l.to.includes('#') && pathname === l.to ? 'bg-white text-primary' : 'text-ink/85'
                          }`}
                        >
                          {t(l.key)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="space-y-3 border-t border-primary/10 p-4">
              {session ? (
                <UserMenu onNavigate={() => setOpen(false)} />
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/login" className="flex-1 rounded-full border border-primary/20 py-2 text-center text-sm font-medium text-primary">
                    {t('nav.login')}
                  </Link>
                  <Link to="/register" className="flex-1 rounded-full bg-primary py-2 text-center text-sm font-semibold text-white">
                    {t('nav.register')}
                  </Link>
                </div>
              )}
              <LanguageSwitcher />
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </header>
  )
}

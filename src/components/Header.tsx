import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Logo } from './Logo'
import { LanguageSwitcher } from './LanguageSwitcher'
import { UserMenu } from './UserMenu'
import { useAuth } from '../auth/AuthProvider'

const links = [
  { to: '/courses', key: 'nav.courses' },
  { to: '/software', key: 'nav.software' },
  { to: '/services', key: 'nav.services' },
  { to: '/about', key: 'nav.about' },
]

export function Header() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { session } = useAuth()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-primary-50 text-primary' : 'text-ink/80 hover:text-primary'
    }`

  return (
    <header className="sticky top-0 z-40 border-b border-primary/10 bg-sand/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label={t('nav.home')}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={navClass}>
              {t(l.key)}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          {session ? (
            <UserMenu />
          ) : (
            <>
              <Link to="/login" className="px-3 py-2 text-sm font-medium text-primary hover:underline">
                {t('nav.login')}
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
              >
                {t('nav.register')}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-primary md:hidden"
          aria-label={t('nav.menu')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-primary/10 px-4 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-3" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navClass}>
                {t(l.key)}
              </NavLink>
            ))}
            {!session && (
              <div className="mt-3 flex items-center gap-2">
                <Link to="/login" className="flex-1 rounded-full border border-primary/20 py-2 text-center text-sm font-medium text-primary">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="flex-1 rounded-full bg-primary py-2 text-center text-sm font-semibold text-white">
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </nav>
          {session && (
            <div className="mt-3">
              <UserMenu onNavigate={() => setOpen(false)} />
            </div>
          )}
          <div className="mt-3">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </header>
  )
}

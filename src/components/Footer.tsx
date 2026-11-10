import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="mt-auto bg-ink text-white/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <div>
            <p className="text-xl font-bold text-white">{t('brand')}</p>
            <p className="text-sm">{t('footer.tagline')}</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link to="/about" className="hover:text-white">{t('nav.about')}</Link>
          <Link to="/contact" className="hover:text-white">{t('nav.contact')}</Link>
          <Link to="/terms" className="hover:text-white">{t('footer.terms')}</Link>
          <Link to="/privacy" className="hover:text-white">{t('footer.privacy')}</Link>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {t('brand')} — {t('footer.rights')}
      </div>
    </footer>
  )
}

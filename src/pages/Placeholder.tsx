import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogoMark } from '../components/Logo'

/** صفحة مؤقتة للمسارات التي لم تُبنَ بعد */
export function Placeholder({ titleKey, notFound = false }: { titleKey?: string; notFound?: boolean }) {
  const { t } = useTranslation()
  return (
    <section className="contour-bg">
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <LogoMark className="h-16 w-16" />
        {titleKey && <h1 className="mt-6 text-3xl font-bold text-primary">{t(titleKey)}</h1>}
        <p className="mt-3 text-lg font-medium">
          {notFound ? t('page.notFound') : t('page.comingSoon')}
        </p>
        {!notFound && <p className="mt-1 text-muted">{t('page.comingSoonText')}</p>}
        <div className="dotted-path my-8 h-2 w-40 text-secondary" />
        <Link to="/" className="rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
          {t('page.backHome')}
        </Link>
      </div>
    </section>
  )
}
